-- Shot list: free-text items an idea still needs shot, checked off once
-- they're covered — separate from idea_photos (frames already shot).
CREATE TABLE IF NOT EXISTS idea_shot_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_idea_shot_list_idea ON idea_shot_list_items(idea_id);
