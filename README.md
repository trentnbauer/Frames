This is AI slop

# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

**Full documentation is in the [wiki](https://github.com/trentnbauer/Frames/wiki).**

## What it does

- **Photoshoots and a library.** Photographs are read from a folder you mount (read-only), uploaded, or synced from Google Drive, Dropbox or OneDrive. Originals are never modified or deleted.
- **Server settings.** Administrators have nine sections under Settings, Server: Sign-in & access (methods, how long a sign-in lasts, whether anyone may sign up, the defaults for new guest links, the bot check), Members, Photos & storage (library folders, XMP sidecars, the originals rules and cloud app registrations), Backup (on or off, daily or weekly, how many to keep, Back up now, history and restore, off-server copies), AI, Cloudflare tunnel, Email, Storage & processing (cache size, rescan, rebuild thumbnails) and Updates & system (version, health checks, the env file, restart). Not tested against the real SMTP, Cloudflare, S3 or cloud services. Storage & processing sets a cache limit (the previews opened longest ago are deleted and made again when opened), the preview size and how many photographs are processed at once; Updates & system sets the update channel and the log level and downloads the last week of the server log. Photos & storage has cloud rules (who may connect, the fastest sync, a storage cap per person), Members can let members see each other's shoot names and dates, and AI can limit each person's requests to shared paid AIs and stop members adding their own. Updates & system also has "Send anonymous crash reports": off, and impossible until whoever runs the server sets `CRASH_REPORT_URL` to a place that takes them; a report holds the version, the error and the top of its stack with paths cut to their last part and emails and keys removed, at most three an hour. Storage & processing has "Heavy jobs run" (AI tagging and remaking previews wait for five quiet minutes when set to idle), and AI can put the shared AIs first for a person who has not set their own order.
- **Guests edit a copy.** A guest opening a composition link sees the editor's print panel: other sizes, frames and mats, more or fewer prints, a different candidate in a print. Nothing changes the composition; Send sends their copy as suggestions the photographer can apply or dismiss.
- **Reviews.** Rate each photograph over several sessions, spaced out, so a settled opinion emerges.
- **Backups to S3 and cloud accounts.** An administrator can send the daily whole-server archive to Amazon S3 or an S3-compatible service (MinIO, Backblaze B2, Wasabi) under Settings, Backup: endpoint, region, bucket, optional folder, and an access and secret key (the secret is write-only, never shown again, and left out of backups). The last seven are kept there, only Frames' own archives are ever removed, and they are listed under Restore to restore from. Path-style addresses; tested against a stand-in server, not the real services. Photographs are not backed up. Backups can also go to the administrator's own Dropbox, Google Drive or OneDrive (Settings, Backup): a separate sign-in for backups with write access, a folder called Frames backups that Frames makes, the same last seven, restore from there too. Needs the service set up under Settings, Cloud services with an app registration that allows writing files. Dropbox archives over 140 MB are refused (use S3). The cloud services are tested only against stand-ins built from their documented calls, not the real services.
- **Map pin.** Place a pin on a photograph from its page (click the map, or search for a place to move it). Map tiles and search come from OpenStreetMap through your server, only when you open a map, so the browser never contacts it; the server sends an identifying User-Agent, as their usage policy asks, and searches are limited to one a second. A pin you set is never overwritten when the file is read again. Not tested against the real service from CI. Photoshoots keep a place name only, with no pin.
- **Camera details.** On a photograph's page: camera, lens, ISO, aperture, shutter speed, focal length, and film or digital (with a film stock, offered from the ones already in your library). They are read from the file where it has them and are optional extras: nothing here is ever required and none of it fills the To do list. Anything you type is kept when the file is read again; a blank clears it. Defaults for a film camera and stock: set your own under Settings, Metadata & XMP (for new photographs), or per photoshoot (which wins, and reaches photographs already in it and any moved in). The camera, lens, film or digital, film stock and the field of view (wide angle up to 35mm, regular up to 70mm, telephoto beyond, from the file's 35mm-equivalent where it has one, otherwise the lens's own focal length, which is only right for a full-frame camera) become tags on the photograph, so they can be searched and used in compositions (such as "Sunsets on Kodak Gold" or "Cars on telephoto"); a tag you remove is not put back unless its detail changes, and these tags do not count as tagged for the To do list. The AI is also asked to suggest wide angle, regular or telephoto. A default only fills a blank, never replaces what the file says or you typed, and a photograph follows its default if that changes.
- **Compositions.** Plan a wall of prints to scale: sizes, frames, stacked photographs, a shopping list, and an export of the untouched originals. In the editor, add a photo of your room (Edit layout, Room photo) and mark a known width on it (a couch, a door) so the prints are drawn at their real size against it; drag them where they would hang. The room photo is re-encoded and kept in your own data, and is never part of a share link or the portfolio. Photographs fill their prints, and a print's settings has a zoom and move crop to preview how it would look cropped (the original is never changed).
- **Sharing.** Send a link for guests to rate, suggest other photographs, frame colours or a different layout, and send their version back. Guests can have an account, or just give a name.
- **A redesigned interface** with light and dark themes (no flash on load), a workflow header (Upload, Compose, Export), a notifications bell, and phone layouts. Admins see a red banner while the app's server settings differ from `frames.env`, and a once-per-session update notice from GitHub Releases.
- **Sign in without a password.** Emailed 6-character codes (single use, 10 minutes, five wrong tries voids a code) alongside Google, Cloudflare Access and the shared password. The email option appears only while SMTP (Settings, Email) is set up and passing its health check; an email log keeps 30 days of what was sent (never the bodies).
- **Notifications.** A bell with deep links, and email for the things you choose (guest replies, review reminders, a monthly summary), held during quiet hours. Settings, Notifications.
- **Community review.** Opt in to let other members rate your photos anonymously, and rate theirs. Photos tagged nudity, violence or adult are never shown; reports hide a photo and go to an administrator (Settings, Members).
- **Gear and wishlist.** What you own and a ranked want-to-buy list; it feeds the portfolio's Gear page.
- **Share links** can have a 4-number PIN (five wrong tries lock the link on that device for 15 minutes) and can be emailed from the Share dialog.
- **Search** understands cameras, lenses, film stocks, apertures, shutter speeds, ISO, places and file names (`xt5` finds an X-T5, `dscf41` finds `DSCF4182.RAF`).
- **Photos** get an editable date and a season for your hemisphere (Settings, Profile).
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
