import { keyClick } from './keyClick';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GearAliases } from './GearAliases';

/** The Gear page's ⋯ menu: the links that used to sit in a row above the page. */
export function GearMore() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState(false);
  const item = (label: string, run: () => void) => <button key={label} className="mi" role="menuitem" onClick={() => { setOpen(false); run(); }}><span>{label}</span></button>;
  return (
    <span style={{ position: 'relative' }}>
      <button className="iconbtn" title="More" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ width: 40, height: 40, borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 18 }}>⋯</button>
      {open && (
        <>
          <div role="button" tabIndex={0} onKeyDown={keyClick} className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="popover" role="menu" aria-label="More Gear actions" style={{ right: 0, top: 'calc(100% + 6px)' }}>
            {item('Gear name aliases…', () => setAliases(true))}
            {item('Purchase & decision history', () => nav('/gear-history'))}
            {item('Recently removed', () => nav('/activity'))}
          </div>
        </>
      )}
      {aliases && <GearAliases open onClose={() => setAliases(false)} />}
    </span>
  );
}
