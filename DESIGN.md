# Frames UI conventions

Keep new screens and changes consistent with the existing app. The live colour, typography and component rules are in [web/src/styles.css](web/src/styles.css); theme switching is in [web/src/theme.ts](web/src/theme.ts). Reuse shared components before adding another implementation.

## Theme and typography

- Use the warm neutral palette in both dark and light themes. Use the CSS tokens (`--page`, `--surface`, `--text`, `--muted`, `--outline`, `--btn-bg`, etc.) rather than inventing screen-specific colours. Check both themes, including hover, focus and disabled states.
- Use Instrument Serif for prominent titles, IBM Plex Sans for UI text, and IBM Plex Mono for small technical labels and measurements. Reuse the existing font tokens and nearby text sizes.
- Keep photographs unchanged by theme switching. Use subdued surfaces and thin outlines so the photographs remain the focus.
- Match existing button, pill, modal and toolbar styles. Use a filled treatment for the selected segmented choice. Text links should remain text links; portfolio **Edit Portfolio** and **Edit Gear** are plain text, not outlined pills.

## AI provenance

Use **✦** as the AI marker. Place it **before** AI-derived data such as a generated tag, title, description or suggestion. Show it only when the data's provenance is AI; manual data must not acquire an AI marker simply because it was accepted or saved.

Give an icon-only provenance marker an accessible label or nearby text, such as “Added by AI” or “Suggested by AI”. Keep the marker separate from actions: it identifies provenance; accepting, rejecting and removing data use distinct controls. Do not use an inert tick to mean “AI data”.

## Workflow shapes

Use the same visual sequence for workflow stages: **circle → diamond → square**.

| Shape | Meaning | Composition stage |
| --- | --- | --- |
| Circle (○) | Starting or working | Progress |
| Diamond (◇) | Reviewing or checking | Review |
| Square (□) | Complete | Done |

Keep the shapes and stages in that order. Pair shapes with text labels; do not rely on shape or colour alone. In a segmented control, expose the selected stage with `aria-pressed` and use the existing selected fill. Decorative shapes accompanying a text label should be hidden from screen readers.

The composition editor keeps the workflow control in the original header action area. In Done it is replaced by **Edit** beside **Export**; Edit reopens the work in Review and restores the three-stage control (Progress if artwork is no longer complete). Keep this action area the same width so **Guests** and **Share** do not shift between states. Do not add a separate toolbar row for the stages.

## Validation

Check visible changes in the real app in dark and light themes, including long titles and narrow layouts. Check that new controls do not overlap text or move neighbouring actions unexpectedly. Follow the repository's checks and PR requirements in [CLAUDE.md](CLAUDE.md).
