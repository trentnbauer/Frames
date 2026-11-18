import { useEffect, useState } from 'react';
import { RotateButton } from '../components/RotateButton';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection } from '../data';
import { useStore } from '../store';
import { CompPicker } from './CompPicker';
import { Modal } from '../components/Modal';
import ProtoReview from '../proto/ProtoReview';
import { reviewRequest } from '../reviewScope';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileReviewDone, MobileReviewSession } from '../mobile/ReviewSession';

type Session = { shootName?: string; runId: string; queue: { id: number; ar: number }[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };

/** Review: one photograph at a time, rate with 1 to 5. Previous ratings are never shown: the review is blind by design. */
export function Review() {
  const nav = useNavigate();
  const location = useLocation();
  const { refreshSummary } = useStore();
  const [s, setS] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState('');
  const [removals, setRemovals] = useState(0);
  const checkRemovals = () => api<{ photos: unknown[] }>('/photos/delete-suggestions').then((result) => setRemovals(result.photos.length)).catch(() => undefined);
  const colls = useApi<Collection[]>('/collections');
  const [fav, setFav] = useState<{ id: number; busy: boolean } | null>(null); // a 5 out of 5: offer to add the photograph to the portfolio favourites
  const [offer, setOffer] = useState<{ id: number; comp: Collection } | null>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const phone = usePhoneWidth();

  useEffect(() => {
    api<Session>('/review/start', { method: 'POST', body: reviewRequest(window.location.search) }).then(setS).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { if (!offer) return; const t = setTimeout(() => setOffer(null), 6000); return () => clearTimeout(t); }, [offer]);

  const done = !!s && s.index >= s.queue.length;
  useEffect(() => { if (done) void checkRemovals(); }, [done]);
  const cur = s && !done ? s.queue[s.index] : null;
  const leave = () => { refreshSummary(); if (location.key !== 'default') nav(-1); else nav('/'); };
  const move = async (index: number) => { if (s) setS(await api<Session>('/review/session', { method: 'PUT', body: { index } })); };
  const bestFit = (photoId: number) => [...(colls.data ?? [])].filter((c) => !c.printedAt && !c.photoIds.includes(photoId)).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id)[0] ?? null;
  // Moves on at once and saves in the background, so quick key presses never land on the same photo. If a rating can't be saved, you are put back on it.
  // A vote to delete: the lowest rating. After enough of them (Settings, Reviews, Clean-up) the photograph leaves Frames; its original stays.
  const bin = () => {
    if (!s || !cur) return;
    const before = s;
    setSaveErr('');
    setS({ ...s, ratings: { ...s.ratings, [cur.id]: 1 }, index: s.index + 1 });
    setOffer(null);
    api('/review/rate', { body: { photoId: cur.id, bin: true, note: s.notes[cur.id] } }).then(() => { refreshSummary(); void checkRemovals(); }).catch((e: Error) => { setS(before); setSaveErr(`That vote was not saved (${e.message}). Try it again.`); });
  };
  const rate = (n: number) => {
    if (!s || !cur) return;
    const before = s;
    setSaveErr('');
    setS({ ...s, ratings: { ...s.ratings, [cur.id]: n }, index: s.index + 1 });
    const fit = n >= 4 ? bestFit(cur.id) : null;
    setOffer(fit ? { id: cur.id, comp: fit } : null);
    if (n === 5) { const id = cur.id; api<{ favourite: boolean }>(`/portfolio/photos/${id}`).then((st) => { if (!st.favourite) setFav({ id, busy: false }); }).catch(() => undefined); }
    api('/review/rate', { body: { photoId: cur.id, rating: n, note: s.notes[cur.id] } }).then(() => { refreshSummary(); void checkRemovals(); }).catch((e: Error) => { setS(before); setSaveErr(`That rating was not saved (${e.message}). Try it again.`); });
  };

  if (error) return <div className="page-shell"><p role="alert" className="muted">Something went wrong: {error}</p></div>;
  if (!s) return null;
  if (s.queue.length === 0 || done) {
    const rated = Object.values(s.ratings);
    const mean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
    if (phone) return <MobileReviewDone empty={s.queue.length === 0} rated={rated.length} skipped={s.queue.length - rated.length} mean={mean} removals={removals} onRemovals={() => nav('/removals')} onDone={() => api('/review/session', { method: 'DELETE' }).then(leave)} />;
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--text)' }}>
        <div>
          <h1 style={{ font: "400 64px/1 'Instrument Serif',Georgia,serif", margin: 0 }}>{s.queue.length === 0 ? 'Nothing to review.' : 'Session complete.'}</h1>
          <p style={{ margin: '16px 0 28px', color: 'var(--text2)' }}>{s.queue.length === 0 ? 'Photographs come back here when they are due.' : `${rated.length} rated · ${s.queue.length - rated.length} skipped${rated.length ? ` · average ${mean.toFixed(1)}` : ''}`}</p>
          {removals > 0 && <p><button className="btn outline" onClick={() => nav('/removals')}>Review {removals} suggested {removals === 1 ? 'removal' : 'removals'}</button><br /><span className="muted" style={{ fontSize: 13 }}>Low averages after completed review sessions. Nothing is removed automatically.</span></p>}
          <button className="btn primary lg" onClick={() => api('/review/session', { method: 'DELETE' }).then(leave)}>Back</button>
        </div>
      </div>
    );
  }
  const favModal = fav && (
    <Modal title="Loved it. Add to your portfolio favourites?" sub="Favourites are shown on your portfolio. You can take it out again from the photograph’s page." width={480} onClose={() => setFav(null)}
      foot={<><span className="grow" /><button className="btn" onClick={() => setFav(null)}>Not now</button><button className="btn primary" disabled={fav.busy} onClick={async () => { setFav({ ...fav, busy: true }); try { await api(`/portfolio/photos/${fav.id}`, { body: { favourite: true } }); } catch (e) { setSaveErr(`It could not be added to your portfolio (${(e as Error).message}).`); } setFav(null); }}>Add to favourites</button></>}>
      <img src={imgUrl(fav.id, 'thumb')} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8, background: '#000' }} />
    </Modal>
  );
  const inComps = colls.data?.filter((c) => cur && c.photoIds.includes(cur.id)).length ?? 0;
  if (phone && cur) {
    return (<>
      <MobileReviewSession
        key={cur.id} total={s.queue.length} index={s.index} shootName={s.shootName} photoId={cur.id} photoSrc={imgUrl(cur.id, 'preview')} rating={s.ratings[cur.id]}
        onRate={rate} onBin={bin} onSkip={() => move(s.index + 1)} onBack={() => move(Math.max(0, s.index - 1))} onFinish={leave}
        fav={fav && fav.id === cur.id ? { busy: fav.busy } : null} onDismissFav={() => setFav(null)}
        onFavourite={async () => { if (!fav) return; setFav({ ...fav, busy: true }); try { await api(`/portfolio/photos/${fav.id}`, { body: { favourite: true } }); setFav(null); } catch (e) { setFav(null); setSaveErr(`It could not be added to your favourites (${(e as Error).message}).`); } }}
        renderCompPicker={(close, d) => <CompPicker ids={[pickFor ?? cur.id]} from="The photo you just rated" onClose={() => { setPickFor(null); close(); }} onDone={(m) => { setPickFor(null); colls.reload(); d(m); }} />}
        rotateBtn={<RotateButton id={cur.id} onDone={() => setS({ ...s })} style={{ width: 36, height: 36, background: 'rgba(255,255,255,.08)', color: '#efede8' }} />}
        error={saveErr}
      />
    </>);
  }
  return (<>
    <ProtoReview
      total={s.queue.length} index={s.index} shootName={s.shootName} photoSrc={cur ? imgUrl(cur.id, 'preview') : ''} rating={cur ? s.ratings[cur.id] : undefined}
      onRate={rate} onBin={bin} onSkip={() => move(s.index + 1)} onBack={() => move(Math.max(0, s.index - 1))} onFinish={leave}
      note={cur ? s.notes[cur.id] : ''}
      onNote={async (note: string) => { if (!cur) return; if (s.ratings[cur.id] !== undefined) setS(await api<Session>('/review/note', { body: { photoId: cur.id, note } })); else setS({ ...s, notes: { ...s.notes, [cur.id]: note } }); }}
      offer={offer ? { name: offer.comp.name } : null}
      onAddOffer={async () => { if (!offer) return; await api(`/collections/${offer.comp.id}/photos/${offer.id}`, { method: 'PUT' }); setOffer(null); colls.reload(); }}
      onChooseOffer={() => { if (offer) { setPickFor(offer.id); setOffer(null); } }}
      renderCompPicker={(close: () => void, d: (m: string) => void) => <CompPicker ids={[pickFor ?? cur?.id ?? 0]} from="The photo you just rated" onClose={() => { setPickFor(null); close(); }} onDone={(m) => { setPickFor(null); colls.reload(); d(m); }} />}
      onOpenPhoto={() => cur && nav(`/photo/${cur.id}`)}
      rotateBtn={cur ? <RotateButton id={cur.id} onDone={() => setS({ ...s })} /> : null}
      onLeaveOut={async () => { if (cur) { await api(`/photos/${cur.id}`, { method: 'PATCH', body: { archived: true } }).catch(() => undefined); await move(s.index + 1); } }}
      onUndo={async () => { if (s.index > 0) await move(s.index - 1); }}
      onFavourite={async () => { if (!cur) return ''; try { await api(`/portfolio/photos/${cur.id}`, { body: { favourite: true } }); return 'Added to your portfolio favourites'; } catch (e) { return `Not added to favourites (${(e as Error).message})`; } }}
      delSub={`${s.shootName ?? 'This photo'} · photo ${s.index + 1} of ${s.queue.length}`}
      delWarn={inComps ? `It will be taken out of ${inComps} composition${inComps === 1 ? '' : 's'}, along with its ratings and tags.` : 'Its ratings and tags go with it.'}
      onDelete={async () => { if (!cur) return; try { await api('/photos/remove', { body: { ids: [cur.id], originals: 'keep' } }); refreshSummary(); await move(s.index + 1); } catch (e) { setSaveErr(`Not deleted (${(e as Error).message}).`); } }}
      error={saveErr}
    />
    {favModal}
  </>);
}
