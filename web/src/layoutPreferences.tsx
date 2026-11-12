import { createContext, useContext, type ReactNode } from 'react';
import { usePrefs } from './settings/hooks';

const LayoutContext = createContext({ fullWidth: false, setFullWidth: (_wide: boolean) => {} });
export const useLayoutPreferences = () => useContext(LayoutContext);

/** Keep the existing saved width choice, now shared by the whole signed-in app. */
export function LayoutPreferencesProvider({ children }: { children: ReactNode }) {
  const prefs = usePrefs('user');
  const fullWidth = prefs.get('browseFullWidth', false);
  return <LayoutContext.Provider value={{ fullWidth, setFullWidth: (wide) => prefs.set('browseFullWidth', wide) }}>
    <div className={`app-layout${fullWidth ? ' app-wide' : ''}`}>{children}</div>
  </LayoutContext.Provider>;
}
