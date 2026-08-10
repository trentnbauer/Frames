-- SQLite can't ALTER a CHECK constraint directly, so widen it by renaming
-- the old table out of the way, creating a fresh one with the new
-- constraint, and copying rows across (explicit ids, so AUTOINCREMENT
-- continuity is preserved).
ALTER TABLE vision_providers RENAME TO vision_providers_old;

CREATE TABLE vision_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('openai', 'anthropic', 'gemini', 'self_hosted')),
  base_url TEXT,
  api_key TEXT,
  model TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO vision_providers (id, name, type, base_url, api_key, model, enabled, created_at)
  SELECT id, name, type, base_url, api_key, model, enabled, created_at FROM vision_providers_old;

DROP TABLE vision_providers_old;
