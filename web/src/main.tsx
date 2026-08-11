import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ToastProvider } from './toast.js';
import { applyAccent, applyTheme, getStoredAccent, getStoredTheme } from './theme.js';
import { loadEnvConfig } from './importConfig.js';
import './styles.css';

// Applied before first paint (not in a component effect) to avoid a
// flash of the wrong theme/accent.
applyTheme(getStoredTheme());
applyAccent(getStoredAccent());

// Fire-and-forget: caches container env-var defaults (Google/Dropbox keys)
// for importConfig.ts getters. Import buttons work fine before this resolves.
loadEnvConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
