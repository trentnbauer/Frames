import { setTheme, useTheme } from '../theme';

/** A shortcut to the same browser theme preference used by App settings. */
export function ThemeToggle() {
  const theme = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="iconbtn" title={label} aria-label={label} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTheme(theme === 'dark' ? 'light' : 'dark', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {theme === 'dark' ? <><circle cx="8" cy="8" r="3" /><path d="M8 1v1m0 12v1M1 8h1m12 0h1M3 3l.7.7m8.6 8.6.7.7M3 13l.7-.7m8.6-8.6L13 3" /></> : <path d="M12.8 9.3A5.2 5.2 0 0 1 6.7 3.2a5.2 5.2 0 1 0 6.1 6.1Z" />}
      </svg>
    </button>
  );
}
