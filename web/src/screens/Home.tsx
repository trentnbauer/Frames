import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { FRAMES, MATS, or } from '../layout';
import { useStore } from '../store';
import { Header } from '../components/Shell';
import { AddPhotosModal, useStatus } from '../components/AddPhotos';
import { Today, greetingFor } from '../pages/Today';
import ProtoHome from '../proto/ProtoHome';

type SuggestedSet = { name: string; reason: string; photoIds: number[]; photos: (PhotoLite & { ar: number })[]; tags?: string[]; colours?: { name: string; hex: string }[] };
type Batch = { id: number; name: string; count: number; days: number; importedAt: string; covers: number[]; done: boolean };

const thumb = (id: number) => imgUrl(id, 'thumb');

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
    const lead = first.current ? offset : 0;
    first.current = false;
    const t = window.setTimeout(() => { iv = window.setInterval(() => { if (!paused.current) go(i + 1); }, ms); }, lead);
    return () => { window.clearTimeout(t); window.clearInterval(iv); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return { i: n ? i % n : 0, fade, go, pause: () => { paused.current = true; }, resume: () => { paused.current = false; } };
}

/** The miniature wall in "Pick up where you left off": the prints at a common scale, with their frames, mats and photographs. */
function miniWall(c: Collection) {
  const prints = c.layout.prints;
  const totalW = prints.reduce((n, p) => n + or(p.size, p.orientation)[0], 0);
  const k = Math.min(0.2, 340 / Math.max(totalW, 1));
  return prints.map((p) => {
    const [w, h] = or(p.size, p.orientation);
    const fr = p.frame;
    return { w: `${Math.round(w * k)}px`, h: `${Math.round(h * k)}px`, frame: fr && fr.color !== 'none' ? FRAMES[fr.color] : 'transparent', mat: fr ? MATS[fr.mat] : 'transparent', matPad: fr && fr.size !== p.size ? '7px' : '0', img: p.photoId ? `url(${thumb(p.photoId)}) center/cover` : 'rgba(0,0,0,.18)', empty: p.photoId ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)' };
  });
}
const printsSummary = (c: Collection) => { const sizes = new Map<string, number>(); c.layout.prints.forEach((p) => sizes.set(p.size, (sizes.get(p.size) ?? 0) + 1)); return [...sizes].map(([s, n]) => (n > 1 ? `${n} × ${s}` : s)).join(' + '); };

