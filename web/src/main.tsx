import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { applyTheme, getStoredTheme } from './theme.js';
import './styles.css';

// Applied before first paint (not in a component effect) to avoid a
// flash of the wrong theme.
applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
