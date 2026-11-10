This is AI slop

# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

**Full documentation is in the [wiki](https://github.com/trentnbauer/Frames/wiki).**

## What it does

- **Photoshoots & library:** Read-only mounted folders, uploads and Google Drive, Dropbox or OneDrive sync. Originals are never modified or deleted.
- **Server administration:** Nine settings sections covering access, members, storage, backups, AI, Cloudflare, email, processing and system updates. Includes user storage limits, cache controls, health checks, logs and restart controls.
- **Photos & metadata:** Editable camera, lens, film stock, ISO, aperture, shutter speed, focal length, date, season and location metadata. Automatic metadata extraction, configurable defaults, XMP sidecars and searchable gear tags.
- **Reviews:** Multi-session photograph ratings and optional anonymous community reviews. Sensitive-tagged photographs are excluded, with reporting and moderation.
- **Compositions:** Design print walls to scale with sizes, frames, stacked photographs and room-photo calibration. Preview cropping, generate shopping lists and export untouched originals.
- **Sharing & guests:** Share compositions for guests to rate, suggest photographs, frames and layouts, and return edited copies for photographer approval. Supports guest accounts, emailed sign-in codes and optional PIN-protected links.
- **Backups:** Scheduled server archives with configurable retention and restore. Supports S3-compatible storage, Dropbox, Google Drive and OneDrive. Photographs are excluded.
- **Authentication:** Passwordless email codes, passkeys, Google, Cloudflare Access and shared-password sign-in, controlled by administrators.
- **Notifications:** In-app and configurable email notifications for guest replies, review reminders and monthly summaries, with quiet hours.
- **Exports:** PDF print sheets and ZIP archives of untouched originals.
- **Gear & wishlist:** Track owned equipment and ranked purchases, displayed on the portfolio's Gear page.
- **Search:** Search by camera, lens, film stock, exposure settings, location and filename.
- **Interface:** Redesigned responsive UI with light/dark themes, Upload/Compose/Export navigation, notifications and admin warnings.
- **Portfolio & infrastructure:** Optional public portfolio, AI tagging/descriptions/search, multi-user support and Cloudflare tunnel access.

**Integration note:** External cloud, SMTP, Cloudflare, S3, OpenStreetMap and authenticator integrations have not been fully tested against live services.

## Run with Docker

Start with no settings, set everything up in the app, then export it.

1. Save [`docker-compose.minimal.yml`](docker-compose.minimal.yml) in a folder, put your photographs in a `photos` folder beside it, and run:

   ```sh
   docker compose -f docker-compose.minimal.yml up -d
   ```

   It needs Docker Compose 2.24 or newer. Frames listens on `127.0.0.1:3000` only until you decide otherwise.
2. Open http://localhost:3000, go to **Photoshoots** and press **Sync library** (or **Upload photos**).
3. Fill in the settings in the app (**Settings**): sign-in, AI, cloud accounts, your portfolio, the tunnel.
4. Optionally open **Settings, Server, Updates & system**, turn on the export and download `frames.env`. Put it next to the compose file and start again: from then on it is the source of truth. Keep it private; it holds every secret.

The container runs as an unprivileged user with a read-only filesystem. Your photographs are mounted read-only, and the database and previews live in the `frames-data` volume (back it up; the app can also make and restore backups).

More: [installation](https://github.com/trentnbauer/Frames/wiki/Installation) (Portainer, building from source), [every environment variable](https://github.com/trentnbauer/Frames/wiki/Environment-variables) and [the env file](https://github.com/trentnbauer/Frames/wiki/Env-file).

## Documentation

| | |
|---|---|
| [Installation](https://github.com/trentnbauer/Frames/wiki/Installation) · [Environment variables](https://github.com/trentnbauer/Frames/wiki/Environment-variables) · [The env file](https://github.com/trentnbauer/Frames/wiki/Env-file) · [Versions and releases](https://github.com/trentnbauer/Frames/wiki/Versions-and-releases) | Getting it running, and updating |
| [Reviews](https://github.com/trentnbauer/Frames/wiki/Reviews) · [Share links](https://github.com/trentnbauer/Frames/wiki/Share-links) · [Portfolio](https://github.com/trentnbauer/Frames/wiki/Portfolio) · [AI](https://github.com/trentnbauer/Frames/wiki/AI) · [XMP](https://github.com/trentnbauer/Frames/wiki/XMP) · [Cloud sync](https://github.com/trentnbauer/Frames/wiki/Cloud-sync) | Using it |
| [People and libraries](https://github.com/trentnbauer/Frames/wiki/People-and-libraries) · [Security](https://github.com/trentnbauer/Frames/wiki/Security) · [Cloudflare tunnel](https://github.com/trentnbauer/Frames/wiki/Cloudflare-tunnel) · [Backup and restore](https://github.com/trentnbauer/Frames/wiki/Backup-and-restore) | Running it |
| [Known limits](https://github.com/trentnbauer/Frames/wiki/Known-limits) · [Development](https://github.com/trentnbauer/Frames/wiki/Development) | More |

## Develop

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders. Node 22 or newer. See [`CLAUDE.md`](CLAUDE.md) for how changes are made (pull requests, release labels, checks).

## Security

To report a vulnerability, see [`SECURITY.md`](SECURITY.md).
