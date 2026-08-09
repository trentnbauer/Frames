# Frames

*Micro-projects, surfaced from your own frames.*

Frames is a self-hosted tool for film photographers. You upload your scans, it
auto-tags them with a vision model, and you cluster the tags into **ideas** —
small, shootable micro-projects. The point isn't to *manage* a photo library
(Immich already does that); it's to look harder at the frames you've already
shot and find the projects hiding in them, then know what to go shoot next.

> Not to be confused with the film-notebook app of the same name. Frames here is
> about **surfacing projects from your archive**, not logging per-frame metadata.

---

## What it does (v1)

1. **Upload** photos. On ingest, Frames keeps the full-res **original** on disk
   and generates two smaller **derivatives** — a tiny *thumbnail* for the grid and
   a mid-size *display* version for viewing a single frame. The app only ever
   serves derivatives; the heavy original is touched only at export. (A 25MB scan
   never gets sent to the browser for display.)
2. **Auto-tag.** A vision model tags each frame on ingest (bring-your-own API
   key). Tags arrive as *suggestions*, visually distinct from confirmed ones.
3. **Filter by tag.** Tap `signage`, see every frame that matches. This alone is
   most of the value — it's how the projects reveal themselves.
4. **Ideas.** Create a micro-project (title + notes + ideal-light preference),
   then *drop photos into it*. A photo can live in many ideas at once.
5. **Curate tags.** Accept or dismiss AI suggestions, add your own, and attach a
   note to a tag on a specific frame (e.g. "this is the cast shadow, not paint").
6. **Export an idea.** Pull a micro-project back out as a zip of its full-res
   photos — the payoff. (Richer export formats come later; see Backlog.)

That's the whole of v1. Everything else is deferred (see Non-goals / Backlog).

---

## The core loop

Tagging photos and filling ideas are the same relationship seen from two sides,
so the app can nudge you both ways:

- **Gap finder:** "6 frames tagged `neon` aren't in any idea — start one?"
- **Idea filler:** open an idea, see loosely-matching frames that might belong.

The goal is a tool that makes you re-examine your own contact sheets — not one
that thinks for you and closes the loop.

---

## Data model (v1)

Two nouns — **photos** and **ideas** — joined two ways: photos carry **tags**,
ideas **collect photos**.

- **photos** — one row per frame. Pixels live on disk; the row holds paths to the
  full-res **original** plus its two derivatives (**thumb** for the grid,
  **display** for single-frame viewing), a content hash (dedupe re-uploads),
  filename, dimensions, best-effort camera / film-stock / season parsed from the
  filename, and a tagging status. The vision tagger reads the display derivative,
  not the original — cheaper, and plenty for recognising subjects.
- **tags** — canonical vocabulary, deduped by slug.
- **photo_tags** — the many-to-many join, and the most important table. Carries
  two extra fields that let AI suggestions and your truth coexist:
  - `source` — `ai_suggested` / `user_confirmed` / `user_added` (on the *join*,
    not the tag, because the same tag can be a guess on one frame and a
    deliberate choice on another).
  - `note` — free text, per photo-per-tag. Preserves the *why* a classifier
    would destroy.
- **ideas** — micro-projects. Title, free-text notes (rule / subject / framing
  constraint — deliberately unstructured), a status, and one structured field
  worth having early: `light_pref`
  (`any / overcast / raking_sun / golden_hour / dark / night`), which powers the
  future "what can I shoot today?" view at no cost now.
- **idea_photos** — the "drop into an idea" join. Many-to-many. Includes a
  `position` field reserved for hand-sequencing later (ignored in v1), and a
  `why` note — a one-liner on *why* this frame belongs to this project
  ("the wide half of the diptych") that captures the reasoning holding the set
  together.
