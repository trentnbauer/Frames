import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Express } from 'express';

// db.ts is a singleton module that reads DATA_DIR once at import time, so
// each test file gets its own isolated SQLite DB by setting the env var
// before dynamically importing app.ts (vitest resets the module registry
// per test file by default, so this doesn't leak between files).
export async function createTestApp(): Promise<{ app: Express; cleanup: () => void }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-test-'));
  process.env.DATA_DIR = tempDir;
  const { app } = await import('../app.js');
  return {
    app,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

// Distinct RGB values produce distinct bytes (and thus distinct content
// hashes) — pass a different seed per test image that needs to avoid
// deduping against another.
export async function tinyJpeg(seed = 1): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: seed % 255, g: (seed * 7) % 255, b: (seed * 13) % 255 } },
  })
    .jpeg()
    .toBuffer();
}
