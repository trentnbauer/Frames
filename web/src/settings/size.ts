/** A storage size typed by a person: "10", "2.5 GB", "500 MB", "1 TB". Empty or "none" means no limit (0). Returns GB, or null when it is not a size. */
export function parseSize(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t === '' || t === 'none' || t === 'no limit' || t === 'unlimited') return 0;
  const m = /^(\d+(?:[.,]\d+)?)\s*(mb|gb|tb|m|g|t)?$/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const gb = m[2]?.startsWith('m') ? n / 1024 : m[2]?.startsWith('t') ? n * 1024 : n;
  const r = Math.round(gb * 1000) / 1000;
  return n > 0 && r === 0 ? 0.001 : r; // the smallest size is a thousandth of a GB, not "no limit"
}
/** GB as it is shown: "10 GB", "512 MB", or "" for no limit. */
export function showSize(gb: number): string {
  if (!gb) return '';
  return gb >= 1 ? `${+gb.toFixed(3)} GB` : `${Math.round(gb * 1024)} MB`;
}
