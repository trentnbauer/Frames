import { useEffect, useRef, useState } from 'react';
import { useApi } from '../api';
import { useChangelog } from '../useChangelog';

/** The app version in a corner, and a "What's new" list: opens by itself once after an update, or on request. */
export function Changelog() {
  const v = useApi<{ version: string }>('/health');
  const { entries, newEntries, markAllSeen } = useChangelog();
  const [manual, setManual] = useState(false);
  const auto = newEntries.length > 0;
  const open = auto || manual;
  const close = () => { markAllSeen(); setManual(false); };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', f);
    return () => { window.removeEventListener('keydown', f); before?.focus?.(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = auto ? newEntries : entries;
  const version = v.data ? (v.data.version === 'dev' ? 'dev build' : `v${v.data.version.replace(/^v/, '')}`) : '';
  return (
    <>
      <a className="verfoot" style={{ right: 'auto', left: 16 }} href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      <button className="verfoot" onClick={() => setManual(true)} aria-label={`Frames ${version}. What's new`}>{version && <span>{version} · </span>}What’s new</button>
      {open && (
        <div className="scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="changelog" ref={ref} role="dialog" aria-modal="true" aria-label="What's new" tabIndex={-1}>
            <h2 className="serif" style={{ fontSize: 28, margin: '0 0 4px' }}>What’s new</h2>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>{version && `You are on ${version}. `}{auto ? 'Here is what has changed since you were last here.' : 'Everything that has shipped so far.'}</p>
            {shown.length === 0
              ? <p className="muted">Nothing to list yet. The list is made when a release is published.</p>
              : <ul className="clist">{shown.map((e) => <li key={e.number}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> <span className="faint">#{e.number}</span></li>)}</ul>}
            <div style={{ marginTop: 16 }}><button className="pill primary" onClick={close}>Got it</button></div>
          </div>
        </div>
      )}
    </>
  );
}
