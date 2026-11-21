# Places, camera details and search

## Place and map pin

Put a pin on a photograph from its page: click the map, or search for a place to move it. A pin you set is never overwritten when the file is read again.

- **Show publicly as: Exact, Suburb or City.** You always see the exact pin. Share links never show the place. The portfolio caption shows the place name only when this is Exact, and leaves it out otherwise.
- **Where the map comes from.** Tiles and place search come from OpenStreetMap, through your server, and only when you open a map, so your browser never contacts it. The server sends an identifying User-Agent, as their usage policy asks, and searches are limited to one a second.
- Photoshoots keep a place name only, with no pin.
- Not tested against the real service from CI.

## Camera details

On a photograph's page: camera, lens, ISO, aperture, shutter speed, focal length, and film or digital (with a film stock, offered from the ones already in your library).

- They are read from the file where it has them. They are optional: nothing is ever required, and none of it fills the To do list.
- Anything you type is kept when the file is read again. A blank clears it.
- **Defaults** for a film camera and stock: set your own under *Settings, Your library, Camera & XMP* (for new photographs), or per photoshoot, which wins and reaches photographs already in it. A default only fills a blank, never replaces what the file says or you typed.
- **Camera names are not tags.** Search reads the camera, lens and film from the photograph's details, so "Sunsets on Kodak Gold" still works, but they are not copied into tags. A one-time upgrade step removes tags that only repeat the photograph's own camera, lens or film name, including ones typed by hand. The AI is no longer asked for wide angle, regular or telephoto, and its tags are tidied of filler words, repeated words and near-twins (mist and misty).

## Search

Press ⌘K (or Ctrl K). Search understands cameras, lenses, film stocks, apertures, shutter speeds, ISO, places and file names: `xt5` finds an X-T5, `dscf41` finds `DSCF4182.RAF`.

Search shows the matching photographs straight away. If an AI is set up for search, it reads the sentence afterwards and narrows the results when it answers; if it does not answer within about six seconds the results stay as they are.

## Dates and seasons

Photographs get an editable date and a season for your hemisphere (*Settings, Your library, Profile*). Photoshoot dates can be changed and propagated to their photos without modifying the originals.

Location-aware searches such as **birds at Melbourne** combine a subject/tag term with the place. Shared named locations and nearby unnamed GPS positions can also produce [composition ideas](Composition-ideas).
