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
  document.documentElement.style.setProperty('--accent-ink', contrastingInk(color));
  localStorage.setItem(ACCENT_KEY, color);
}

// .btn-solid fills its background with --accent and needs a text color
// that stays readable regardless of how light/dark that accent is — a
// muted grey default (or any custom accent a user picks) can't assume
// dark text will always have enough contrast. WCAG relative-luminance
// threshold, same formula used for the AA contrast check.
function contrastingInk(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#161826';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const [rl, gl, bl] = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  return luminance > 0.45 ? '#161826' : '#ffffff';
}
