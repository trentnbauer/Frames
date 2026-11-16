import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS } from '../data';
import { useStore } from '../store';
import { setTheme, useTheme } from '../theme';
import { BackPill, Eyebrow, Row, Seg, Toggle } from './ui';

type NP = { bell: Record<string, boolean>; email: Record<string, boolean>; quiet: { on: boolean; from: string; to: string }; tz: string; reviewReminder: 'off' | 'daily' | 'weekly' };
const NOTIFS: [string, string, string, string[]][] = [
  ['due', 'Reviews due', 'When photographs are ready to rate again', ['review-due']],
  ['ideas', 'New ideas', 'Suggested sets for compositions', ['idea']],
  ['guests', 'Guest replies', 'Ratings and suggestions on share links', ['guest-suggestion', 'guest-rating', 'guest-reply']],
  ['gear', 'New gear found', 'Cameras and lenses found in photo metadata', ['gear-found']],
  ['community', 'Community ratings', 'When someone rates your work', ['community-rating']],
  ['cloud', 'Cloud sync', 'New batches from Google Drive or Dropbox', ['cloud-sync']],
];

/** The short list of settings the phone keeps: theme, rating scale, session length and what reaches the bell. The rest is on the full page. */
export function MobileSettings() {
  const nav = useNavigate();
  const theme = useTheme();
  const { settings, setSettings } = useStore();
  const prefs = useApi<{ prefs: NP }>('/notifications/prefs');
  const [err, setErr] = useState('');
  const p = prefs.data?.prefs;
  const guard = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } };
  const bell = (kinds: string[]) => !!p && kinds.every((k) => p.bell[k] !== false);
  const flip = (kinds: string[]) => guard(async () => { await api('/notifications/prefs', { method: 'PUT', body: { bell: Object.fromEntries(kinds.map((k) => [k, !bell(kinds)])) } }); prefs.reload(); });
  const section = (t: string) => <Eyebrow style={{ paddingTop: 8 }}>{t}</Eyebrow>;
  return (
    <div className="ppage" data-screen-label="Settings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ paddingTop: 4 }}><BackPill /></div>
        <h1 style={{ font: '400 56px/1 var(--serif)', margin: '8px 0 4px' }}>Settings</h1>
        {err && <div role="alert" className="reason">{err}</div>}
        {section('APPEARANCE')}
        <span style={{ fontSize: 18 }}>Theme</span>
        <Seg label="Theme" value={theme} options={[['dark', 'Dark'], ['light', 'Light']]} onPick={(v) => setTheme(v)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 18 }}>Rating scale</span><span style={{ fontSize: 14, letterSpacing: 2 }} aria-hidden>{RATINGS.map((r) => (settings?.ratingStyle === 'stars' ? '★' : r.emoji)).join(settings?.ratingStyle === 'stars' ? '' : ' ')}</span></div>
        <Seg label="Rating scale" value={settings?.ratingStyle ?? 'emoji'} options={[['emoji', 'Faces'], ['stars', 'Stars']]} onPick={(v) => guard(() => setSettings({ ratingStyle: v }))} />
        {section('REVIEWS')}
        <span style={{ fontSize: 18 }}>Session length</span>
        <div role="group" aria-label="Session length" style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--surface)' }}>
          {[6, 12, 24].map((n) => { const on = settings?.reviewSize === n; return <button key={n} aria-pressed={on} onClick={() => guard(() => setSettings({ reviewSize: n }))} style={{ flex: 1, height: 38, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'transparent', color: on ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 14, fontWeight: 500 }}>{n} photos</button>; })}
        </div>
        <Row label="Review schedule" sub="How often photographs come back" onClick={() => nav('/review-schedule')} />
        {section('NOTIFICATIONS')}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {NOTIFS.map(([k, label, sub, kinds]) => <Toggle key={k} label={label} sub={sub} on={bell(kinds)} onClick={() => flip(kinds)} />)}
        </div>
        {section('MORE')}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Row label="All settings" sub="Account, storage, AI, sign-in and the server" onClick={() => nav('/settings?section=account')} />
        </div>
      </div>
    </div>
  );
}
