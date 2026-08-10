-- A Lomography-style color-bar strip under each thumbnail: a JSON array of
-- hex colors (most-dominant first), computed at ingest time and backfillable
-- for photos uploaded before this existed (see POST /api/photos/backfill-palette).
ALTER TABLE photos ADD COLUMN palette TEXT;
