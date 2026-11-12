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

- Open them ready for review, not as drafts.
- **Turn on auto-merge for every pull request** (squash) as soon as it is open and carries its release label: `gh pr merge <number> --auto --squash`, or the "Enable auto-merge" button. It then merges itself once the required checks pass. Never merge by hand over a failing check, never bypass the branch rules, and never turn auto-merge on for a pull request whose release label is missing or wrong, because the label decides the version number at merge. If you cannot turn it on (no permission, or a tool or session that is not allowed to), say so in your report and in the pull request so the owner can.
- A pull request with conflicts will not auto-merge: when `main` moves on, merge `main` into the branch, fix the conflicts and push.
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
5. A change to the Dockerfile must build. CI builds and starts the image (amd64 and arm64) only when the Dockerfile, .dockerignore or a package.json or lock file changes, and on every push to main and release; other pull requests skip it, so it is up to you to build it when you change something the image depends on.

## UI design

Read [DESIGN.md](DESIGN.md) before changing the UI. It documents the theme and typography, **✦ before AI-derived data**, and **circle → diamond → square** for workflow stages. Reuse the shared CSS tokens and components, and verify both themes.

## Conventions

- Node 22. `better-sqlite3` stays on 11 (later majors ship no prebuilt binaries for the slim image). Native modules must have prebuilds for the Node major in the Dockerfile.
- The server is Fastify with one route module per area (`server/src/routes/*.ts`) sharing the `Ctx` object, plus plain modules for the rest. The web app is React with `useApi` for reads and `api()` for writes.
- On/off environment variables are written `true` or `false` (read with `envBool` in `server/src/env.ts`, which also accepts 1/0, yes/no, on/off and warns on anything else). Never test a switch with `=== '1'`.
- Every route is fuzzed automatically (`server/src/garbage.test.ts` reads the route definitions): it sends wrong types, nulls, huge values and odd addresses and fails on any server error, so a new route is covered without being listed. A request body is refused unless it is a plain JSON object (see the `preValidation` hook in `app.ts`). Code that runs from a timer must never throw: an uncaught exception ends the whole server.
- Input from the network is validated where it enters. Secrets (API keys, client secrets, tokens) are **write-only**: stored through `setSecret`/the `secret:` settings prefix, never returned by an API, never logged, and left out of backups.
- Originals are never modified or deleted by Frames. Anything that copies, syncs or exports is additive.
- Each person has their own library. Code in routes and `ingest`/`ai`/`portfolio` etc. reads `db` and `cfg` from the shared `Ctx`, which are proxies answering from the person making the request (see `tenants.ts`), so never keep a library's data in a module-level variable or cache it across requests. Instance-wide things (sign-in providers, people, sessions, the tunnel) live in the system database, `ctx.sys`. Background jobs must run inside `tenants.run(tenant, ...)` for each person.
- Anything reachable without signing in (share links, the public portfolio, the health check) stays a short, fixed list of addresses; add to it with great care and a test.
- Do not put anything that looks like a real credential in a test or a doc, not even an obviously fake one in a real token's shape: secret scanning (GitGuardian) will flag it. Build such values at run time.
- Never commit a `.env` file, a database, or a photograph.
- Commit messages and pull request text are plain prose, written for the person reading the history later.
