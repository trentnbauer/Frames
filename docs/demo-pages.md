# Frames GitHub Pages demo

Issue #367. A static, read-only interactive **sample** of Frames, published to GitHub Pages.

## How it works

The demo is a separate React entry point (`web/demo.html` and `web/src/demo/`), not a copy of the authenticated application. It reuses Frames typography and design tokens but **never calls the Frames API**, stores no visitor data and does not offer upload, editing, rating or saving controls. Visitors can browse example photographs, search/filter, open a photo, browse photoshoots and open compositions.

Sample images are generated locally as deterministic SVG gradients and abstract shapes. They require no external image service; this demo does not contain or expose private photographs.

## Deployment

The `Publish Frames demo` GitHub Actions workflow builds the demo with the GitHub Pages project base path `/Frames/`, then deploys `web/dist-demo`. It runs when relevant files change on main, on manual dispatch, and every day at **20:00 UTC = 07:00 AEDT**. During AEST (UTC+10) this runs at 06:00; the requested fixed AEDT time is preserved.

To activate the site, enable GitHub Pages for this repository and select **GitHub Actions** as its build and deployment source. The expected project URL is `https://trentnbauer.github.io/Frames/` once the workflow deploys successfully. Repository Pages configuration is not changed by this PR.

## Local preview

```sh
cd web
npm ci
npx vite build --config vite.demo.config.ts
mv dist-demo/demo.html dist-demo/index.html
npx vite preview --outDir dist-demo --base /Frames/
```

This is a lightweight tour of the main navigation and photography views, not a complete simulation of every Frames screen.
