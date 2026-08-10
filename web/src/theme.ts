export type Theme = 'dark' | 'light';

const THEME_KEY = 'frames-theme';
const ACCENT_KEY = 'frames-accent';
export const DEFAULT_ACCENT = '#5f6068';

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function getStoredAccent(): string {
  return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT;
}

export function applyAccent(color: string) {
  document.documentElement.style.setProperty('--accent', color);
  localStorage.setItem(ACCENT_KEY, color);
}
