-- A Lomography-style color-bar strip under each thumbnail: a JSON array of
-- hex colors (most-dominant first), computed at ingest time and backfilled
-- automatically at server boot for photos uploaded before this existed
-- (see backfillPalettes() in lib/ingest.ts).
ALTER TABLE photos ADD COLUMN palette TEXT;
