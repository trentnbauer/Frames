# Frames GitHub Pages demo

GitHub issue #367.

The Pages demo now **mounts the production React application** (`App`, `StoreProvider`, production routes, components and styles). It is not a separate recreation of the interface.

## Read-only, synthetic data

- `web/src/demo/main.tsx` starts the real Frames UI using the `/Frames` BrowserRouter basename.
- `web/vite.demo.config.ts` sets the `VITE_FRAMES_DEMO` build flag.
- `web/src/api.ts` routes demo reads to `web/src/demo/api.ts` and image URLs to stable public sample JPEGs served by Picsum Photos (480px thumbnails and 1600px previews). No personal Frames photographs or user data are included. Sample images require internet access.
- **Every mutation via `api()` is rejected**; direct same-origin `fetch` requests to API/auth endpoints also receive HTTP 403 within the demo page. No Frames backend is deployed.
- Editing controls are inherited from the real application for visual fidelity, but do not save changes. Some API-dependent screens have no populated examples yet.

This design deliberately avoids running a public writable instance or copying its database. Unlike the previous standalone imitation, the shared frontend components mean ordinary UI improvements also appear in the demo on its next deploy.

## Deploy

Set GitHub Settings → Pages → Build and deployment → **Source: GitHub Actions**.

`Publish Frames demo` runs when relevant files on main change, manually, and daily at 20:00 UTC (07:00 AEDT, or 06:00 AEST). It produces an SPA `404.html` for refreshable deep links under the `/Frames/` project path.

Expected address: https://trentnbauer.github.io/Frames/

## Local build

```sh
cd web
npm ci
npx tsc --noEmit
npx vite build --config vite.demo.config.ts
mv dist-demo/demo.html dist-demo/index.html
cp dist-demo/index.html dist-demo/404.html
npx vite preview --outDir dist-demo --base /Frames/
```
