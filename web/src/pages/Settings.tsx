import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Header, Loading } from '../components/bits';
import { useStore, type Settings } from '../store';
import { PortfolioSettings } from './PortfolioSettings';
import { TunnelSettings } from './TunnelSettings';

const SECTIONS = ['Libraries & storage', 'Portfolio', 'Cloudflare tunnel', 'Reviews', 'AI', 'Tags & subjects', 'Metadata & XMP', 'Backup', 'About'] as const;
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
  const [err, setErr] = useState('');
  // Settings that can be refused (for example AI without a model) report why instead of failing silently.
  const save = async (p: Partial<Settings>) => { setErr(''); try { await setSettings(p); } catch (e) { setErr((e as Error).message); } };
  if (!s) return <div className="page"><Header /><Loading /></div>;
  return (
    <div className="page">
      <Header />
      <div className="settings">
        <nav className="snav" aria-label="Settings sections">
          {SECTIONS.map((x) => <button key={x} className={sec === x ? 'on' : ''} onClick={() => { setSec(x); setErr(''); }}>{x}</button>)}
        </nav>
        <div>
          <h1 className="serif" style={{ fontSize: 44, marginBottom: 12 }}>{sec}</h1>
          {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
          {sec === 'Reviews' && <Reviews s={s} save={save} />}
          {sec === 'AI' && <Ai s={s} save={save} />}
          {sec === 'Libraries & storage' && <Libraries />}
          {sec === 'Portfolio' && <PortfolioSettings />}
          {sec === 'Cloudflare tunnel' && <TunnelSettings />}
          {sec === 'Tags & subjects' && <Vocabulary />}
          {sec === 'Metadata & XMP' && <Metadata s={s} save={save} />}
          {sec === 'Backup' && <Backup />}
          {sec === 'About' && <About />}
        </div>
      </div>
    </div>
  );
}

