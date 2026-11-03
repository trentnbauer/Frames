import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import type { DB } from './db.js';

export const RAW_EXT = new Set(['.raf', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2']);
export const IMAGE_EXT = new Set([...RAW_EXT, '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

export type Cfg = { libraries: string[]; dataDir: string };

export function derivPath(cfg: Cfg, id: number, kind: 'thumb' | 'preview') {
  return path.join(cfg.dataDir, 'derivatives', String(id), `${kind}.jpg`);
}

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

/** Files on disk that are not in the database yet, grouped by library folder. */
export function pending(db: DB, cfg: Cfg) {
  const known = new Set([
    ...(db.prepare('SELECT path FROM photos').all() as { path: string }[]).map((r) => r.path),
    ...(db.prepare('SELECT path FROM duplicates').all() as { path: string }[]).map((r) => r.path),
  ]);
  const files: string[] = [];
  for (const lib of cfg.libraries) for (const f of walk(lib)) if (!known.has(f)) files.push(f);
  const folders = new Map<string, number>();
  for (const f of files) {
    const lib = cfg.libraries.find((l) => f.startsWith(l))!;
    const rel = path.relative(lib, path.dirname(f));
    const key = path.join(path.basename(lib), rel) || path.basename(lib);
    folders.set(key, (folders.get(key) ?? 0) + 1);
  }
  return { files, count: files.length, folders: [...folders].map(([folder, n]) => ({ folder, count: n })) };
}

function hashFile(p: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const titleFromFile = (f: string) => path.basename(f, path.extname(f)).replace(/[_-]+/g, ' ');

async function exif(file: string) {
  try {
    return (await exifr.parse(file, { tiff: true, exif: true, gps: false, translateValues: true })) ?? {};
  } catch {
    return {};
  }
}

async function makeDerivatives(cfg: Cfg, id: number, file: string, isRaw: boolean) {
  const dir = path.dirname(derivPath(cfg, id, 'thumb'));
  fs.mkdirSync(dir, { recursive: true });
  let input: string | Buffer = file;
  if (isRaw) {
    // Embedded JPEG preview only. Full RAW development is out of scope.
    const t = await exifr.thumbnail(file).catch(() => undefined);
    if (!t) return null;
    input = Buffer.from(t);
  }
  const base = sharp(input, { failOn: 'none' }).rotate();
  const meta = await base.clone().metadata();
  await base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(derivPath(cfg, id, 'thumb'));
  await base.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(derivPath(cfg, id, 'preview'));
  return meta;
}

export type ScanResult = { imported: number; duplicates: number; errors: { file: string; error: string }[]; shootId: number | null; shootName: string | null };

/** Imports every new file into one photoshoot named for today's date. Originals are only ever read. */
export async function scan(db: DB, cfg: Cfg): Promise<ScanResult> {
  const { files } = pending(db, cfg);
  const result: ScanResult = { imported: 0, duplicates: 0, errors: [], shootId: null, shootName: null };
  if (!files.length) return result;

  const now = new Date();
  const name = fmtDate(now);
  const sourceLabel = `Library sync · ${cfg.libraries.map((l) => path.basename(l)).join(', ')}`;
  const existing = db.prepare("SELECT id FROM shoots WHERE name = ? AND substr(imported_at, 1, 10) = ?").get(name, now.toISOString().slice(0, 10)) as { id: number } | undefined;
  const shootId = existing?.id ?? Number(db.prepare('INSERT INTO shoots(name, source, imported_at) VALUES(?, ?, ?)').run(name, sourceLabel, now.toISOString()).lastInsertRowid);
  result.shootId = shootId;
  result.shootName = name;

  const insert = db.prepare(`INSERT INTO photos(shoot_id, path, file, hash, title, w, h, captured_at, camera, lens, exposure, file_type, size_bytes, has_derivs, added_at, next_review_at)
    VALUES(@shoot_id, @path, @file, @hash, @title, @w, @h, @captured_at, @camera, @lens, @exposure, @file_type, @size_bytes, 0, @added_at, @added_at)`);

  for (const f of files) {
    try {
      const hash = await hashFile(f);
      if (db.prepare('SELECT 1 FROM photos WHERE hash = ?').get(hash)) {
        db.prepare('INSERT OR IGNORE INTO duplicates(path, hash) VALUES(?, ?)').run(f, hash);
        result.duplicates++;
        continue;
      }
      const ext = path.extname(f).toLowerCase();
      const isRaw = RAW_EXT.has(ext);
      const x = await exif(f);
      const st = fs.statSync(f);
      const cap = x.DateTimeOriginal instanceof Date ? x.DateTimeOriginal.toISOString() : null;
      const exposure = [
        x.ExposureTime ? `1/${Math.round(1 / x.ExposureTime)}s` : null,
        x.FNumber ? `f/${x.FNumber}` : null,
        x.ISO ? `ISO ${x.ISO}` : null,
      ].filter(Boolean).join(' · ');
      const info = insert.run({
        shoot_id: shootId, path: f, file: path.basename(f), hash, title: titleFromFile(f),
        w: x.ExifImageWidth ?? x.ImageWidth ?? 0, h: x.ExifImageHeight ?? x.ImageHeight ?? 0,
        captured_at: cap, camera: [x.Make, x.Model].filter(Boolean).join(' ').trim(), lens: x.LensModel ?? '',
        exposure, file_type: ext.slice(1).toUpperCase().replace('JPEG', 'JPG'), size_bytes: st.size, added_at: now.toISOString(),
      });
      const id = Number(info.lastInsertRowid);
      const meta = await makeDerivatives(cfg, id, f, isRaw).catch(() => null);
      if (meta) {
        const rot = (meta.orientation ?? 1) >= 5;
        const w = rot ? meta.height : meta.width;
        const h = rot ? meta.width : meta.height;
        // For RAW the derivative is only the embedded thumbnail, so its size says nothing about the real pixels.
        const keepExif = isRaw && (x.ExifImageWidth ?? x.ImageWidth);
        db.prepare(`UPDATE photos SET has_derivs = 1,
          w = CASE WHEN ? OR w = 0 THEN ? ELSE w END, h = CASE WHEN ? OR h = 0 THEN ? ELSE h END WHERE id = ?`)
          .run(keepExif ? 0 : 1, w ?? 0, keepExif ? 0 : 1, h ?? 0, id);
      }
      result.imported++;
    } catch (e) {
      result.errors.push({ file: f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
