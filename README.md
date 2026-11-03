# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate collections you can download as untouched original files or share with a link.

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

Pin an exact version to choose when you upgrade. The running version is shown in the corner of every page (and in Settings, About). Click it for **What's new**: the merged pull requests so far. After an update it opens by itself once, listing only what is new since that browser last looked (the first visit is never shown the whole history). A build from source shows "dev build" and an empty list.

**Version numbers are decided by pull request labels.** Every pull request carries exactly one label (the *Release label* check fails without one):

| Label | Use it for | Version change |
|---|---|---|
| `release: fix` | a bug fix, a small tweak, a dependency update | `1.2.3` to `1.2.4` |
| `release: minor` | a new feature or setting that existing users can ignore | `1.2.3` to `1.3.0` |
| `release: major` | a breaking change (something users must act on, such as a changed setting or a removed feature) | `1.2.3` to `2.0.0` |
| `release: none` | documentation, CI and other changes that need no new image | no release |

When the pull request is merged into `main`, the **Version** workflow works out the next number from the latest `vX.Y.Z` tag (starting from `0.0.0`, so the first release is `0.0.1`, `0.1.0` or `1.0.0`), tags that commit, creates a GitHub release with generated notes, and the **Release** workflow runs the tests and publishes the image (amd64 and arm64) with the tags `1.2.3`, `1.2`, `1` and `latest`. The rules are in `.github/scripts/next-version.sh` and are tested in CI.

The release also writes the "What's new" list from the merged pull requests (`.github/scripts/generate-changelog.sh`), so a clear pull request title is the changelog line.

Setting it up once (maintainers): create the four labels, and in the repository's branch protection rules for `main` make **Release label** a required check. Pushing a tag by hand (`git tag v1.2.3 && git push origin v1.2.3`) still publishes that exact version; a tag with a suffix (`v1.2.3-rc.1`) is published as that version only, never as `latest`. The first publish creates the package as private: make it public in the package settings if others should pull it.

## Security

- **Sign-in (optional).** Frames works with no sign-in. To protect it you can use either or both of:
  - **OAuth providers** (Settings, Access): Google, GitHub, Microsoft, any OpenID Connect server (Authentik, Keycloak, Authelia and so on), or another OAuth 2 service. Add a provider with its client ID and secret, register the redirect address Frames shows you, list who may sign in (emails, whole domains such as `@family.com`, or account ids), press **Test sign-in**, then turn **Require sign-in** on. Everyone on the list has the same access.
  - **A shared password** (`AUTH_PASSWORD`). This is HTTP Basic, so **use HTTPS** if it crosses a network you don't trust.
- **You can't lock yourself out.** Sign-in can only be switched on after a test sign-in by an account that is on the list, and you can't save a list that removes your own account or change a provider while sign-in is on. If it still goes wrong, set `AUTH_DISABLE=1` on the container and restart.
- **How OAuth is handled.** Standard authorization-code flow with PKCE, state and nonce; the ID token's signature, issuer, audience and expiry are all checked; email entries only count if the provider says the address is verified. Sessions are random, HttpOnly, SameSite=Lax cookies (Secure over https), kept as a hash in the database. Client secrets are write-only: never sent back to the browser and left out of every backup. Failed and repeated sign-in attempts are rate-limited. Share links and the health check never need a sign-in.
- Wrong shared passwords are rate-limited: after 10 wrong tries in a minute an address is refused (even with the right password) until the minute is up, and `/auth/password` follows the same limit. Put a proxy limit in front too if Frames is internet-facing.
- **Everyone allowed in has full access**, including to Settings. That means they can point Frames at an AI address or sign-in provider of their choosing, so only allow people you trust. AI requests never follow redirects, so a service cannot bounce your key to another host.
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

## Cloud sync (Google Drive, Dropbox, OneDrive)

Settings, Cloud sync copies the photographs from a cloud folder into Frames, then adds them like any other photo (the folder is `cloud/` in the data volume). It is one way and careful:

- **Read-only on the cloud side.** Frames asks each service for read access to files and nothing more.
- **Nothing is deleted or overwritten.** A photo already copied is never fetched again. If you edit it online, Frames tells you and keeps the copy you have. Removing a file online, or disconnecting an account, leaves your copies alone.
- **Photos and sidecars only.** Image and RAW files and `.xmp` sidecars are copied; everything else is skipped.
- **Set up once per service.** A self-hosted app has no shared account with these services, so you register a small app of your own in the service's developer console (free) and paste its client ID and secret into Settings. The return address to give them is shown on that page (it is `<your Frames address>/api/cloud/callback`; set the public address in Settings, Access if Frames is behind a proxy).
- **Secrets stay put.** The client secret and the refresh token are kept on the server only, are never shown again and are left out of backups.
- Pick a folder, then sync by hand or let Frames check as often as every 15 minutes. Connect as many accounts as you like.

## Cloudflare tunnel

