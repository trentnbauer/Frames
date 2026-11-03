# Working on Frames

Rules for anyone (human or Claude) changing this repository. What Frames does and how it is run is in `README.md` (the original design document has been retired: every requirement in it was built and tested, and `git log` has its history).

## Every pull request gets exactly one release label

The version number of the container image is worked out from it when the pull request is merged into `main` (see README, "Versions and releases"). Add the label when you open the pull request (`gh pr create --label "release: minor" ...`) and keep it right if the scope changes:

| Label | Use it for | Version |
|---|---|---|
| `release: fix` | a bug fix, a small tweak, a dependency update | patch: `1.2.3` to `1.2.4` |
| `release: minor` | a new feature or setting existing users can ignore | minor: `1.2.3` to `1.3.0` |
| `release: major` | a breaking change users must act on (a removed or changed setting, a data migration they must plan for) | major: `1.2.3` to `2.0.0` |
| `release: none` | documentation, CI, tests only: nothing that changes the image | no release |

When unsure between two, take the bigger one. A pull request with no release label, or more than one, fails the *Release label* check and must not be merged. Stacked pull requests (based on another branch) still need a label.

Write the pull request title as the line users will read in the app's "What's new" list (it is the changelog entry): plain, specific, in the past or imperative tense, no ticket numbers or branch names.

## Pull requests

- Open them ready for review, not as drafts. Do not merge your own pull request unless the owner has said to.
- Say in the description what changed, what was checked, and what was not (for example "not tested against the real service").
- If a change adds or alters behaviour users can see, describe it in `README.md` in the same pull request, including its limits and anything not tested against the real service.
- If it adds or changes an environment variable, update the README's *Environment variables* tables, `.env.example` and both compose files.
- If it adds a database migration, append to `MIGRATIONS` in `server/src/db.ts` (never edit an old one). Two open pull requests can both add the next number: whichever merges second renumbers.

## Before a pull request is ready

All of these, not a subset:

1. `npx tsc --noEmit` in `server/` and `web/`.
2. `npx vitest run` in `server/` and `web/`. New behaviour gets tests; a bug fix gets a test that fails without the fix.
3. `npm run build` in `web/` (and `server/`).
4. Run the real app and try the change in a browser (Playwright is fine). Several real bugs here only showed up in a browser.
5. A change to the Dockerfile must build (CI builds it for amd64 and arm64).

## Conventions

- Node 22. `better-sqlite3` stays on 11 (later majors ship no prebuilt binaries for the slim image). Native modules must have prebuilds for the Node major in the Dockerfile.
- The server is Fastify with one route module per area (`server/src/routes/*.ts`) sharing the `Ctx` object, plus plain modules for the rest. The web app is React with `useApi` for reads and `api()` for writes.
- Input from the network is validated where it enters. Secrets (API keys, client secrets, tokens) are **write-only**: stored through `setSecret`/the `secret:` settings prefix, never returned by an API, never logged, and left out of backups.
- Originals are never modified or deleted by Frames. Anything that copies, syncs or exports is additive.
- Anything reachable without signing in (share links, the public portfolio, the health check) stays a short, fixed list of addresses; add to it with great care and a test.
- Do not put anything that looks like a real credential in a test or a doc, not even an obviously fake one in a real token's shape: secret scanning (GitGuardian) will flag it. Build such values at run time.
- Never commit a `.env` file, a database, or a photograph.
- Commit messages and pull request text are plain prose, written for the person reading the history later.
