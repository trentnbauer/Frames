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
   never gets sent to the browser for display.) Alongside the file(s), a short
   **upload form** captures **city, camera, lens, film stock** — pre-filled from
   a best-effort filename parse, all editable — plus any **tags** you already
   know you want, so structured context doesn't depend on remembering to fix it
   later in the tag editor.
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

## Combo suggestions

A third nudge, sharper than either half of the core loop alone: Frames
cross-joins your **structured shoot fields** (city, camera, lens, film stock)
against your **subject tags** to surface micro-project candidates neither
would suggest on its own — *"Minolta in Melbourne"*, *"neon on Portra 400"*,
*"signage + Nikon FM2"*. Each combo shows its co-occurrence count and, like the
gap finder, offers a one-tap "start an idea" that seeds the project with every
matching frame.

Combos render as **two-part chips, not a single label** — each half keeps a
colour tied to its own dimension (city / camera / lens / film-stock /
subject-tag each get a distinct hue), joined by a plain-text connector ("in" /
"on" / "+"). You should be able to tell what *kind* of intersection you're
looking at before you've read the words.

These are computed at query time from existing columns — no new table, no
stored combo entity. Consistent with keeping this an engine, not a library.

---

## Data model (v1)

Two nouns — **photos** and **ideas** — joined two ways: photos carry **tags**,
ideas **collect photos**.

- **photos** — one row per frame. Pixels live on disk; the row holds paths to the
  full-res **original** plus its two derivatives (**thumb** for the grid,
  **display** for single-frame viewing), a content hash (dedupe re-uploads),
  filename, dimensions, a tagging status, and four structured shoot-context
  fields — **city, camera, lens, film_stock**. All four are best-effort parsed
  from the filename on ingest, then shown pre-filled in the upload form so you
  can correct or fill them in by hand at upload time rather than digging back
  into the tag editor later. (**Season** stays filename-only, no form field —
  too low-value to type on every upload; derivable from the date instead.) The
  vision tagger reads the display derivative, not the original — cheaper, and
  plenty for recognising subjects.
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
- Vision tagging via BYO API key (FilmCalc "Add with AI" pattern) — see
  **Vision providers** below
- Docker stack behind a Cloudflare Tunnel
- Repo / host namespaced (`frames-app`, `frames.<domain>`) to avoid collisions

---

## Vision providers

Auto-tagging isn't locked to one vendor. A provider is one of:

- **OpenAI** — BYO API key, hosted.
- **Anthropic** — BYO API key, hosted.
- **Self-hosted** — any endpoint speaking the OpenAI-compatible
  `/chat/completions` shape: Ollama, LM Studio, llama.cpp server, etc. No API
  key required (or an arbitrary one, since local servers rarely check) — just
  a base URL and a model name. This is what makes tagging free and private if
  you'd rather not send scans to a hosted API at all.

You can save **multiple provider profiles** at once (e.g. "OpenAI GPT-4o" and
"Local Ollama llava"), each with its own type / base-URL / key / model, and
pick which one is **active** for auto-tagging in Settings. Switching the
active profile only affects photos tagged *after* the switch — it never
retags or touches existing `ai_suggested` tags. Comparing providers side by
side (running two profiles against the same frame) is a possible v2 addition,
not v1 — v1 is one active profile at a time, freely swappable.

---

## v1 checklist

- [ ] Upload endpoint + on-disk storage, content-hash dedupe
- [ ] Generate derivatives on ingest: thumb (grid) + display (single-frame view);
      keep original untouched for export
- [ ] Filename parser (best-effort city / camera / lens / film / season)
- [ ] Upload form: city / camera / lens / film_stock (pre-filled from filename
      parse, editable) + tags, filled out at upload time
- [ ] Vision auto-tag on ingest, tags stored as `ai_suggested`; provider is
      OpenAI / Anthropic / self-hosted (OpenAI-compatible endpoint), multiple
      saved profiles with one active at a time
- [ ] Photo grid with tag filter
- [ ] Tag editor: accept / dismiss / add, plus per-photo-tag note
- [ ] Ideas: create / edit (title, notes, light_pref, status)
- [ ] Drop photos into ideas / remove (many-to-many), with per-membership `why` note
- [ ] Gap finder: tagged-but-in-no-idea view
- [ ] Orphan view: frames with no tags and no idea, so nothing good gets lost
- [ ] Combo suggestions: cross-join city / camera / lens / film_stock against
      subject tags into two-colour combo chips, each with a "start an idea"
- [ ] Export an idea as a zip of its full-res photos

## Roadmap (v2, in priority order — only if v1 earns it)

1. **Contact-sheet / brief export.** The richer versions of v1's zip: a printable
   grid of an idea's frames, and the idea's rule + light + notes as a phone-ready
   shoot card. Serves the "get the project out" payoff.
2. **"What can I shoot today?"** — `light_pref` crossed with live weather +
   location. "It's overcast in Ballarat — here are the 3 projects you can shoot
   right now." The one genuinely novel feature; the north star.
3. **Tag co-occurrence view.** Extends v1's deterministic **combo suggestions**
   (structured field × subject tag) to fuzzier subject-tag × subject-tag
   clustering — "`signage` frames are often also `night` + `wet` — start a
   project from that cluster?" The engine that *generates* ideas rather than you
   naming them all by hand. The intellectual core.
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
- **No automatic EXIF / film-log integration.** City, camera, lens, and film
  stock are filename-parsed as a best-effort guess and otherwise typed by hand
  in the upload form — never pulled from EXIF or a connected film-log service.
  Going further rebuilds the *other* Frames app; stop at "you typed it once."
- **No multi-user / sharing / social.** This is a single-user thinking tool. The
  moment it has accounts and sharing it's a different, much larger product.
- **No in-app editing or filters.** That's Lightroom / Darktable's job, and it
  fights the whole principle.
- **No AI that writes the projects for you.** The AI tags (suggestions) and
  clusters (surfacing) — it does **not** decide the projects. The entire value is
  *you* noticing the shadow, the tension, the thread. A tool that closes that
  loop removes the thing that makes you a better photographer.
