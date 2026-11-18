import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../api';
import { GearPage, type GearData } from '../components/GearPage';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileGear } from '../mobile/Gear';

/** Gear & wishlist (design: Frames UI Review, Gear). It follows the portfolio's Gear page. */
export function Gear() {
  return usePhoneWidth() ? <MobileGear /> : <DesktopGear />;
}

type Data = GearData;

function DesktopGear() {
  const g = useApi<Data>('/gear/items');
  useEffect(() => { const changed = () => g.reload(); window.addEventListener('frames:gear-changed', changed); return () => window.removeEventListener('frames:gear-changed', changed); }, [g.reload]);
  const [blocklisting, setBlocklisting] = useState<string | null>(null);
  const [blocklistError, setBlocklistError] = useState('');
  const blocklistBusy = useRef(false);
  const blocklistFound = async (name: string) => {
    if (blocklistBusy.current) return;
    blocklistBusy.current = true; setBlocklisting(name); setBlocklistError('');
    try { await api('/gear/blacklist', { body: { name } }); window.dispatchEvent(new Event('frames:gear-changed')); }
    catch (e) { setBlocklistError((e as Error).message); }
    finally { blocklistBusy.current = false; setBlocklisting(null); }
  };
  return <GearPage data={g.data as GearData | undefined} reload={async () => { g.set(await api<Data>('/gear/items')); }} blocklisting={blocklisting} blocklistError={blocklistError || g.error || ''} onBlocklistFound={blocklistFound} />;
}
