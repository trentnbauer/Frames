# Frames UI conventions

Keep new screens and changes consistent with the existing app. The live colour, typography and component rules are in [web/src/styles.css](web/src/styles.css); theme switching is in [web/src/theme.ts](web/src/theme.ts). Reuse shared components before adding another implementation.

## Theme and typography

- Use the warm neutral palette in both dark and light themes. Use the CSS tokens (`--page`, `--surface`, `--text`, `--muted`, `--outline`, `--btn-bg`, etc.) rather than inventing screen-specific colours. Check both themes, including hover, focus and disabled states.
- Use Instrument Serif for prominent titles, IBM Plex Sans for UI text, and IBM Plex Mono for small technical labels and measurements. Reuse the existing font tokens and nearby text sizes.
- Home review banners use theme-aware text and a subdued background-image tint; the light theme must not put dark text over a darkened photo. Keep photographs unchanged by theme switching. Use subdued surfaces and thin outlines so the photographs remain the focus.
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

The composition editor keeps the circle → diamond → square workflow visible in the header in every stage, including Done. Choose Progress or Review to reopen a Done composition. Export belongs in the **Done · Read-only** side panel, where frame editing normally appears; it is not a header action. Keep Guests and Share in place when the stage changes. The composition editor title/action bar scrolls with the page; only the Compositions list header stays sticky below the shared app header. Keep pan and zoom geometry immediate so frames track the background without position or size transitions.

The shared app header uses the Home screen's inset and stays in the same position across navigation. Place an icon-only theme shortcut immediately left of the user dropdown: sun in dark mode, crescent in light mode, using the notification bell’s 16px size and 1.4px stroke. Keep theme and app-wide full-width controls in Your library → App settings, alongside other display preferences, and apply it consistently to page containers rather than giving individual screens independent width controls. The editor wall and overlaid controls use theme tokens too; keep control surfaces opaque enough to stay readable over a room photo.

## Notifications and gear suggestions

Each notification has a dismiss × at its top right. Keep dismissal and action buttons separate from the main navigation button. New-gear notifications offer Add to gear and Blacklist for one camera body or lens at a time. Metadata discovery is not AI provenance, so it does not receive an AI marker. Keep Found in your photos, including its photo-count labels, above the owned gear blocks. Blacklisted gear uses editable tags at the bottom, below the owned gear blocks, and blacklisting must immediately remove a matching Found in your photos suggestion and clear its camera/lens values and automatic gear tags from existing photos. Future imports and metadata edits must respect the blacklist. Original files remain unchanged.

## Account security

Personal password sign-in uses labelled email/password fields and a real submit button, with password-manager autocomplete and shared theme tokens. Keep the personal password server switch separate from the legacy shared password and emergency access. Two-factor enrolment and verification use shared theme tokens, normal buttons and labelled inputs. Generate the authenticator QR code locally, with a white quiet zone in both themes. Show setup keys and recovery codes only in the enrolment flow, and explain that recovery codes are shown once. Keep the emergency administrator exempt and its credentials out of the in-app logs.

## Validation

Check visible changes in the real app in dark and light themes, including long titles and narrow layouts. Check that new controls do not overlap text or move neighbouring actions unexpectedly. Follow the repository's checks and PR requirements in [CLAUDE.md](CLAUDE.md).

Removal decisions open in a dedicated full-screen view, with Back/Escape to leave and no app header or navigation over the photo. On desktop, Removal review belongs in the To do hover menu alongside other waiting tasks, rather than as a separate navigation tab. The phone removal entry remains conditional on eligible photos. The view uses one large photo beside a prominent personal-rating history, with Keep and Delete actions. Keep dismisses until another personal rating; Delete asks for confirmation. Match the shared theme in both modes and stack the panels on narrow screens. Automatic removal is a separate default-off setting with its own personal-average threshold and minimum-review count; it retains original files.

Share links use a named-link sidebar and a selected-link settings panel. Keep New link separate from Replace address, and show stopped/expired links explicitly. On phones stack the link list above the settings; retain the shared full-screen modal and footer. Each link’s permissions, PIN, expiry and invitations stay independent.

The owned-gear System view uses a system sidebar and selected-system details. Use consistent 1.4px stroked SVG equipment icons, draggable gear rows and labelled move selectors for keyboard/phone users. Show empty stored systems and Unassigned explicitly. Rename and edit operations use shared confirmation forms with visible save errors. Keep discovery and blacklist sections in their existing positions.

The Home wishlist is a compact bordered strip below all main Home content, using shared gear icons and theme tokens. Show at most two priority items plus a link to the full wishlist; omit the strip when empty. Keep review and composition content above it. Stack the strip on phones and wrap long equipment names.

The Gear wishlist uses expandable rows with explicit Edit, Save changes and Cancel actions. Keep URL, estimated price, notes and priority editable after creation; show unknown prices separately from zero. Use shared gear icons, visible save errors, up/down alternatives to dragging, and stacked fields on phones. Keep the owned-gear sidebar below the wishlist.

Keep collapsed wishlist rows single-line and compact, with plain sans-serif names. Put notes, Bought it, Didn't buy it and keyboard reorder actions inside Edit. Truncate long collapsed names with their full value available in the editor. Show the total beside the item count rather than repeating it below the list.


Library workflow controls reuse the shared toolbar, fields, modals and theme tokens. Bulk edits separate field inclusion from each field's Fill blanks choice and require a count preview. Put recovery, batch history, saved views, import history and review scheduling near Library controls. Gear aliases and wishlist history remain on Gear. Saved arrangements use the editor's existing room-control area, preserving the title, workflow, Share and Done export positions. Comparisons stack on phones. Undo and recovery failures remain visible and never silently overwrite newer work.

Desktop To do navigation is a hover/focus/click disclosure above the dock button, with counts and direct task links. Keep Removal review together with missing-detail tasks and omit empty groups. Support arrow keys and Escape, show the T shortcut, and keep All to do available when caught up. Do not duplicate To do in the top-right user menu.

Use shared themed in-app modals for every confirmation and typed confirmation; never use browser-native confirm, prompt or alert dialogs. Cancel, Escape and backdrop dismissal must leave the pending action untouched. Trap focus inside the topmost modal and restore focus afterward; a nested confirmation must not close its parent modal.

The header reserves a stable slot immediately before the theme toggle for a small ✦ AI activity indicator. Use muted grey at rest and theme-aware amber while working, with a subtle opacity pulse disabled for reduced motion. Hover/focus reveals the task and batch progress where available; never shift the other header controls or show old batch progress for an interactive task.

Composition frames require selection before dragging to move. Ignore pointer jitter below six screen pixels regardless of zoom. Space-drag and middle-button drag pan anywhere on the wall, including over frames, and never save a layout change. Keep these gestures available in Done and guest views; wall controls and text fields retain their own pointer/keyboard behaviour.
