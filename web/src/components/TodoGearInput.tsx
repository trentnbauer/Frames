import { useId, useState } from 'react';

export type GearChoice = { name: string; type: string };
export function gearChoices(owned: GearChoice[], discovered: GearChoice[], type: string, query: string) {
  const seen = new Set<string>(), q = query.trim().toLocaleLowerCase();
  return ([['Owned gear', owned], ['Discovered gear', discovered]] as const).flatMap(([group, rows]) => rows
    .filter((item) => item.type === type && item.name.toLocaleLowerCase().startsWith(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((item) => { const key = item.name.trim().toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .map((item) => ({ name: item.name, group })));
}

/** Suggestions are optional: typing arbitrary text never adds an item to owned gear. */
export function TodoGearInput({ value, type, placeholder, owned, discovered, onChange }: { value: string; type: string; placeholder: string; owned: GearChoice[]; discovered: GearChoice[]; onChange: (value: string) => void }) {
  const id = useId(), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const options = gearChoices(owned, discovered, type, value);
  const shown = open && options.length > 0;
  const choose = (name: string) => { onChange(name); setOpen(false); setActive(-1); };
  return <span style={{ position: 'relative', minWidth: 0 }}>
    <input role="combobox" aria-label={placeholder} aria-autocomplete="list" aria-expanded={shown} aria-controls={shown ? id : undefined} aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" placeholder={placeholder} value={value}
      style={{ width: '100%', height: 38, borderRadius: 8, border: 0, background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', padding: '0 12px', font: "400 14px 'IBM Plex Sans',sans-serif" }}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((n) => Math.max(0, Math.min(options.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1)))); }
        else if (e.key === 'Enter' && shown && options[active]) { e.preventDefault(); choose(options[active].name); }
        else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setActive(-1); }
      }} />
    {shown && <span id={id} role="listbox" aria-label={`${placeholder} suggestions`} style={{ display: 'block', position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 70, maxHeight: 240, overflowY: 'auto', marginTop: 4, padding: 4, borderRadius: 8, background: 'var(--raised)', boxShadow: '0 0 0 1px var(--outline), 0 8px 24px var(--scrim)' }}>
      {options.map((option, index) => <span key={option.name}>
        {options[index - 1]?.group !== option.group && <span style={{ display: 'block', padding: '6px 8px', fontSize: 11, color: 'var(--muted)' }}>{option.group}</span>}
        <span id={`${id}-${index}`} role="option" aria-selected={active === index} onMouseDown={(e) => { e.preventDefault(); choose(option.name); }} onMouseEnter={() => setActive(index)} style={{ display: 'block', padding: '8px', cursor: 'pointer', borderRadius: 4, color: 'var(--text)', background: active === index ? 'var(--hover)' : 'transparent', overflowWrap: 'anywhere' }}>{option.name}</span>
      </span>)}
    </span>}
  </span>;
}
