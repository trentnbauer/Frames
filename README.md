# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate collections you can download as untouched original files or share with a link. Requirements are in [DesignDoc.md](DesignDoc.md).

## Run with Docker

```sh
cp .env.example .env        # then edit it: at least PHOTOS_DIR
docker compose up -d --build
```

Open http://localhost:3000, go to **Photoshoots** and press **Sync library** (or **Upload photos**).

- Your photos are mounted **read-only**. Frames never writes to them (see *XMP* below for the one opt-in exception).
- The database and generated previews live in the `frames-data` volume. Back that up (see *Backup*).
- The container runs as an unprivileged user with a read-only filesystem, no extra capabilities, and a health check.

### Settings (`.env`)

| Setting | What it does |
|---|---|
| `PHOTOS_DIR` | Folder of photographs, mounted read-only at `/library`. A cloud drive mounted as a folder (for example with rclone) works too. |
| `AUTH_USER` / `AUTH_PASSWORD` | Turn on a login (HTTP Basic). Empty password = no login. |
| `BIND_ADDRESS`, `PORT` | Where to listen. Default `127.0.0.1` (this machine only). |
| `ALLOWED_HOSTS` | Public host name(s), if a reverse proxy rewrites the `Host` header. |
| `TRUST_PROXY` | `1` behind a reverse proxy, so share links rate-limit each visitor. |
| `MAX_UPLOAD_MB` | Largest single upload (default 2048). |
| `FRAMES_IMAGE` | Run a published release instead of building (see *Versions*). |

### Versions and releases

Releases are Docker images on GitHub's container registry: `ghcr.io/trentnbauer/frames`, tagged `1.2.3`, `1.2`, `1` and `latest` (amd64 and arm64). To run a release instead of building from source, set `FRAMES_IMAGE=ghcr.io/trentnbauer/frames:1.2.3` in `.env`, then:

```sh
docker compose pull && docker compose up -d --no-build
```

Pin an exact version to choose when you upgrade. The running version is shown in Settings, About.

**Publishing a release** (maintainers): push a version tag. The release workflow runs the tests, then builds and pushes the image.

```sh
git tag v1.2.3 && git push origin v1.2.3
```

A tag with a suffix (`v1.2.3-rc.1`) publishes only that exact version, never `latest`. The first publish creates the package as private: make it public in the package settings if others should pull it.

## Security

- **Login.** Set `AUTH_PASSWORD` to require a login. It is HTTP Basic, so **use HTTPS** (a reverse proxy) if the password crosses a network you don't trust. There is no rate limiting on failed logins; put one on your proxy if it is internet-facing.
- **Exposure.** By default Frames only listens on this machine. To reach it from other devices set `BIND_ADDRESS=0.0.0.0`, and set a password first. Frames warns at start-up if there is no password.
- Cross-site writes are blocked, responses carry a strict Content-Security-Policy, original files are only ever served by photo id, symlinks in the library are ignored, and the AI key is write-only (never sent back, never in a backup).
- The page loads its fonts from Google Fonts (allowed in the policy). Self-host them if that matters to you.

### Share links

A **Share** button on every collection and photoshoot makes an address like `/s/Xk3…` that works **without the login**, so you can send photos to a client or friend. This is the one part of Frames reachable without a password, so it is narrow on purpose:

- A link opens exactly one collection or photoshoot. Nothing else is reachable with it.
- Guests see only each photo's picture and title. No location, camera data, notes, descriptions or file paths.
- You choose per link whether guests can **download the originals** and/or **review and rate** them. Ratings from guests are kept apart from your own reviews and never change your ratings or schedule. You can see them under the link.
- Links can expire, and can be turned off at any time. They cannot be guessed (128 random bits), and wrong guesses are rate-limited.
- Share pages are marked not for search engines.

Anyone who has the address can use it, so treat it like a key and send it privately.

## Backup

Everything Frames knows (reviews, tags, collections, share links, settings) is in one database. Your originals are not part of it: back those up the way you already do.

- **Download a backup** from Settings, Backup. The AI key is left out.
- **Automatic backups**: one a day, the last seven kept, in the data volume's `backups` folder.
- **Restore**: stop Frames, replace `frames.db` in the data volume with a backup (delete any `frames.db-wal` and `frames.db-shm` beside it), start it again, then Settings, Libraries & storage, **Rebuild all** if previews are missing. Previews and analysis are rebuilt from your originals.
- On start-up Frames checks the database and logs a clear message if it is damaged.

## AI (optional)

Off by default; everything else works without it. Turn it on in Settings, AI:

- **Local**: an [Ollama](https://ollama.com) server on your network (a vision model such as `llava`, and an embedding model such as `nomic-embed-text`). Photos never leave your network.
- **External**: any OpenAI-compatible service. Previews (at most 1024 px) are sent to that third party, so you must confirm this before it can be used.

It suggests descriptions, subjects and tags (nothing counts until you accept it), enables search by meaning and natural-language searches, and improves "similar" suggestions. Without AI, colour, shape and light still drive similarity, near-duplicate detection and recommendations.

## XMP

Frames reads `photo.jpg.xmp` or `photo.xmp` next to a photograph: keywords become tags, and its title and description are used where you haven't written your own. **Your own edits always win**; differences are listed for you to settle. Tags another app added are never removed. Approved metadata can be exported as XMP (always to the data folder). Writing sidecars **beside your originals** is off by default and needs the library mounted writable (remove `:ro` in `docker-compose.yml`); another program's sidecar is never overwritten, and image files are never modified.

## Develop

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders. Node 22 or newer.

## Known limits

- **RAW files**: every RAW (uploaded or in a library) gets a JPEG thumbnail and preview. Frames uses the biggest JPEG the camera embedded (found with ExifTool, so it works across makers). If there is none or it is small, the RAW is developed with `dcraw` just to make the preview. The RAW itself is never changed. Checked with a real Nikon D5600 file and the ExifTool sample set (Canon, Nikon, Fuji, Panasonic, Adobe DNG), not every camera. A file with no picture data at all shows a placeholder.
- **AI**: tested against a stand-in model server, not against real models. Quality depends on the model you choose.
- **Cloud storage**: use a cloud drive mounted as a folder. There are no built-in connectors for S3, WebDAV or Google Drive.
- **Login**: one shared password, no accounts or per-person permissions.