Settings, Cloudflare tunnel lets you reach Frames (or just your public portfolio) from outside your network with no open ports. Frames runs the bundled `cloudflared` for you.

- **Two ways to set it up.** Paste a tunnel token you made in the Cloudflare dashboard, or give Frames an API token and it creates the tunnel, its routes and the DNS records itself. The API token only needs *Account: Cloudflare Tunnel: Edit* and *Zone: DNS: Edit* (plus *Zone: Read*), limited to your domain.
- **Safe by default.** Every hostname goes to this Frames server and nothing else on your network. A **portfolio** hostname shows only the public portfolio (set the same address in Settings, Portfolio). Exposing the **whole app** is refused unless sign-in is on.
- **Secrets stay put.** Tokens are write-only (never shown again), are kept out of backups, reach `cloudflared` through its environment (not the command line) and are removed from the tunnel log.
- It reconnects by itself after a failure and starts again when Frames restarts, if you left it on. Frames only deletes DNS records it created.
- Running Frames outside the supplied Docker image? Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and put it on the `PATH`.


## Backup

Everything Frames knows (reviews, tags, collections, share links, settings) is in one database. Your originals are not part of it: back those up the way you already do.

- **Download a backup** from Settings, Backup. The AI key is left out.
- **Automatic backups**: one a day, the last seven kept, in the data volume's `backups` folder.
- **Restore**: stop Frames, replace `frames.db` in the data volume with a backup (delete any `frames.db-wal` and `frames.db-shm` beside it), start it again, then Settings, Libraries & storage, **Rebuild all** if previews are missing. Previews and analysis are rebuilt from your originals.
- On start-up Frames checks the database and logs a clear message if it is damaged.

## AI (optional)

Off by default; everything else works without it. Settings, AI is one list of the AIs you have set up. Add as many as you like, open one to change it, and choose which one is in use:

- **On your network** (photos never leave it): [Ollama](https://ollama.com) (a vision model such as `llava` and an embedding model such as `nomic-embed-text`), or any local OpenAI-compatible server (LM Studio, llama.cpp, vLLM, LocalAI).
- **Cloud**: Claude, Gemini, ChatGPT, OpenRouter, or any other OpenAI-compatible service. Previews (at most 1024 px) are sent to that third party, so you must tick a confirmation on each one before it can be used.
- Claude and OpenRouter have no embeddings, so with one of those in use, search by meaning is unavailable (colour and shape still drive similar photos).
- API keys are write-only: never shown again and left out of backups. Testing a connection sends one short text message, never a photograph.
- Removing the confirmation, or deleting the AI in use, switches AI off rather than sending photos anywhere unconfirmed.

It suggests descriptions, subjects and tags (nothing counts until you accept it), enables search by meaning and natural-language searches, and improves "similar" suggestions. Without AI, colour, shape and light still drive similarity, near-duplicate detection and recommendations.

## XMP

Frames reads `photo.jpg.xmp` or `photo.xmp` next to a photograph: keywords become tags, and its title and description are used where you haven't written your own. **Your own edits always win**; differences are listed for you to settle. Tags another app added are never removed. Approved metadata can be exported as XMP (always to the data folder). Writing sidecars **beside your originals** is off by default and needs the library mounted writable (remove `:ro` in `docker-compose.yml`); another program's sidecar is never overwritten, and image files are never modified.

## What Frames is not

Left out on purpose, to stay a small tool for one photographer's portfolio: photo editing or RAW development, photobook or print layout, gallery-wall or framing previews, exhibition management, social networking or public galleries beyond the one portfolio page, multi-user collaboration (sign-in only controls who may get in; everyone allowed in has the same access), a photography journal, gamification or challenges, heavy analytics and reporting, automated publishing to other services, two-way file synchronisation, training your own AI models, and elaborate ranking algorithms.

## Develop

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders. Node 22 or newer.

## Known limits

- **RAW files**: every RAW (uploaded or in a library) gets a JPEG thumbnail and preview. Frames uses the biggest JPEG the camera embedded (found with ExifTool, so it works across makers). If there is none or it is small, the RAW is developed with `dcraw` just to make the preview. The RAW itself is never changed. Checked with a real Nikon D5600 file and the ExifTool sample set (Canon, Nikon, Fuji, Panasonic, Adobe DNG), not every camera. A file with no picture data at all shows a placeholder.
- **AI**: tested against a stand-in model server, not against real models. Quality depends on the model you choose.
- **Cloud storage**: built-in sync covers Google Drive, Dropbox and OneDrive (see *Cloud sync*), and any other drive that can be mounted as a folder (S3, WebDAV, SMB, with rclone for example) works as a library. There are no built-in S3 or WebDAV connectors. The three services are tested against stand-in servers, not the live services.
- **Access**: everyone allowed in has the same access (no per-person permissions). OAuth sign-in is tested against stand-in providers that follow the standards, not against live Google, GitHub or Microsoft.
