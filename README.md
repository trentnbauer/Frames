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

### Environment variables

Two layers. The **stack variables** are set in `.env` (or in Portainer's stack form) and are read by `docker-compose.yml`; the compose file hands the **container variables** to Frames. Leave anything you do not need empty.

**Stack variables** (`.env`, see `.env.example`)

| Variable | Default | What it does |
|---|---|---|
| `PHOTOS_DIR` | `./photos` | Folder of photographs on the Docker host, mounted **read-only** at `/library`. A cloud drive mounted as a folder (for example with rclone) works too. Required in the Portainer file. |
| `BIND_ADDRESS` | `127.0.0.1` | Which address the published port listens on. `127.0.0.1` is this machine only; `0.0.0.0` is every interface (turn on sign-in first). |
| `PORT` | `3000` | The port published on the host. (Inside the container Frames always listens on 3000.) |
| `FRAMES_IMAGE` | `frames:local` (built from source) | Run a published release instead of building, for example `ghcr.io/trentnbauer/frames:1.2.3` (see *Versions*). |
| `FRAMES_VERSION` | `latest` | Portainer file only: the image tag to pull. |

**Container variables** (passed to Frames by the compose files)

| Variable | Default | What it does |
|---|---|---|
| `AUTH_USER` | `frames` | User name for the optional shared password. |
| `AUTH_PASSWORD` | empty | A shared password (HTTP Basic, so use HTTPS across networks you do not trust). Empty = none. For Google, GitHub, Microsoft or your own OpenID Connect server use Settings, Access instead; both can be on. |
| `AUTH_DISABLE` | empty | `1` switches **all** sign-in off, so a misconfigured provider cannot lock you out (see *Security*). Remove it again afterwards. |
| `OIDC_ALLOW_HTTP` | empty | `1` allows an OpenID Connect server on plain `http://`, on a network you trust. |
| `SESSION_DAYS` | `14` | How long a sign-in lasts (renewed by use). |
| `ALLOWED_HOSTS` | empty | Comma-separated public host names (for example `frames.example.com`), needed only when a reverse proxy rewrites the `Host` header. |
| `TRUST_PROXY` | empty | `1` when Frames sits behind a reverse proxy, so share links rate-limit each visitor rather than the proxy. |
| `MAX_UPLOAD_MB` | `2048` | Largest single uploaded photo, in MB. |

**Set by the image itself** (change only if you run Frames without the supplied compose files)

| Variable | Value in the image | What it does |
|---|---|---|
| `DATA_DIR` | `/data` | Where the database, previews, backups and copied cloud photos live (the `frames-data` volume). |
| `LIBRARY_DIRS` | `/library` | Comma-separated read-only photo folders to scan. (`LIBRARY_DIR` is the older single-folder name.) |
| `PORT` | `3000` | The port Frames listens on inside the container. |
| `HOST` | `0.0.0.0` | The address Frames listens on inside the container. |
| `WEB_DIR` | `/app/web` | The built web app. |
| `APP_VERSION` | the release version, or `dev` | Shown in the app; set at build time. |
| `NODE_ENV` | `production` | Standard Node setting. |

Everything else (AI, sign-in providers, portfolio, sync) is set in the app, under Settings, and kept in the database.

**Portainer**: use `docker-compose.portainer.yml` (Stacks, Add stack, Web editor). It pulls the published image, reads no files, and takes every stack and container variable above from the stack's *Environment variables* section; only `PHOTOS_DIR` is required.

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

- **Sign-in (optional).** Frames works with no sign-in. To protect it you can use either or both of:
  - **OAuth providers** (Settings, Access): Google, GitHub, Microsoft, any OpenID Connect server (Authentik, Keycloak, Authelia and so on), or another OAuth 2 service. Add a provider with its client ID and secret, register the redirect address Frames shows you, list who may sign in (emails, whole domains such as `@family.com`, or account ids), press **Test sign-in**, then turn **Require sign-in** on. Everyone on the list has the same access.
  - **A shared password** (`AUTH_PASSWORD`). This is HTTP Basic, so **use HTTPS** if it crosses a network you don't trust.
- **You can't lock yourself out.** Sign-in can only be switched on after a test sign-in by an account that is on the list, and you can't save a list that removes your own account or change a provider while sign-in is on. If it still goes wrong, set `AUTH_DISABLE=1` on the container and restart.
- **How OAuth is handled.** Standard authorization-code flow with PKCE, state and nonce; the ID token's signature, issuer, audience and expiry are all checked; email entries only count if the provider says the address is verified. Sessions are random, HttpOnly, SameSite=Lax cookies (Secure over https), kept as a hash in the database. Client secrets are write-only: never sent back to the browser and left out of every backup. Failed and repeated sign-in attempts are rate-limited. Share links and the health check never need a sign-in.
- Login failures are not rate-limited for the shared password; put that on your proxy if it is internet-facing.
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

## Public portfolio

Settings, Portfolio turns one collection into a public website (your name, tagline, social links, theme toggle, masonry gallery, full-size viewer and a "My Gear" page). It is the same site that used to be built by GitHub Actions, now served by Frames, so you add photos from a photo's page (**Add to portfolio**) instead of pushing to git.

- **It is public on purpose, so it is narrow.** Only photos in the chosen collection can be reached, through a fixed set of addresses, and visitors never see places, notes, file paths or other photos.
- **What visitors get when they open a photo** is your choice: a resized copy with all camera data removed (the default), the original file (which can contain camera details and the place it was taken, so Frames warns you), or nothing extra. RAW and TIFF originals always get the resized copy.
- **Its own address.** At `/portfolio/` on this server, or give it a hostname (for example `photography.example.com`). Point a tunnel or reverse proxy at Frames and that hostname shows **only** the portfolio: every other address, including the app, share links and the API, returns "not found" on it. That is what makes it safe to expose.
- It stays public even when sign-in is required for the rest of Frames.

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
- **Access**: everyone allowed in has the same access (no per-person permissions). OAuth sign-in is tested against stand-in providers that follow the standards, not against live Google, GitHub or Microsoft.
