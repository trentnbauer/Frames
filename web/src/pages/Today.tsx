import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import { useUi } from '../ui';
import { AddPhotosButton, useStatus } from '../components/AddPhotos';

type SuggestedSet = { name: string; reason: string; photoIds: number[]; photos: PhotoLite[] };
type Batch = { id: number; name: string; count: number; days: number; importedAt: string; covers: number[]; done: boolean };

/** By the device's clock: before 5 "Up late", before 12 "Good morning", before 17 "Good afternoon", otherwise "Good evening". */
export const greetingFor = (hour: number) => (hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');

const cover = (id: number) => imgUrl(id, 'thumb');

/** The getting-started checklist: what is still to do to set Frames up. Finished steps are shown ticked for a few visits, then go. */
function GettingStarted() {
  const gs = useApi<{ steps: { key: string; title: string; detail: string; link: string; done: boolean }[] }>('/getting-started');
  const steps = gs.data?.steps ?? [];
  if (!steps.length) return null;
  return (
    <section aria-label="Getting started" style={{ margin: '0 0 28px', maxWidth: 640 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Getting started</div>
      {steps.map((st) => (
        <div key={st.key} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--hair)', opacity: st.done ? 0.55 : 1 }}>
          <span aria-hidden style={{ width: 18, flex: 'none' }}>{st.done ? '✓' : '○'}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{st.detail}</span>
          </span>
          {!st.done && <Link to={st.link} style={{ fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 3 }}>Go</Link>}
        </div>
      ))}
    </section>
  );
}

/** One batch the cloud sync brought in, still to be named (or split by day). */
function BatchRow({ b, onChange }: { b: Batch; onChange: () => void }) {
  const [name, setName] = useState('');
  const [split, setSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = name.trim() || b.name;
  const add = async () => {
    setBusy(true);
    try {
      if (name.trim()) await api(`/shoots/${b.id}`, { method: 'PATCH', body: { name: name.trim() } });
      if (split) await api(`/shoots/${b.id}/split-by-day`, { body: { name: label } });
      await api(`/home/batches/${b.id}/done`, { body: { on: true } });
      onChange();
    } finally { setBusy(false); }
  };
  if (b.done) return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', padding: '8px 0', opacity: 0.8 }}><span>✓ Added “{b.name}”</span><button style={{ textDecoration: 'underline' }} onClick={() => api(`/home/batches/${b.id}/done`, { body: { on: false } }).then(onChange)}>Undo</button></div>;
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 2 }}>{b.covers.map((c) => <img key={c} src={cover(c)} alt="" width={36} height={36} style={{ objectFit: 'cover', borderRadius: 4 }} />)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="field-in" style={{ height: 36 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={b.name} aria-label={`Name for ${b.name}`} />
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{b.count} photo{b.count === 1 ? '' : 's'} · {b.days} day{b.days === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {b.days > 1 && <button className="btn outline" style={{ height: 32, padding: '0 14px', fontSize: 13 }} aria-pressed={split} onClick={() => setSplit(!split)}>{split ? `✓ Split into ${b.days} shoots` : `Split by day (${b.days})`}</button>}
        <span style={{ flex: 1 }} />
        <button className="btn primary" style={{ height: 32, padding: '0 16px', fontSize: 13 }} disabled={busy} onClick={add}>{split ? `Add ${b.days} shoots` : 'Add shoot'}</button>
      </div>
    </div>
  );
}

/** A cross-fading carousel (300ms) that pauses while hovered. */
function useCarousel(n: number, ms: number, offset = 0) {
  const [i, setI] = useState(0);
  const [fade, setFade] = useState(1);
  const paused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const go = (to: number) => {
    if (n < 1) return;
    setFade(0);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setI(((to % n) + n) % n); setFade(1); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
  };
  const first = useRef(true);
  useEffect(() => {
    if (n < 2) return;
    let iv: number | undefined;
    const lead = first.current ? offset : 0; // the two carousels start staggered, once
    first.current = false;
    const t = window.setTimeout(() => { iv = window.setInterval(() => { if (!paused.current) go(i + 1); }, ms); }, lead);
    return () => { window.clearTimeout(t); window.clearInterval(iv); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return { i: n ? i % n : 0, fade, go, pause: () => { paused.current = true; }, resume: () => { paused.current = false; } };
}

function Dots({ n, i, go }: { n: number; i: number; go: (i: number) => void }) {
  if (n < 2) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button aria-label="Previous" className="muted" onClick={() => go(i - 1)}>‹</button>
      {Array.from({ length: n }, (_, k) => <button key={k} aria-label={`Go to ${k + 1}`} onClick={() => go(k)} style={{ width: 6, height: 6, borderRadius: '50%', background: k === i ? 'var(--text)' : 'var(--outline)' }} />)}
      <button aria-label="Next" className="muted" onClick={() => go(i + 1)}>›</button>
    </span>
  );
}

/** Home: greeting, the review banner, the upload and compose cards, and a way into community review. */
export function Today() {
  const { summary: s, me } = useStore();
  const firstName = (me?.displayName || me?.user?.name || '').split(' ')[0];
  const { openNew } = useUi();
  const nav = useNavigate();
  const status = useStatus();
  const recs = useApi<SuggestedSet[]>('/collections/suggestions');
  const comps = useApi<Collection[]>('/collections');
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<{ count: number }>('/library/pending');
  const batches = useApi<{ batches: Batch[]; left: number }>(status.data && status.data.cloudProviders.length ? '/home/batches' : null);
  const community = useApi<{ enabled: boolean; waiting: number; showOnHome: boolean }>('/community/summary');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const ideas = (recs.data ?? []).filter((x) => !dismissed.has(x.name));
  const wip = (comps.data ?? []).filter((c) => c.photoIds.length > 0 && !c.printedAt).slice(0, 6);
  const ci = useCarousel(ideas.length, 4500, 2250);
  const cw = useCarousel(wip.length, 4500);
  const idea = ideas[ci.i];
  const wall = wip[cw.i];
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));

  // A notification can scroll to the ideas or to the cloud batches.
  const { hash } = window.location;
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); }, [hash, ideas.length]);

  const begin = () => nav(s && s.due === 0 && !s.resumable && s.early > 0 ? '/review?early' : '/review');
  const startIdea = async (x: SuggestedSet) => {
    const c = await api<Collection>('/collections', { body: { name: x.name, photoIds: x.photoIds } });
    await api('/recommendations/feedback', { body: { kind: 'together', photoIds: x.photoIds, verdict: 'accept' } });
    nav(`/collections/${c.id}`);
  };
  const notMe = (x: SuggestedSet) => { api('/recommendations/feedback', { body: { kind: 'together', photoIds: x.photoIds, verdict: 'reject' } }).catch(() => undefined); setDismissed((d) => new Set(d).add(x.name)); };

  if (s && s.total === 0) {
    return (
      <div className="page">

        <div style={{ maxWidth: 640 }}>
          <GettingStarted />
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1.02, margin: '0 0 20px' }}>Your library is empty.</h1>
          <p className="t2" style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' }}>Add photographs, then Frames groups them into shoots. Originals are never changed.</p>
          <AddPhotosButton big onDone={() => nav('/shoots')} />
        </div>
      </div>
    );
  }

  const dueText = s && s.due > 0
    ? `${s.shootNames.length ? `From ${s.shootNames.join(' and ')} · ` : ''}about ${s.minutes} ${s.minutes === 1 ? 'minute' : 'minutes'} · ratings rank your compositions`
    : 'Come back when the next ones are due, or begin anyway with the photographs you have not seen for longest.';
  const cloudLeft = batches.data?.left ?? 0;
  const total = shoots.data?.length ?? 0;

  return (
    <div className="page">

      <GettingStarted />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 className="serif" style={{ fontSize: 48, lineHeight: 1 }}>{greetingFor(new Date().getHours())}{firstName ? `, ${firstName}.` : ''}</h1>
        <span className="muted" style={{ fontSize: 13 }}>{(s?.total ?? 0).toLocaleString()} photographs · {total} shoots · {comps.data?.length ?? 0} compositions</span>
      </div>

      {s && (s.due > 0 || s.resumable || s.early > 0) && (
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', marginBottom: 16 }}>
          {s.nextId && <div style={{ position: 'absolute', inset: 0, background: `url(${cover(s.nextId)}) center/cover`, filter: 'blur(28px) brightness(.45)', transform: 'scale(1.2)' }} />}
          <div className="review-banner" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 32, padding: '28px 28px 28px 32px', color: s.nextId ? '#efede8' : 'var(--text)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="mono" style={{ fontSize: 12, letterSpacing: '.04em', opacity: .8 }}>REVIEW · {s.due > 0 ? 'DUE NOW' : s.resumable ? 'IN PROGRESS' : 'ANYTIME'}</span>
              <h2 className="serif" style={{ fontSize: 36, lineHeight: 1.05 }}>{s.due > 0 ? `${s.due} ${s.due === 1 ? 'photo is' : 'photos are'} waiting for your rating` : 'Nothing is waiting to be seen again'}</h2>
              <p style={{ margin: 0, fontSize: 13.5, opacity: .8 }}>{dueText}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 'none' }}>
              <button className="btn lg" style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500 }} onClick={begin}>{s.resumable ? 'Resume review' : s.due === 0 ? 'Review anyway' : 'Begin review'}</button>
              <span className="mono" style={{ fontSize: 12, opacity: .7, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.3)', borderRadius: 4, padding: '2px 6px' }}>R</span>
            </div>
          </div>
        </div>
      )}

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 260 }}>
          <div className="spread" style={{ alignItems: 'center' }}><span className="mono faint" style={{ fontSize: 12, fontWeight: 500 }}>01 · UPLOAD</span><span className="mono" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 12, display: 'grid', placeItems: 'center' }}>1</span></div>
          <h2 className="serif" style={{ fontSize: 32, lineHeight: 1.05 }}>Bring in a shoot</h2>
          <p className="t2" style={{ margin: 0, fontSize: 13.5 }}>{pending.data && pending.data.count > 0 ? `${pending.data.count} new file${pending.data.count === 1 ? '' : 's'} are waiting in your library folder.` : 'Upload from this computer or sync from the cloud.'}</p>
          {batches.data && batches.data.batches.length > 0 && (
            <div id="cloud">
              <div className="spread" style={{ marginBottom: 4 }}><span className="eyebrow">From the cloud · to organise</span><span className="faint" style={{ fontSize: 12 }}>{cloudLeft ? `${cloudLeft} batch${cloudLeft === 1 ? '' : 'es'}` : 'All sorted ✓'}</span></div>
              {batches.data.batches.map((b) => <BatchRow key={`${b.id}-${b.done}`} b={b} onChange={() => { batches.reload(); shoots.reload(); }} />)}
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <AddPhotosButton onDone={() => { shoots.reload(); pending.reload(); batches.reload(); }} />
            {pending.data && pending.data.count > 0 && <Link to="/shoots" className="muted" style={{ fontSize: 13 }}>Import {pending.data.count} →</Link>}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="spread" style={{ alignItems: 'flex-start' }}>
            <div><span className="mono faint" style={{ fontSize: 12, fontWeight: 500 }}>02 · COMPOSE &amp; EXPORT</span><h2 className="serif" style={{ fontSize: 32, lineHeight: 1.05, marginTop: 14 }}>Compositions</h2></div>
            <Link to="/collections" className="muted" style={{ fontSize: 13 }}>All {comps.data?.length ?? ''} →</Link>
          </div>
          <div className="compose-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 24, flex: 1 }}>
            <div id="ideas" onMouseEnter={ci.pause} onMouseLeave={ci.resume} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div className="spread"><span className="eyebrow">Ideas for you</span><Dots n={ideas.length} i={ci.i} go={ci.go} /></div>
              {idea ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: ci.fade, transition: 'opacity .3s' }}>
                  <div style={{ display: 'flex', gap: 6, height: 120 }}>{idea.photos.slice(0, 4).map((p) => <img key={p.id} src={cover(p.id)} alt="" style={{ height: '100%', flex: `${p.ar} 1 0`, minWidth: 0, objectFit: 'cover', borderRadius: 4 }} />)}</div>
                  <h3 className="serif" style={{ fontSize: 24 }}>{idea.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>{idea.reason}</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><button className="btn primary" onClick={() => startIdea(idea)}>Start this composition</button><button className="muted" onClick={() => notMe(idea)}>Not for me</button></div>
                </div>
              ) : <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{recs.loading ? 'Looking for sets…' : 'No ideas yet. Rate a few more photographs and Frames will suggest sets.'}</p>}
            </div>
            <i style={{ background: 'var(--hair)' }} />
            <div onMouseEnter={cw.pause} onMouseLeave={cw.resume} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div className="spread"><span className="eyebrow">Pick up where you left off</span><Dots n={wip.length} i={cw.i} go={cw.go} /></div>
              {wall ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: cw.fade, transition: 'opacity .3s' }}>
                  <div style={{ display: 'flex', gap: 6, height: 120 }}>{wall.photoIds.slice(0, 4).map((id) => <img key={id} src={cover(id)} alt="" style={{ height: '100%', flex: `${byId.get(id)?.ar ?? 1.5} 1 0`, minWidth: 0, objectFit: 'cover', borderRadius: 2 }} />)}</div>
                  <h3 className="serif" style={{ fontSize: 24 }}>{wall.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>{wall.chosenIds.length ? `${wall.chosenIds.length} print${wall.chosenIds.length === 1 ? '' : 's'} placed` : 'No prints placed yet'} · {wall.photoIds.length} candidates</p>
                  <div><Link to={`/collections/${wall.id}`} className="btn primary">Continue</Link></div>
                </div>
              ) : <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Nothing in progress. <button style={{ textDecoration: 'underline' }} onClick={() => openNew()}>Start a composition</button>.</p>}
            </div>
          </div>
        </div>
      </div>

      {community.data?.enabled && community.data.showOnHome && (
        <Link to="/community" className="community-cta" style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--surface)', borderRadius: 12, padding: '22px 28px' }}>
          <div style={{ flex: 1 }}><span className="eyebrow">Community review</span><h2 className="serif" style={{ fontSize: 28, margin: '6px 0 2px' }}>Rate other photographers’ work</h2><span className="muted" style={{ fontSize: 13 }}>Anonymous both ways · {community.data.waiting} photo{community.data.waiting === 1 ? '' : 's'} waiting · reviewing helps your own photos get reviewed</span></div>
          <span className="btn outline">Start community review</span>
        </Link>
      )}
    </div>
  );
}
