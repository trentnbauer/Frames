import { useState } from 'react';
import { ZineList } from '../screens/Zines';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { printsSummary, slotsOf, chosenCount } from '../screens/walls';
import { useUi } from '../ui';
import { MiniWall } from './MiniWall';
import { Eyebrow } from './ui';

type Idea = { aiAssisted?: boolean; name: string; reason: string; photoIds: number[]; photos: (PhotoLite & { ar: number })[] };
type Stage = 'all' | 'progress' | 'review' | 'done';
const STAGES: [Stage, string, string][] = [['all', 'All', ''], ['progress', 'Progress', 'progress'], ['review', 'Review', 'review'], ['done', 'Done', 'done']];
const STAGE_LABEL = { progress: ['progress', 'Progress'], review: ['review', 'Review'], done: ['done', 'Done'] } as const;

/** The Compositions tab: stage filter, ideas, and each composition as its wall with its stage and how far it is. */
export function MobileCompositions() {
  const nav = useNavigate();
  const { openNew } = useUi();
  const colls = useApi<Collection[]>('/collections');
  const sug = useApi<Idea[]>('/collections/suggestions');
  const [stage, setStage] = useState<Stage>('all');
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const all = [...(colls.data ?? [])].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id);
  const list = all.filter((c) => stage === 'all' || c.stage === stage);
  const ideas = (sug.data ?? []).filter((i) => !gone.has(i.name));
  const start = async (i: Idea) => {
    setErr('');
    try {
      const c = await api<Collection>('/collections', { body: { name: i.name, photoIds: i.photoIds } });
      await api('/recommendations/feedback', { body: { kind: 'together', photoIds: i.photoIds, verdict: 'accept' } });
      nav(`/collections/${c.id}`);
    } catch (e) { setErr((e as Error).message); }
  };
  const status = (c: Collection) => c.stage === 'done' ? (c.printedAt ? 'Printed' : 'Ready to print') : chosenCount(c) === 0 ? 'No prints chosen' : `${chosenCount(c)} of ${slotsOf(c)} chosen`;
  return (
    <div className="pscreen ptab headless" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Compositions</h1><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>{all.length}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button onClick={() => openNew()} aria-label="New composition" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--btn-bg)', color: 'var(--btn-fg)', display: 'grid', placeItems: 'center', fontSize: 20, lineHeight: 1 }}>+</button></div>
      </div>
      <div role="group" aria-label="Stage" style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--surface)' }}>
        {STAGES.map(([k, l, shape]) => <button key={k} aria-pressed={stage === k} onClick={() => setStage(k)} style={{ flex: 1, height: 36, borderRadius: 999, background: stage === k ? 'var(--btn-bg)' : 'transparent', color: stage === k ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{shape && <span aria-hidden className={`stage-shape ${shape}`} />}{l}</button>)}
      </div>
      {err && <div role="alert" className="reason">{err}</div>}
      {ideas.length > 0 && stage !== 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>IDEAS FOR YOU</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -20px', padding: '0 20px', scrollbarWidth: 'none' }}>
            {ideas.map((i) => (
              <div key={i.name} style={{ flexShrink: 0, width: 236, scrollSnapAlign: 'start', borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box' }}>
                <div style={{ height: 80, display: 'flex', gap: 2, borderRadius: 6, overflow: 'hidden' }}>{i.photos.slice(0, 4).map((p) => <div key={p.id} style={{ flex: `${p.ar || 1} 1 0`, minWidth: 0, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--hair)` }} />)}</div>
                <span style={{ font: '400 21px/1.05 var(--serif)' }}>{i.aiAssisted && <span aria-label="AI-assisted idea">✦ </span>}{i.name}</span>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <button onClick={() => start(i)} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>Start composition</button>
                  <button onClick={() => { api('/recommendations/feedback', { body: { kind: 'together', photoIds: i.photoIds, verdict: 'reject' } }).catch(() => undefined); setGone((g) => new Set(g).add(i.name)); }} style={{ height: 36, padding: '0 10px', fontSize: 12.5, color: 'var(--text2)' }}>Skip idea</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
        {colls.data && list.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>{all.length === 0 ? 'No compositions yet. Tap + to start one.' : 'No compositions in this stage.'}</div>}
      </div>
      <ZineList heading={<h2 style={{ font: '400 32px/1 var(--serif)', margin: 0 }}>Zines</h2>} />
    </div>
  );
}
