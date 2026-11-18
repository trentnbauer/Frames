/** Separate add and blocklist actions so blocking discovered gear never adds it to owned gear. */
export function FoundGearItem({ name, count, onAdd, onHide, onBlocklist, busy = false }: {
  name: string; count: string; onAdd: () => void; onHide?: () => void; onBlocklist?: () => void; busy?: boolean;
}) {
  return <span className="gear-found-item">
    <button type="button" disabled={busy} aria-label={`Add ${name} to gear`} onClick={onAdd}>+ {name} <span className="muted">{count}</span></button>
    {onHide && <button type="button" disabled={busy} className="gear-found-blocklist" aria-label={`Hide ${name} from this list`} title="Take it off this list. Your photos keep the camera details." onClick={onHide}>Hide</button>}
    {onBlocklist && <button type="button" disabled={busy} className="gear-found-blocklist" style={{ color: 'var(--danger)' }} aria-label={`Blacklist ${name}`} title="Clear it from your photos' camera details, now and for new photos." onClick={onBlocklist}>Blacklist</button>}
  </span>;
}
