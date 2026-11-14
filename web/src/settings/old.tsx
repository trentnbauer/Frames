import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Img, Loading } from '../components/bits';
import { GearDefaults } from '../components/GearDefaults';
import type { Settings } from '../store';

/** Suggest taking out photographs whose average rating, after every session, is below a line you choose. Nothing is removed until you tick and confirm. */
export function DeleteSuggestions({ s, save, inline = false, onChanged }: { s: Settings; save: (p: Partial<Settings>) => Promise<void>; inline?: boolean; onChanged?: () => void }) {
  const [open, setOpen] = useState(inline);
  const list = useApi<{ below: number; sessions: number; photos: { id: number; title: string; avg: number; reviews: number }[] }>(`/photos/delete-suggestions?b=${s.deleteBelow}&sessions=${s.sessions}&enabled=${s.archiveSuggest}`);
  const [picked, setPicked] = useState<number[]>([]);
  const [msg, setMsg] = useState('');
  const n = list.data?.photos.length ?? 0;
  const validPicked = picked.filter((id) => list.data?.photos.some((photo) => photo.id === id));
  const take = async () => {
    if (!validPicked.length || !window.confirm(`Take ${validPicked.length} ${validPicked.length === 1 ? 'photograph' : 'photographs'} out of Frames?\n\nTheir reviews, tags and composition places go with them. Files in your library folders are not touched; copies Frames holds itself (uploads, cloud copies) are deleted. A scan will not bring them back.`)) return;
    try {
      const r = await api<{ removed: number; filesDeleted: number }>('/photos/remove', { body: { ids: validPicked } });
      setMsg(`Took ${r.removed} out of Frames${r.filesDeleted ? ` and deleted ${r.filesDeleted} of Frames’ own copies` : ''}.`);
      setPicked([]); list.reload(); onChanged?.();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="field">
      <h3>Suggested for removal</h3>
      <p>After all {s.sessions} review sessions, a photograph qualifies when the average of your own ratings is below {s.deleteBelow.toFixed(1)}. Guest and community ratings are separate. Nothing is removed without your confirmation.</p>
      {!inline && <div className="form">
        <label>Suggest when the average is below{' '}
          <select aria-label="Suggest taking out below" value={s.deleteBelow} onChange={(e) => { setOpen(false); save({ deleteBelow: Number(e.target.value) }); }}>
            <option value={0}>Never</option>
            {[1.5, 2, 2.5, 3, 3.5, 4].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {s.deleteBelow > 0 && <button className="pill" disabled={n === 0} onClick={() => { setOpen(!open); setMsg(''); }}>{n === 0 ? 'Nothing suggested' : open ? 'Hide the suggestions' : `See ${n} suggested`}</button>}
      </div>}
      {list.error && <p role="alert" className="reason">{list.error}</p>}
      {msg && <p role="status" className="muted" style={{ fontSize: 13 }}>{msg}</p>}
      {open && n > 0 && (
        <div style={{ marginTop: 12, maxWidth: 720 }}>
          <div className="row" style={{ gap: 12 }}>
            <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" aria-label="Tick all suggestions" checked={picked.length === n} onChange={(e) => setPicked(e.target.checked ? list.data!.photos.map((p) => p.id) : [])} /> Tick all</label>
            <button className="pill primary" disabled={!validPicked.length} onClick={take}>Take {validPicked.length || ''} out of Frames</button>
          </div>
          {list.data!.photos.map((p) => (
            <label className="row" key={p.id} style={{ gap: 12, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Take out ${p.title}`} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
              <span style={{ width: 64, height: 44, overflow: 'hidden', borderRadius: 6, background: 'var(--surface)', flex: 'none' }}><Img p={{ id: p.id, ar: 1.5 }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{p.title}</b> <Link to={`/photo/${p.id}`} className="t2" style={{ fontSize: 12, textDecoration: 'underline' }}>open</Link></span>
              <span className="faint">average {p.avg} over {p.reviews} sessions</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div className="field toggle"><div><h3 style={{ fontSize: 19 }}>{label}</h3>{hint && <p style={{ margin: 0 }}>{hint}</p>}</div><button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} /></div>
);

export function Vocabulary() {
  const [kind, setKind] = useState<'subject' | 'tag'>('tag');
  const list = useApi<{ name: string; kind: 'subject' | 'tag'; n: number }[]>('/tags');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: () => void) => {
    setError(''); setBusy(true);
    try { await fn(); list.reload(); done?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const shown = (list.data ?? []).filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="field">
    <p>Manage all tags and subjects here. Renaming to an existing name merges entries of the same type.</p>
    {error && <p role="alert" className="reason">{error}</p>}
    <form className="form" style={{ margin: '14px 0' }} onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) void act(() => api('/tags', { body: { name, kind } }), () => setName('')); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag or subject" aria-label="New tag or subject" />
      <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as 'tag' | 'subject')}><option value="tag">Tag</option><option value="subject">Subject</option></select>
      <button className="btn outline" disabled={!name.trim() || busy}>Create</button>
    </form>
    <input aria-label="Find tags and subjects" placeholder="Find tags and subjects" value={query} onChange={(e) => setQuery(e.target.value)} />
    {list.loading && <Loading error={list.error} />}
    {list.error && <p role="alert">{list.error}</p>}
    {!list.loading && !shown.length && <p className="muted">{query ? 'No matches.' : 'None yet.'}</p>}
    <div style={{ maxHeight: '45vh', overflow: 'auto' }}>{shown.map((t) => {
      const key = `${t.kind}:${t.name}`, path = `/tags/${t.kind}/${encodeURIComponent(t.name)}`;
      return <div className="row" key={key}>
        {editing === key ? <form className="form" onSubmit={(e) => { e.preventDefault(); if (to.trim() && !busy) void act(() => api(path, { method: 'PATCH', body: { name: to } }), () => setEditing(null)); }}>
          <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} aria-label={`Rename ${t.kind} ${t.name}`} /><button className="btn outline" disabled={!to.trim() || busy}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button>
        </form> : <Link to={`/library?${t.kind}=${encodeURIComponent(t.name)}`}>{t.name} <span className="faint">{t.n} · {t.kind}</span></Link>}
        <span style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
          <button disabled={busy} aria-label={`Rename ${t.kind} ${t.name}`} onClick={() => { setEditing(key); setTo(t.name); }}>Rename</button>
          <button disabled={busy} aria-label={`Delete ${t.kind} ${t.name}`} onClick={() => { if (confirm(`Delete ${t.kind} “${t.name}”${t.n ? ` from ${t.n} photographs` : ''}? The photographs are not touched.`)) void act(() => api(path, { method: 'DELETE' })); }}>Delete</button>
        </span>
      </div>;
    })}</div>
  </div>;
}


export function Metadata({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const conflicts = useApi<{ photoId: number; field: string; mine: string; theirs: string; file: string }[]>('/metadata/conflicts');
  const [res, setRes] = useState<{ written: number; writtenBeside: number; skipped: { file: string; reason: string }[] } | null>(null);
  return (
    <>
      <div className="field">
        <h3>Reading other apps’ edits</h3>
        <p>When a sidecar file (photo.jpg.xmp or photo.xmp) sits next to a photograph, Frames reads its keywords as tags, and its title and description where you have not written your own. Your own edits always win. Frames never removes tags that another app added, and never changes the image file.</p>
      </div>
      <div className="field">
        <h3>Camera defaults</h3>
        <p>Camera details for every new photograph whose file has none: a film camera and stock, say. They only fill blanks. What the file says, and anything you type on a photograph, is never replaced, and a photoshoot can have its own defaults, which win over these. Photographs already here are not changed.</p>
        <GearDefaults label="Camera defaults" value={s.gear} onSave={(gear) => save({ gear })} />
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

