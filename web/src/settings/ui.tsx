import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** One row of a settings card, as the handover's Settings screen defines them. */
export type R = {
  id: string;
  t: 'toggle' | 'select' | 'seg' | 'chips' | 'seq' | 'text' | 'link' | 'button' | 'meter' | 'method' | 'stepper' | 'swatch' | 'pills' | 'links' | 'selTog' | 'order' | 'hidden';
  label: ReactNode; hint?: ReactNode; note?: ReactNode;
  icon?: string; avatar?: { name: string; src?: string }; thumbs?: string[]; dim?: boolean; danger?: boolean;
  /** Shown only while another row is on (or equals depVal). */
  dep?: string; depVal?: string;
  value?: any; set?: (v: any) => void;
  opts?: string[]; /** select: choices that cannot be picked (shown greyed out). */ offOpts?: string[]; step?: number; min?: number; max?: number; unit?: string; prefix?: string;
  meta?: string; act?: () => void;
  ph?: string; inputType?: string; disabled?: boolean;
  pct?: number; text?: string;
  swatches?: [string, string][]; addAs?: string;
  /** selTog and order: the switch beside the control. */
  tog?: boolean; togSet?: (v: boolean) => void; togDisabled?: string;
  /** method: a sign-in or cloud provider that is tested before it is turned on. */
  method?: { configured?: boolean; builtIn?: boolean; on: boolean; setOn: (v: boolean) => void; test: 'none' | 'pass' | 'fail' | 'busy'; failWith?: string; runTest: () => void; configure: () => void };
  /** order: which provider comes first, how many follow, and how to open the order. */
  order?: { first: string; more: number; open: () => void };
};
export type Group = { title?: string; rows: R[]; jump?: () => void };
export type Section = { after?: ReactNode; key: string; name: string; hint: string; badge?: string; action?: { label: string; act: () => void }; groups: Group[] };

const mono = "'IBM Plex Mono',monospace";
const ringBtn = 'inset 0 0 0 1px rgba(255,255,255,.2)';
export const truthy = (v: unknown) => !!v && v !== 'Off';

export function visibleRows(all: R[]): (r: R) => boolean {
  const byId = new Map(all.map((r) => [r.id, r]));
  const vis = (r: R): boolean => r.t !== 'hidden' && (!r.dep || (!!byId.get(r.dep) && vis(byId.get(r.dep)!) && (r.depVal ? byId.get(r.dep)!.value === r.depVal : truthy(byId.get(r.dep)!.value))));
  return vis;
}

function Switch({ on, set, title, op = 1, label }: { on: boolean; set: () => void; title?: string; op?: number; label: string }) {
  return (
    <span role="switch" aria-checked={on} aria-label={label} tabIndex={0} title={title} onClick={set} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(); } }}
      style={{ width: 40, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer', transition: 'background .15s', flex: 'none', opacity: op, background: on ? '#efede8' : 'rgba(255,255,255,.14)' }}>
      <i style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', transition: 'left .15s', left: on ? 21 : 3, background: on ? '#0d0d0d' : '#a8a59f' }} />
    </span>
  );
}

