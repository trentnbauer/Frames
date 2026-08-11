#### AI slop!
# Frames

Frames is a self-hosted tool for film photographers. Upload your scans, let a vision model auto-tag them, then cluster tags into **ideas** — small, shootable micro-projects. The point isn't to *manage* a photo library (Immich already does that); it's to look harder at the frames you've already shot and find the projects hiding in them.

## What it does

- **Ingest** — upload scans; Frames keeps the full-res original and generates thumbnail/display derivatives. EXIF (camera, lens, GPS, capture date) is pulled automatically; a filename parser guesses camera/film stock/season as a starting point.
- **Auto-tag** — bring your own API key (OpenAI, Anthropic, Gemini, or any self-hosted OpenAI-compatible endpoint like Ollama/LM Studio). Suggestions arrive distinct from confirmed tags; run one provider or several at once.
- **Organize** — filter by tag/camera/location/season/film stock, search across all of it, favorite frames, browse a map of GPS-tagged photos or a timeline grouped by capture date, auto-detect near-duplicates.
- **Ideas** — drop photos into a micro-project (title, notes, ideal light), track progress, get nudged when one goes stale.
- **Discovery** — gap-finder and combo suggestions surface project ideas neither the tag nor the location would suggest alone (e.g. "signage at Melbourne CBD").
- **Export** — pull an idea back out as a zip of full-res photos, a printable contact sheet / shoot brief, or lay it out page-by-page in the Zine Creator (rotate, crop, captions, undo/redo, autosave) and export a print-ready PDF.
- **Backup** — full library export/import as a single zip; auto-import from a watched folder.

## Quickstart (Docker Compose — recommended)

Requires Docker and Docker Compose.

```bash
git clone https://github.com/trentnbauer/Frames.git
cd Frames
docker compose up -d --build
```

Open `http://localhost:4000`. Photos and the database persist in the `frames-data` volume.

To enable auto-tagging or the Google Drive/Dropbox import buttons, copy `.env.example` to `.env`, fill in the keys you want, and uncomment the matching lines in `docker-compose.yml` before starting — see the comments in both files for the full list. Everything is optional; Frames runs with zero keys configured, it just won't auto-tag.

> [!WARNING]
> Frames has no built-in login or access control (see [Security](#security) below) — don't publish port 4000 to the open internet as-is.

## Local development

Requires Node 20+.

```bash
npm install
npm run dev:server   # API + SQLite, :4000
npm run dev:web      # Vite dev server with hot reload, :5173
```

Other useful scripts from the repo root: `npm run build` (both workspaces), `npm test` (both workspaces).

## Security

Frames has no built-in login, users, or access control — every route
(viewing/deleting photos, restoring from backup which replaces the entire
library, vision-provider API keys) is open to anyone who can reach the
server. Don't expose it directly to the internet. Put it behind a reverse
proxy with auth (Caddy, nginx, Traefik + Authelia/oauth2-proxy/basic auth),
or keep it on a private network / VPN / Tailscale only.

---

More detail (architecture, full env var reference, feature walkthroughs) is coming to the wiki.
