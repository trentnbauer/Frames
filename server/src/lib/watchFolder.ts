import fs from 'node:fs';
import path from 'node:path';
import { ingestPhoto } from './ingest.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
// A file's size stops changing between two checks once whatever's writing
// it (a scanner, a sync client, a manual copy) has finished — cruder than
// an OS-level "write finished" signal, but portable, and good enough for a
// personal watch folder where reading mid-copy is the failure to avoid.
const SETTLE_INTERVAL_MS = 2000;
const SETTLE_MAX_CHECKS = 10;

// Auto-imports image files dropped into `dir` — e.g. a phone's camera-sync
// folder or a scanner's output directory — without the user opening Frames
// and clicking Upload. Runs once over whatever's already there at boot,
// then keeps watching. Successfully imported files move into `dir/.imported`
// rather than being deleted, so the folder can't grow into a slow full
// rescan on every restart (content-hash dedup would make re-ingesting them
// a harmless no-op anyway, but skipping the read/hash work entirely is
// still worth it) while staying non-destructive to the user's own files.
export function startWatchFolder(dir: string) {
  const processedDir = path.join(dir, '.imported');
  fs.mkdirSync(processedDir, { recursive: true });

  const inFlight = new Set<string>();

  async function waitUntilSettled(filePath: string): Promise<boolean> {
    let lastSize = -1;
    for (let i = 0; i < SETTLE_MAX_CHECKS; i++) {
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat) return false; // moved/deleted before we got to it
      if (stat.size === lastSize && stat.size > 0) return true;
      lastSize = stat.size;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
    return lastSize > 0;
  }

  async function tryIngest(filePath: string) {
    if (inFlight.has(filePath)) return;
    inFlight.add(filePath);
    try {
      if (!(await waitUntilSettled(filePath))) return;
      const buffer = await fs.promises.readFile(filePath);
      const originalName = path.basename(filePath);
      await ingestPhoto(buffer, originalName);
      await fs.promises.rename(filePath, path.join(processedDir, originalName));
      console.log(`Watch folder: imported ${originalName}`);
    } catch (err) {
      console.error(`Watch folder: failed to import ${filePath}:`, err instanceof Error ? err.message : err);
    } finally {
      inFlight.delete(filePath);
    }
  }

  function isImage(name: string) {
    return IMAGE_EXT.has(path.extname(name).toLowerCase());
  }

  for (const name of fs.readdirSync(dir)) {
    if (isImage(name)) tryIngest(path.join(dir, name));
  }

  fs.watch(dir, (_event, filename) => {
    if (filename && isImage(filename)) tryIngest(path.join(dir, filename));
  });

  console.log(`Watch folder active: ${dir}`);
}
