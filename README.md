This is AI slop

# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

**Full documentation is in the [wiki](https://github.com/trentnbauer/Frames/wiki).**

## What it does

- **Photoshoots and a library.** Photographs are read from a folder you mount (read-only), uploaded, or synced from Google Drive, Dropbox or OneDrive. Originals are never modified or deleted.
- **Reviews.** Rate each photograph over several sessions, spaced out, so a settled opinion emerges.
- **Backups to S3.** An administrator can send the daily whole-server archive to Amazon S3 or an S3-compatible service (MinIO, Backblaze B2, Wasabi) under Settings, Backup: endpoint, region, bucket, optional folder, and an access and secret key (the secret is write-only, never shown again, and left out of backups). The last seven are kept there, only Frames' own archives are ever removed, and they are listed under Restore to restore from. Path-style addresses; tested against a stand-in server, not the real services. Photographs are not backed up.
- **Compositions.** Plan a wall of prints to scale: sizes, frames, stacked photographs, a shopping list, and an export of the untouched originals.
- **Sharing.** Send a link for guests to rate, suggest other photographs, frame colours or a different layout, and send their version back. Guests can have an account, or just give a name.
- **A public portfolio**, an optional **AI** for tags, descriptions and search, **XMP** sidecars, several people on one server, and a **Cloudflare tunnel** to reach it from outside.

## Run with Docker

Start with no settings, set everything up in the app, then export it.

1. Save [`docker-compose.minimal.yml`](docker-compose.minimal.yml) in a folder, put your photographs in a `photos` folder beside it, and run:

   ```sh
   docker compose -f docker-compose.minimal.yml up -d
   ```

   It needs Docker Compose 2.24 or newer. Frames listens on `127.0.0.1:3000` only until you decide otherwise.
2. Open http://localhost:3000, go to **Photoshoots** and press **Sync library** (or **Upload photos**).
3. Fill in the settings in the app (**Settings**): sign-in, AI, cloud accounts, your portfolio, the tunnel.
4. Optionally open **Settings, Env file**, turn on the export and download `frames.env`. Put it next to the compose file and start again: from then on it is the source of truth. Keep it private; it holds every secret.

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
