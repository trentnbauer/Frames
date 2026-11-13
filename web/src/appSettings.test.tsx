import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { useAppSettings, useProfile } from './settings/lib1';
import type { Ctx } from './settings/sections';
import type { Section } from './settings/ui';
const mocks = vi.hoisted(() => ({ setWidth: vi.fn(), setTheme: vi.fn(), modal: vi.fn() }));
vi.mock('./layoutPreferences', () => ({ useLayoutPreferences: () => ({ fullWidth: true, setFullWidth: mocks.setWidth }) }));
vi.mock('./theme', () => ({ useTheme: () => 'dark', setTheme: mocks.setTheme }));
vi.mock('./api', () => ({ api: vi.fn(), useApi: () => ({ data: {}, reload: vi.fn() }) }));
vi.mock('./store', () => ({ useStore: () => ({ refreshMe: vi.fn() }) }));
vi.mock('./settings/hooks', () => ({ usePrefs: () => ({ get: (_key: string, value: unknown) => value, set: vi.fn() }) }));
it('groups display preferences, welcome and cache troubleshooting in App settings', () => {
  const ctx = { toast: vi.fn(), modal: mocks.modal, goto: vi.fn(), me: null, isAdmin: false } satisfies Ctx;
  let app!: Section, profile!: Section;
  function Probe() { app = useAppSettings(ctx); profile = useProfile(ctx); return null; }
  renderToStaticMarkup(<MemoryRouter><Probe /></MemoryRouter>);
  const rows = app.groups.flatMap(g => g.rows);
  expect(rows.map(r => r.id)).toEqual(['fullWidth', 'theme', 'start', 'units', 'dateFmt', 'welcomeTour', 'clearSiteData']);
  expect(profile.groups.flatMap(g => g.rows).some(r => ['theme', 'start', 'units', 'dateFmt'].includes(r.id))).toBe(false);
  rows.find(r => r.id === 'fullWidth')!.set!(false); expect(mocks.setWidth).toHaveBeenCalledWith(false);
  rows.find(r => r.id === 'theme')!.set!('Light'); expect(mocks.setTheme).toHaveBeenCalledWith('light');
  rows.find(r => r.id === 'clearSiteData')!.act!(); expect(mocks.modal).toHaveBeenCalledOnce();
});
