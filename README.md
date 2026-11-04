# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

## Run with Docker

**The recommended way: start with no settings, set everything up in the app, then export it.** You do not write an `.env` file by hand, and you never have to work out which variable does what.

1. **Start the minimal compose file.** It needs no variables at all. Save [`docker-compose.minimal.yml`](docker-compose.minimal.yml) in a folder, put your photographs in a `photos` folder beside it, and run:

   ```sh
   docker compose -f docker-compose.minimal.yml up -d
   ```

   (It needs Docker Compose 2.24 or newer. Frames listens on this machine only, `127.0.0.1:3000`, until you decide otherwise.)
2. **Open it** at http://localhost:3000, go to **Photoshoots** and press **Sync library** (or **Upload photos**).
3. **Fill in the settings** in the app, under **Settings**: sign-in (Access), AI sources and their keys, cloud accounts, your portfolio and its address, and the Cloudflare tunnel. Everything is tried and saved as you go.
4. **Export them.** Open **Settings, Env file** and press **Download frames.env**. That one file holds everything you configured, secrets included.
5. **Put it next to the compose file** (same folder, named `frames.env`) and run `docker compose -f docker-compose.minimal.yml up -d` again. The compose file picks it up by itself. From now on that file is the source of truth: its values win over the app every time Frames starts, and it switches the export off (`ALLOW_ENV_EXPORT=false`) so the secrets cannot be downloaded a second time.
6. **Keep it safe.** `frames.env` holds every secret: keep it private, back it up, and never commit it. To change a setting for good, change it in the app, then set `ALLOW_ENV_EXPORT=true` in `frames.env`, restart, and export a new file.

Using Portainer or another way of giving a stack its variables? Do the same steps, then load `frames.env` as the stack's environment (Portainer: *Stack, Environment variables, Load variables from .env file*) with [`docker-compose.portainer.yml`](docker-compose.portainer.yml), which passes the variables on. More on the export, including what it does and does not contain, is under *Setting up without any variables, then exporting an env file* below.

- Your photos are mounted **read-only**. Frames never writes to them (see *XMP* below for the one opt-in exception).
- The database and generated previews live in the `frames-data` volume. Back that up (see *Backup*).
- The container runs as an unprivileged user with a read-only filesystem, no extra capabilities, and a health check.

### Building from source, or writing the variables yourself

```sh
cp .env.example .env        # then edit it: at least PHOTOS_DIR
docker compose up -d --build
```

