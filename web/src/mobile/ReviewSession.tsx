import { useState, type ReactNode } from 'react';
import { useApi } from '../api';
import { Sheet } from '../components/Sheet';
import { RATINGS, fmtDate, type PhotoFull } from '../data';
import { primaryBtn } from './ui';

type Props = {
  total: number; index: number; shootName?: string; photoId: number; photoSrc: string; rating?: number;
  onRate: (n: number) => void; onBin: () => void; onSkip: () => void; onBack: () => void; onFinish: () => void;
  fav: { busy: boolean } | null; onFavourite: () => void; onDismissFav: () => void;
  renderCompPicker: (close: () => void, done: (m: string) => void) => ReactNode; error?: string; rotateBtn?: ReactNode;
};

/** A review session on a phone: a segmented progress bar, the photograph, and five faces to rate with. Ratings stay hidden while you rate (the review is blind). */
export function MobileReviewSession(p: Props) {
  const photo = useApi<PhotoFull>(`/photos/${p.photoId}`);
  const [sheet, setSheet] = useState<null | 'comp'>(null);
  const [toast, setToast] = useState('');
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2400); };
  const ph = photo.data;
  const when = ph ? fmtDate(ph.dateEdit ?? ph.capturedAt ?? ph.addedAt, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const btn = { height: 44, padding: '0 12px', fontSize: 13, color: '#a8a59f' } as const;
  return (
    <div role="dialog" aria-label="Review" data-screen-label="Review session" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--review)', color: '#efede8' }}>
      <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, right: 16, display: 'flex', gap: 2 }}>
        {p.total > 60 ? <i style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(239,237,232,.14)', overflow: 'hidden' }}><b style={{ display: 'block', height: '100%', width: `${Math.min(100, p.index / p.total * 100)}%`, background: '#efede8' }} /></i> : Array.from({ length: p.total }, (_, i) => <i key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < p.index ? '#efede8' : i === p.index ? 'rgba(239,237,232,.55)' : 'rgba(239,237,232,.14)' }} />)}
      </div>
      <div style={{ position: 'absolute', top: 'max(28px, calc(env(safe-area-inset-top) + 14px))', left: 20, right: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ font: "italic 400 24px/1 'Instrument Serif',Georgia,serif" }}>{p.index + 1} <span style={{ color: '#6f6c67' }}>/ {p.total}</span></span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#8f8c86', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.shootName}</span>
        {p.rotateBtn}
        <button onClick={p.onFinish} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'rgba(255,255,255,.08)', color: '#a8a59f', fontSize: 13 }}>Done</button>
      </div>
      <div style={{ position: 'absolute', top: 84, bottom: 236, left: 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div role="img" aria-label={ph?.title || 'Photograph'} style={{ width: '100%', height: '100%', background: `url(${p.photoSrc}) center/contain no-repeat` }} />
      </div>
      <div style={{ position: 'absolute', bottom: 196, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ font: "400 22px/1.1 'Instrument Serif',Georgia,serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ph?.title || ph?.file || ''}</span>
        <span style={{ font: "400 11px 'IBM Plex Mono',monospace", color: '#6f6c67', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{when}</span>
      </div>
      <div style={{ position: 'absolute', bottom: 136, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={p.onBack} disabled={p.index === 0} style={{ ...btn, color: p.index === 0 ? '#4a4844' : '#a8a59f' }}>← Back</button>
        <button onClick={() => setSheet('comp')} style={btn}>+ Composition</button>
        <button onClick={p.onBin} style={{ ...btn, color: 'var(--danger)' }}>Bin</button>
        <button onClick={p.onSkip} style={btn}>Skip →</button>
      </div>
      <div style={{ position: 'absolute', bottom: 38, left: 12, right: 12, display: 'flex', gap: 4, padding: 6, borderRadius: 26, background: 'rgba(30,30,29,.94)', boxShadow: '0 0 0 1px rgba(255,255,255,.08)' }}>
        {RATINGS.map((r) => (
          <button key={r.value} onClick={() => p.onRate(r.value)} aria-label={`Rate ${r.label}`} style={{ flex: 1, height: 74, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: p.rating === r.value ? 'rgba(239,237,232,.14)' : 'transparent' }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{r.emoji}</span><span style={{ fontSize: 11.5, color: '#a8a59f' }}>{r.label}</span>
          </button>
        ))}
      </div>
      {p.error && <div role="alert" style={{ position: 'absolute', bottom: 8, left: 16, right: 16, fontSize: 12.5, color: 'var(--danger)', textAlign: 'center' }}>{p.error}</div>}
      {p.fav && (
        <div style={{ position: 'absolute', bottom: 236, left: 16, right: 16, background: '#1e1e1d', borderRadius: 14, padding: '10px 10px 10px 16px', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
          <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>Loved it.</b> <span style={{ color: '#a8a59f' }}>Add to your portfolio favourites?</span></span>
          <button disabled={p.fav.busy} onClick={p.onFavourite} style={{ height: 38, padding: '0 14px', borderRadius: 999, background: '#efede8', color: '#0d0d0d', fontWeight: 500, flexShrink: 0 }}>♥ Favourite</button>
          <button onClick={p.onDismissFav} aria-label="Not now" style={{ width: 38, height: 38, color: '#a8a59f', flexShrink: 0 }}>✕</button>
        </div>
      )}
      {toast && <div role="status" style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95, padding: '9px 16px', borderRadius: 999, background: '#1e1e1d', boxShadow: '0 0 0 1px rgba(255,255,255,.08)', fontSize: 13 }}>{toast}</div>}
      {sheet === 'comp' && p.renderCompPicker(() => setSheet(null), (m) => { setSheet(null); say(m); })}
    </div>
  );
}

/** The end of a session on a phone. */
export function MobileReviewDone({ empty, rated, skipped, mean, removals, onRemovals, onDone }: { empty: boolean; rated: number; skipped: number; mean: number; removals: number; onRemovals: () => void; onDone: () => void }) {
  return (
    <div data-screen-label="Review session" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--review)', color: '#efede8', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: '0 28px' }}>
      <span style={{ font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', color: '#6f6c67' }}>{empty ? 'NOTHING TO REVIEW' : 'SESSION COMPLETE'}</span>
      <span style={{ font: "400 46px/1 'Instrument Serif',Georgia,serif" }}>{empty ? 'Nothing to review.' : 'Session complete.'}</span>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: '#a8a59f' }}>{empty ? 'Photographs come back here when they are due.' : `${rated} rated · ${skipped} skipped${rated ? ` · average ${mean.toFixed(1)}` : ''}`}</span>
      {removals > 0 && <button onClick={onRemovals} style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.25)', fontSize: 14 }}>Review {removals} suggested {removals === 1 ? 'removal' : 'removals'}</button>}
      <button onClick={onDone} style={{ marginTop: 12, height: 50, borderRadius: 999, background: '#efede8', color: '#0d0d0d', fontWeight: 500, fontSize: 15, textAlign: 'center' }}>Done</button>
    </div>
  );
}
