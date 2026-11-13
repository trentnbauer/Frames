/** Separate add and blocklist actions so blocking discovered gear never adds it to owned gear. */
export function FoundGearItem({ name, count, onAdd, onBlocklist, busy = false }: {
  name: string; count: string; onAdd: () => void; onBlocklist?: () => void; busy?: boolean;
}) {
  return <span className="gear-found-item">
    <button type="button" disabled={busy} aria-label={`Add ${name} to gear`} onClick={onAdd}>+ {name} <span className="muted">{count}</span></button>
    {onBlocklist && <button type="button" disabled={busy} className="gear-found-blocklist" aria-label={`Blocklist ${name}`} onClick={onBlocklist}>Blocklist</button>}
  </span>;
}
