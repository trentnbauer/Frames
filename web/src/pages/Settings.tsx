import { useState } from 'react';
import { Header } from '../components/bits';
import { useStore } from '../store';

const SECTIONS = ['Libraries & storage', 'Reviews', 'AI', 'Metadata & XMP', 'Backup', 'About'] as const;

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
                <h3>Interval after each session</h3><p>Time before a photograph returns for its next review.</p>
                <div className="tiles">
                  {s.intervals.slice(0, s.sessions).map((v, i) => <div className="tile-s" key={i}><b>after {i + 1}</b>{v}</div>)}
                </div>
              </div>
              <Toggle on={s.adaptive} onChange={(v) => setSettings({ adaptive: v })} label="Adapt to consistency" hint="Steady ratings come back less often. Mixed ratings come back sooner." />
              <Toggle on={s.archiveSuggest} onChange={(v) => setSettings({ archiveSuggest: v })} label="Suggest archiving low-rated photos" hint="After 4 sessions averaging under 2." />
            </>
          )}
          {sec === 'AI' && (
            <div className="field">
              <h3>Where analysis runs</h3><p>Tags, similarity, semantic search and suggestions. Turn it off and the rest of Frames works as normal.</p>
              <div className="cards2" role="radiogroup" aria-label="AI mode">
                <button role="radio" aria-checked={s.ai === 'local'} className={'opt' + (s.ai === 'local' ? ' sel' : '')} onClick={() => setSettings({ ai: 'local' })}>
                  <b>Local</b>{s.aiEndpoint} · photos never leave this server
                </button>
                <button role="radio" aria-checked={s.ai === 'external'} className={'opt' + (s.ai === 'external' ? ' sel' : '')} onClick={() => setSettings({ ai: 'external' })}>
                  <b>External provider</b>Faster on weak hardware.
                  <span className="w">Previews are sent to a third party for analysis.</span>
                </button>
              </div>
              <div style={{ marginTop: 20 }}>
                <button className={'pill'} onClick={() => setSettings({ ai: s.ai === 'off' ? 'local' : 'off' })}>{s.ai === 'off' ? 'Turn AI on' : 'Turn AI off'}</button>
                {s.ai === 'off' && <p style={{ marginTop: 12 }}>AI is off. Tags, similarity and suggestions are hidden. Everything else still works.</p>}
              </div>
            </div>
          )}
          {sec === 'Libraries & storage' && (
            <div className="field">
              <h3>Cloud storage connections</h3><p>Used by “Sync cloud storage” on the Photoshoots page. External libraries are read-only.</p>
              <div className="row"><span>/Film scans</span><span className="faint">synced 2 h ago</span></div>
              <div className="row"><span>/X-T5 imports</span><span className="faint">synced yesterday</span></div>
              <button className="pill" style={{ marginTop: 14 }}>Add connection</button>
            </div>
          )}
          {(sec === 'Metadata & XMP' || sec === 'Backup' || sec === 'About') && <p className="empty">Not designed yet.</p>}
        </div>
      </div>
    </div>
  );
}