function Select({ value, opts, off = [], prefix, set, opened, setOpened, op = 1, label }: { value: string; opts: string[]; off?: string[]; prefix?: string; set: (v: string) => void; opened: boolean; setOpened: (b: boolean) => void; op?: number; label: string }) {
  return (
    <>
      <span role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={opened} aria-label={label} onClick={() => setOpened(!opened)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpened(!opened); } if (e.key === 'Escape') setOpened(false); }}
        style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, boxShadow: ringBtn, fontSize: 13.5, cursor: 'pointer', position: 'relative', zIndex: opened ? 6 : 'auto', opacity: op }}>{prefix}{value} <span style={{ color: '#6f6c67' }}>▾</span></span>
      {opened && (
        <div role="listbox" style={{ position: 'absolute', top: 38, right: 0, zIndex: 6, minWidth: 200, background: '#1e1e1d', borderRadius: 10, padding: 4, boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column' }}>
          {opts.map((o) => (
            <div key={o} role="option" aria-selected={o === value} aria-disabled={off.includes(o) || undefined} onClick={() => { if (off.includes(o)) return; setOpened(false); set(o); }} className="sopt"
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', height: 34, padding: '0 10px', borderRadius: 6, fontSize: 13.5, cursor: off.includes(o) ? 'not-allowed' : 'pointer', opacity: off.includes(o) ? 0.4 : 1, whiteSpace: 'nowrap', background: o === value ? 'rgba(255,255,255,.08)' : 'transparent' }}>
              <span>{o}</span><span style={{ color: '#a8a59f' }}>{o === value ? '✓' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** A text box that saves when it loses focus (or Enter), not on every key, so a half-typed address is never sent. */
function TextBox({ value, ph, type, set, disabled, label }: { value: string; ph?: string; type?: string; set: (v: string) => void; disabled?: boolean; label: string }) {
  const [v, setV] = useState(value ?? '');
  const [seen, setSeen] = useState(value ?? '');
  if ((value ?? '') !== seen) { setSeen(value ?? ''); setV(value ?? ''); }
  const commit = () => { if (v !== (value ?? '')) set(v); };
  return <input value={v} placeholder={ph} type={type || 'text'} disabled={disabled} aria-label={label} autoComplete="off" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="stext"
    style={{ width: 300, height: 32, borderRadius: 999, border: 0, outline: 'none', background: '#0d0d0d', boxShadow: ringBtn, color: '#efede8', padding: '0 14px', font: "400 13.5px 'IBM Plex Sans',sans-serif", opacity: disabled ? 0.6 : 1 }} />;
}

/** A menu link on the portfolio: a full name, a short name (up to 4 characters, or one emoji) and where it goes. */
export type LinkItem = { short: string; name: string; url: string };
const linkOk = (l: LinkItem) => !!l.name.trim() && !!l.short.trim() && Array.from(l.short.trim()).length <= 4 && /^(https?:\/\/|mailto:)\S+/i.test(l.url.trim());
const linkBox: CSSProperties = { height: 32, borderRadius: 999, border: 0, outline: 'none', background: '#0d0d0d', boxShadow: ringBtn, color: '#efede8', padding: '0 14px', font: "400 13.5px 'IBM Plex Sans',sans-serif", minWidth: 0 };

/** The rows of links: Add puts a blank row to fill in; a row is saved once it is complete and valid, and dropping it saves too. */
function LinksRow({ r, last }: { r: R; last: boolean }) {
  const server = (r.value as LinkItem[]) ?? [];
  const [rows, setRows] = useState<LinkItem[]>(server);
  const [focus, setFocus] = useState(-1);
  const sent = useRef(JSON.stringify(server)); // what this editor last saved, so its own save does not reset the rows being typed
  const now = JSON.stringify(server);
  const [seen, setSeen] = useState(now);
  if (now !== seen) { setSeen(now); if (now !== sent.current) setRows([...server, ...rows.filter((x) => !linkOk(x))]); }
  const clean = (list: LinkItem[]) => list.filter(linkOk).map((l) => ({ short: l.short.trim(), name: l.name.trim(), url: l.url.trim() }));
  const save = (list: LinkItem[]) => { const good = clean(list); const j = JSON.stringify(good); if (j !== JSON.stringify(server)) { sent.current = j; r.set?.(good); } };
  const edit = (i: number, p: Partial<LinkItem>) => setRows((x) => x.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const max = r.max ?? 8;
  return (
    <div style={{ padding: '14px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 14.5 }}>{r.label}</div>
      {r.hint && <div style={{ fontSize: 12.5, color: '#a8a59f', marginTop: 3 }}>{r.hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {rows.map((l, i) => {
          const some = !!(l.short || l.name || l.url), bad = some && !linkOk(l);
          return (
            <div key={i}>
              <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) minmax(0,1.6fr) 28px', gap: 8, alignItems: 'center' }}>
                <input autoFocus={focus === i} value={l.short} placeholder="Short" aria-label="Short name (up to 4 characters or an emoji)" onChange={(e) => edit(i, { short: e.target.value })} onBlur={() => save(rows)} style={{ ...linkBox, textAlign: 'center', padding: '0 8px' }} />
                <input value={l.name} placeholder="Full name" aria-label="Full name" onChange={(e) => edit(i, { name: e.target.value })} onBlur={() => save(rows)} style={linkBox} />
                <input value={l.url} placeholder="https://…" aria-label="Link" inputMode="url" onChange={(e) => edit(i, { url: e.target.value })} onBlur={() => save(rows)} style={linkBox} />
                <span role="button" tabIndex={0} aria-label={`Remove ${l.name || 'link'}`} title="Remove" onClick={() => { const next = rows.filter((_, k) => k !== i); setRows(next); save(next); }} style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#a8a59f', cursor: 'pointer' }}>✕</span>
              </div>
              {bad && <div style={{ fontSize: 12, color: '#e79a82', margin: '4px 0 0 4px' }}>Needs a short name (up to 4 characters or an emoji), a full name, and a link starting with https:// or mailto:</div>}
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ fontSize: 13, color: '#8f8c86' }}>No links yet.</div>}
        <span role="button" tabIndex={0} aria-disabled={rows.length >= max || undefined} onClick={() => { if (rows.length >= max) return; setRows([...rows, { short: '', name: '', url: '' }]); setFocus(rows.length); }}
          style={{ alignSelf: 'flex-start', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, boxShadow: ringBtn, fontSize: 13, cursor: rows.length >= max ? 'not-allowed' : 'pointer', opacity: rows.length >= max ? 0.4 : 1 }}>+ Add link{rows.length >= max ? ` (up to ${max})` : ''}</span>
      </div>
    </div>
  );
}

export function RowView({ r, last, indent, open, setOpen, text }: { r: R; last: boolean; indent: boolean; open: string | null; setOpen: (id: string | null) => void; text: string }) {
  const t = r.t;
  if (t === 'links') return <LinksRow r={r} last={last} />;
  const v = r.value;
  const labelText = typeof r.label === 'string' ? r.label : text;
  const toggleLike = t === 'toggle' || t === 'selTog' || t === 'method' || t === 'order';
  const tv = t === 'toggle' ? !!v : t === 'method' ? !!r.method?.on : !!r.tog;
  const onToggle = () => { if (t === 'toggle') r.set?.(!tv); else if (t === 'method') { if (r.method!.test !== 'pass') return; r.method!.setOn(!tv); } else r.togSet?.(!tv); };
  const m = r.method;
  const testLabel = !m ? '' : m.test === 'busy' ? 'Testing…' : m.test === 'pass' ? '✓ Passed' : m.test === 'fail' ? `✕ ${m.failWith ?? 'Failed'} · retry` : 'Test';
  const testFg = m?.test === 'fail' ? 'oklch(0.75 0.14 28)' : m?.test === 'pass' ? '#a8a59f' : '#efede8';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '14px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, paddingLeft: indent ? 16 : 0, borderLeft: indent ? '2px solid rgba(255,255,255,.1)' : 'none' }}>
        {r.thumbs && <span style={{ display: 'flex', gap: 3, flex: 'none' }}>{r.thumbs.map((p, i) => <i key={i} style={{ width: 28, height: 36, borderRadius: 2, background: `url(${p}) center/cover` }} />)}</span>}
        {r.icon && <span style={{ width: 36, height: 36, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', font: `500 12px ${mono}`, background: r.dim ? 'transparent' : 'rgba(255,255,255,.08)', color: r.dim ? '#6f6c67' : '#efede8' }}>{r.icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, color: r.dim ? '#a8a59f' : '#efede8' }}>{r.label}</div>
          {r.hint ? <div style={{ fontSize: 12.5, color: '#8f8c86', textWrap: 'pretty' as never }}>{r.hint}</div> : null}
          {r.note ? <div style={{ fontSize: 12.5, color: '#a8a59f', fontStyle: 'italic', textWrap: 'pretty' as never, marginTop: 4 }}>{r.note}</div> : null}
        </div>
      </div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
        {r.avatar && <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}><i style={{ width: 28, height: 28, borderRadius: '50%', background: r.avatar.src ? `url(${r.avatar.src}) center/cover` : 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center', fontStyle: 'normal', fontSize: 12 }}>{r.avatar.src ? '' : r.avatar.name.slice(0, 1).toUpperCase()}</i>{r.avatar.name}</span>}
        {t === 'stepper' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, boxShadow: ringBtn, height: 32, padding: '0 4px', fontSize: 14 }} role="group" aria-label={labelText}>
            <span role="button" tabIndex={0} aria-label={`Fewer ${labelText}`} onClick={() => r.set?.(Math.max(r.min ?? 0, (v as number) - (r.step ?? 1)))} style={{ width: 24, textAlign: 'center', color: '#a8a59f', cursor: 'pointer' }}>−</span>
            <b style={{ fontWeight: 500, minWidth: 28, textAlign: 'center' }}>{v}{r.unit ?? ''}</b>
            <span role="button" tabIndex={0} aria-label={`More ${labelText}`} onClick={() => r.set?.(Math.min(r.max ?? 999, (v as number) + (r.step ?? 1)))} style={{ width: 24, textAlign: 'center', color: '#a8a59f', cursor: 'pointer' }}>+</span>
          </div>
        )}
        {(t === 'select' || t === 'selTog') && <Select value={String(v ?? r.opts?.[0] ?? '')} opts={r.opts ?? []} off={r.offOpts} prefix={r.prefix} set={(x) => r.set?.(x)} opened={open === r.id} setOpened={(b) => setOpen(b ? r.id : null)} op={t === 'selTog' ? (tv ? 1 : 0.4) : 1} label={labelText} />}
        {(t === 'seg' || t === 'chips') && (
          <div role={t === 'seg' ? 'radiogroup' : 'group'} aria-label={labelText} style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,.05)', fontSize: 13, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 460 }}>
            {(r.opts ?? []).map((o) => {
              const on = t === 'seg' ? v === o : (v as string[]).includes(o);
              const pick = () => (t === 'seg' ? r.set?.(o) : r.set?.(on ? (v as string[]).filter((y) => y !== o) : [...(v as string[]), o]));
              return <span key={o} role={t === 'seg' ? 'radio' : 'checkbox'} aria-checked={on} tabIndex={0} onClick={pick} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick(); } }}
                style={{ padding: '5px 12px', borderRadius: 999, cursor: 'pointer', background: t === 'seg' ? (on ? '#efede8' : 'transparent') : (on ? 'rgba(255,255,255,.12)' : 'transparent'), color: t === 'seg' ? (on ? '#0d0d0d' : '#a8a59f') : (on ? '#efede8' : '#8f8c86') }}>{t === 'chips' && on ? '✓ ' : ''}{o}</span>;
            })}
          </div>
        )}
        {t === 'order' && r.order && (
          <span role="button" tabIndex={0} onClick={r.order.open} title="Change the order" style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, boxShadow: ringBtn, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap', opacity: tv ? 1 : 0.4 }}>
            <b style={{ font: `500 11px ${mono}`, color: '#8f8c86' }}>1</b>{r.order.first}<span style={{ fontSize: 12, color: '#8f8c86' }}>{r.order.more > 0 ? `then ${r.order.more} more` : ''}</span><span style={{ color: '#6f6c67' }}>↕</span>
          </span>
        )}
        {t === 'seq' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 440 }}>
            {(v as string[]).map((x, k, a) => (
              <span key={k} style={{ display: 'contents' }}>
                <span role="button" tabIndex={0} title="Click to change" aria-label={`Wait after session ${k + 1}: ${x}`} onClick={() => { const nx = [...a]; nx[k] = r.opts![(r.opts!.indexOf(x) + 1) % r.opts!.length]; r.set?.(nx); }} style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 999, background: 'rgba(255,255,255,.06)', cursor: 'pointer' }}>{x}</span>
                <span style={{ color: '#5c5a56' }}>{k < a.length - 1 ? '→' : ''}</span>
              </span>
            ))}
          </div>
        )}
        {t === 'swatch' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} role="radiogroup" aria-label={labelText}>
            {(r.swatches ?? []).map(([name, c]) => <i key={name} role="radio" aria-checked={name === v} aria-label={name} title={name} onClick={() => r.set?.(name)} style={{ width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', background: c, boxShadow: name === v ? '0 0 0 2px #161615,0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.12)' }} />)}
          </div>
        )}
        {t === 'pills' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 440 }}>
            {(v as string[]).map((x) => (
              <span key={x} style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 6px 0 12px', borderRadius: 999, background: 'rgba(255,255,255,.08)', fontSize: 13 }}>{x}
                <span role="button" tabIndex={0} aria-label={`Remove ${x}`} onClick={() => r.set?.((v as string[]).filter((y) => y !== x))} style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#8f8c86', cursor: 'pointer', fontSize: 11 }}>✕</span>
              </span>
            ))}
            <Adder add={(name) => r.set?.([...(v as string[]), name])} addAs={r.addAs ?? 'new'} have={v as string[]} />
          </div>
        )}
        {t === 'meter' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#a8a59f' }}>
            <span aria-hidden style={{ width: 160, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', background: '#efede8', width: `${Math.max(0, Math.min(100, r.pct ?? 0))}%` }} /></span>{r.text}
          </div>
        )}
        {t === 'text' && <TextBox value={String(v ?? '')} ph={r.ph} type={r.inputType} set={(x) => r.set?.(x)} disabled={r.disabled} label={labelText} />}
        {t === 'link' && (r.meta ? <span role="button" tabIndex={0} onClick={r.act} onKeyDown={(e) => { if (e.key === 'Enter') r.act?.(); }} className="slink" style={{ fontSize: 13.5, color: '#a8a59f', cursor: 'pointer' }}>{r.meta} →</span> : null)}
        {t === 'button' && <span role="button" tabIndex={0} onClick={r.act} onKeyDown={(e) => { if (e.key === 'Enter') r.act?.(); }} className="sbtn" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, boxShadow: ringBtn, fontSize: 13.5, cursor: 'pointer', color: r.danger ? 'oklch(0.75 0.14 28)' : '#efede8' }}>{r.meta}</span>}
        {t === 'method' && m && (
          <>
            {m.builtIn
              ? <span style={{ fontSize: 13, color: '#6f6c67' }}>Built in</span>
              : <span role="button" tabIndex={0} onClick={m.configure} className="slink" style={{ fontSize: 13, color: m.configured ? '#6f6c67' : '#a8a59f', cursor: 'pointer' }}>{m.configured ? '✓ Configured' : 'Configure'}</span>}
            <span role="button" tabIndex={0} onClick={() => m.test !== 'busy' && m.runTest()} className="sbtn" style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: ringBtn, color: testFg }}>
              {m.test === 'busy' && <i style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block' }} />}{testLabel}
            </span>
          </>
        )}
        {toggleLike && <Switch on={tv} set={onToggle} label={labelText} title={r.togDisabled ?? (t === 'method' && m?.test !== 'pass' ? 'Test it first' : undefined)} op={r.togDisabled ? 0.4 : t === 'method' ? (m?.test === 'pass' ? 1 : 0.35) : t === 'order' ? 1 : 1} />}
      </div>
    </div>
  );
}

function Adder({ add, addAs, have }: { add: (n: string) => void; addAs: string; have: string[] }) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState('');
  if (!on) return <span role="button" tabIndex={0} onClick={() => setOn(true)} style={{ height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 10px', color: '#a8a59f', fontSize: 13, cursor: 'pointer' }}>+ Add</span>;
  const done = () => { const n = v.trim().toLowerCase(); if (n && !have.includes(n)) add(n); setV(''); setOn(false); };
  return <input autoFocus value={v} placeholder={addAs} aria-label={`Add ${addAs}`} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setV(''); setOn(false); } }} style={{ width: 140, height: 30, borderRadius: 999, border: 0, outline: 'none', background: '#0d0d0d', boxShadow: ringBtn, color: '#efede8', padding: '0 12px', font: "400 13px 'IBM Plex Sans',sans-serif" }} />;
}

export function GroupView({ g, vis, open, setOpen, title, jump, rowText }: { g: Group; vis: (r: R) => boolean; open: string | null; setOpen: (id: string | null) => void; title?: string; jump?: () => void; rowText?: (r: R) => string }) {
  const rows = g.rows.filter(vis);
  if (!rows.length) return null;
  const t = title ?? g.title;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {t ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ font: `500 11px ${mono}`, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' }}>{t}</span>{jump && <span role="button" tabIndex={0} onClick={jump} style={{ fontSize: 12.5, color: '#a8a59f', cursor: 'pointer' }}>Open section →</span>}</div> : null}
      <div style={{ background: '#161615', borderRadius: 12, padding: '4px 24px' }}>
        {rows.map((r, i) => <RowView key={r.id} r={r} last={i === rows.length - 1} indent={!!r.dep} open={open} setOpen={setOpen} text={rowText ? rowText(r) : ''} />)}
      </div>
    </div>
  );
}

export const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 18px', borderRadius: 999, boxShadow: ringBtn, fontSize: 14, cursor: 'pointer' };
export function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 1800); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg] as const;
}
export type { ReactNode };
