/** GitHub Pages mounts the production Frames app, not a second demo UI.
 * All data comes from synthetic fixtures; writes are rejected in api.ts.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '../App';
import { StoreProvider } from '../store';
import { DialogHost } from '../components/dialogs';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../styles.css';
import '../proto/hover.css';
import './style.css';
import room from './room.jpg';
import { demoAssets } from './api';

demoAssets.room = room;

// The production fetch wrapper is read-only in demo mode. Also deny raw calls
// from upload/sign-out flows so they cannot contact any API or auth service.
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin === location.origin && (/^\/api(?:\/|$)/.test(url.pathname) || /^\/auth(?:\/|$)/.test(url.pathname))) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Read-only demo: changes are disabled.' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    }));
  }
  return realFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="frames-demo-notice" role="status">
      <strong>Frames demo</strong>
      <span>Actual app interface · Example photographs · Read-only (changes disabled)</span>
      <a href="https://github.com/trentnbauer/Frames" target="_blank" rel="noreferrer">View on GitHub ↗</a>
    </div>
    <BrowserRouter basename="/Frames">
      <StoreProvider>
        <App />
        <DialogHost />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
