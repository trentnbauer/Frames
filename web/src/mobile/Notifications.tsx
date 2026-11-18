import { confirmAction } from '../components/dialogs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ICON, ago, type Notif } from '../components/Shell';
import { BackPill } from './ui';

/** Notifications as a page of their own on a phone: each with a dismiss ×, new gear with Add to gear, Hide and Blacklist. */
export function MobileNotifications() {
  const nav = useNavigate();
  const [items, setItems] = useState<Notif[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const load = useCallback(() => { api<{ items: Notif[] }>('/notifications').then((r) => setItems(r.items)).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const list = items ?? [];
  const unread = list.filter((n) => !n.read).length;
  const open = (n: Notif) => {
    setItems((l) => (l ?? []).map((i) => (i.id === n.id ? { ...i, read: true } : i)));
    api('/notifications/read', { body: { id: n.id } }).catch(() => undefined);
    nav(n.target.screen + (n.target.anchor ? `#${n.target.anchor}` : ''));
  };
  const act = async (n: Notif, action: 'dismiss' | 'add' | 'hide' | 'blacklist') => {
    if (busy !== null) return;
    setBusy(n.id); setErr('');
    try {
      await api(`/notifications/${n.id}${action === 'dismiss' ? '' : '/gear'}`, action === 'dismiss' ? { method: 'DELETE' } : { body: { action } });
      setItems((l) => (l ?? []).filter((i) => i.id !== n.id));
      if (action !== 'dismiss') window.dispatchEvent(new Event('frames:gear-changed'));
    } catch (e) { setErr((e as Error).message); load(); } finally { setBusy(null); }
  };
  const readAll = () => { setItems((l) => (l ?? []).map((i) => ({ ...i, read: true }))); api('/notifications/read', { body: { all: true } }).catch(() => undefined); };
  const clear = async () => { setBusy('all'); setErr(''); try { await api('/notifications', { method: 'DELETE' }); setItems([]); } catch (e) { setErr((e as Error).message); load(); } finally { setBusy(null); } };
  return (
    <div className="ppage" data-screen-label="Notifications">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
          <BackPill label="Home" />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={readAll} disabled={!unread || busy !== null} style={{ height: 36, padding: '0 10px', fontSize: 13, color: unread ? 'var(--text2)' : 'var(--faint)' }}>Mark all read</button>
            <button onClick={clear} disabled={!list.length || busy !== null} style={{ height: 36, padding: '0 10px', fontSize: 13, color: 'var(--text2)' }}>{busy === 'all' ? 'Clearing…' : 'Clear all'}</button>
          </div>
        </div>
        <h1 style={{ font: '400 40px/1 var(--serif)', margin: 0 }}>Notifications</h1>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {list.map((n) => (
            <div key={n.id} style={{ position: 'relative', borderTop: '1px solid var(--hair)' }}>
              <button onClick={() => open(n)} style={{ display: 'flex', gap: 12, padding: '14px 44px 14px 0', width: '100%', textAlign: 'left', boxSizing: 'border-box' }}>
                <span aria-hidden style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--chip)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, color: 'var(--text2)' }}>{ICON[n.kind] ?? '•'}</span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 14.5, lineHeight: 1.4, color: n.read ? 'var(--text2)' : 'var(--text)', textWrap: 'pretty' as never }}>{n.text}</span><span style={{ fontSize: 12, color: 'var(--faint)' }}>{ago(n.createdAt)}</span></span>
              </button>
              {!n.read && <i aria-hidden style={{ position: 'absolute', right: 42, top: 22, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
              <button onClick={() => act(n, 'dismiss')} disabled={busy !== null} aria-label={`Dismiss: ${n.text}`} style={{ position: 'absolute', top: 8, right: -6, width: 40, height: 40, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>×</button>
              {n.gear?.state === 'new' && (
                <div style={{ display: 'flex', gap: 8, padding: '0 0 14px 44px' }}>
                  <button onClick={() => act(n, 'add')} disabled={busy !== null} style={{ height: 38, padding: '0 14px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 13 }}>Add to gear</button>
                  <button onClick={() => act(n, 'hide')} disabled={busy !== null} style={{ height: 38, padding: '0 10px', fontSize: 13, color: 'var(--text2)' }}>Hide</button>
                  <button onClick={async () => { if (await confirmAction(`Blacklist ${n.gear?.name ?? 'this gear'}?\n\nIt is cleared from the camera details of your photos, now and when new ones arrive. Original files are not changed.`, { confirm: 'Blacklist', danger: true })) void act(n, 'blacklist'); }} disabled={busy !== null} style={{ height: 38, padding: '0 10px', fontSize: 13, color: 'var(--danger)' }}>Blacklist</button>
                </div>
              )}
            </div>
          ))}
          {items && !list.length && <div style={{ padding: '28px 0', fontSize: 13.5, color: 'var(--muted)', borderTop: '1px solid var(--hair)' }}>Nothing yet. New gear, guest replies, community ratings and ideas show up here.</div>}
          {!items && !err && <div style={{ padding: '28px 0', fontSize: 13.5, color: 'var(--muted)' }}>Loading…</div>}
        </div>
        <button onClick={() => nav('/settings?section=notifications')} style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 13, color: 'var(--text2)' }}>Notification settings</button>
      </div>
    </div>
  );
}
