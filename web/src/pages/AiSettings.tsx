import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';

type Type = { id: string; label: string; group: string; local: boolean; endpoint: string; model: string; embedModel: string; needsKey: boolean; canEmbed: boolean; note: string };
type Source = { shared?: boolean; id: string; type: string; name: string; endpoint: string; model: string; embedModel: string; ack: boolean; hasKey: boolean; ready: boolean; why: string };
type Data = { types: Type[]; active: string; sources: Source[] };
type Status = { enabled: boolean; pending: number; done: number; failed: number; running: boolean; total: number; lastError: string | null };

/** Every AI you have set up, in one list. Open one to change it; pick which one is in use. */
export function AiSettings({ server = false }: { server?: boolean }) {
  const base = server ? '/admin/ai' : '/ai'; // the administrator's list for everyone, or your own
  const d = useApi<Data>(`${base}/sources`);
  const status = useApi<Status>('/ai/status');
  const { setSettings } = useStore();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState('ollama');
  useEffect(() => { if (status.data?.running) { const t = setTimeout(status.reload, 2000); return () => clearTimeout(t); } }, [status.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return <p className="empty">Loading…</p>;
  const { types, sources, active } = d.data;
  // Whatever changed here may have switched AI on or off, so the rest of the app is told too.
  const refresh = async () => { d.reload(); status.reload(); await setSettings({}).catch(() => {}); };
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } await refresh(); };
  const groups = ['Local', 'Cloud', 'Other'];

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <div className="field">
        <h3>{server ? 'AIs for everyone on this server' : 'Your AIs'}</h3>
        {server
          ? <p>Set one up here once and it appears in everyone’s list, ready to use, so people do not each need their own address and key. The key stays on this server and is never shown. Each person still chooses whether to use it, and can set up their own as well under Settings, AI. Photographs are sent to a shared AI the same way as to a personal one, so a service outside your network needs the confirmation below.</p>
          : <p>Descriptions, tags and subjects, search by meaning, similar photos and suggestions. Nothing here changes your files, and it all stays a suggestion until you accept it. Set up as many as you like and choose which one is in use. With none in use, everything else works as normal. AIs marked <i>from the administrator</i> are shared by this server: you can use them but not change them.</p>}
        {sources.length === 0 && <p className="muted">Nothing set up yet. Add one below.</p>}
        {sources.map((src) => (
          <Item key={src.id} base={base} server={server} src={src} type={types.find((t) => t.id === src.type)!} active={active === src.id} open={open === src.id} onToggle={() => setOpen(open === src.id ? null : src.id)} run={run} />
        ))}
        <div className="form" style={{ marginTop: 16 }}>
          <label>Add an AI{' '}
            <select aria-label="Kind of AI" value={kind} onChange={(e) => setKind(e.target.value)}>
              {groups.map((g) => <optgroup key={g} label={g}>{types.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>)}
            </select>
          </label>
          <button className="pill" onClick={() => run(async () => { const r = await api<Data>(`${base}/sources`, { body: { type: kind } }); setOpen(r.sources[r.sources.length - 1].id); })}>Add</button>
        </div>
        {!server && active && <div style={{ marginTop: 14 }}><button className="t2" onClick={() => run(() => api('/ai/active', { method: 'PUT', body: { id: '' } }), 'AI is off.')}>Turn AI off</button></div>}
        {!server && !active && sources.length > 0 && <p className="muted" style={{ marginTop: 12 }}>AI is off. Tags, descriptions, similarity from content and suggestions are hidden. Colour-based similarity, search and everything else still work.</p>}
      </div>
      {!server && status.data?.enabled && (
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

function Item({ base, server, src, type, active, open, onToggle, run }: { base: string; server: boolean; src: Source; type: Type; active: boolean; open: boolean; onToggle: () => void; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [f, setF] = useState({ name: src.name, endpoint: src.endpoint, model: src.model, embedModel: src.embedModel, key: '' });
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const dirty = f.name !== src.name || f.endpoint !== src.endpoint || f.model !== src.model || f.embedModel !== src.embedModel || !!f.key;
  const body = () => ({ name: f.name, endpoint: f.endpoint, model: f.model, embedModel: f.embedModel, ...(f.key ? { key: f.key } : {}) });
  const saveIt = () => run(async () => { await api(`${base}/sources/${src.id}`, { method: 'PUT', body: body() }); setF({ ...f, key: '' }); }, 'Saved.');
  const state = active ? 'In use' : src.ready ? 'Ready' : src.why;
  if (src.shared && !server) {
    return (
      <div className="row" style={{ display: 'block', padding: '10px 0' }}>
        <div><b>{src.name}</b> {src.name !== type.label && <span className="muted">{type.label}</span>} <span className={active ? '' : src.ready ? 'faint' : 'reason'}>{state}</span> <span className="faint">· from the administrator · {type.local ? 'stays on your network' : 'previews are sent out'}</span></div>
        <div style={{ marginTop: 8 }}>
          {!active && <button className="pill primary" disabled={!src.ready} onClick={() => run(() => api('/ai/active', { method: 'PUT', body: { id: src.id } }), `${src.name} is now in use.`)}>Use this one</button>}
        </div>
      </div>
    );
  }
  return (
    <details className="row" style={{ display: 'block', padding: '10px 0' }} open={open} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open !== open) onToggle(); }}>
      <summary style={{ cursor: 'pointer' }}>
        <b>{src.name}</b> {src.name !== type.label && <span className="muted">{type.label}</span>}{' '}
        <span className={active ? '' : src.ready ? 'faint' : 'reason'}>{state}</span>{' '}
        <span className="faint">{type.local ? '· stays on your network' : '· previews are sent out'}</span>
      </summary>
      <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520, marginTop: 10 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{type.note}</p>
        <label>Name <input aria-label={`${src.name} name`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Address <input aria-label={`${src.name} address`} value={f.endpoint} placeholder={type.endpoint || 'https://…'} onChange={(e) => setF({ ...f, endpoint: e.target.value })} /></label>
        <label>Vision model <input aria-label={`${src.name} vision model`} value={f.model} placeholder={type.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
        {type.canEmbed
          ? <label>Embedding model <input aria-label={`${src.name} embedding model`} value={f.embedModel} placeholder={type.embedModel || 'Optional'} onChange={(e) => setF({ ...f, embedModel: e.target.value })} /></label>
          : <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>This service has no embeddings, so search by meaning is unavailable while it is in use. Colour and shape still drive similar photos.</p>}
        <label>API key <input type="password" autoComplete="off" aria-label={`${src.name} API key`} value={f.key} placeholder={src.hasKey ? 'Saved. Type to replace' : type.needsKey ? 'Paste the key' : 'Optional'} onChange={(e) => setF({ ...f, key: e.target.value })} /></label>
        {src.hasKey && <div><button className="t2" onClick={() => run(() => api(`${base}/sources/${src.id}`, { method: 'PUT', body: { clearKey: true } }), 'Key removed.')}>Remove the saved key</button></div>}
        {!type.local && (
          <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" aria-label={`${src.name}: previews may be sent to this third party`} checked={src.ack} onChange={(e) => run(() => api(`${base}/sources/${src.id}`, { method: 'PUT', body: { ack: e.target.checked } }))} />
            <span>Needed before this can be used: I understand that previews (up to 1024 px) of my photographs will be sent to this third party. They may be stored or used according to its terms.</span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="pill" disabled={!dirty} onClick={saveIt}>Save</button>
          <button className="pill" onClick={async () => { setTest(null); if (dirty) await api(`${base}/sources/${src.id}`, { method: 'PUT', body: body() }).catch(() => {}); setTest(await api<{ ok: boolean; detail: string }>(`${base}/sources/${src.id}/test`, { method: 'POST', body: {} }).catch((e: Error) => ({ ok: false, detail: e.message }))); setF({ ...f, key: '' }); }}>Test</button>
          {!server && !active && <button className="pill primary" disabled={dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => run(() => api('/ai/active', { method: 'PUT', body: { id: src.id } }), `${src.name} is now in use.`)}>Use this one</button>}
          <button className="t2" onClick={() => { if (window.confirm(`Remove ${src.name}?`)) run(() => api(`${base}/sources/${src.id}`, { method: 'DELETE' }), 'Removed.'); }}>Remove</button>
          {test && <span role="status" className={test.ok ? 'muted' : 'reason'} style={{ fontSize: 13 }}>{test.detail}</span>}
        </div>
      </div>
    </details>
  );
}
