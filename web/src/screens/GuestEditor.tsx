import { useMemo, useRef, useState } from 'react';
import { imgUrl } from '../api';
import { arrange, type Layout, type Print } from '../layout';
import ProtoEditor from '../proto/ProtoEditor';
import { centreOf, fromDesign, toDesign, type DPrint } from './Editor';

type G = { id: number; title: string; ar: number; n: number };

/** What a guest sees of a shared composition (design: Proto Editor, guest view). Changes are tried here and only sent when they press send. */
export function GuestEditor({ token, name, owner, layout, chosenIds, photos, askName }: { token: string; name: string; owner?: string; layout: Layout; chosenIds: number[]; photos: G[]; askName: (then: (n: string) => void) => void }) {
  const base: Print[] = layout.mode === 'free' ? layout.prints : arrange(layout.prints, layout.mode);
  const origin = useRef(centreOf(base));
  const baseD = useMemo(() => toDesign(base, origin.current), [JSON.stringify(base)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<DPrint[]>(baseD);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const inWall = new Set(base.flatMap((p) => [p.photoId, p.photoId2]).filter((x): x is number => x != null));
  const others = photos.filter((p) => !inWall.has(p.id)).map((p) => p.id);
  const post = async (path: string, body: object, reviewer: string) => {
    const r = await fetch(`/api/s/${token}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, reviewer }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not save that');
  };
  const send = (note: string) => new Promise<void>((resolve, reject) => askName(async (reviewer) => {
    try {
      let structural = false;
      for (const d of draft) {
        const o = baseD.find((x) => x.id === d.id);
        if (!o) { structural = true; continue; }
        if (o.photo !== d.photo && o.photo != null) await post('suggest', { forId: o.photo, photoId: d.photo }, reviewer);
        else if (o.photo !== d.photo) structural = true;
        if (o.size !== d.size || o.or !== d.or || o.x !== d.x || o.y !== d.y || o.framed !== d.framed || o.frame !== d.frame || o.mat !== d.mat) {
          if (o.colour !== d.colour && o.size === d.size && o.or === d.or && o.framed === d.framed && o.frame === d.frame && o.mat === d.mat && o.x === d.x && o.y === d.y) await post('frame', { printId: d.id, color: d.colour.toLowerCase() }, reviewer);
          else structural = true;
        } else if (o.colour !== d.colour) await post('frame', { printId: d.id, color: d.colour.toLowerCase() }, reviewer);
      }
      if (baseD.some((o) => !draft.some((d) => d.id === o.id))) structural = true;
      if (structural) await post('layout', { layout: { mode: 'free', prints: fromDesign(draft, base, origin.current) }, note }, reviewer);
      else if (note.trim()) await post('comment', { body: note.trim() }, reviewer);
      resolve();
    } catch (e) { reject(e); }
  }));
  return (
    <ProtoEditor
      guest name={name} owner={owner} printsKey={JSON.stringify(base)} prints={baseD} basePrints={baseD}
      onPrints={(ds: DPrint[]) => setDraft(ds)}
      photoMeta={(pid: number) => [byId.get(pid)?.title || `Photo ${pid}`, '', 0]} photoDims={(pid: number) => { const ar = byId.get(pid)?.ar ?? 1.5; return [Math.round(ar * 4000), 4000]; }} photoUrl={(pid: number) => imgUrl(pid, 'preview', token)}
      order={others.length ? others : chosenIds} unrated={[]}
      onSend={send}
    />
  );
}
