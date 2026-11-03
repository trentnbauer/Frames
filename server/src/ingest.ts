import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { analyseLocal } from './analysis.js';
import type { DB } from './db.js';
import { rawInfo, rawToJpeg, type RawInfo } from './raw.js';
import { findSidecar, readSidecar, type XmpData } from './xmp.js';

export const RAW_EXT = new Set(['.raf', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2']);
export const IMAGE_EXT = new Set([...RAW_EXT, '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

export type Cfg = { libraries: string[]; dataDir: string };

export const internalDir = (cfg: Cfg) => path.join(cfg.dataDir, 'originals');

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
    // Symlinks are skipped on purpose: a link must not pull in files from outside the library.
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
    const lib = cfg.libraries.find((l) => f.startsWith(l + path.sep))!;
    const rel = path.relative(lib, path.dirname(f));
    const key = path.join(path.basename(lib), rel) || path.basename(lib);
    folders.set(key, (folders.get(key) ?? 0) + 1);
  }
  return { files, count: files.length, folders: [...folders].map(([folder, n]) => ({ folder, count: n })) };
}

export function hashFile(p: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const titleFromFile = (f: string) => path.basename(f, path.extname(f)).replace(/[_-]+/g, ' ');

type Meta = Record<string, any>;
async function exif(file: string): Promise<Meta> {
  let x: Meta = {};
  try {
    x = (await exifr.parse(file, { tiff: true, exif: true, gps: true, iptc: true, translateValues: true, mergeOutput: true })) ?? {};
  } catch { /* some formats exifr cannot read; ExifTool below covers RAW */ }
  if (RAW_EXT.has(path.extname(file).toLowerCase())) {
    // ExifTool reads every camera maker's RAW format. It only fills in what exifr could not find.
    const info = await rawInfo(file);
    if (info) for (const [k, v] of Object.entries(info.meta)) if (v !== undefined && (x[k] === undefined || x[k] === null)) x[k] = v;
  }
  return x;
}
const arr = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((s) => String(s).trim()).filter(Boolean);

/**
 * Applies metadata that came from outside Frames (IPTC in the file, an XMP sidecar).
 * Rules: what the user typed always wins. External values only fill blanks, and when they differ
 * from something the user wrote, the difference is recorded as a conflict for the user to decide.
 * Tags are only ever added, never removed.
 */
export function applyExternal(db: DB, id: number, ext: { title?: string; description?: string; keywords?: string[]; rating?: number | null; place?: string }, source: 'xmp' | 'iptc') {
  const p = db.prepare('SELECT title, title_user, description, desc_source, place FROM photos WHERE id = ?').get(id) as { title: string; title_user: number; description: string; desc_source: string; place: string } | undefined;
  if (!p) return;
  for (const k of ext.keywords ?? []) {
    const name = k.toLowerCase().slice(0, 60);
    if (name) db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, ?, 1, 'tag')").run(id, name, source);
  }
  const conflict = (field: string, mine: string, theirs: string) => db.prepare('INSERT OR REPLACE INTO xmp_conflicts(photo_id, field, mine, theirs) VALUES(?, ?, ?, ?)').run(id, field, mine, theirs);
  const clear = (field: string) => db.prepare('DELETE FROM xmp_conflicts WHERE photo_id = ? AND field = ?').run(id, field);
  if (ext.title) {
    if (!p.title_user) db.prepare('UPDATE photos SET title = ? WHERE id = ?').run(ext.title.slice(0, 200), id);
    else if (ext.title !== p.title) conflict('title', p.title, ext.title);
    else clear('title');
  }
  if (ext.description) {
    if (p.desc_source === 'user') { if (ext.description !== p.description) conflict('description', p.description, ext.description); else clear('description'); }
    else if (source === 'xmp' || p.desc_source !== 'xmp') db.prepare('UPDATE photos SET description = ?, desc_source = ? WHERE id = ?').run(ext.description.slice(0, 2000), source, id);
  }
  if (ext.place && !p.place) db.prepare('UPDATE photos SET place = ? WHERE id = ?').run(ext.place.slice(0, 120), id);
  if (source === 'xmp' && ext.rating !== undefined) db.prepare('UPDATE photos SET xmp_rating = ? WHERE id = ?').run(ext.rating, id);
}

const sidecarSig = (file: string) => {
  const f = findSidecar(file);
  if (!f) return null;
  try { const st = fs.statSync(f); return `${Math.floor(st.mtimeMs)}-${st.size}`; } catch { return null; }
};

function importSidecar(db: DB, id: number, file: string) {
  const sig = sidecarSig(file);
  db.prepare('UPDATE photos SET xmp_sig = ? WHERE id = ?').run(sig, id);
  const x: XmpData | null = sig ? readSidecar(file) : null;
  if (x) applyExternal(db, id, x, 'xmp');
}

async function makeDerivatives(cfg: Cfg, id: number, file: string, isRaw: boolean, info: RawInfo | null) {
  const dir = path.dirname(derivPath(cfg, id, 'thumb'));
  fs.mkdirSync(dir, { recursive: true });
  let input: string | Buffer = file;
  if (isRaw) {
    // A RAW file becomes a JPEG first (its biggest embedded preview, or developed by dcraw), and the thumbnail and
    // preview are made from that. The RAW itself is only read.
    const r = await rawToJpeg(file, info);
    if (r) input = r.jpeg;
    else {
      // No helper tools on this machine: fall back to the small thumbnail inside the file, if it has one.
      const t = await exifr.thumbnail(file).catch(() => undefined);
      if (!t) return null;
      input = Buffer.from(t);
    }
  }
  const base = sharp(input, { failOn: 'none' }).rotate();
  const meta = await base.clone().metadata();
  await base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(derivPath(cfg, id, 'thumb'));
  await base.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(derivPath(cfg, id, 'preview'));
  return meta;
}

/** Builds previews and the AI-free analysis for one photo. Safe to run again. */
export async function processPhoto(db: DB, cfg: Cfg, id: number, file: string, opts: { exifW?: number; exifH?: number } = {}) {
  const isRaw = RAW_EXT.has(path.extname(file).toLowerCase());
  const info = isRaw ? await rawInfo(file) : null;
  const meta = await makeDerivatives(cfg, id, file, isRaw, info).catch(() => null);
  if (!meta) return false;
  const rot = (meta.orientation ?? 1) >= 5;
  const w = rot ? meta.height : meta.width;
  const h = rot ? meta.width : meta.height;
  // For RAW the JPEG is a preview, smaller than the real picture, so its size says nothing about the real pixels:
  // keep the size from the file's own header when there is one.
  const keepExif = isRaw && !!(info?.w || opts.exifW);
  db.prepare('UPDATE photos SET has_derivs = 1, w = CASE WHEN ? THEN w ELSE ? END, h = CASE WHEN ? THEN h ELSE ? END WHERE id = ?')
    .run(keepExif ? 1 : 0, w ?? 0, keepExif ? 1 : 0, h ?? 0, id);
  try {
    const a = await analyseLocal(derivPath(cfg, id, 'thumb'));
    db.prepare('UPDATE photos SET dhash = ?, palette = ?, colors = ?, brightness = ?, contrast = ?, saturation = ? WHERE id = ?')
      .run(a.dhash, JSON.stringify(a.palette), a.colors, a.brightness, a.contrast, a.saturation, id);
  } catch (e) {
    console.error(`analysis failed for photo ${id}`, e);
  }
  return true;
}

export type ScanResult = { imported: number; duplicates: number; relinked: number; changed: number; errors: { file: string; error: string }[]; shootId: number | null; shootName: string | null };

function readInto(db: DB, id: number, x: Meta, file: string) {
  // EXIF capture times carry no timezone. Keep the wall-clock time as written ("06:30 on 12 Oct"), never
  // converted to UTC, or a dawn shot lands on the previous day.
  const d = x.DateTimeOriginal instanceof Date && !Number.isNaN(+x.DateTimeOriginal) ? x.DateTimeOriginal : null;
  const p2 = (n: number) => String(n).padStart(2, '0');
  const cap = d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` : null;
  const exposure = [x.ExposureTime ? `1/${Math.round(1 / x.ExposureTime)}s` : null, x.FNumber ? `f/${x.FNumber}` : null, x.ISO ? `ISO ${x.ISO}` : null].filter(Boolean).join(' · ');
  const lat = typeof x.latitude === 'number' ? x.latitude : null;
  const lon = typeof x.longitude === 'number' ? x.longitude : null;
  db.prepare('UPDATE photos SET captured_at = ?, camera = ?, lens = ?, exposure = ?, lat = ?, lon = ?, w = CASE WHEN ? > 0 THEN ? ELSE w END, h = CASE WHEN ? > 0 THEN ? ELSE h END WHERE id = ?')
    .run(cap, [x.Make, x.Model].filter(Boolean).join(' ').trim(), x.LensModel ?? '', exposure, lat, lon,
      x.ExifImageWidth ?? x.ImageWidth ?? 0, x.ExifImageWidth ?? x.ImageWidth ?? 0, x.ExifImageHeight ?? x.ImageHeight ?? 0, x.ExifImageHeight ?? x.ImageHeight ?? 0, id);
  // IPTC inside the file, then the sidecar next to it (the sidecar is what other photo apps edit).
  applyExternal(db, id, { title: arr(x.ObjectName)[0], description: arr(x.Caption)[0] ?? arr(x['Caption-Abstract'])[0], keywords: arr(x.Keywords), place: [arr(x.City)[0], arr(x.Country)[0]].filter(Boolean).join(', ') }, 'iptc');
  importSidecar(db, id, file);
}

/** Imports every new file into one photoshoot named for today's date, then notices files that changed. Originals are only ever read. */
export async function scan(db: DB, cfg: Cfg, onProgress?: (done: number, total: number) => void): Promise<ScanResult> {
  const { files } = pending(db, cfg);
  const known = db.prepare('SELECT id, path, size_bytes, mtime, hash, xmp_sig FROM photos WHERE missing = 0').all() as { id: number; path: string; size_bytes: number; mtime: number | null; hash: string; xmp_sig: string | null }[];
  let processed = 0;
  const total = files.length + known.length;
  const tick = () => onProgress?.(++processed, total);
  const result: ScanResult = { imported: 0, duplicates: 0, relinked: 0, changed: 0, errors: [], shootId: null, shootName: null };

  const now = new Date();
  if (files.length) {
    const name = fmtDate(now);
    const sourceLabel = `Library sync · ${cfg.libraries.map((l) => path.basename(l)).join(', ')}`;
    const day = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const existing = db.prepare("SELECT id FROM shoots WHERE name = ? AND source LIKE 'Library sync%' AND substr(imported_at, 1, 10) IN (?, ?)").get(name, now.toISOString().slice(0, 10), day) as { id: number } | undefined;
    const shootId = existing?.id ?? Number(db.prepare('INSERT INTO shoots(name, source, imported_at) VALUES(?, ?, ?)').run(name, sourceLabel, now.toISOString()).lastInsertRowid);
    result.shootId = shootId;
    result.shootName = name;

    const insert = db.prepare(`INSERT INTO photos(shoot_id, path, file, hash, title, w, h, file_type, size_bytes, mtime, has_derivs, added_at, next_review_at)
      VALUES(@shoot_id, @path, @file, @hash, @title, 0, 0, @file_type, @size_bytes, @mtime, 0, @added_at, @added_at)`);

    for (const f of files) {
      try {
        const hash = await hashFile(f);
        const same = db.prepare('SELECT id, path FROM photos WHERE hash = ?').get(hash) as { id: number; path: string } | undefined;
        if (same) {
          if (!fs.existsSync(same.path)) {
            // The known file moved: keep its reviews and tags, just point it at the new location.
            db.prepare('UPDATE photos SET path = ?, file = ?, missing = 0, mtime = ? WHERE id = ?').run(f, path.basename(f), Math.floor(fs.statSync(f).mtimeMs), same.id);
            result.relinked++;
          } else {
            db.prepare('INSERT OR IGNORE INTO duplicates(path, hash) VALUES(?, ?)').run(f, hash);
            result.duplicates++;
          }
          continue;
        }
        const ext = path.extname(f).toLowerCase();
        const st = fs.statSync(f);
        const id = Number(insert.run({
          shoot_id: result.shootId, path: f, file: path.basename(f), hash, title: titleFromFile(f),
          file_type: ext.slice(1).toUpperCase().replace('JPEG', 'JPG'), size_bytes: st.size, mtime: Math.floor(st.mtimeMs), added_at: now.toISOString(),
        }).lastInsertRowid);
        const x = await exif(f);
        readInto(db, id, x, f);
        await processPhoto(db, cfg, id, f, { exifW: x.ExifImageWidth ?? x.ImageWidth, exifH: x.ExifImageHeight ?? x.ImageHeight });
        result.imported++;
      } catch (e) {
        result.errors.push({ file: f, error: e instanceof Error ? e.message : String(e) });
      } finally {
        tick();
      }
    }
  }

  // Files already known: did the image change, or did its sidecar?
  for (const k of known) {
    try {
      const st = fs.statSync(k.path);
      const m = Math.floor(st.mtimeMs);
      if (k.mtime === null) {
        db.prepare('UPDATE photos SET mtime = ? WHERE id = ?').run(m, k.id); // first scan since this was added to Frames
      } else if (st.size !== k.size_bytes || m !== k.mtime) {
        const hash = await hashFile(k.path);
        db.prepare('UPDATE photos SET mtime = ?, size_bytes = ? WHERE id = ?').run(m, st.size, k.id);
        if (hash !== k.hash) {
          // Edited in place. Keep reviews, tags and collections; refresh everything derived from the pixels.
          db.prepare("UPDATE photos SET hash = ?, ai_status = NULL, ai_json = NULL, embedding = NULL, ai_attempts = 0 WHERE id = ?").run(hash, k.id);
          const x = await exif(k.path);
          readInto(db, k.id, x, k.path);
          await processPhoto(db, cfg, k.id, k.path, { exifW: x.ExifImageWidth ?? x.ImageWidth });
          result.changed++;
        }
      } else if (sidecarSig(k.path) !== k.xmp_sig) {
        importSidecar(db, k.id, k.path);
      }
    } catch {
      /* missing or unreadable files are flagged by the caller */
    } finally {
      tick();
    }
  }
  return result;
}

/** Regenerates previews and analysis for photos that lack them (or all of them). */
export async function rebuild(db: DB, cfg: Cfg, all: boolean, onProgress?: (done: number, total: number) => void) {
  const rows = db.prepare(`SELECT id, path FROM photos WHERE missing = 0 ${all ? '' : 'AND (has_derivs = 0 OR dhash IS NULL)'}`).all() as { id: number; path: string }[];
  let done = 0, fixed = 0;
  for (const r of rows) {
    try { if (await processPhoto(db, cfg, r.id, r.path)) fixed++; } catch { /* leave it for next time */ }
    onProgress?.(++done, rows.length);
  }
  return { checked: rows.length, rebuilt: fixed };
}
