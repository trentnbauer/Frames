# Application bug and security review — 16 November 2026

Reviewed the application at af01882, using source review, isolated test libraries, API probes, dependency audits and desktop Chromium. No production instance or production account was accessed.

## High-risk fixes

| Finding | Change | Verification |
| --- | --- | --- |
| Routed API authorization differed from raw-URL authorization | Administrator permissions, guest restrictions and second-factor enforcement use the route Fastify actually matched. Alternate URL encodings cannot skip these checks. | Regression tests first reproduced the failures, then passed with the fix. Desktop HTTP checks confirmed member/guest/MFA denials while a verified administrator could still use Library. |
| An empty wall-only share exposed all candidates | Wall-only filtering stays active even when no photos are chosen. | Empty shared lists, thumbnail/preview/original denials and rejected reviews for unselected candidates are covered. |

Private report: [GHSA-g3rc-rm77-999x](https://github.com/trentnbauer/Frames/security/advisories/GHSA-g3rc-rm77-999x). The integration could file the report but GitHub denied creation of a temporary private fork. Repository-based delivery was then requested by the owner.

## Medium findings logged for follow-up

- [#355](https://github.com/trentnbauer/Frames/issues/355): bulk metadata treats a rejected AI tag/subject as already accepted.
- [#356](https://github.com/trentnbauer/Frames/issues/356): share PIN signatures and device lockout keys need library/link scoping. Cookie crossover was reproduced with matching share IDs and test PINs in two synthetic accounts.
- [#357](https://github.com/trentnbauer/Frames/issues/357): recovery returns HTTP 500 if the retained original path exists but cannot be read as a file.
- [#358](https://github.com/trentnbauer/Frames/issues/358): fallback portfolio Markdown permits link-attribute injection. Chromium confirmed a harmless injected attribute; current CSP blocks inline scripts, so unrestricted script execution was not demonstrated.

Each issue includes reproduction, impact, suggested correction and regression expectations. These are open findings, not fixed by this patch.

## Coverage and results

- Reviewed authentication/session handling, second-factor enforcement, guest/admin roles, tenant selection, public share/portfolio membership, PIN state, CSRF checks and security headers.
- Reviewed upload/path handling, original downloads, recovery/Undo, import retries, backup secret scrubbing and external-service configuration boundaries.
- Existing authentication, MFA, tenant-isolation, share/PIN, file handling, backup and route-fuzz tests ran with the full suite.
- Server: 1,143 tests passed, including RAW tests with ExifTool available. Web: 122 tests passed. Both type checks and production builds passed.
- Production dependency audits found zero reported vulnerabilities in server and web dependencies at review time.
- Desktop Chromium verified the authorization changes, an ordinary administrator Library view, empty-wall sharing and blocked original downloads.
- Raw HTTP path-traversal/encoded-path probes against the local fixture did not expose administrator routes without authentication.

Live external OAuth/SMTP/cloud-provider accounts and production proxy/container configuration were not exercised. This review does not change intentionally unprotected operation when sign-in is disabled or the configured ability to connect to a local AI service.

## Manual verification

1. As a member, call an administrator endpoint normally and with percent-encoded static URL characters. Both must return 403; settings must remain unchanged after a refused write.
2. With second-factor verification outstanding, try ordinary and encoded Library/API requests. Both must require verification. The account's factor-setup endpoints must remain accessible.
3. As a guest, ordinary and encoded Library requests must return 403; the account and shared-link list remain accessible.
4. As a verified administrator, open Library and server settings normally. Existing permitted actions must still work.
5. Make a composition containing candidates but no selected wall photos. Share with Only the wall and downloads enabled. Its guest list must be empty; direct candidate image/download/review requests must be refused. Select a wall photo and confirm only selected work becomes visible.
