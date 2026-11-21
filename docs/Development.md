# Development

```sh
cd server && npm install && npm run dev      # API on :3000
cd web && npm install && npm run dev         # UI on :5173, proxies /api to :3000
```

`npm test`, `npm run typecheck` and `npm run build` work in both folders. Node 22 or newer.

## Container builds and releases

Pull requests validate image changes on native Linux AMD64 and ARM64 runners, with a separate BuildKit cache for each architecture. Every push to `main` runs CI once through the version workflow, including changes labelled `release: none`. A release builds each image once, checks that exact image starts and reports the correct version, then publishes the multi-architecture manifest from the tested digests. The publisher does not rebuild. Manually pushed version tags use the same validation and publishing steps. Both architectures use the same generated changelog; version, major/minor and stable `latest` tags keep their existing behavior.

Docker installs system packages before copying application files or applying the release version, so ordinary code/version changes can reuse that layer. A cold cache, changed dependencies or an updated base image still requires the corresponding installation work. If a build network uses a private trusted CA, supply it without disabling TLS verification: `docker build --secret id=extra_ca,src=/path/to/trusted-ca.pem -t frames .`. The certificate is mounted only during networked build steps and is not copied into the image.

## More for developers

- [GitHub Pages demo](Demo-pages): how the public demo runs the real app on synthetic data.
- [Library workflow testing](Testing-library-workflows): the manual test plan for bulk edits, recovery, saved views and more.
- [Security review, 16 November 2026](Security-review-2026-11-16).
