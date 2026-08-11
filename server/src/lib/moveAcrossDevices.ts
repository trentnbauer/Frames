import fs from 'node:fs';

// fs.renameSync throws EXDEV if src/dest are on different filesystems — a
// real case here, not hypothetical: multer/AdmZip always extract under
// os.tmpdir() (the container's writable layer), while DATA_DIR is commonly
// a separate mounted volume in production. Fall back to copy-then-remove
// when a plain rename isn't possible.
//
// Deliberately has no dependency on db.ts: db.ts resolves DATA_DIR from
// process.env at module-evaluation time, and importing it too early (e.g. a
// static top-level import in a test file, before that test's beforeAll sets
// DATA_DIR) silently locks the whole file onto db.ts's un-overridable
// fallback path instead of the intended per-test isolation directory.
export function moveAcrossDevices(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}
