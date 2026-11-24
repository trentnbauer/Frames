import { useState } from 'react';
import { ZineList, type Zine } from '../screens/Zines';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { printsSummary, slotsOf, chosenCount } from '../screens/walls';
import { KINDS, STAGES, listOrder, useCompositionsQuery, zineKindOf, type ListKind } from '../screens/compositionsList';
import { useUi } from '../ui';
import { MiniWall } from './MiniWall';
import { Eyebrow, Seg } from './ui';
import { useScrollRestore } from '../useScrollRestore';

type Idea = { aiAssisted?: boolean; name: string; reason: string; photoIds: number[]; photos: (PhotoLite & { ar: number })[] };
const STAGE_LABEL = { progress: ['progress', 'Progress'], review: ['review', 'Review'], done: ['done', 'Done'] } as const;
const SORTS = [['updated-desc', 'Updated · newest first'], ['updated-asc', 'Updated · oldest first'], ['created-desc', 'Created · newest first'], ['created-asc', 'Created · oldest first']] as const;
const count = { font: '400 11px var(--mono)', color: 'var(--faint)' };

/** The Compositions tab: search, Frames / Zines / Carousels, the stage, the order, a suggestion, then each composition as its wall. */
export function MobileCompositions() {
  const nav = useNavigate();
  const { openNew } = useUi();
  const { kind, stage, created, asc, q, set, setAll } = useCompositionsQuery();
  const colls = useApi<Collection[]>('/collections');
  const zines = useApi<Zine[]>('/zines');
  const sug = useApi<Idea[]>('/collections/suggestions');
  useScrollRestore(!!colls.data && !!zines.data && !!sug.data); // the suggestion card sits above the list
  const [si, setSi] = useState(0);
  const [err, setErr] = useState('');
  const needle = q.trim().toLowerCase();
  const all = colls.data ?? [], zineList = zines.data ?? [];
  const ofKind = (k: ListKind) => (k === 'frames' ? all : zineList.filter((z) => (z.kind ?? 'zine') === zineKindOf(k)));
  const inStage = (st: string) => ofKind(kind).filter((c) => (c.stage ?? 'progress') === st && (!needle || c.name.toLowerCase().includes(needle))).length;
  const list = all.filter((c) => c.stage === stage && (!needle || c.name.toLowerCase().includes(needle))).sort(listOrder(created, asc));
  const ideas = sug.data ?? [];
  const idea = ideas.length ? ideas[si % ideas.length] : null;
  const shown = inStage(stage);
  const noun = kind === 'frames' ? (shown === 1 ? 'composition' : 'compositions') : `${zineKindOf(kind)}${shown === 1 ? '' : 's'}`;
  const make = () => { setErr(''); if (kind === 'frames') { openNew(); return; } api<Zine>('/zines', { body: { kind: zineKindOf(kind) } }).then((z) => nav(`/zines/${z.id}`), (e: Error) => setErr(e.message)); };
  const start = async (i: Idea) => {
    setErr('');
    try {
      await api('/recommendations/feedback', { body: { kind: 'together', photoIds: i.photoIds, verdict: 'accept' } });
      openNew({ name: i.name, photoIds: i.photoIds }); // asks what to make with the set first
    } catch (e) { setErr((e as Error).message); }
  };
  const status = (c: Collection) => c.stage === 'done' ? (c.printedAt ? 'Printed' : 'Ready to print') : chosenCount(c) === 0 ? 'No prints chosen' : `${chosenCount(c)} of ${slotsOf(c)} chosen`;
  return (
    <div className="pscreen ptab headless" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Compositions</h1><span style={count}>{all.length + zineList.length}</span></div>
        <button onClick={make} aria-label={kind === 'frames' ? 'New composition' : `New ${zineKindOf(kind)}`} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--btn-bg)', color: 'var(--btn-fg)', display: 'grid', placeItems: 'center', fontSize: 20, lineHeight: 1 }}>+</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)' }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" aria-hidden><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.4 3.4" /></svg>
        <input value={q} onChange={(e) => set('find', e.target.value)} placeholder="Find a composition" aria-label="Find a composition" style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text)', fontSize: 15 }} />
      </div>
      <div role="tablist" aria-label="Kind" className="ptabs">
        {KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => set('kind', k === 'frames' ? null : k)}>{l} <span style={count}>{ofKind(k).length}</span></button>)}
      </div>
      <Seg label="Stage" value={stage} onPick={(k) => set('stage', k === 'progress' ? null : k)}
        options={STAGES.map(([k, l]) => [k, <><span aria-hidden className={`stage-shape ${k}`} />{l} <span style={{ ...count, color: 'inherit', opacity: 0.6 }}>{inStage(k)}</span></>])} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text2)', marginTop: -4 }}>
        <span>{shown} {noun} {stage === 'done' ? 'done' : `in ${stage}`}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <select aria-label="Order" value={`${created ? 'created' : 'updated'}-${asc ? 'asc' : 'desc'}`} onChange={(e) => { const [s, d] = e.target.value.split('-'); setAll({ sort: s === 'created' ? s : null, dir: d === 'asc' ? d : null }); }}
            className="plain-select">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span aria-hidden style={{ fontSize: 10, color: 'var(--faint)' }}>▾</span>
        </label>
      </div>
      {err && <div role="alert" className="reason">{err}</div>}
      {kind === 'frames' && stage === 'progress' && !needle && idea && (
        <div style={{ borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Eyebrow>SUGGESTED</Eyebrow>
            {ideas.length > 1 && <button onClick={() => setSi(si + 1)} aria-label="Next suggestion" style={{ fontSize: 13, color: 'var(--text2)' }}>{(si % ideas.length) + 1} of {ideas.length} ›</button>}
          </div>
          <div style={{ height: 64, display: 'flex', gap: 2, borderRadius: 4, overflow: 'hidden' }}>{idea.photos.slice(0, 3).map((p) => <div key={p.id} style={{ flex: `${p.ar || 1} 1 0`, minWidth: 0, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--hair)` }} />)}</div>
          <span style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.45 }}><b style={{ fontWeight: 500, color: 'var(--text)' }}>{idea.aiAssisted && <span aria-label="AI-assisted idea">✦ </span>}{idea.name}</b> · {idea.reason}</span>
          <button onClick={() => start(idea)} style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Start composition →</button>
        </div>
      )}
      {kind === 'frames' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {list.map((c) => (
            <button key={c.id} onClick={() => nav(`/collections/${c.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
              <MiniWall c={c} height={170} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ font: '400 25px/1.05 var(--serif)', overflowWrap: 'anywhere' }}>{c.name}</span><span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{printsSummary(c)}</span></div>
                <span style={{ flexShrink: 0, height: 26, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 999, background: 'var(--chip)', fontSize: 12 }}><span aria-hidden className={`stage-shape ${STAGE_LABEL[c.stage][0]}`} />{STAGE_LABEL[c.stage][1]}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{status(c)}</span>
            </button>
          ))}
          {colls.data && list.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>{all.length === 0 ? 'No compositions yet. Tap + to start one.' : 'No compositions here. Try another stage or search.'}</div>}
        </div>
      ) : <ZineList kind={zineKindOf(kind)} stage={stage} find={q} order={listOrder(created, asc)} />}
    </div>
  );
}
