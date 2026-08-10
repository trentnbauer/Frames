import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ToastProvider } from './toast.js';
import { applyAccent, applyTheme, getStoredAccent, getStoredTheme } from './theme.js';
import './styles.css';

// Applied before first paint (not in a component effect) to avoid a
// flash of the wrong theme/accent.
applyTheme(getStoredTheme());
applyAccent(getStoredAccent());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
