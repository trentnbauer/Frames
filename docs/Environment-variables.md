# Environment variables

Two layers. The **stack variables** are set in `.env` (or in Portainer's stack form) and are read by `docker-compose.yml`; the compose file hands the **container variables** to Frames. Leave anything you do not need empty.

**Stack variables** (`.env`, see `.env.example`)

| Variable | Default | What it does |
|---|---|---|
| `PHOTOS_DIR` | `./photos` | Folder of photographs on the Docker host, mounted **read-only** at `/library`. A cloud drive mounted as a folder (for example with rclone) works too. Required in the Portainer file. |
| `BIND_ADDRESS` | `127.0.0.1` | Which address the published port listens on. `127.0.0.1` is this machine only; `0.0.0.0` is every interface (turn on sign-in first). |
| `PORT` | `3000` | The port published on the host. (Inside the container Frames always listens on 3000.) |
| `FRAMES_IMAGE` | `frames:local` (built from source) | Run a published release instead of building, for example `ghcr.io/trentnbauer/frames:1.2.3` (see [Versions and releases](Versions-and-releases)). |
| `FRAMES_VERSION` | `latest` | Portainer file only: the image tag to pull. |

**Container variables** (passed to Frames by the compose files)

| Variable | Default | What it does |
|---|---|---|
| `AUTH_USER` | `frames` | User name for the optional shared password. |
| `AUTH_PASSWORD` | empty | A shared password (HTTP Basic, so use HTTPS across networks you do not trust). Empty = none. For Google, GitHub, Microsoft or your own OpenID Connect server use Settings, Sign-in & access instead; both can be on. |
| `AUTH_DISABLE` | `false` | `true` turns **all** sign-in inside Frames off. Use it for a single-person setup that something else already protects (Cloudflare Access, a VPN, a firewall), or to get back in if a sign-in provider is misconfigured (see [Security](Security)). Anyone who can reach the port can use Frames while it is `true`. |
| `EMERGENCY_LOGIN` | `true` | Each start, make one temporary one-use administrator (valid five minutes) and write its username and password to the log, for when nobody can sign in. `false` makes none. See [Signing in](Sign-in). |
| `OIDC_ALLOW_HTTP` | `false` | `true` allows an OpenID Connect server on plain `http://`, on a network you trust. |
| `SESSION_DAYS` | `14` | How long a sign-in lasts (renewed by use). |
| `ALLOWED_HOSTS` | empty | Comma-separated public host names (for example `frames.example.com`), needed only when a reverse proxy rewrites the `Host` header. |
| `ALLOW_SIGNUPS` | `true` | `false` turns off self-service accounts: someone on the allow-list who has no account yet is refused, and only people an administrator has added, or who already have an account, can sign in. |
| `TUNNEL_TOKEN` | empty | The token of a tunnel you made in the Cloudflare dashboard (see [Cloudflare tunnel](Cloudflare-tunnel)). Pre-fills Settings, Cloudflare tunnel and turns the tunnel on; it wins over what was saved in the app. |
| `CLOUDFLARE_API_TOKEN` | empty | Turns on the environment-configured Cloudflare tunnel (below). A scoped API token: *Account > Cloudflare Tunnel: Edit*, *Account > Access: Apps and Policies: Edit*, *Zone > DNS: Edit*, *Zone > Zone: Read*. Kept in the environment only, never written to the database. |
| `CLOUDFLARE_ACCOUNT_ID` | empty | Your Cloudflare account id (32 letters and numbers, in the dashboard). |
| `TUNNEL_NAME` | `Frames` | The tunnel's name in Cloudflare. |
| `APP_HOSTNAME` | empty | The app's public address, for example `frames.example.com`. It is only published behind Cloudflare Access, so `ACCESS_EMAILS` is required with it. |
| `ACCESS_EMAILS` | empty | Comma-separated emails that Cloudflare Access lets in to `APP_HOSTNAME`. |
| `PORTFOLIO_HOSTNAME` | empty | The public portfolio's own address, for example `gallery.example.com`. It shows only the portfolio and needs no login. |
| `FRAMES_SECRET_KEY` | empty | The key that encrypts every API key, client secret and token Frames stores (at least 16 characters). Keep it **outside the data volume** (in the stack's environment) and a copy of the data alone cannot read the secrets. Empty: Frames makes a random key the first time and keeps it as `secret.key` in the data folder. See *Security*. |
| `ALLOW_ENV_EXPORT` | `true` | Whether Settings, Env file may be used to download the env file (all your settings and secrets) at all. `true` only *allows* it: the export is also off until an administrator turns on the switch in the app (see below). `false` locks it off whatever the switch says, and is what the exported file sets, so using the file switches the export off again; set it back to `true` and restart to export again. |
| `SHARED_AI_1_ENDPOINT`, `SHARED_AI_1_KEY`, `AUTH_1_CLIENT_ID`, `AUTH_1_KEY`, `AUTH_ALLOW`, `FRAMES_SYSTEM__…` | empty | Written by the export, one variable per server setting (see *Setting up without any variables, then exporting an env file*). They win over what was saved in the app at every start. |
| `TRUST_PROXY` | `false` | `true` when Frames sits behind a reverse proxy, so share links rate-limit each visitor rather than the proxy. |
| `MAX_UPLOAD_MB` | `2048` | Largest single uploaded photo, in MB. |
| `TURNSTILE_DISABLE` | `false` | `true` switches the Cloudflare Turnstile bot check off (sign-in page and share links), whatever the settings say. The way back in if a wrong site key stops the check from showing. |
| `BACKUP_DIR` | `<data>/backups/server` | Where the daily whole-server backup is written and where Settings, Backup restores from. The compose files set it to `/backups`, a mount from `BACKUPS_DIR` on the host (default `./backups`). Frames runs as an unprivileged user (uid 1000), so a bind-mounted or older volume must be writable by it (`chown 1000:1000`); a volume created fresh from the image already is. If it is not, the log says so once. |

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

`AUTH_DISABLE=true` also bypasses Frames 2FA for operator recovery. Restore protection after recovery. Temporary emergency credentials are emitted to Docker/server console logs, not retained in in-app logs, even at Errors-only logging. Two-factor enforcement is an app setting under Server → Sign-in & access and is included in the normal server-settings env export; personal authenticator secrets are not exported.
