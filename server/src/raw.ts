import { execFile } from 'node:child_process';
import sharp, { type Metadata, type Sharp } from 'sharp';

/**
 * Turning a camera RAW file into a JPEG that Frames can show.
 *
 * Cameras embed a JPEG in nearly every RAW file, in a different place for each maker (JpgFromRaw, PreviewImage,
 * OtherImage, ThumbnailImage). ExifTool knows where, so it pulls them all and the biggest one wins. If there is
 * none, or only a small one, dcraw develops the RAW itself (half size, camera white balance), which is fast and
 * plenty for a preview. If neither tool is installed, nothing breaks: the photo just shows a placeholder.
 * The RAW file itself is only ever read.
 */

const run = (cmd: string, args: string[], timeout = 90_000) =>
  new Promise<Buffer | null>((resolve) => {
    execFile(cmd, args, { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout }, (err, stdout) => resolve(err || !stdout?.length ? null : stdout));
  });

// "Installed" means the program starts at all. dcraw with no arguments prints usage and exits non-zero, which is fine.
const installed = (cmd: string, args: string[]) => new Promise<boolean>((resolve) => execFile(cmd, args, (err) => resolve(!(err && (err as NodeJS.ErrnoException).code === 'ENOENT'))));

let tools: Promise<{ exiftool: boolean; dcraw: boolean }> | null = null;
/** Which helpers exist on this machine. Checked once. */
export function rawTools() {
  tools ??= Promise.all([installed('exiftool', ['-ver']), installed('dcraw', [])]).then(([exiftool, dcraw]) => ({ exiftool, dcraw }));
  return tools;
}
/** Forget what was detected (used by tests that change PATH). */
export const resetRawTools = () => { tools = null; };

export type RawInfo = { w: number; h: number; orientation: number; meta: Record<string, any> };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Real pixel size, orientation and the camera details, for any RAW format ExifTool understands. */
export async function rawInfo(file: string): Promise<RawInfo | null> {
  if (!(await rawTools()).exiftool) return null;
  const out = await run('exiftool', ['-json', '-n', '-ImageSize', '-Orientation', '-Make', '-Model', '-LensModel', '-LensID', '-DateTimeOriginal', '-ExposureTime', '-FNumber', '-ISO', '-GPSLatitude', '-GPSLongitude', file]);
  if (!out) return null;
  try {
    const j = JSON.parse(out.toString())[0] ?? {};
    // -n prints ImageSize as "6000 4000" (or "6000x4000" in older versions).
    const m = /^(\d+)\D+(\d+)$/.exec(String(j.ImageSize ?? '').trim());
    let when: Date | undefined;
    const d = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(String(j.DateTimeOriginal ?? ''));
    if (d) when = new Date(+d[1], +d[2] - 1, +d[3], +d[4], +d[5], +d[6]); // wall-clock time, no timezone, exactly as written
    const orientation = num(j.Orientation) ?? 1;
    // The header gives the sensor's width and height. A camera held upright (orientation 5-8) shows them the other way round.
    const turned = orientation >= 5;
    const w = m ? (turned ? +m[2] : +m[1]) : 0, h = m ? (turned ? +m[1] : +m[2]) : 0;
    return {
      w, h, orientation,
      meta: {
        Make: j.Make, Model: j.Model, LensModel: j.LensModel ?? j.LensID, DateTimeOriginal: when,
        ExposureTime: num(j.ExposureTime), FNumber: num(j.FNumber), ISO: num(j.ISO),
        latitude: num(j.GPSLatitude), longitude: num(j.GPSLongitude),
        ExifImageWidth: w || undefined, ExifImageHeight: h || undefined,
      },
    };
  } catch { return null; }
}

const TAGS = ['JpgFromRaw', 'PreviewImage', 'OtherImage', 'ThumbnailImage'];
const isJpeg = (b: Buffer) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;

/** Every embedded JPEG in the file. */
export async function embeddedJpegs(file: string): Promise<Buffer[]> {
  if (!(await rawTools()).exiftool) return [];
  const found = await Promise.all(TAGS.map((t) => run('exiftool', ['-b', `-${t}`, file], 60_000)));
  return found.filter((b): b is Buffer => !!b && isJpeg(b));
}

/** dcraw: develop the RAW at half size to a TIFF. Slower than reading an embedded JPEG, so it is the fallback. */
export async function developRaw(file: string): Promise<Buffer | null> {
  if (!(await rawTools()).dcraw) return null;
  return run('dcraw', ['-c', '-T', '-h', '-w', file], 120_000);
}

/** Rotate or flip so the picture is upright, given an EXIF orientation number. */
function upright(img: Sharp, o: number): Sharp {
  switch (o) {
    case 2: return img.flop();
    case 3: return img.rotate(180);
    case 4: return img.flip();
    case 5: return img.rotate(90).flop();
    case 6: return img.rotate(90);
    case 7: return img.rotate(270).flop();
    case 8: return img.rotate(270);
    default: return img;
  }
}

export type RawJpeg = { jpeg: Buffer; w: number; h: number; source: 'embedded' | 'developed' };

const area = (m: Metadata) => (m.width ?? 0) * (m.height ?? 0);
const BIG_ENOUGH = 1600; // long edge. An embedded preview this size is as good as we need, so skip the slower develop.

/** A full-quality, upright JPEG from a RAW file, or null if nothing can be read from it. */
export async function rawToJpeg(file: string, info?: RawInfo | null): Promise<RawJpeg | null> {
  const orientation = (info ?? (await rawInfo(file)))?.orientation ?? 1;
  let best: { buf: Buffer; m: Metadata; source: 'embedded' | 'developed' } | null = null;
  const consider = async (buf: Buffer, source: 'embedded' | 'developed') => {
    try {
      const m = await sharp(buf, { failOn: 'none' }).metadata();
      if (m.width && m.height && (!best || area(m) > area(best.m))) best = { buf, m, source };
    } catch { /* an unreadable candidate is just skipped */ }
  };
  for (const b of await embeddedJpegs(file)) await consider(b, 'embedded');
  const long = (m?: Metadata) => Math.max(m?.width ?? 0, m?.height ?? 0);
  if (long((best as { m: Metadata } | null)?.m) < BIG_ENOUGH) {
    const dev = await developRaw(file);
    if (dev) await consider(dev, 'developed');
  }
  const pick = best as { buf: Buffer; m: Metadata; source: 'embedded' | 'developed' } | null;
  if (!pick) return null;
  // dcraw already turns the picture upright. An embedded preview may carry its own orientation tag; if it does not,
  // the RAW file's orientation says how to turn it.
  let img = sharp(pick.buf, { failOn: 'none' });
  if (pick.source === 'embedded') img = pick.m.orientation ? img.rotate() : upright(img, orientation);
  const jpeg = await img.jpeg({ quality: 93, mozjpeg: false }).toBuffer();
  const out = await sharp(jpeg).metadata();
  return { jpeg, w: out.width ?? 0, h: out.height ?? 0, source: pick.source };
}
