-- Tracks when an idea (project) was last meaningfully touched — title/
-- notes/status edits, zine_state saves (same PATCH endpoint), or a photo
-- being added/removed — so the sidebar and Dashboard can sort by that
-- instead of pure creation order. CURRENT_TIMESTAMP, not datetime('now'):
-- SQLite only allows the "true constant" CURRENT_* keywords as a NOT NULL
-- default on ADD COLUMN, not a function-call expression.
ALTER TABLE ideas ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