function Reviews({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  return (
    <>
      <div className="field">
        <h3>Sessions per photo</h3><p>How many times each photograph comes back for a rating.</p>
        <div className="stepper">
          <button aria-label="Fewer sessions" onClick={() => save({ sessions: Math.max(1, s.sessions - 1) })}>−</button>
          <b>{s.sessions}</b>
          <button aria-label="More sessions" onClick={() => save({ sessions: Math.min(12, s.sessions + 1) })}>+</button>
        </div>
      </div>
      <div className="field">
        <h3>Interval after each session</h3><p>Time before a photograph returns for its next review. Tap a tile to change it.</p>
        <div className="tiles">
          {Array.from({ length: s.sessions }, (_, i) => {
            const v = s.intervals[Math.min(i, s.intervals.length - 1)];
            return <button className="tile-s" key={i} aria-label={`Interval after session ${i + 1}: ${v}`} onClick={() => {
              const next = [...s.intervals];
              while (next.length < s.sessions) next.push(next[next.length - 1] ?? '1 year');
              next[i] = INTERVALS[(INTERVALS.indexOf(v) + 1) % INTERVALS.length];
              save({ intervals: next });
            }}><b>after {i + 1}</b>{v}</button>;
          })}
        </div>
      </div>
      <Toggle on={s.adaptive} onChange={(v) => save({ adaptive: v })} label="Adapt to consistency" hint="Steady ratings come back less often. Mixed ratings come back sooner." />
      <Toggle on={s.archiveSuggest} onChange={(v) => save({ archiveSuggest: v })} label="Suggest leaving low-rated photos out of review" hint="After 4 sessions averaging under 2. They stay in your library, search and collections." />
    </>
  );
}

type AiStatus = { enabled: boolean; pending: number; done: number; failed: number; running: boolean; total: number; lastError: string | null };

function Ai({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const status = useApi<AiStatus>('/ai/status');
  const key = useApi<{ hasKey: boolean }>('/ai/key');
  const [f, setF] = useState({ endpoint: s.aiEndpoint, model: s.aiModel, embed: s.aiEmbedModel, key: '' });
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  useEffect(() => { if (status.data?.running) { const t = setTimeout(status.reload, 2000); return () => clearTimeout(t); } }, [status.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const mode = s.ai;
  const DEFAULTS = {
    local: { e: 'http://localhost:11434', m: 'llava', em: 'nomic-embed-text' },
    external: { e: 'https://api.openai.com', m: 'gpt-4o-mini', em: 'text-embedding-3-small' },
  };
  // Switching mode fills in sensible defaults, unless you have typed your own values.
  const setMode = (ai: 'local' | 'external') => {
    const d = DEFAULTS[ai], other = DEFAULTS[ai === 'local' ? 'external' : 'local'];
    const pick = (cur: string, mine: string, theirs: string) => (!cur || cur === theirs ? mine : cur);
    const next = { endpoint: pick(f.endpoint, d.e, other.e), model: pick(f.model, d.m, other.m), embed: pick(f.embed, d.em, other.em), key: f.key };
    setF(next);
    return save({ ai, aiEndpoint: next.endpoint, aiModel: next.model, aiEmbedModel: next.embed }).then(status.reload);
  };
  const hint = mode === 'external' ? 'https://api.openai.com' : 'http://192.168.1.20:11434';
  return (
    <>
      <div className="field">
        <h3>Where analysis runs</h3>
        <p>Descriptions, tags and subjects, picture-based search, similar photos and suggestions. Nothing here changes your files, and it all stays a suggestion until you accept it. With AI off, everything else works as normal.</p>
        <div className="cards2" role="radiogroup" aria-label="AI mode">
          <button role="radio" aria-checked={mode === 'local'} className={'opt' + (mode === 'local' ? ' sel' : '')} onClick={() => setMode('local')}>
            <b>Local</b>A model on your own network (Ollama). Photos never leave your network.
          </button>
          <button role="radio" aria-checked={mode === 'external'} className={'opt' + (mode === 'external' ? ' sel' : '')} onClick={() => setMode('external')}>
            <b>External provider</b>Any OpenAI-compatible service.
            <span className="w">Previews (up to 1024 px) are sent to a third party for analysis.</span>
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="pill" onClick={() => (mode === 'off' ? setMode('local') : save({ ai: 'off' }).then(status.reload))}>{mode === 'off' ? 'Turn AI on (local)' : 'Turn AI off'}</button>
        </div>
        {mode === 'off' && <p style={{ marginTop: 12 }}>AI is off. Tags, descriptions, similarity from content and suggestions are hidden. Colour-based similarity, search and everything else still work.</p>}
      </div>
      <div className="field">
        <h3>Connection</h3>
        <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 460 }}>
          <label>Address <input value={f.endpoint} placeholder={hint} aria-label="AI address" onChange={(e) => setF({ ...f, endpoint: e.target.value })} /></label>
          <label>Vision model <input value={f.model} placeholder={mode === 'external' ? 'gpt-4o-mini' : 'llava'} aria-label="Vision model" onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
          <label>Embedding model <input value={f.embed} placeholder={mode === 'external' ? 'text-embedding-3-small' : 'nomic-embed-text'} aria-label="Embedding model" onChange={(e) => setF({ ...f, embed: e.target.value })} /></label>
          <label>API key <input type="password" autoComplete="off" value={f.key} placeholder={key.data?.hasKey ? 'Saved. Type to replace' : 'Optional'} aria-label="API key" onChange={(e) => setF({ ...f, key: e.target.value })} /></label>
        </div>
        {(
          <label className="check" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 560 }}>
            <input type="checkbox" aria-label="Confirm previews are sent to a third party" checked={s.aiExternalAck} onChange={(e) => save({ aiExternalAck: e.target.checked })} />
            <span>Needed before an external provider can be used: I understand that previews of my photographs will be sent to this third party. They may be stored or used according to its terms.</span>
          </label>
        )}
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="pill" onClick={async () => {
            if (f.key) { await api('/ai/key', { method: 'PUT', body: { key: f.key } }); setF({ ...f, key: '' }); key.reload(); }
            await save({ aiEndpoint: f.endpoint, aiModel: f.model, aiEmbedModel: f.embed });
            status.reload();
          }}>Save connection</button>
          <button className="pill" disabled={mode === 'off'} onClick={async () => { setTest(null); setTest(await api<{ ok: boolean; detail: string }>('/ai/test', { method: 'POST', body: {} }).catch((e: Error) => ({ ok: false, detail: e.message }))); }}>Test connection</button>
          {test && <span role="status" className={test.ok ? 'muted' : 'reason'} style={{ fontSize: 13 }}>{test.detail}</span>}
        </div>
      </div>
      {status.data?.enabled && (
        <div className="field">
          <h3>Analysis</h3>
          <p>{status.data.done} analysed · {status.data.pending} waiting{status.data.failed > 0 && ` · ${status.data.failed} failed`}{status.data.running && ` · working (${status.data.done}/${status.data.total})`}</p>
          {status.data.lastError && <p className="reason">{status.data.lastError}</p>}
          <button className="pill" disabled={status.data.running} onClick={async () => { await api('/ai/run?retry=1', { method: 'POST', body: {} }); setTimeout(status.reload, 500); }}>{status.data.running ? 'Analysing…' : status.data.failed ? 'Retry failed and continue' : 'Analyse now'}</button>
        </div>
      )}
    </>
  );
}

