This is AI slop

# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

**Full documentation is in the [wiki](https://github.com/trentnbauer/Frames/wiki).**

## What it does

- **Photoshoots and a library.** Photographs are read from a folder you mount (read-only), uploaded, or synced from Google Drive, Dropbox or OneDrive. Originals are never modified or deleted.
- **Reviews.** Rate each photograph over several sessions, spaced out, so a settled opinion emerges. Optionally let other members rate yours anonymously.
- **Compositions.** Plan a wall of prints to scale, against a photo of your room if you like, then export the untouched originals or a print sheet.
- **Sharing.** Send a link for guests to rate photographs or suggest other prints, frames or layouts. A public portfolio, optional.
- **Finding things.** Search understands cameras, lenses, film stocks, places and file names. Optional AI adds tags, descriptions and search by meaning.
- **Several people on one server**, each with their own library. Sign in with an emailed code, a passkey, Google, Microsoft, GitHub, any OpenID Connect server, or Cloudflare Access. Light and dark themes, and phone and tablet layouts.
- **Run by you.** Backups (including to S3 or your cloud account), a Cloudflare tunnel to reach it from outside, and the terms and privacy page are all set in the app by an administrator. If nobody can sign in, an emergency login is written to the server log at each start.

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

## Documentation

[Installation](https://github.com/trentnbauer/Frames/wiki/Installation) · [Environment variables](https://github.com/trentnbauer/Frames/wiki/Environment-variables) · [The env file](https://github.com/trentnbauer/Frames/wiki/Env-file) · [Server settings](https://github.com/trentnbauer/Frames/wiki/Server-settings) · [Signing in](https://github.com/trentnbauer/Frames/wiki/Sign-in) · [Compositions](https://github.com/trentnbauer/Frames/wiki/Compositions) · [Share links](https://github.com/trentnbauer/Frames/wiki/Share-links) · [Backup and restore](https://github.com/trentnbauer/Frames/wiki/Backup-and-restore) · [Known limits](https://github.com/trentnbauer/Frames/wiki/Known-limits) · [Development](https://github.com/trentnbauer/Frames/wiki/Development)

## Develop

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders. Node 22 or newer. See [`CLAUDE.md`](CLAUDE.md) for how changes are made (pull requests, release labels, checks).

## Security

To report a vulnerability, see [`SECURITY.md`](SECURITY.md).
