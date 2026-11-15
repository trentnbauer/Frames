import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { GearIcon } from './GearSystems';
export type WishlistData = {
  want: { id: number; name: string; type: string; system: string; why: string; price: number | null }[];
  own: { system: string }[];
  prefs: { currency?: string };
};
export function WishlistStrip({ data }: { data: WishlistData | null }) {
  if (!data?.want.length) return null;
  return <section className="home-wishlist" aria-label="Your wishlist">
    <div className="home-wishlist-heading"><span className="eyebrow">Your wishlist</span><h2 className="serif">Next for your kit</h2><Link to="/gear">All {data.want.length} {data.want.length === 1 ? 'item' : 'items'} →</Link></div>
    {data.want.slice(0, 2).map((item, index) => <Link key={item.id} to="/gear" className="home-wishlist-item" aria-label={`Open wishlist: ${item.name}`}>
      <span className="home-wishlist-rank">{String(index + 1).padStart(2, '0')}</span><GearIcon type={item.type} />
      <span className="home-wishlist-name"><strong>{item.name}</strong><small>{item.system && data.own.some((owned) => owned.system === item.system) ? `Fits ${item.system}` : item.why || 'On your wishlist'}</small></span>
      <span className="home-wishlist-price">{item.price === null ? <small>Price not set</small> : `${data.prefs.currency ?? '$'}${item.price.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`}</span>
    </Link>)}
  </section>;
}
export function HomeWishlist({ standalone = false }: { standalone?: boolean }) {
  const gear = useApi<WishlistData>('/gear/items');
  useEffect(() => { const refresh = () => gear.reload(); window.addEventListener('frames:gear-changed', refresh); return () => window.removeEventListener('frames:gear-changed', refresh); }, [gear.reload]);
  if (!gear.data?.want.length) return null;
  return standalone ? <div className="page-shell home-wishlist-standalone"><WishlistStrip data={gear.data} /></div> : <WishlistStrip data={gear.data} />;
}