- **ideas** also carry optional **reference** slots — a couple of pinned
  external inspiration images or a text note ("shoot like the Waubra dawn-fog
  idea") — so the intent stays attached to the project.

### Load-bearing decisions
- Store pixels **once**, reference everywhere — never duplicate per idea.
- `source` + `note` live on the **photo_tags** join.
- `light_pref` is the **only** early structure on ideas; everything else stays in
  notes until a real need forces a column.
- Keep it an **engine, not a library** — no albums, ratings, EXIF browser, or
  map view.

---

## Design priority

The **correction path** — dismissing a wrong AI tag and typing your own — must be
the *smooth* path, not the exception. The auto-tagger will be confidently wrong
on exactly your best frames (the ones that subvert the obvious label), so make
re-tagging fast and pleasant. If fighting the tagger feels like work, the whole
tool feels like fighting an AI. Build this interaction first.

---

## Stack

FilmCalc's shape plus a thin storage-and-vision backend:

- Node / TypeScript
- SQLite (plenty at personal volume; Postgres only if outgrown)
- Vision tagging via BYO API key (FilmCalc "Add with AI" pattern)
- Docker stack behind a Cloudflare Tunnel
- Repo / host namespaced (`frames-app`, `frames.<domain>`) to avoid collisions

---

## v1 checklist

- [ ] Upload endpoint + on-disk storage, content-hash dedupe
- [ ] Generate derivatives on ingest: thumb (grid) + display (single-frame view);
      keep original untouched for export
- [ ] Filename parser (best-effort camera / film / season)
- [ ] Vision auto-tag on ingest (BYO key), tags stored as `ai_suggested`
- [ ] Photo grid with tag filter
- [ ] Tag editor: accept / dismiss / add, plus per-photo-tag note
- [ ] Ideas: create / edit (title, notes, light_pref, status)
- [ ] Drop photos into ideas / remove (many-to-many), with per-membership `why` note
- [ ] Gap finder: tagged-but-in-no-idea view
- [ ] Orphan view: frames with no tags and no idea, so nothing good gets lost
- [ ] Export an idea as a zip of its full-res photos

## Roadmap (v2, in priority order — only if v1 earns it)

1. **Contact-sheet / brief export.** The richer versions of v1's zip: a printable
   grid of an idea's frames, and the idea's rule + light + notes as a phone-ready
   shoot card. Serves the "get the project out" payoff.
2. **"What can I shoot today?"** — `light_pref` crossed with live weather +
   location. "It's overcast in Ballarat — here are the 3 projects you can shoot
   right now." The one genuinely novel feature; the north star.
3. **Tag co-occurrence view.** "`signage` frames are often also `night` + `wet` —
   start a project from that cluster?" The engine that *generates* ideas rather
   than you naming them all by hand. The intellectual core.
4. **Idea progress nudges.** Uses the existing `status` field: "6 frames in — you
   wanted a roll." Closes the loop between planning and shooting.
5. **Frame sequencing within an idea.** Drag frames into narrative order to build
   a photo-essay. Uses the reserved `position` field. A whole interaction
   surface, so it waits.

## Non-goals — and why

Deliberately excluded to keep Frames an **engine, not a library**, and to protect
the one thing that makes it worth using — that *you* do the noticing.

- **Not a photo manager** — no albums, ratings, EXIF browser, or map view.
  Immich already does all of that; each one drags Frames toward being a library.
- **No EXIF / film-log integration beyond the filename parse.** Going further
  rebuilds the *other* Frames app. The filename already gives camera + film for
  free; stop there.
- **No multi-user / sharing / social.** This is a single-user thinking tool. The
  moment it has accounts and sharing it's a different, much larger product.
- **No in-app editing or filters.** That's Lightroom / Darktable's job, and it
  fights the whole principle.
- **No AI that writes the projects for you.** The AI tags (suggestions) and
  clusters (surfacing) — it does **not** decide the projects. The entire value is
  *you* noticing the shadow, the tension, the thread. A tool that closes that
  loop removes the thing that makes you a better photographer.
