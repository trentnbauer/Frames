import { useState } from 'react';
import { useApi } from '../api';
import { fmtDate } from '../data';
import { Header, Loading } from '../components/bits';
import { useStore } from '../store';

const SECTIONS = ['Libraries & storage', 'Reviews', 'AI', 'Metadata & XMP', 'Backup', 'About'] as const;
const INTERVALS = ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'];

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="field toggle">
      <div><h3 style={{ fontSize: 19 }}>{label}</h3>{hint && <p style={{ margin: 0 }}>{hint}</p>}</div>
      <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  );
}

export function SettingsPage() {
  const [sec, setSec] = useState<(typeof SECTIONS)[number]>('Reviews');
  const { settings: s, setSettings } = useStore();
  const info = useApi<{ libraries: { path: string; exists: boolean; lastScan: string | null }[] }>('/settings');
  if (!s) return <div className="page"><Header /><Loading /></div>;
  return (
    <div className="page">
      <Header />
      <div className="settings">
        <nav className="snav" aria-label="Settings sections">
          {SECTIONS.map((x) => <button key={x} className={sec === x ? 'on' : ''} onClick={() => setSec(x)}>{x}</button>)}
        </nav>
        <div>
          <h1 className="serif" style={{ fontSize: 44, marginBottom: 12 }}>{sec}</h1>
          {sec === 'Reviews' && (
            <>
              <div className="field">
                <h3>Sessions per photo</h3><p>How many times each photograph comes back for a rating.</p>
                <div className="stepper">
                  <button aria-label="Fewer sessions" onClick={() => setSettings({ sessions: Math.max(1, s.sessions - 1) })}>−</button>
                  <b>{s.sessions}</b>
                  <button aria-label="More sessions" onClick={() => setSettings({ sessions: Math.min(12, s.sessions + 1) })}>+</button>
                </div>
              </div>
              <div className="field">
                <h3>Interval after each session</h3><p>Time before a photograph returns for its next review. Tap a tile to change it.</p>
                <div className="tiles">
                  {Array.from({ length: s.sessions }, (_, i) => {
                    const v = s.intervals[Math.min(i, s.intervals.length - 1)];
                    return (
                      <button className="tile-s" key={i} aria-label={`Interval after session ${i + 1}: ${v}`} onClick={() => {
                        const next = [...s.intervals];
                        while (next.length < s.sessions) next.push(next[next.length - 1] ?? '1 year');
                        next[i] = INTERVALS[(INTERVALS.indexOf(v) + 1) % INTERVALS.length];
                        setSettings({ intervals: next });
                      }}><b>after {i + 1}</b>{v}</button>
                    );
                  })}
                </div>
              </div>
              <Toggle on={s.adaptive} onChange={(v) => setSettings({ adaptive: v })} label="Adapt to consistency" hint="Steady ratings come back less often. Mixed ratings come back sooner." />
              <Toggle on={s.archiveSuggest} onChange={(v) => setSettings({ archiveSuggest: v })} label="Suggest archiving low-rated photos" hint="After 4 sessions averaging under 2." />
            </>
          )}
          {sec === 'AI' && (
            <div className="field">
              <h3>Where analysis runs</h3>
              <p>Tags, similarity, semantic search and suggestions. The analysis itself isn’t built yet, so choosing a mode only saves your preference. Turn it off and everything else works as normal.</p>
              <div className="cards2" role="radiogroup" aria-label="AI mode">
                <button role="radio" aria-checked={s.ai === 'local'} className={'opt' + (s.ai === 'local' ? ' sel' : '')} onClick={() => setSettings({ ai: 'local' })}>
                  <b>Local</b>Runs on a model on your own network. Photos never leave this server.
                </button>
                <button role="radio" aria-checked={s.ai === 'external'} className={'opt' + (s.ai === 'external' ? ' sel' : '')} onClick={() => setSettings({ ai: 'external' })}>
                  <b>External provider</b>Faster on weak hardware.
                  <span className="w">Previews are sent to a third party for analysis.</span>
                </button>
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="pill" onClick={() => setSettings({ ai: s.ai === 'off' ? 'local' : 'off' })}>{s.ai === 'off' ? 'Turn AI on' : 'Turn AI off'}</button>
                {s.ai === 'off' && <p style={{ marginTop: 12 }}>AI is off. Tags, similarity and suggestions are hidden. Everything else still works.</p>}
              </div>
            </div>
          )}
          {sec === 'Libraries & storage' && (
            <div className="field">
              <h3>Photo libraries</h3>
              <p>Folders Frames reads photographs from. They are read-only: originals are never changed. Set with the LIBRARY_DIRS setting (see the README).</p>
              {(info.data?.libraries ?? []).map((l) => (
                <div className="row" key={l.path}>
                  <span className="mono">{l.path}</span>
                  <span className={l.exists ? 'faint' : 'reason'}>{!l.exists ? 'folder not found' : l.lastScan ? `synced ${fmtDate(l.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'not synced yet'}</span>
                </div>
              ))}
            </div>
          )}
          {(sec === 'Metadata & XMP' || sec === 'Backup' || sec === 'About') && <p className="empty">{sec === 'Backup' ? 'Back up the data folder (it holds the database and previews). Your originals are untouched.' : 'Not built yet.'}</p>}
        </div>
      </div>
    </div>
  );
}
