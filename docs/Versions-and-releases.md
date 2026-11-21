# Versions and releases

Releases are Docker images on GitHub's container registry: `ghcr.io/trentnbauer/frames`, tagged `1.2.3`, `1.2`, `1` and `latest` (amd64 and arm64). To run a release instead of building from source, set `FRAMES_IMAGE=ghcr.io/trentnbauer/frames:1.2.3` in `.env`, then:

```sh
docker compose pull && docker compose up -d --no-build
```

Pin an exact version to choose when you upgrade. The running version is shown in the corner of every page (and in Settings, About). Click it for **What's new**: the merged pull requests so far. After an update it opens by itself once, listing only what is new since that browser last looked (the first visit is never shown the whole history). A build from source shows "dev build" and an empty list.

**Version numbers are decided by pull request labels.** Every pull request carries exactly one label (the *Release label* check fails without one):

| Label | Use it for | Version change |
|---|---|---|
| `release: fix` | a bug fix, a small tweak, a dependency update | `1.2.3` to `1.2.4` |
| `release: minor` | a new feature or setting that existing users can ignore | `1.2.3` to `1.3.0` |
| `release: major` | a breaking change (something users must act on, such as a changed setting or a removed feature) | `1.2.3` to `2.0.0` |
| `release: none` | documentation, CI and other changes that need no new image | no release |

When the pull request is merged into `main`, the **Create Version and Docker Container** workflow works out the next number from the latest `vX.Y.Z` tag (starting from `0.0.0`, so the first release is `0.0.1`, `0.1.0` or `1.0.0`), tags that commit, creates a GitHub release with generated notes, and its **Create Docker Container** part runs the tests and publishes the image (amd64 and arm64) with the tags `1.2.3`, `1.2`, `1` and `latest`. The rules are in `.github/scripts/next-version.sh` and are tested in CI.

The release also writes the "What's new" list from the merged pull requests (`.github/scripts/generate-changelog.sh`), so a clear pull request title is the changelog line.

Setting it up once (maintainers): create the four labels, and in the repository's branch protection rules for `main` make **Release label** a required check. Pushing a tag by hand (`git tag v1.2.3 && git push origin v1.2.3`) still publishes that exact version; a tag with a suffix (`v1.2.3-rc.1`) is published as that version only, never as `latest`. The first publish creates the package as private: make it public in the package settings if others should pull it.
