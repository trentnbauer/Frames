-- Four independent additions, bundled into one migration since none
-- depends on the others:
--   taken_at    EXIF capture date/time (DateTimeOriginal), for a real
--               "date taken" sort distinct from upload order (created_at).
--   latitude/
--   longitude   Raw GPS coordinates kept alongside the reverse-geocoded
--               place name in `location` — the coords were previously
--               computed then discarded, closing off any future map view.
--   is_favorite Manual star/pick flag, independent of tags or projects.
--   phash       Perceptual (average) hash for near-duplicate detection —
--               distinct from content_hash, which only catches byte-for-
--               byte identical files.
ALTER TABLE photos ADD COLUMN taken_at TEXT;
ALTER TABLE photos ADD COLUMN latitude REAL;
ALTER TABLE photos ADD COLUMN longitude REAL;
ALTER TABLE photos ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN phash TEXT;