Open http://localhost:3000. This builds the image from this repository and passes every variable in the tables below through `.env`. Use it if you want to build your own image, or prefer to write the variables by hand.

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
| `AUTH_PASSWORD` | empty | A shared password (HTTP Basic, so use HTTPS across networks you do not trust). Empty = none. For Google, GitHub, Microsoft or your own OpenID Connect server use Settings, Sign-in & access instead; both can be on. |
| `AUTH_DISABLE` | `false` | `true` turns **all** sign-in inside Frames off. Use it for a single-person setup that something else already protects (Cloudflare Access, a VPN, a firewall), or to get back in if a sign-in provider is misconfigured (see *Security*). Anyone who can reach the port can use Frames while it is `true`. |
| `OIDC_ALLOW_HTTP` | `false` | `true` allows an OpenID Connect server on plain `http://`, on a network you trust. |
| `SESSION_DAYS` | `14` | How long a sign-in lasts (renewed by use). |
| `ALLOWED_HOSTS` | empty | Comma-separated public host names (for example `frames.example.com`), needed only when a reverse proxy rewrites the `Host` header. |
| `ALLOW_SIGNUPS` | `true` | `false` turns off self-service accounts: someone on the allow-list who has no account yet is refused, and only people an administrator has added, or who already have an account, can sign in. |
| `TUNNEL_TOKEN` | empty | The token of a tunnel you made in the Cloudflare dashboard (see *Cloudflare tunnel*). Pre-fills Settings, Cloudflare tunnel and turns the tunnel on; it wins over what was saved in the app. |
| `CLOUDFLARE_API_TOKEN` | empty | Turns on the environment-configured Cloudflare tunnel (below). A scoped API token: *Account > Cloudflare Tunnel: Edit*, *Account > Access: Apps and Policies: Edit*, *Zone > DNS: Edit*, *Zone > Zone: Read*. Kept in the environment only, never written to the database. |
| `CLOUDFLARE_ACCOUNT_ID` | empty | Your Cloudflare account id (32 letters and numbers, in the dashboard). |
| `TUNNEL_NAME` | `Frames` | The tunnel's name in Cloudflare. |
| `APP_HOSTNAME` | empty | The app's public address, for example `frames.example.com`. It is only published behind Cloudflare Access, so `ACCESS_EMAILS` is required with it. |
| `ACCESS_EMAILS` | empty | Comma-separated emails that Cloudflare Access lets in to `APP_HOSTNAME`. |
| `PORTFOLIO_HOSTNAME` | empty | The public portfolio's own address, for example `gallery.example.com`. It shows only the portfolio and needs no login. |
| `FRAMES_SECRET_KEY` | empty | The key that encrypts every API key, client secret and token Frames stores (at least 16 characters). Keep it **outside the data volume** (in the stack's environment) and a copy of the data alone cannot read the secrets. Empty: Frames makes a random key the first time and keeps it as `secret.key` in the data folder. See *Security*. |
| `ALLOW_ENV_EXPORT` | `true` | Whether Settings, Env file may download the env file (all your settings and secrets). The exported file sets it to `false`, so using the file switches the export off again; set it back to `true` and restart to export again. |
| `SHARED_AI_1_ENDPOINT`, `SHARED_AI_1_KEY`, `AUTH_1_CLIENT_ID`, `AUTH_1_KEY`, `AUTH_ALLOW`, `FRAMES_SYSTEM__…` | empty | Written by the export, one variable per server setting (see *Setting up without any variables, then exporting an env file*). They win over what was saved in the app at every start. |
| `TRUST_PROXY` | `false` | `true` when Frames sits behind a reverse proxy, so share links rate-limit each visitor rather than the proxy. |
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

### Setting up without any variables, then exporting an env file

You do not have to write the variables by hand. Start Frames with none at all (just the photo folder and the data volume), set everything up in the app, then open **Settings, Env file** (administrators only) and **Download frames.env**. That one file holds the **server's** settings, secrets included: sign-in providers and the allowed list, the Cloudflare tunnel, the AIs set up for everyone and their keys, the cloud storage providers' app registrations and the privacy page. Nobody's own library is in it, the owner's included (their AIs, cloud folders, portfolio and review settings stay in the data volume).

Use it as the stack's env: `docker compose --env-file frames.env up -d`, or save it as `.env` next to the compose file, or in Portainer *Stack, Environment variables, Load variables from .env file*. The compose files in this repository read it through `env_file` (`frames.env`, or `stack.env` in the Portainer file), so every variable in it reaches Frames.

- **One readable variable per setting.** Things that come as a list are numbered: the first AI set up for everyone is `SHARED_AI_1_ID`, `SHARED_AI_1_TYPE`, `SHARED_AI_1_NAME`, `SHARED_AI_1_ENDPOINT`, `SHARED_AI_1_MODEL`, `SHARED_AI_1_EMBED_MODEL`, `SHARED_AI_1_ACK` and `SHARED_AI_1_KEY` (its API key), the second `SHARED_AI_2_…`; sign-in methods are `AUTH_1_TYPE`, `AUTH_1_CLIENT_ID`, `AUTH_1_KEY` (the client secret) and so on, with `AUTH_ENABLED`, `AUTH_ALLOW` (comma separated emails, `@domain`s or accounts) and `AUTH_PUBLIC_URL`; and the cloud storage providers' app registrations are `CLOUD_GOOGLE_CLIENT_ID` and `CLOUD_GOOGLE_CLIENT_SECRET` (also `DROPBOX`, `ONEDRIVE`). Every other server setting is written by path: `FRAMES_SYSTEM__privacy__operator=…`. A value that would be read as something else (`true`, `12`, a line break) is wrapped in double quotes, so text stays text. You can write any of them by hand, and a few are enough.
- **The file wins.** Every time Frames starts it writes these over what the app had saved, so the env file is the source of truth. A change you make in the app afterwards lasts until the next restart; Settings says so while a file is loaded. The older form, `FRAMES_CONFIG_SYSTEM` and `FRAMES_CONFIG_OWNER` (one JSON object each, which earlier versions exported), is still read, and the plain variables win over it.
- **The secrets can only be downloaded once.** `ALLOW_ENV_EXPORT` (default `true`) controls whether the file can be downloaded at all, and the exported file contains `ALLOW_ENV_EXPORT=false`. So as soon as you use it, the export is switched off and the secrets cannot be downloaded a second time. To export again (to keep changes made in the app), set it to `true` in your env file, restart, and download a new one.
- **What is not in the file**: anyone's own library, the owner's included (their AIs and keys, cloud folders, portfolio, review settings), plus your photographs, previews, compositions and everyone's sign-in sessions. They stay in the data volume, so keep using the same volume. A file made by an earlier version may still carry the owner's settings (`FRAMES_OWNER__…`, or the older `FRAMES_CONFIG_OWNER`): those are still read, but never written again. The file is built fresh from the saved settings each time you download it, rather than being kept on disk, so there is no second copy of your secrets sitting in the data volume.
- **If a value is wrong**: a variable named like a setting Frames does not know is ignored and reported in the log, and an older `FRAMES_CONFIG_*` that is not valid JSON is ignored the same way (the app's own settings are used).
- **The Cloudflare API variables are not carried over** when the tunnel is managed from Settings: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_HOSTNAME` and the others belong to the environment-variable setup, and copying a left-over (or revoked) one into the file would put it back in charge of the tunnel.

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

When the pull request is merged into `main`, the **Create Version and Docker Container** workflow works out the next number from the latest `vX.Y.Z` tag (starting from `0.0.0`, so the first release is `0.0.1`, `0.1.0` or `1.0.0`), tags that commit, creates a GitHub release with generated notes, and its **Create Docker Container** part runs the tests and publishes the image (amd64 and arm64) with the tags `1.2.3`, `1.2`, `1` and `latest`. The rules are in `.github/scripts/next-version.sh` and are tested in CI.

The release also writes the "What's new" list from the merged pull requests (`.github/scripts/generate-changelog.sh`), so a clear pull request title is the changelog line.

Setting it up once (maintainers): create the four labels, and in the repository's branch protection rules for `main` make **Release label** a required check. Pushing a tag by hand (`git tag v1.2.3 && git push origin v1.2.3`) still publishes that exact version; a tag with a suffix (`v1.2.3-rc.1`) is published as that version only, never as `latest`. The first publish creates the package as private: make it public in the package settings if others should pull it.

## Security

- **Sign-in (optional).** Frames works with no sign-in. To protect it you can use either or both of:
  - **OAuth providers** (Settings, Sign-in & access): Google, GitHub, Microsoft, Dropbox, any OpenID Connect server (Authentik, Keycloak, Authelia and so on), or another OAuth 2 service. Add a provider with its client ID and secret, register the redirect address Frames shows you, list who may sign in (emails, whole domains such as `@family.com`, or account ids), press **Test sign-in**, then turn **Require sign-in** on. Everyone on the list gets their own library (see *People and libraries*).
  - **Cloudflare Access as the login** (Settings, Sign-in & access, add the provider *Cloudflare Access*). If Cloudflare Access already asks people to prove who they are in front of Frames, Frames can take that: every request that gets through Access carries a signed token (`Cf-Access-Jwt-Assertion`) with the person's email, and Frames signs them in with it, **with no sign-in screen of its own**. Enter your Zero Trust **team domain** (Settings, Custom Pages, for example `myteam.cloudflareaccess.com`) and the Frames application's **Audience (AUD) tag** (Access, Applications, the application, Overview); there is no client ID or secret. Use **Test sign-in** while browsing through the Access-protected address. The allow-list and `ALLOW_SIGNUPS` still decide who gets in and whether a newcomer gets a library, so Access proves *who*, and Frames still decides *whether*. The token's signature, issuer, audience and expiry are all checked against Cloudflare's published keys; a token for another application, an unsigned one or one with no email is refused, and a token on its own signs nobody in except through the sign-in route (an API call with a token and no session is still refused). It works on the App URL, where Access sits; a direct visit to the LAN address has no token, so it still shows the normal sign-in page (or add another provider for that). Not tested against a real Cloudflare Access application.
  - **Who is allowed in**: *Only people on the list* (the default) or *Anyone who signs in*. The second lets any verified account at one of the offered providers use Frames, each with their own empty library (new accounts still need `ALLOW_SIGNUPS` on). The list is kept, so switching back restores it. While sign-in is on in list mode and an API token is saved under Cloudflare tunnel, the App URL is protected by Cloudflare Access for the same list automatically (it cannot be switched off then); in *Anyone who signs in* that protection is your choice again, and a warning appears if a policy still only lets the list in.
  - **A shared password** (`AUTH_PASSWORD`). This is HTTP Basic, so **use HTTPS** if it crosses a network you don't trust.
- **Secrets are encrypted at rest.** Every API key, client secret and token Frames stores (AI keys, sign-in client secrets, the Cloudflare token, cloud-account tokens) is saved encrypted (AES-256-GCM, a new random value each time), never as readable text in the database. So a copy of a database file on its own reveals none of them. The key is `FRAMES_SECRET_KEY` if you set it; keep that outside the data volume and the volume alone is not enough. Without it, Frames keeps a random key in `secret.key` in the data folder (readable only by Frames' user): that protects a database file copied or backed up on its own, not someone who takes the whole data folder. Secrets from before this are encrypted the next time Frames starts. If the key is lost or changed, the secrets cannot be read: they show as not set and you enter them again. Backups and the server backup leave secrets out altogether, and the env file (Settings, Env file) holds them readable on purpose, so keep it private.
- **You can't lock yourself out.** Sign-in can only be switched on after a test sign-in by an account that is on the list, and you can't save a list that removes your own account or change a provider while sign-in is on. If it still goes wrong, set `AUTH_DISABLE=true` on the container and restart.
- **How OAuth is handled.** Standard authorization-code flow with PKCE, state and nonce; the ID token's signature, issuer, audience and expiry are all checked; email entries only count if the provider says the address is verified. Sessions are random, HttpOnly, SameSite=Lax cookies (Secure over https), kept as a hash in the database. Client secrets are write-only: never sent back to the browser and left out of every backup. Failed and repeated sign-in attempts are rate-limited. Share links and the health check never need a sign-in.
- Wrong shared passwords are rate-limited: after 10 wrong tries in a minute an address is refused (even with the right password) until the minute is up, and `/auth/password` follows the same limit. Put a proxy limit in front too if Frames is internet-facing.
- **Every request is counted per visitor** (`@fastify/rate-limit`, before sign-in or anything else runs): more than 6000 in a minute from one address is answered with 429 until the minute is up. That is far above what browsing a large library needs, and is only a ceiling against floods; the sign-in, password and share-link routes keep their own much stricter limits. The health check is never limited. Behind a reverse proxy, set `TRUST_PROXY=true` so the visitor, not the proxy, is counted.
- **Several ways to sign in as the same person.** Under *Settings, Sign-in methods* a signed-in person sees *Ways to sign in as you* and can **Add** another provider's account: they pass through that provider once and the account is then theirs too, so signing in with either reaches the same library. An account that already belongs to someone else is never moved or merged (it is refused), an account the allow-list would turn away is refused, and a linked account can be removed again (never the one they started with). Removing a person erases their linked accounts with them. Linking was tested with a stand-in provider, not a real Google, GitHub or Microsoft account.
- **Administrators and members.** Members use Frames but cannot change sign-in or the tunnel (those APIs answer 403). Anyone can still point *their own* library at an AI address or cloud account of their choosing, so Frames makes requests to addresses they type: only allow people you trust. AI requests never follow redirects, so a service cannot bounce a key to another host.
- **Exposure.** By default Frames only listens on this machine. To reach it from other devices set `BIND_ADDRESS=0.0.0.0`, and set a password first. Frames warns at start-up if there is no password.
- Cross-site writes are blocked, responses carry a strict Content-Security-Policy, original files are only ever served by photo id, symlinks in the library are ignored, and the AI key is write-only (never sent back, never in a backup).
- The page loads its fonts from Google Fonts (allowed in the policy). Self-host them if that matters to you.

### Share links

A **Share** button on every composition and photoshoot makes an address like `/s/Xk3…` that works **without the login**, so you can send photos to a client or friend. This is the one part of Frames reachable without a password, so it is narrow on purpose:

- A link opens exactly one composition or photoshoot. Nothing else is reachable with it.
- Guests see only each photo's picture and title. No location, camera data, notes, descriptions or file paths.
- You choose per link whether guests can **download the originals** and/or **review and rate** them. Ratings from guests are kept apart from your own reviews and never change your ratings or schedule. You can see them under the link.
- Links can expire, and can be turned off at any time. They cannot be guessed (128 random bits), and wrong guesses are rate-limited.
- Share pages are marked not for search engines.

Anyone who has the address can use it, so treat it like a key and send it privately.

## People and libraries

With sign-in on (Settings, Sign-in & access), **every person has their own library**: their own photographs, shoots, reviews, compositions, share links, tags, AI settings, cloud sync accounts, backups and portfolio. Nobody can see or reach anyone else's, even by guessing ids. Each person's data lives in their own database and folder under `data/users/<id>`.

- **Where their photographs come from.** Under the libraries mount, a person's folder is `/library/<their folder>` (the folder is named after them, for example `/library/alice`; the owner can see it in their account and an administrator can change it). Put their photographs there, read-only like any library, and press Sync. People can also upload, and use cloud sync, which keep their files in their own part of the data volume.
- **The owner.** **The first person to sign in is the administrator** (the owner): whoever did the **Test sign-in** from Settings, Sign-in & access, or, if sign-in was switched on from an env file, the first person to get through. Everyone who signs in after that is a member until an administrator changes their role. The owner's library is the one that already existed: nothing moves on upgrade. The owner's own scan skips other people's folders under the libraries mount. With only the shared password (or no sign-in) there is just the owner.
- **New people.** The first time someone on the allow-list signs in they get a member account and an empty library. Set `ALLOW_SIGNUPS=false` to stop that: only existing accounts, and people an administrator has added by email, can then sign in.
- **Administrators and members.** Administrators manage sign-in, the allow-list and the tunnel. Members can do everything inside their own library. Settings is one page with a menu on the left and a *Find a setting* box above it. The first part is about your own library: **Your library** (Reviews, Tags & subjects, Metadata & XMP), **Connections** (Your AI, Cloud sync, Portfolio) and **Your account** (Sign-in methods, Your data). For administrators only, below a line headed *Applies to everyone on this server*, **Administration**: **People & sign-in** (People, Sign-in & access), **Storage** (Photo folders, Backup, Env file) and **Shared services** (AI for everyone, Cloud storage providers, Cloudflare tunnel). The old `/admin` address still works and opens Sign-in & access. **AI for everyone** sets up AIs for everyone on the server (the key stays on the server); they appear in each person's AI list, marked *from the administrator*, to use but not change.
- **Managing people** (administrators, Settings, People): see everyone, how many photographs and how much space each holds, add someone by email ahead of time (they are put on the allow-list, and their first sign-in with that verified address claims the account), change a role, change a folder, switch an account off (it is signed out at once), or delete their data. There is always at least one administrator.
- **Deleting data.** Anyone can erase everything Frames holds for them from Settings, Your data (type `delete` to confirm); an administrator can do the same for someone on request. A member's account, database, uploaded and cloud-copied photographs, previews, backups, share links, settings, saved connections and portfolio address are erased and they are signed out. The owner's library is emptied but the account stays. Photographs in a library folder are only read by Frames, so they are not touched (whoever runs the server removes those). Copies in the daily backups rotate out within a week.
- **Privacy page.** `/privacy` is readable without signing in and linked from the sign-in page, Settings and the page corner. It describes what is kept, who can see it, who else receives information (your sign-in provider, AI services if turned on, cloud drives, Cloudflare if the tunnel is on, Google Fonts) and how to delete it, filled in with this instance's own facts. Administrators add who runs the server and a contact under Settings, People. It describes what the software does and is not legal advice.
- **Upgrading a shared setup.** If several people used one Frames before, the existing library now belongs to the owner. Everyone else signs in once more and gets a library of their own (the old sessions end).
- **Share links and portfolios.** A share link opens its owner's library, with no sign-in. The owner's portfolio is at `/portfolio/` on the main address. Every other person's portfolio is served only on a hostname of their own (Settings, Portfolio): that hostname shows their portfolio and nothing else, and two people cannot use the same one.

## Welcome tour

Someone whose library is new and empty is taken to a short tour the first time they reach the front page: bringing photographs in (cloud storage or files), photoshoots versus compositions, how reviewing works and feeds compositions, and sharing a composition for others to review. **Skip the tour** or **Start using Frames** ends it for good; a library that already has photographs is counted as welcomed, so existing users are not interrupted. It can be shown again from Settings, About Frames.

## Reviews

Every photograph is reviewed in a few sessions, spaced out, so your real opinion settles.

- **The default**: four sessions, a week apart (so a photograph is reviewed four times in about a month). Change the number of sessions and the interval after each under Settings, Reviews. With *Adapt to consistency* on, steady ratings come back a little later and mixed ones sooner.
- **A new photograph is not reviewed straight away.** One that has never been reviewed counts as reviewed on the day it was added, so its first review is one interval (the first one you set) after that. Libraries from before this are moved once, the same way; photographs you asked to review again keep the date you gave.
- **Nothing due? Begin anyway.** When nothing is waiting, Today offers **Review anyway**: a session of the 20 photographs you saw longest ago (again, never reviewed counts from when it was added). It is an ordinary session: the ratings are kept and each photograph's next date is worked out from today.
- **The oldest review comes first.** A session shows the photographs that are due in the order of when each was last reviewed, longest ago first (a photograph never reviewed counts from when it was added). The photo page shows when it was last reviewed and when it is next due.

- **To do.** A **To do · N** button appears at the end of the bottom bar only when something is waiting on you, and is gone when nothing is. The page lists: AI-suggested tags and subjects to approve, AI-suggested descriptions to approve, photographs with no subject, photographs with no tag (newest first, so what you just brought in comes first), photographs whose colours have not been read, and a cloud account that needs reconnecting. It lists, and offers two shortcuts: *Accept all* for the AI's waiting suggestions of one kind (it asks first, and only touches what the AI suggested and is still waiting: nothing you added or rejected), and *See all N in the Library* for photographs with no subject or tag (the Library's `missing=subject` / `missing=tag` filter, shown as a chip). The count refreshes whenever you move between pages.
- **Navigation.** The bottom bar is Home, Library, Shoots, Compositions, Search (⌘K), **Review · N** and **+ Composition**; the top right of every page has the date, Library, For you, Stats and Settings. **+ Composition** (and *New composition* on Home) asks for a name, the number of prints, the print size and which shoots to draw candidates from, then creates the composition with that print target.
- **Search, sharing, upload and review boxes.** The search box (⌘K) shows the first ten matches with *Create composition from N results* (or from the ones you tick with *Select*) and *Add to a composition…*. *Share for review* opens a box with the link to copy, whether guests can rate and download, when it expires, and how many ratings have come in; guests can rate by default and cannot download unless you tick it. *Upload photos* opens *Bring in a shoot* (drop or choose files, or sync the library folder), shows the import, then offers to start a composition from the new shoot, send it for review, or review it now. The review screen shows the session and *Esc to finish* at the top and each score with its word under the faces.
- **Photoshoots.** A *Bring in a new shoot* banner at the top (drop photographs on it, or *Upload photos*; *Sync library* and *New photoshoot* beside it), then a card per shoot with a review progress bar and **Compose from this →**. A shoot's page has the name, review progress, *Select photographs* (move them to another shoot, or start a composition from them), **Compose from this shoot**, *Share for review* and *Delete photoshoot*.
- **A photograph's page.** The photograph large on the left with the rest of its shoot as a strip underneath (← and → move through the library). On the right: the title, a **combined score** (your average rating, blended with what guests gave it through share links, plus its rank in its shoot and a bar per review session), the compositions it is in with an *Add* / *Added ✓* button each and *Start a composition with this*, how sharp it prints at A4, A3 and A2 at 300 PPI (or the PPI it reaches), subjects and tags as pills (*+ Subject*, *+ Tag*; the AI's suggestions show dashed with ✓ and ✕), capture details, description, colours, variants, and the actions (download the original, export XMP, portfolio, review again, leave out of review, delete). Guests' ratings are only counted from share links that allow review.
- **The composition workspace.** A composition has a print target (how many prints, what size) and a ranking. Each candidate shows a **score** that blends *your* average rating with the average the **guests** gave it through the composition's share links (the guests' share is 35% by default; change it under *Change target*, 0 to 60%). With no guest rating the score is yours, with none of yours it is the guests'. A candidate too small for the print size is dimmed with the pixels it needs. Click a candidate to put it in the next print slot (or *remove* under a slot). **Help me decide** shows two candidates at a time (← or → to pick); the winner stays for the next round, up to six of the best that meet the target. **Export for print** (enabled when every slot is filled) lists the originals in print order with the names they will download as; after downloading, **Mark as printed** moves the composition to the *Printed* list on the Compositions page, where it can be reopened. Not tested against a real print lab. **Rate these candidates** starts a review session of just that composition's candidates you have not rated yet (all of them if you have rated every one); it replaces an unfinished session, and the ratings count as a review session for those photographs.
- **Compositions (formerly collections).** A composition is a curated set of photographs. In the Library and in the search box, press **Select** to tick photographs (a tick on each tile), then **Add N to a composition** to put them in an existing one or start a new one with them; a photograph's own page has the same button for that one photograph. Inside a composition, **Add photos** can be narrowed by one or more subjects and tags to suggest what fits, tick several, and add them together. The address (`/collections`) and share links are unchanged.
- **Taking photographs out.** A photograph's page has **Delete from Frames** and a photoshoot's page **Delete photoshoot**. That removes the record, reviews, tags, composition places and previews. **A file in a library folder is never touched** (Frames only reads those); only copies Frames holds itself, an upload or a cloud-sync copy, are deleted. The fingerprint is remembered so a scan does not import it again; Settings, Your data lists how many and can bring them back.
- **Suggest deleting by score.** Settings, Reviews, *Suggest taking out below*: after a photograph's last session, if its average is below the score you picked (1.5 to 4, or never), it is listed for you to tick and take out. Nothing is removed without your confirmation.
## Public portfolio

Settings, Portfolio turns one composition into a public website (your name, tagline, social links, theme toggle, masonry gallery, full-size viewer and a "My Gear" page). It is the same site that used to be built by GitHub Actions, now served by Frames, so you add photos from a photo's page (**Add to portfolio**) instead of pushing to git.

- **It is public on purpose, so it is narrow.** Only photos in the chosen composition can be reached, through a fixed set of addresses, and visitors never see places, notes, file paths or other photos.
- **What visitors get when they open a photo** is your choice: a resized copy with all camera data removed (the default), the original file (which can contain camera details and the place it was taken, so Frames warns you), or nothing extra. RAW and TIFF originals always get the resized copy.
- **Its own address.** At `/portfolio/` on this server, or give it a hostname (for example `photography.example.com`). Point a tunnel or reverse proxy at Frames and that hostname shows **only** the portfolio: every other address, including the app, share links and the API, returns "not found" on it. That is what makes it safe to expose.
- It stays public even when sign-in is required for the rest of Frames.

- **Buttons on the site.** Under Settings, Portfolio, *Buttons on the site*: up to 8 links shown in the portfolio's header, each with a short name (an emoji or up to 4 letters, used where space is tight), a full name and a link (`https://` or `mailto:`), in the order you set. A portfolio that had the old Instagram, X and Behance links gets them as buttons.
- **Original files need the server's say-so.** *The original file* is only an option when an administrator has switched on *Let portfolios offer original files* under Settings, Photo folders (off by default). Switching it off again stops every portfolio offering originals.

## Cloud sync (Google Drive, Dropbox, OneDrive)

Settings, Cloud sync copies the photographs from a cloud folder into Frames, then adds them like any other photo (the folder is `cloud/` in the data volume). It is one way and careful:

- **Read-only on the cloud side.** Frames asks each service for read access to files and nothing more.
- **Nothing is deleted or overwritten.** A photo already copied is never fetched again. If you edit it online, Frames tells you and keeps the copy you have. Removing a file online, or disconnecting an account, leaves your copies alone.
- **Several folders per connection.** *Choose folders* opens a browser with a tick box beside each folder (and *Everything in this account* at the top); *Open ›* goes inside one. Every ticked folder is copied with its subfolders; a folder inside a ticked one shows as already included. Untick the chips (×) to drop one. With none chosen nothing is copied and automatic syncing is off. A connection made before this keeps its one folder. Two folders holding a file of the same name are both kept (the second gets a suffix). Not tested against the real services.
- **Photos and sidecars only.** Image and RAW files and `.xmp` sidecars are copied; everything else is skipped.
- **Set up once per service, by an administrator.** A self-hosted app has no shared account with these services, so an administrator registers a small app of their own in the service's developer console (free) and pastes its client ID and secret into **Settings, Cloud storage providers** (Administrator). That is for the whole server, and travels in the env file. Each person then signs in to *their own* account under Settings, Cloud sync, and gets their own folders and copies. (A registration saved in a person's own library by an older version keeps working until an administrator enters one.) The return address to give them is shown on that page (it is `<your Frames address>/api/cloud/callback`; set the public address in Settings, Sign-in & access if Frames is behind a proxy).
- **What to pick in each console** (the page lists these steps for each service). All three use **OAuth** (authorization code with PKCE) for a **web application**, never a service account or an API key:
  - *Google Drive*: enable the **Google Drive API**; OAuth consent screen, **External**, yourself as a test user, scope `drive.readonly`; Credentials, **OAuth client ID**, type **Web application**, with the return address as an authorised redirect URI. In *Testing* mode Google ends the connection every 7 days, so press **Publish app**.
  - *Dropbox*: **Scoped access**, Full Dropbox (or App folder); permissions `files.metadata.read`, `files.content.read`, `account_info.read`; the return address under Redirect URIs; the App key and App secret are the client ID and secret.
  - *OneDrive*: Microsoft Entra, App registrations, new registration, a **Web** redirect URI with the return address; Microsoft Graph **delegated** permissions `Files.Read`, `User.Read`, `offline_access`; a client secret's *Value*.
- **Several accounts of the same service.** Connect as many as you like, including more than one Dropbox, Google or OneDrive account: each connection has its own login and its own folder, and you are asked which account every time (the provider's account chooser is forced, so a browser already signed in to one account does not silently pick it). Connecting an account that is already connected renews that connection instead of adding a second.
- **Sign in with the same accounts.** Google, Microsoft and Dropbox can also be a sign-in method (Settings, Sign-in & access) that uses the app already registered under Settings, Cloud storage providers: tick *Use the app already set up*, so there is no second client ID and secret, and add the sign-in redirect address (`<your Frames address>/auth/callback/<id>`, shown on the provider) to that app as well. The allowed list still decides who gets in. Dropbox signs in with the permission `account_info.read` (name and verified email only).
- **Keep only a smaller copy (optional, per connected folder).** Tick *Keep only a smaller copy of each photo here* on a connection and Frames makes each photograph a **JPEG at quality 80 with the same pixels and camera data** (a third to a half of the space; skipped when it would save little, and for RAW and other files) and leaves the **full-size original in your cloud account**. It applies to new photographs as they come in and, on the next sync, to the ones already copied, but only where the file in the cloud is still the same one. Reviews, tags and the print-size check are unaffected (the pixels are the same). **Exporting always gives the full-size original**: Frames fetches each one from your cloud account, one photograph at a time, through the same download (composition export, share links that allow originals, and a portfolio that offers originals). **Do not delete those photos from the cloud account: that deletes the only full-size original.** If the account is disconnected or needs reconnecting, those originals cannot be fetched until it is connected again, and Frames says so. The Google Drive, Dropbox and OneDrive files are only ever read.
- **Required for everyone, or each person's choice.** An administrator can switch on *Always keep only a smaller copy of cloud photos* under Settings, Photo folders: then every connected folder keeps only a smaller copy, the box on each connection is ticked and locked (*required by your administrator*), and copies already held are made smaller on the next sync. Off, it is each person's choice per folder.
- **Secrets stay put.** The client secret and the refresh token are kept on the server only, are never shown again and are left out of backups.
- Pick a folder, then sync by hand or let Frames check as often as every 15 minutes. Connect as many accounts as you like.

## Cloudflare tunnel

Settings, Cloudflare tunnel lets you reach Frames (and people's public portfolios) from outside your network with no open ports. Frames makes the tunnel, its routes and the DNS records through the Cloudflare API, and runs the bundled `cloudflared` with it.

### Setting it up

You need a domain that is on Cloudflare (its nameservers point to Cloudflare).

1. **Give Frames API access.** [Create a custom API token](https://dash.cloudflare.com/profile/api-tokens) with these settings (the page shows the same table). Your **account ID** is the 32 letters and numbers in the dashboard's address after `dash.cloudflare.com/`, and on the right of your domain's overview page.

   | Section | Scope | Permission | Level | Needed for |
   |---|---|---|---|---|
   | Permissions | Account | Cloudflare Tunnel | Edit | always |
   | Permissions | Zone | DNS | Edit | always |
   | Permissions | Account | Access: Apps and Policies | Edit | Cloudflare Access: the protection box and the public share links |
   | Permissions | Account | Access: Organizations, Identity Providers, and Groups | Read | Cloudflare Access sign-in (finding your team domain) |
   | Account Resources | Include | All accounts (or just yours) | | |
   | Zone Resources | Include | Specific zone | each domain you use | the App URL's domain and any portfolio address's |
2. **Enter them** under *1. Let Frames use your Cloudflare account* in Settings, Cloudflare tunnel, then turn **Run the tunnel** on. It shows *Connected* once cloudflared has a connection.
3. **Set the addresses.** *Frames: App URL* is the address you open Frames at from outside (for example `https://frames.example.com`). It is the same **public address** as under Settings, Sign-in & access: set it in either place and it changes in both. Tick **Portfolios** to also serve each person's portfolio; each person sets their own portfolio address under Settings, Portfolio.
4. **That is all: there is nothing to add in Cloudflare.** Frames finds its tunnel by name (`Frames`, or makes it; no tunnel id is stored anywhere), sets the tunnel's routes so every address is served by this Frames (anything else gets a 404), and keeps a proxied `CNAME` DNS record for each address. It does this again by itself whenever an address changes, in Settings, Cloudflare tunnel, Access or Portfolio, and a changed route needs no restart. It removes only the DNS records it made itself, for addresses that are gone; an address that already has a non-CNAME record is refused with Cloudflare's reason, shown on the page. The domain of each address must be on the Cloudflare account.
   **The tunnel turns itself on.** Once the credentials work and the tunnel is set up, Frames starts it (and starts it again with the server, and again after any change), unless you switched it off yourself with *Run the tunnel*; your choice is kept.
   **One allowed list.** Who is allowed in is the same list under Settings, Cloudflare tunnel and Settings, Sign-in & access: edit it in either place and it changes in both (the tunnel page applies it to Cloudflare Access at once). The same lock-out protection applies.
   **Cloudflare Access, set up for you.** Tick *Protect the App URL with Cloudflare Access* and Frames creates the Access application for the App URL, with a policy that lets in the emails and whole domains on the allowed list (Settings, Sign-in & access), before it publishes anything. It also adds *Cloudflare Access* as a sign-in method (team domain and audience tag filled in by Frames), so after **Test sign-in** through the App URL and **Require sign-in**, people are signed in with the email Access vouches for and see no second login. With nobody on the list it refuses, since Access would let no one in; unticking removes the application it made. The token needs *Access: Apps and Policies, Edit*, and *Access: Organizations, Identity Providers, and Groups, Read* for the sign-in method.
   **Cloudflare Access bypass.** So that an Access login in front of the app never blocks what must be public, Frames also keeps two *bypass* Access applications (no login): *Frames public paths* for the share links and portfolio on the App URL (`/s/`, `/api/s/`, `/portfolio`, and the few files they need), and *Frames portfolio addresses* for every portfolio address in full. They are updated with the addresses, and removed when there is nothing to list. If the API token lacks the Access permission the tunnel still works and the page says what to add. With the tunnel set up from environment variables, the portfolio address is in the same bypass list.
   **A portfolio on someone's own domain.** Settings, Portfolio shows the DNS record to add for the address you enter: a `CNAME` from it to the App URL's address. When the domain is on the same Cloudflare account, Frames makes the record and the route itself.
5. **Lock the app address down in Cloudflare** (for example with Cloudflare Access), unless Frames' own sign-in is on: Frames never blocks this, but it tells you on the page when the App URL is open to anyone. Portfolio addresses show only that person's public portfolio and nothing else.

- **Safe by default.** Traffic always goes to this Frames server and nothing else on your network, never an address you type in. A portfolio address shows only that person's public portfolio.
- **Secrets stay put.** Tokens are write-only (never shown again), are kept out of backups, reach `cloudflared` through its environment (not the command line) and are removed from the tunnel log.
- **Pre-filled from the environment.** `TUNNEL_TOKEN` (the name `cloudflared` itself uses, for a tunnel you made by hand in the dashboard: Frames then runs it but cannot set its routes or DNS) turns the tunnel on, `APP_HOSTNAME` is the App URL and `PORTFOLIO_HOSTNAME` is the owner's portfolio address (with Portfolios ticked). The environment wins over what was saved in the app each time Frames starts.
- **From environment variables** (a single person, no sign-in inside Frames): set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_HOSTNAME`, `ACCESS_EMAILS` and `PORTFOLIO_HOSTNAME` (all in the table above) and Frames does the rest on every start: it creates the tunnel, its routes and proxied DNS records, a **Cloudflare Access** application that lets only `ACCESS_EMAILS` in to the app address, and a second Access application that **bypasses the login for share links (`/s/`, `/api/s/`), the portfolio (`/portfolio`) and the few files they need (`/assets/`, `/icon.svg`, `/privacy`)**, so anyone can open those. The portfolio address is the owner's and shows only the portfolio, public. Settings, Cloudflare tunnel then shows it read-only. Access is set up *before* anything is published, and Frames also checks Cloudflare's signed login token on the app address itself, so if the Access application is ever deleted or misconfigured the app stays closed instead of open. Frames only changes what it created, tracked by id. Turn one-time-PIN login on once in Cloudflare Zero Trust (*Settings, Authentication, Login methods*) if you have not already. With `AUTH_DISABLE=true` and the port published on your network, anyone on that network can still use Frames directly at the LAN address: Access protects the public address.
- Running Frames outside the supplied Docker image? Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and put it on the `PATH`.

## Backup

Everything Frames knows (reviews, tags, compositions, share links, settings) is in databases. Your originals are not part of them: back those up the way you already do.

- **The whole server** (administrators): Settings, Backup, **Download a server backup**. One archive with the server's own database (people, sign-in, the tunnel) and every person's library database. Keys, secrets and sign-in sessions are taken out of every copy.
- **Your own data** (everyone): Settings, Your data, **Download my backup**, the same thing for just your library.
- **Automatic backups**: one a day for each library, the last seven kept, in that library's `backups` folder. Settings, Backup lists them.
- **Restore**: stop Frames, replace `system.db` and a library's `frames.db` in the data volume (`users/<number>/frames.db` for everyone but the first administrator) with the copies from a backup (delete any `-wal` and `-shm` files beside them), start it again, then Settings, Your data, **Rebuild all** if previews are missing. Previews and analysis are rebuilt from your originals. A restored copy has no keys or sign-in sessions: enter the keys again and sign in.
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
- **Access**: there are two roles, administrator and member; there are no finer permissions, and no sharing of one library between people except by share links and downloads. OAuth sign-in is tested against stand-in providers that follow the standards, not against live Google, GitHub or Microsoft.
