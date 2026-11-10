import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from '../components/Modal';
import type { Ctx } from './sections';
import type { Section } from './ui';

type Sec = { h: string; p: string };
type Policy = { sections: Sec[]; custom: boolean; defaults: Sec[] };
type Policies = { terms: Policy; privacy: Policy };
type Info = { operator: string; contact: string; extra: string };

/** One policy as a list of sections to edit: a heading and some text each, in order. Saving an empty list goes back to Frames' own text. */
function PolicyModal({ which, ctx, data, onDone }: { which: 'terms' | 'privacy'; ctx: Ctx; data: Policy; onDone: () => void }) {
  const [list, setList] = useState<Sec[]>(data.sections);
  const info = useApi<Info>(which === 'privacy' ? '/admin/privacy' : null);
  const [who, setWho] = useState<Info>({ operator: '', contact: '', extra: '' });
  useEffect(() => { if (info.data) setWho(info.data); }, [info.data]);
  const set = (i: number, patch: Partial<Sec>) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async (sections: Sec[]) => {
    try {
      await api(`/admin/policies/${which}`, { method: 'PUT', body: { sections } });
      if (which === 'privacy') await api('/admin/privacy', { method: 'PUT', body: who });
      ctx.toast('Saved'); ctx.modal(null); onDone();
    } catch (e) { ctx.toast(e instanceof Error ? e.message : 'That did not work.'); }
  };
  const name = which === 'terms' ? 'Terms' : 'Privacy';
  return (
    <Modal title={name} sub={which === 'terms' ? 'Shown when people sign up and on the terms page.' : 'Shown on the privacy page, which anyone can read.'} width={760} onClose={() => ctx.modal(null)}
      foot={<>
        <button className="btn" disabled={!data.custom && list === data.sections} onClick={() => { if (window.confirm(`Go back to the ${name.toLowerCase()} text Frames writes? Your own sections are removed.`)) void save([]); }}>Use Frames’ text</button>
        <span className="grow" />
        <button className="btn" onClick={() => ctx.modal(null)}>Cancel</button>
        <button className="btn primary" onClick={() => void save(list.filter((s) => s.h.trim() || s.p.trim()))}>Save</button>
      </>}>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        {data.custom ? 'These are your own sections.' : 'This is the text Frames writes, kept true to how this server is set up. Change any of it and the sections become yours: Frames stops updating them.'} Blank lines start a new paragraph, a line starting “- ” is a bullet, and **words** are bold.
      </p>
      {which === 'privacy' && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          <input className="field-in" aria-label="Who runs this server" placeholder="Who runs this server (your name)" value={who.operator} maxLength={120} onChange={(e) => setWho({ ...who, operator: e.target.value })} />
          <input className="field-in" aria-label="How to reach them" placeholder="How to reach you (an email address)" value={who.contact} maxLength={200} onChange={(e) => setWho({ ...who, contact: e.target.value })} />
          <textarea className="field-in" aria-label="Anything else to tell people" rows={2} placeholder="Anything else to tell people" value={who.extra} maxLength={4000} onChange={(e) => setWho({ ...who, extra: e.target.value })} />
        </div>
      )}
      <div style={{ display: 'grid', gap: 14, maxHeight: '52vh', overflow: 'auto' }}>
        {list.map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field-in" aria-label={`Heading ${i + 1}`} placeholder="Heading" value={s.h} maxLength={120} onChange={(e) => set(i, { h: e.target.value })} style={{ flex: 1 }} />
              <button className="btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn" aria-label={`Remove ${s.h || 'section'}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Remove</button>
            </div>
            <textarea className="field-in" aria-label={`Text ${i + 1}`} rows={Math.min(10, Math.max(3, s.p.split('\n').length + 1))} value={s.p} maxLength={6000} onChange={(e) => set(i, { p: e.target.value })} />
          </div>
        ))}
        <button className="btn outline" onClick={() => setList((l) => [...l, { h: '', p: '' }])}>+ Add a section</button>
      </div>
    </Modal>
  );
}

/** Settings, Server, Policies: the terms and the privacy page, as people read them. */
export function usePolicies(ctx: Ctx): Section {
  const d = useApi<Policies>('/admin/policies');
  const open = (which: 'terms' | 'privacy') => { if (d.data) ctx.modal(<PolicyModal which={which} ctx={ctx} data={d.data[which]} onDone={d.reload} />); };
  const line = (p?: Policy) => (p ? `${p.sections.length} sections · ${p.custom ? 'your own text' : 'Frames’ text, kept up to date'}` : '…');
  return {
    key: 'policies', name: 'Policies', hint: 'The terms and the privacy page people read.',
    groups: [
      { title: 'What people read', rows: [
        { id: 'terms', t: 'button', label: 'Terms', hint: line(d.data?.terms), meta: 'Edit', act: () => open('terms') },
        { id: 'privacy', t: 'button', label: 'Privacy', hint: line(d.data?.privacy), meta: 'Edit', act: () => open('privacy') },
        { id: 'policyLinks', t: 'link', label: 'Read them as a visitor', hint: 'Both can be read without signing in.', meta: 'Open privacy page', act: () => { window.open('/privacy', '_blank', 'noopener'); } },
      ] },
    ],
  };
}
