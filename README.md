<img src="web/public/icon.svg" width="80" alt="Frames logo">

# Frames

A self-hosted photo archive for organising shoots, reviewing photographs over time, and planning walls of prints.

- Import from folders, uploads, Google Drive, Dropbox or OneDrive.
- Organise and review photos, edit metadata, and curate compositions.
- Share selected work or publish a portfolio.
- Manage gear and wishlists, with separate libraries for multiple people and optional AI tools.

## Quick start

Save [docker-compose.minimal.yml](docker-compose.minimal.yml), place your photos in a `photos` folder beside it, then run:

```sh
docker compose -f docker-compose.minimal.yml up -d
```

Open http://localhost:3000 and configure Frames in **Settings**. See [Installation](https://github.com/trentnbauer/Frames/wiki/Installation) for requirements, storage, backups and remote access.

## Documentation

The [wiki](https://github.com/trentnbauer/Frames/wiki) contains the full guides, settings and limitations:

- [Using Frames](https://github.com/trentnbauer/Frames/wiki/Library-workflows) · [Reviews](https://github.com/trentnbauer/Frames/wiki/Reviews) · [Compositions](https://github.com/trentnbauer/Frames/wiki/Compositions)
- [Server settings](https://github.com/trentnbauer/Frames/wiki/Server-settings) · [Signing in](https://github.com/trentnbauer/Frames/wiki/Sign-in) · [Screenshots](https://github.com/trentnbauer/Frames/wiki/Screenshots)

## Contributing and security

Use Node 22 or newer. See [Development](https://github.com/trentnbauer/Frames/wiki/Development), [CLAUDE.md](CLAUDE.md) and [DESIGN.md](DESIGN.md) before contributing.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