export function Home() {
  const { summary: s, me } = useStore();
  const nav = useNavigate();
  const status = useStatus();
  const recs = useApi<SuggestedSet[]>('/collections/suggestions');
  const comps = useApi<Collection[]>('/collections');
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<{ count: number }>('/library/pending');
  const batches = useApi<{ batches: Batch[]; left: number }>(status.data && status.data.cloudProviders.length ? '/home/batches' : null);
  const community = useApi<{ enabled: boolean; waiting: number; showOnHome: boolean }>('/community/summary');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [splits, setSplits] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, boolean>>({});
  const ideas = (recs.data ?? []).filter((x) => !dismissed.has(x.name));
  const wip = (comps.data ?? []).filter((c) => c.photoIds.length > 0 && !c.printedAt).slice(0, 6);
  const ci = useCarousel(ideas.length, 4500, 2250);
  const cw = useCarousel(wip.length, 4500);
  const idea = ideas[ci.i];
  const wall = wip[cw.i];
  const firstName = (me?.displayName || me?.user?.name || '').split(' ')[0];

  // A notification can scroll to the ideas or to the cloud batches.
  const { hash } = window.location;
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); }, [hash, ideas.length]);

  const due = s?.due ?? 0;
  const pn = pending.data?.count ?? 0;
  const left = (batches.data?.batches ?? []).filter((b) => !done[b.id] && !b.done).length;
  const v = {
    greeting: `${greetingFor(new Date().getHours())}${firstName ? `, ${firstName}.` : ''}`,
    summaryLine: `${(s?.total ?? 0).toLocaleString()} photographs · ${shoots.data?.length ?? 0} shoots · ${comps.data?.length ?? 0} compositions`,
    showReview: !!s && (s.due > 0 || s.resumable || s.early > 0), revCover: s?.nextId ? thumb(s.nextId) : '', revTag: due > 0 ? 'DUE NOW' : s?.resumable ? 'IN PROGRESS' : 'ANYTIME',
    revTitle: due > 0 ? `${due} ${due === 1 ? 'photo is' : 'photos are'} waiting for your rating` : 'Nothing is waiting to be seen again',
    revSub: due > 0 ? `${s!.shootNames.length ? `From ${s!.shootNames.join(' and ')} · ` : ''}about ${s!.minutes} ${s!.minutes === 1 ? 'minute' : 'minutes'} · ratings rank your compositions` : 'Come back when the next ones are due, or begin anyway with the photographs you have not seen for longest.',
    revCta: s?.resumable ? 'Resume review' : due === 0 ? 'Review anyway' : 'Begin review', revThumbs: s?.nextId ? [thumb(s.nextId)] : [],
    begin: () => nav(s && s.due === 0 && !s.resumable && s.early > 0 ? '/review?early' : '/review'),
    pendingN: pn, pendingText: pn > 0 ? `${pn} new file${pn === 1 ? '' : 's'} are waiting in your library folder.` : 'Upload from this computer or sync from the cloud.',
    canAdd: !status.data || status.data.storage.local || status.data.storage.cloud, addPhotos: () => setAdding(true),
    cloudOn: !!batches.data && batches.data.batches.length > 0, cloudLeft: left ? `${left} batch${left === 1 ? '' : 'es'}` : 'All sorted ✓',
    batches: (batches.data?.batches ?? []).map((b) => {
      const isDone = !!done[b.id] || b.done, sp = !!splits[b.id], nm = (names[b.id] ?? '').trim() || b.name;
      return {
        open: !isDone, done: isDone, op: isDone ? 0.7 : 1, name: names[b.id] ?? '', ph: b.name, meta: `${b.count} photo${b.count === 1 ? '' : 's'} · ${b.days} day${b.days === 1 ? '' : 's'}`, a: b.covers[0] ? thumb(b.covers[0]) : '', b: b.covers[1] ? thumb(b.covers[1]) : '',
        onName: (e: React.ChangeEvent<HTMLInputElement>) => setNames((x) => ({ ...x, [b.id]: e.target.value })),
        canSplit: b.days > 1, splitBg: sp ? 'rgba(255,255,255,.12)' : 'transparent', splitFg: sp ? '#efede8' : '#a8a59f', splitRing: sp ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.2)', splitLabel: sp ? `✓ Split into ${b.days} shoots` : `Split by day (${b.days})`, splitTog: () => setSplits((x) => ({ ...x, [b.id]: !sp })),
        addLabel: sp ? `Add ${b.days} shoots` : 'Add shoot',
        add: async () => {
          if ((names[b.id] ?? '').trim()) await api(`/shoots/${b.id}`, { method: 'PATCH', body: { name: names[b.id].trim() } });
          if (sp) await api(`/shoots/${b.id}/split-by-day`, { body: { name: nm } });
          await api(`/home/batches/${b.id}/done`, { body: { on: true } });
          setDone((x) => ({ ...x, [b.id]: true })); shoots.reload();
        },
        undo: async () => { await api(`/home/batches/${b.id}/done`, { body: { on: false } }); setDone((x) => ({ ...x, [b.id]: false })); batches.reload(); },
        doneLabel: sp ? `✓ Added “${nm}” as ${b.days} shoots` : `✓ Added “${nm}”`,
      };
    }),
    compCount: comps.data?.length ?? 0,
    sug: { title: idea?.name ?? 'No ideas yet', photos: (idea?.photos ?? []).slice(0, 4).map((p) => ({ img: `url(${thumb(p.id)}) center/cover`, flex: `${p.ar || 1} 1 0` })), tags: idea?.tags ?? [], colours: idea?.colours ?? [], why: idea?.reason ?? (recs.loading ? 'Looking for sets…' : 'Rate a few more photographs and Frames will suggest sets.') },
    sFade: ci.fade, sDots: ideas.map((_, k) => ({ bg: k === ci.i ? '#efede8' : 'rgba(255,255,255,.2)', go: () => ci.go(k) })), sPrev: () => ci.go(ci.i - 1), sNext: () => ci.go(ci.i + 1),
    startIdea: async () => {
      if (!idea) return;
      const c = await api<Collection>('/collections', { body: { name: idea.name, photoIds: idea.photoIds } });
      await api('/recommendations/feedback', { body: { kind: 'together', photoIds: idea.photoIds, verdict: 'accept' } });
      nav(`/collections/${c.id}`);
    },
    notMe: () => { if (!idea) return; api('/recommendations/feedback', { body: { kind: 'together', photoIds: idea.photoIds, verdict: 'reject' } }).catch(() => undefined); setDismissed((d) => new Set(d).add(idea.name)); },
    pause: () => { cw.pause(); ci.pause(); }, resume: () => { cw.resume(); ci.resume(); },
    fade: cw.fade, dots: wip.map((_, k) => ({ bg: k === cw.i ? '#efede8' : 'rgba(255,255,255,.2)', go: () => cw.go(k) })), prev: () => cw.go(cw.i - 1), next: () => cw.go(cw.i + 1),
    wall: wall
      ? { title: `Finish ${wall.name}`, status: `${wall.chosenIds.length} of ${wall.layout.prints.length} prints chosen · ${printsSummary(wall)}`, cta: 'Continue', gap: '14px', prints: miniWall(wall), count: `${cw.i + 1} of ${wip.length} in progress`, open: () => nav(`/collections/${wall.id}`) }
      : { title: 'Nothing in progress', status: 'Start a composition from an idea, or from the Compositions page.', cta: 'Compositions', gap: '0', prints: [] as ReturnType<typeof miniWall>, count: '', open: () => nav('/collections') },
    showCommunity: !!community.data?.enabled && !!community.data.showOnHome, communityWaiting: community.data?.waiting ?? 0,
  };

  if (s && s.total === 0) return <Today />;
  return (
    <div className="page-shell">
      <Header />
      <ProtoHome v={v} cloudOn={v.cloudOn} />
      {adding && <AddPhotosModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); shoots.reload(); pending.reload(); batches.reload(); }} />}
    </div>
  );
}
