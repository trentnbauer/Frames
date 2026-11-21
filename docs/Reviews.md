# Reviews and To do

Photographs return for ratings in spaced sessions so your opinion can settle. Set session counts, intervals, review size, rating style and adaptive spacing under **Settings → Your library → Reviews**.

New photographs start their review schedule from their added date. Due photos are ordered by when they were last reviewed; a never-reviewed photo uses its added date. **Resume review** continues an unfinished session. If nothing is due, **Review anyway** offers older photographs without waiting; ratings still count and update the schedule normally.

The Home review banner follows the selected theme, including **REVIEW · ANYTIME / Nothing is waiting to be seen again**. It remains readable over its subdued photograph tint in Light and Dark.

![Home in the light theme](https://raw.githubusercontent.com/wiki/trentnbauer/Frames/screenshots/home-light.png)

## Scope and shared reviews

Starting a review from a photoshoot reviews that photoshoot's photographs, rather than unrelated library photos. A share link opens exactly the selected photoshoot or composition; guest scores remain separate from your own. See [Share links](Share-links).

## To do

**To do** offers one-at-a-time and list views for missing/awaiting subjects, tags, places, descriptions and other configured tasks. AI suggestions are identified separately, and acceptance/removal controls should not be confused with the ✦ provenance marker. Skipping a photo does not delete it. To do can also provide candidates to a composition.

On a phone, To do shows the same total as the desktop, and each row counts every photograph missing that thing. Opening a row still walks through the photographs it is first in line for. In Statistics, "In compositions" counts photographs chosen for a print, not every candidate.

A photoshoot's shared tags/subjects and default place can pass to its photographs. Removing an inherited value does not delete a separately added personal value. Photoshoot dates are editable and can be propagated to photographs through the shoot controls; the originals remain untouched.

## Navigation and ideas

The bottom navigation links to Home, Shoots, Library and Compositions, with search and To do access. The shared Frames/account/notifications header stays aligned across pages. **Welcome tour** can be reopened from App settings → Help. For candidate sets based on tags, colours and locations, see [Composition ideas](Composition-ideas).

## Missing-detail tasks

When **Camera** or **Lens** is selected under Settings → Your library → Reviews → To do list counts photos missing, a photo missing that detail appears in To do’s **Everything** queue and badge count as well as the **Camera** or **Lens** filter. Camera and lens fields are shown in Everything for those photos; saving the missing detail removes that task. Camera/lens values cleared by the gear blacklist follow the same rule. Camera and Lens are independent opt-in reasons: turning either off excludes tasks caused only by that missing detail.

To do’s badge counts each photo once, even when it needs several details. Cloud reconnection tasks count separately. Camera, lens and film fields offer prefix suggestions from owned gear first, then discovered gear of the matching type, while allowing free text. Selecting or typing a value does not add it to owned gear.

To do offers independent camera-body and lens suggestions from other photos in the same shoot. Each “Use … from the same shoot” action fills only that field; other camera and exposure values stay as entered. Save & next persists the changes. Photos outside a shoot do not receive these suggestions.

## Due dates and filters

Shoot cards and the Needs review filter now describe photos **due now**, using the same schedule and archived/missing exclusions as the review queue. Shoots waiting for a later review do not display a review-status badge; the shoot’s percentage still measures completion of all configured sessions. The shoot review action includes repeat reviews when due and displays “Nothing due” when there are none. Library’s Review menu filters Due now, Unrated, Waiting, Review complete or Left out of review; it combines with other filters and is saved in the URL. Review completion and empty-queue screens use **Back** to return to the preceding page (Home for a directly opened review).

See [Review schedule](Review-schedule) for date changes and early reviews.

## Low-rated photographs

Enable **Settings → Your library → Reviews → Suggest removing low-rated photos** to receive removal suggestions. A photo qualifies after all configured review sessions when the average of your own ratings is strictly below **Averaging below** (default 2.0). Guest/community ratings do not affect this decision. Suggestions appear in To do, under Suggested now in Reviews settings, and as a link after a review session. Select photos and confirm before removing anything; disabling the switch hides suggestions. All original files, including uploaded and cloud copies, are retained. Removal records can be recovered during the configured recovery period.

Removal decisions open in a dedicated full-screen review, with Back/Escape, a large uncropped photo, personal score-history chart and per-session scores. Removal review appears under the desktop To do menu only while eligible photos are waiting. To do and Reviews settings link to this view. **Keep** dismisses until another personal rating; **Delete** requires confirmation. Kept decisions are private and pause automatic removal until ratings change. Portrait and landscape photos fit completely inside the preview.

**Reviews → Automatically remove low-rated photos** replaces the former “Suggest leaving low-rated photos out of review” preference. It is off by default and has its own **Averaging below** threshold (default 2.0) and **After at least this many reviews** requirement (default 4), independent of suggestions. Enabling it or changing its criteria immediately processes qualifying existing photos; it also runs after rating a photo, on startup and once a minute. It uses only personal ratings, requires the average to be strictly below the threshold, skips unavailable files, keeps all original files and does not reimport removed records during normal scans. No confirmation is shown once automatic removal is enabled.

Photos in any composition (including candidates and Done compositions), and photos in shoots with active, unexpired share links, are excluded from both removal suggestions and automatic removal. Confirmed Delete rechecks eligibility on the server so newly shared or composed photos are protected even if the displayed suggestion was loaded earlier. Revoked or expired shoot shares do not block eligibility.

Removed records can be restored during the configured recovery period; see [Recovery and Undo](Recovery-and-undo).

## To do navigation

Hover over **To do** in the desktop navigation to see the waiting task groups and their counts. Removal review appears here, alongside missing tags, subjects, camera/lens details and other outstanding tasks. Only groups with waiting work appear; **All to do** remains available when everything is complete. Clicking the button or focusing it with the keyboard opens the same menu; arrow keys move between links and Escape closes it. Missing-detail links open the corresponding To do filter directly.

Press **T** to open To do when you are not typing or using a modal. To do is no longer duplicated in the top-right user dropdown.
