# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, and curate collections you can download as untouched original files. See [DesignDoc.md](DesignDoc.md) for the full requirements.

## Run with Docker

```sh
cp .env.example .env        # then edit it: at least PHOTOS_DIR
docker compose up -d --build
```

Open http://localhost:3000, go to **Photoshoots** and press **Sync library**.

- Your photos are mounted **read-only**. Frames never writes to them.
- The database and generated previews live in the `frames-data` volume. Back that up.
- The container runs as an unprivileged user with a read-only filesystem, no extra capabilities, and a health check.

### Security

- **Login.** Set `AUTH_PASSWORD` (and optionally `AUTH_USER`, default `frames`) in `.env` to require a login. It is HTTP Basic, so **use HTTPS** (a reverse proxy) if the password crosses a network you don't trust. There is no rate limiting on failed logins; put one on your proxy if it is internet-facing.
- **Exposure.** By default Frames only listens on this machine (`BIND_ADDRESS=127.0.0.1`). To reach it from other devices set `BIND_ADDRESS=0.0.0.0`, and set a password first. Frames logs a warning at start-up if there is no password.
- **Reverse proxy.** If your proxy rewrites the `Host` header, list the public name in `ALLOWED_HOSTS` (for example `frames.example.com`), otherwise saving changes is blocked by the cross-site request check.
- Cross-site writes are blocked, responses carry a strict Content-Security-Policy, original files are only ever served by photo id, and symlinks in the library are ignored.
- The page loads its fonts from Google Fonts (allowed in the policy). Self-host them if that matters to you.

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
- Collections with an optional print target (size, orientation, PPI) that explains why a photo fails, and a **Download files** button that saves the original files, in order and byte for byte, through your browser (no ZIP). Chrome may ask once to allow multiple downloads.
- Stats, simple recommendations from your review history, settings.

## Not built yet

- **AI** (tagging, similarity, semantic search, “belongs together”). The setting is saved but does nothing yet.
- **RAW previews** use the small embedded thumbnail only; RAW files with none show a placeholder. Full-size embedded previews are not extracted.
- **Near-duplicate detection**, **XMP sidecars**, **cloud-storage connections** (use a mounted folder), **backup tooling**.
