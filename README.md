# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, and curate collections you can export as a ZIP of untouched originals. See [DesignDoc.md](DesignDoc.md) for the full requirements.

## Run with Docker

```sh
PHOTOS_DIR=/path/to/your/photos docker compose up --build
```

Open http://localhost:3000, go to **Photoshoots** and press **Sync library**.

- Your photos are mounted **read-only**. Frames never writes to them.
- The database and generated previews live in the `frames-data` volume. Back that up.
- There is **no login**. Run it on a trusted network or behind your own reverse proxy.

## Develop

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders.

Server settings (environment): `LIBRARY_DIRS` (comma-separated folders to read), `DATA_DIR`, `PORT`, `WEB_DIR`.

## What works

- Sync from library folders, exact-duplicate detection, EXIF extraction, thumbnails and previews. Each import becomes a photoshoot named for the import date, which you can rename.
- Library browsing and filtering (photoshoot, tag, rating), search across filenames, metadata and tags, tags you add yourself.
- Blind multi-session reviews with an emoji scale, notes, resume, adaptive intervals, and review-again.
- Collections with an optional print target (size, orientation, PPI) that explains why a photo fails, and a **Download ZIP** of the original files in order.
- Stats, simple recommendations from your review history, settings.

## Not built yet

- **AI** (tagging, similarity, semantic search, “belongs together”). The setting is saved but does nothing yet.
- **RAW previews** use the small embedded thumbnail only; RAW files with none show a placeholder. Full-size embedded previews are not extracted.
- **Near-duplicate detection**, **XMP sidecars**, **cloud-storage connections** (use a mounted folder), **backup tooling**.