function Libraries() {
  const info = useApi<{ internalDir: string; libraries: { path: string; exists: boolean; lastScan: string | null }[] }>('/settings');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const rebuild = async (all: boolean) => {
    setBusy(true); setMsg('');
    try {
      await api(`/library/rebuild${all ? '?all=1' : ''}`, { method: 'POST', body: {} });
      for (;;) {
        const r = await api<{ running: boolean; done: number; total: number; result: { checked: number; rebuilt: number } | null }>('/library/rebuild/status');
        setMsg(`Working… ${r.done}/${r.total}`);
        if (!r.running) { setMsg(r.result ? `Checked ${r.result.checked}, rebuilt ${r.result.rebuilt}.` : 'Done.'); break; }
        await new Promise((x) => setTimeout(x, 700));
      }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="field">
        <h3>Photo libraries</h3>
        <p>Folders Frames reads photographs from. External libraries are read-only: originals are never changed. They are set with LIBRARY_DIRS (see the README), and can be a cloud drive mounted as a folder.</p>
        {(info.data?.libraries ?? []).map((l) => (
          <div className="row" key={l.path}>
            <span className="mono">{l.path}{l.path === info.data?.internalDir ? '  (uploads)' : ''}</span>
            <span className={l.exists || l.path === info.data?.internalDir ? 'faint' : 'reason'}>{!l.exists && l.path !== info.data?.internalDir ? 'folder not found' : l.lastScan ? `synced ${fmtDate(l.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'not synced yet'}</span>
          </div>
        ))}
        <p style={{ marginTop: 12 }}>Photos uploaded from the <Link to="/shoots" className="t2" style={{ textDecoration: 'underline' }}>Photoshoots</Link> page are kept in Frames’ own data folder.</p>
      </div>
      <div className="field">
        <h3>Previews</h3>
        <p>Thumbnails, previews and colour analysis are made from your originals and kept separately. If any are missing or damaged, rebuild them.</p>
        <button className="pill" disabled={busy} onClick={() => rebuild(false)}>Rebuild missing</button>{' '}
        <button className="pill" disabled={busy} onClick={() => rebuild(true)}>Rebuild all</button>
        {msg && <span role="status" className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
      </div>
    </>
  );
}

function Vocabulary() {
  const [kind, setKind] = useState<'subject' | 'tag'>('subject');
  const list = useApi<{ name: string; kind: string; n: number }[]>(`/tags?kind=${kind}`);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const act = async (fn: () => Promise<unknown>) => { await fn(); list.reload(); };
  return (
    <div className="field">
      <p>Subjects are what is in a picture (a harbour, a heron). Tags are everything else: style, mood, projects. Renaming to a name that exists merges the two.</p>
      <div className="tabs" role="tablist">
        {(['subject', 'tag'] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'subject' ? 'Subjects' : 'Tags'}</button>)}
      </div>
      <form className="form" style={{ margin: '14px 0' }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) act(() => api('/tags', { body: { name, kind } })).then(() => setName('')); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${kind}`} aria-label={`New ${kind}`} />
        <button className="pill">Create</button>
      </form>
      {list.loading && <Loading error={list.error} />}
      {list.data?.length === 0 && <div className="empty" style={{ padding: '10px 0' }}>None yet.</div>}
      {list.data?.map((t) => (
        <div className="row" key={t.name}>
          {editing === t.name ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => api(`/tags/${kind}/${encodeURIComponent(t.name)}`, { method: 'PATCH', body: { name: to } })).then(() => setEditing(null)); }}>
              <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} aria-label={`Rename ${t.name}`} /><button className="pill">Save</button>
            </form>
          ) : <Link to={`/library?${kind}=${encodeURIComponent(t.name)}`}>{t.name} <span className="faint">{t.n}</span></Link>}
          <span className="t2" style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
            <button onClick={() => { setEditing(t.name); setTo(t.name); }}>Rename</button>
            <button onClick={() => { if (confirm(`Delete “${t.name}”${t.n ? ` from ${t.n} photographs` : ''}? The photographs are not touched.`)) act(() => api(`/tags/${kind}/${encodeURIComponent(t.name)}`, { method: 'DELETE' })); }}>Delete</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Metadata({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const conflicts = useApi<{ photoId: number; field: string; mine: string; theirs: string; file: string }[]>('/metadata/conflicts');
  const [res, setRes] = useState<{ written: number; writtenBeside: number; skipped: { file: string; reason: string }[] } | null>(null);
  return (
    <>
      <div className="field">
        <h3>Reading other apps’ edits</h3>
        <p>When a sidecar file (photo.jpg.xmp or photo.xmp) sits next to a photograph, Frames reads its keywords as tags, and its title and description where you have not written your own. Your own edits always win. Frames never removes tags that another app added, and never changes the image file.</p>
      </div>
      <Toggle on={s.xmpWriteBack} onChange={(v) => save({ xmpWriteBack: v })} label="Write XMP next to my originals" hint="Off by default, because libraries are read-only. Turn it on only if the library folder is mounted writable. Another program’s existing sidecar is never overwritten." />
      <div className="field">
        <h3>Export approved metadata</h3>
        <p>Your titles and descriptions, accepted tags and subjects, and average review rating, as XMP sidecars. They are always saved in Frames’ data folder{s.xmpWriteBack ? ', and beside the originals too' : ''}. You can also export one photograph from its page.</p>
        <button className="pill" onClick={async () => setRes(await api('/metadata/export', { body: {} }))}>Export all</button>
        {res && <p role="status" style={{ marginTop: 10 }}>Wrote {res.written} sidecars{res.writtenBeside > 0 && `, ${res.writtenBeside} beside the originals`}.{res.skipped.length > 0 && <span className="reason"> Skipped {res.skipped.length}: {res.skipped.slice(0, 3).map((k) => `${k.file} (${k.reason})`).join('; ')}.</span>}</p>}
      </div>
      <div className="field">
        <h3>Differences to settle</h3>
        {conflicts.data?.length === 0 && <p>None. Nothing in another app disagrees with what you wrote.</p>}
        {conflicts.data?.map((c) => (
          <div key={`${c.photoId}${c.field}`} style={{ marginBottom: 12, fontSize: 13 }}>
            <Link to={`/photo/${c.photoId}`} className="t2" style={{ textDecoration: 'underline' }}>{c.file}</Link> · <b>{c.field}</b>: yours “{c.mine}”, theirs “{c.theirs}”<br />
            {(['mine', 'theirs'] as const).map((u) => <button key={u} className="pill" style={{ marginRight: 8 }} onClick={async () => { await api('/metadata/resolve', { body: { photoId: c.photoId, field: c.field, use: u } }); conflicts.reload(); }}>{u === 'mine' ? 'Keep mine' : 'Use theirs'}</button>)}
          </div>
        ))}
      </div>
    </>
  );
}

function Backup() {
  const list = useApi<{ name: string; bytes: number }[]>('/backup/list');
  return (
    <>
      <div className="field">
        <h3>Back up</h3>
        <p>Everything Frames knows (reviews, tags, collections, settings) is in one database. Your originals are not part of it: back those up the way you already do. The AI key is never included.</p>
        <a className="pill primary" href="/api/backup" download>Download a backup</a>
      </div>
      <div className="field">
        <h3>Automatic backups</h3>
        <p>One a day, the last seven kept, in the data folder’s <span className="mono">backups</span> directory.</p>
        {list.data?.length === 0 && <p className="muted">None yet. The first is made shortly after start-up.</p>}
        {list.data?.map((b) => <div className="row" key={b.name}><span className="mono">{b.name}</span><span className="faint">{(b.bytes / 1e6).toFixed(1)} MB</span></div>)}
      </div>
      <div className="field">
        <h3>Restore</h3>
        <p>Stop Frames, replace <span className="mono">frames.db</span> in the data folder with a backup (delete any <span className="mono">frames.db-wal</span> and <span className="mono">-shm</span> files beside it), then start it again. Use Settings, Libraries &amp; storage, “Rebuild all” if previews are missing. Previews and analysis are rebuilt from your originals.</p>
      </div>
    </>
  );
}

function About() {
  const h = useApi<{ version: string }>('/health');
  return <p className="empty">Frames {h.data ? (h.data.version === 'dev' ? '(development build)' : `version ${h.data.version}`) : ''}</p>;
}
