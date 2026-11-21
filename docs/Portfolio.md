# Public portfolio

Settings, Portfolio turns one composition into a public website (your name, tagline, social links, theme toggle, masonry gallery, full-size viewer and a "My Gear" page). It is the same site that used to be built by GitHub Actions, now served by Frames, so you add photos from a photo's page (**Add to portfolio**) instead of pushing to git.

- **It is public on purpose, so it is narrow.** Only photos in the chosen composition can be reached, through a fixed set of addresses, and visitors never see coordinates, notes, file paths or other photos.
- **What visitors get when they open a photo** is your choice: a resized copy with all camera data removed (the default), the original file (which can contain camera details and the place it was taken, so Frames warns you), or nothing extra. RAW and TIFF originals always get the resized copy.
- **The caption under an opened photo** shows what Frames holds for it: the place name on one line, then the camera, lens, film and settings (shutter speed, aperture, focal length, ISO), for example *Fujifilm X-T5 · XF 35mm F1.4 · 1/250s · f/2.8 · 35mm · ISO 400*. Anything not filled in is left out. The place is shown only when the photo's *Show publicly as* is **Exact**: a place to be shown only as its suburb or city is not shown at all. Turn captions off in Portfolio settings ("Show the place, camera, lens and settings under a photo that is opened"). Earlier versions guessed the camera and film from the file name; that is gone.
- **Its own address.** At `/portfolio/` on this server, or give it a hostname (for example `photography.example.com`). Point a tunnel or reverse proxy at Frames and that hostname shows **only** the portfolio: every other address, including the app, share links and the API, returns "not found" on it. That is what makes it safe to expose.
- It stays public even when sign-in is required for the rest of Frames.

- **Buttons on the site.** Under Settings, Portfolio, *Buttons on the site*: up to 8 links shown in the portfolio's header, each with a short name (an emoji or up to 4 letters, used where space is tight), a full name and a link (`https://` or `mailto:`), in the order you set. A portfolio that had the old Instagram, X and Behance links gets them as buttons.
- **Original files need the server's say-so.** *The original file* is only an option when an administrator has switched on *Let portfolios offer original files* under Settings, Photo folders (off by default). Switching it off again stops every portfolio offering originals.

## Management shortcuts and manually added photos

Your own public portfolio shows **Edit Portfolio** and **Edit Gear** at the top left when your sign-in is available on that address. Other visitors do not see them. A separate portfolio hostname needs the app's public URL configured and an owner session available there; cookies do not carry across unrelated domains. Shared-password access and an unprotected local instance also show the owner's links. Portfolio configuration containing these links is never cached. These controls are plain text links.

Photographs added to the portfolio by hand are managed under **Settings → Portfolio → Added by hand**. The automatic backing list is hidden from Compositions; a regular composition deliberately chosen for the portfolio remains visible.
