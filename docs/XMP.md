# XMP

Frames reads `photo.jpg.xmp` or `photo.xmp` next to a photograph: keywords become tags, and its title and description are used where you haven't written your own. **Your own edits always win**; differences are listed for you to settle. Tags another app added are never removed. Approved metadata can be exported as XMP (always to the data folder). Writing sidecars **beside your originals** is off by default and needs the library mounted writable (remove `:ro` in `docker-compose.yml`); another program's sidecar is never overwritten, and image files are never modified.
