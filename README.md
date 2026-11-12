This is AI slop

# Frames

A self-hosted archive for portfolio photographs: organise them into photoshoots, review them over several sessions so your real opinion settles, find what's strongest, and curate compositions you can download as untouched original files or share with a link.

**Full documentation is in the [wiki](https://github.com/trentnbauer/Frames/wiki).**

## What it does

- **Photoshoots and a library.** Photographs are read from a folder you mount (read-only), uploaded, or synced from Google Drive, Dropbox or OneDrive. Originals are never modified or deleted.
- **Reviews.** Rate each photograph over several sessions, spaced out, so a settled opinion emerges. Optionally let other members rate yours anonymously.
  Starting a review inside a photoshoot reviews only its photographs that have not yet been rated. If none remain, it shows “Nothing to review” rather than starting a library review. Reviewing selected photographs from the Library also keeps that selection.
- **Compositions.** Plan a wall of prints to scale, against a photo of your room if you like, then export the untouched originals or a print sheet.
- **Sharing.** Send a link for guests to rate photographs or suggest other prints, frames or layouts. A public portfolio, optional.
- **Finding things.** Search understands cameras, lenses, film stocks, places and file names. Optional AI adds tags, descriptions and search by meaning.
- **Several people on one server**, each with their own library. Sign in with an emailed code, a passkey, Google, Microsoft, GitHub, any OpenID Connect server, or Cloudflare Access. Light and dark themes, and phone and tablet layouts.
- **Run by you.** Backups (including to S3 or your cloud account), a Cloudflare tunnel to reach it from outside, and the terms and privacy page are all set in the app by an administrator. If nobody can sign in, an emergency login is written to the server log at each start.

## Screenshots

The Library and composition editor, shown with a small demo library of sample images.

![Library with sample images](docs/screenshots/library.jpg)

![Composition editor with framed and stacked prints](docs/screenshots/composition.jpg)

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

### Container builds and releases

Pull requests validate image changes on native Linux AMD64 and ARM64 runners, with a separate BuildKit cache for each architecture. Every push to `main` runs CI once through the version workflow, including changes labelled `release: none`. A release builds each image once, checks that exact image starts and reports the correct version, then publishes the multi-architecture manifest from the tested digests. The publisher does not rebuild. Manually pushed version tags use the same validation and publishing steps. Both architectures use the same generated changelog; version, major/minor and stable `latest` tags keep their existing behavior.

Docker installs system packages before copying application files or applying the release version, so ordinary code/version changes can reuse that layer. A cold cache, changed dependencies or an updated base image still requires the corresponding installation work. If a build network uses a private trusted CA, supply it without disabling TLS verification: `docker build --secret id=extra_ca,src=/path/to/trusted-ca.pem -t frames .`. The certificate is mounted only during networked build steps and is not copied into the image.

## Photo and composition tools

The visual conventions are documented in [DESIGN.md](DESIGN.md), including **✦** before AI-derived data and **circle → diamond → square** for workflow stages.

Compositions have explicit **Progress**, **Review**, and **Done** stages. Filling every artwork slot does not change the stage automatically; Review and Done require every slot to hold a photo, including both halves of stacked prints. Emptying a slot while reviewing returns the composition to Progress. In Done the composition is read-only: its name, layout, crops, frames, candidates and room photo cannot be edited or deleted until it is reopened. The three-stage control becomes **Edit** beside **Export**, keeping Guests and Share in place. Edit reopens into Review and restores the workflow control; if an artwork has become unavailable, it reopens into Progress. Zoom, fullscreen, sharing and original downloads remain available in Done. The composition list uses the same three stages, with export actions under Done, and candidate pickers leave out Done compositions.

Previously printed compositions migrate to Done; other compositions start in Progress. Original photographs are unchanged. Legacy printed/reopen requests map to Done/Progress. Library-level changes to a photo can still affect what a saved composition displays; Done protects the composition's own controls and write endpoints. If a Done composition is also the portfolio's backing list, reopen it before changing that list's candidates.

Portfolio owner edit links are plain text. The owner-only visibility and destinations are unchanged.

The composition Share dialog uses the current composition name, including after a rename. While editing, type directly into the composition title to rename it: Enter or leaving the field saves, Escape cancels, and a blank name restores the saved title. Save failures appear below the title.

Photoshoot and composition sharing use the same dialog. Choose permissions, expiry, name and optional PIN before **Create link**; existing links can be copied, previewed, updated, regenerated or stopped. Photoshoots offer ratings and downloads; compositions also offer suggestions and wall-only viewing.

Your own public portfolio shows **Edit Portfolio** and **Edit Gear** at the top left when your sign-in is available on that address. Other visitors do not see them. A separate portfolio hostname needs the app's public URL configured and an owner session available there; cookies do not carry across unrelated domains. Shared-password access and an unprotected local instance also show the owner's links. Portfolio configuration containing these links is never cached.

`/auth/signin` redirects to `/signin`, preserving the return address, guest mode and error message. Provider buttons use the same light filled style on sign-in and sign-up. OAuth, email codes, passkeys and the shared password keep their existing flows; live third-party sign-in must be checked with your configured providers.

The **To do** page uses the same **Add to composition** picker as the Library and photo pages, including search and new compositions. The editor's **Remove** action removes a candidate only from that composition; if a print holds it, confirmation is required and that print is left empty. Candidate previews use thumbnails, while the wall uses larger previews.

Photoshoots have a **Share** button with the existing link, expiry, PIN and guest review controls. On a photo, **Colour & variants** opens its palette and actual linked photographs. AI tags show a ✦ marker before their name instead of an inert tick; the separate × button removes a tag. Settings → Tags & subjects has one searchable management modal for both types, with create, rename, merge within a type, and delete. These changes use existing data and do not merge tag and subject records automatically.

Composition cards show the saved layout, orientation, frames, mats, crops and both photographs in a stacked print, fitted closely into the preview. **Room photo** in the editor uploads a room picture; **Set scale** calibrates it against a known width. The room picture follows wall zoom and pan and stays private to its owner.

Click a photoshoot’s date to apply a new date to every photograph in that shoot. This updates the displayed date without changing the camera date or original file; another shoot is unaffected. Keyword search accepts phrases such as **milky way at Cape Schanck**, combining tags and locations without searching for the connecting word. This does not add typo correction.

Photographs added to the portfolio by hand are managed under **Settings → Portfolio → Added by hand**. The automatic backing list is hidden from Compositions; a regular composition deliberately chosen for the portfolio remains visible.

### Zoom

Scroll over the composition wall, pinch a trackpad, or use two fingers on a touchscreen to zoom from 50% to 400%. The bottom-left **−** and **+** buttons zoom around the centre. Drag empty wall space to pan. These controls also work in fullscreen and guest editors. Zoom and pan affect only the current view: print sizes, positions, photo crops and exports stay the same. Scrolling a settings panel keeps scrolling that panel. The view resets when the editor is reopened.

## Security

To report a vulnerability, see [`SECURITY.md`](SECURITY.md).

## Library layout and account security

The user dropdown has **Clear site data**, immediately above **Sign out**. Confirm **Clear and reload** to reset this browser's cached files, cookies and local site preferences, then reload Frames. You may need to sign in again; photos, reviews and server settings are retained. Clearing the HTTP cache and HTTP-only cookies uses the browser's `Clear-Site-Data` support (normally over HTTPS); local storage, browser-managed caches, service workers and supported IndexedDB storage are also cleared directly as a fallback.

Library and Photoshoots have a **Full width** toggle in the header. The preference is saved per library and shared between these screens. **Comfortable width** restores the centred layout. The Frames logo, account menu and notifications remain visible while scrolling, above the page toolbar; both headers match the page background in light and dark themes.

Under **Settings → Your library → Password & security**, manage linked sign-in methods and passkeys, inspect active personal sessions and the latest 100 successful sign-ins, and sign out individual sessions. Signing out this browser returns it to sign-in; signing out another browser invalidates it on its next request. People see only their own sessions. New sign-ins record the IP address as seen by the server and the browser's user-agent; correct reverse-proxy configuration is needed for a client's original IP. Existing sessions remain usable and show “IP not recorded” / “Device not recorded”. Shared-password and automatic access do not create personal sessions. The log records successful sign-ins, not failed attempts; up to 1,000 past sign-ins are retained per account, alongside active sessions.

Under **Settings → Server → Sign-in & access**, each provider's **Configure** opens only that provider's settings and setup instructions. Other providers and general server access settings are kept out of this modal. Real external OAuth providers and physical passkey registration require testing with your own accounts and device.
