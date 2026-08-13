import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
export const ORIGINALS_DIR = path.join(PHOTOS_DIR, 'originals');
export const THUMBS_DIR = path.join(PHOTOS_DIR, 'thumbs');
export const DISPLAY_DIR = path.join(PHOTOS_DIR, 'display');
// Idea mood-board reference images — a single resized copy each (no
// original/thumb/display trio, no tagging pipeline), kept apart from
// photos/ so a reference is never mistaken for an actual shot frame.
export const REFERENCES_DIR = path.join(DATA_DIR, 'references');
export const DB_PATH = path.join(DATA_DIR, 'frames.db');

for (const dir of [DATA_DIR, PHOTOS_DIR, ORIGINALS_DIR, THUMBS_DIR, DISPLAY_DIR, REFERENCES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

runMigrations(db, path.join(__dirname, 'migrations'));

export default db;
