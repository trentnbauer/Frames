# Security Policy

Frames is a self-hosted photo archive, so a security problem in it can expose someone's photographs, their location data or the keys they have saved. Please report problems privately and give me a chance to fix them before they are public.

## Supported versions

Only the **latest release** gets security fixes. That is the newest `X.Y.Z` image on [GitHub Packages](https://github.com/trentnbauer/Frames/pkgs/container/frames), also tagged `latest`. A fix is published as a new patch release; older versions are not patched, so please update (`docker compose pull && docker compose up -d`).

| Version | Supported |
| ------- | --------- |
| The latest release | Yes |
| Anything older | No: update to the latest |

## Reporting a vulnerability

**Use GitHub's private reporting:** [report a vulnerability](https://github.com/trentnbauer/Frames/security/advisories/new). Only I can see it. Please do **not** open a public issue, pull request or discussion for a security problem.

A good report says:

- what you found and what an attacker could do with it (for example "a signed-in member can read another person's photographs");
- the version (Settings, About, or the corner of any page) and how Frames is run (Docker, with or without sign-in, behind a tunnel or proxy);
- the steps to reproduce it, or a short proof of concept. Please test on your own instance and your own data.

Frames is looked after by one person in their spare time, so these are best-effort promises:

- I will **acknowledge** your report within **7 days**.
- I will tell you whether I think it is a vulnerability, and **keep you updated at least every 14 days** until it is fixed or closed.
- For a confirmed problem I aim to **release a fix within 30 days**, sooner for anything serious, and then publish an advisory that credits you (or not, if you prefer).
- If I decide it is not a vulnerability, I will explain why.

Please give me a reasonable time to fix a problem before you tell anyone else.

## What counts

Reports I especially want:

- getting in without signing in, or past Cloudflare Access when the environment-variable tunnel setup is used;
- one person reaching another person's library, collections, settings or secrets, or a member doing something only an administrator can (changing sign-in, the tunnel, the people list);
- share links or the public portfolio showing more than they should (places, notes, file paths, other photographs), or guessable share links;
- secrets (AI keys, client secrets, tunnel tokens, the shared password) appearing in a response, a log, a backup or an error;
- reading or writing files outside the data and library folders, or changing or deleting an original photograph;
- cross-site scripting, cross-site request forgery, or the sign-in flow being tricked;
- anything that lets a request make the server do something it should not (for example reaching other services on the network without an administrator having set that up);
- a way out of the container, or a dependency problem that is actually reachable from Frames.

## What does not

- Problems that need an administrator, or access to the server or its files, to begin with: anyone allowed in as an administrator can already change settings (including AI addresses and sign-in providers), and whoever runs the server can read its data.
- Running Frames open to the internet with no sign-in and no other protection (`AUTH_DISABLE=true` is for one person behind something that protects it). Frames says so on the screen.
- Missing rate limits on routes that need a sign-in, and findings in tools or services outside this repository (Docker, Cloudflare, your sign-in provider).
- Reports from automated scanners with no demonstrated impact.

## How Frames protects itself

The details are in the README under *Security*. In short: sign-in is optional and, when on, each person gets a separate library that other people cannot reach; share links and the portfolio are a short fixed list of addresses with only a photograph's picture and title; secrets are write-only and left out of backups and logs; the container runs as an unprivileged user with a read-only filesystem and no extra capabilities; and the repository is checked on every change by tests, CodeQL code scanning, GitGuardian secret scanning and Dependabot.
