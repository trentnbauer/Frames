/* eslint-disable */
// @ts-nocheck
// The place picker (search, a list of places, a map you can click, how much the public may see), lifted out of Proto Photo so the
// photo page and a photoshoot open the same dialog. props: place, defaultLat, defaultLng, searchPlaces, reversePlace, onSavePlace,
// onRemovePlace, onClose, onToast.
import { DCLogic } from './runtime';

const ICON = { business: 'BU', suburb: 'SU', city: 'CI', landmark: 'LM', place: 'PL' };

// Place lookups cached in memory and localStorage so a repeated search or pin drop loads instantly.
// shortcut: no expiry, only a size cap; place data rarely changes, clear the key if it ever goes stale.
const KEY = 'frames.mapCache', MAX = 200;
let cache = null;
const load = () => { if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; } } return cache; };
const cget = (k) => load()[k];
const cset = (k, v) => {
  const c = load(); delete c[k]; c[k] = v;
  const ks = Object.keys(c); if (ks.length > MAX) ks.slice(0, ks.length - MAX).forEach((x) => delete c[x]);
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage full or blocked: memory cache still works */ }
};

const W = 552, H = 280, ZMIN = 3, ZMAX = 19;
const toPx = (lat, lng, N) => { const r = lat * Math.PI / 180; return [(lng + 180) / 360 * N, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N]; };
const toLL = (x, y, N) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI, x / N * 360 - 180];

// The last few places saved, offered when the search box is empty.
const RKEY = 'frames.recentPlaces', RMAX = 4;
const recents = () => { try { const r = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; } };
const remember = (pl) => { try { localStorage.setItem(RKEY, JSON.stringify([pl, ...recents().filter((r) => r.name !== pl.name)].slice(0, RMAX))); } catch { /* blocked storage: no recents */ } };

export class Logic extends DCLogic {
  state = { map: null };
  mT = 0;
  componentDidMount() { this.openMap(); }
  ptrs = new Map(); moved = false; pinch = 0;
  // Pan by dragging, zoom with the wheel or a pinch. The view (vlat, vlng, z) is separate from the pin (lat, lng).
  mapRef = (el) => {
    if (!el || el._w) return;
    el._w = 1; el.style.touchAction = 'none';
    el.addEventListener('wheel', (e) => { e.preventDefault(); const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; this.zoomBy(-d * (e.ctrlKey ? 0.01 : 0.0025), e, el); }, { passive: false });
  };
  rel(e, el) { const r = el.getBoundingClientRect(), k = r.width / W; return [(e.clientX - r.left) / k - W / 2, (e.clientY - r.top) / k - H / 2, k]; }
  zoomBy(dz, e, el) {
    const M = this.state.map; if (!M) return;
    const z = Math.min(ZMAX, Math.max(ZMIN, M.z + dz)); if (z === M.z) return;
    const [ox, oy] = this.rel(e, el), N = 256 * 2 ** M.z, N2 = 256 * 2 ** z, f = N2 / N;
    const [cx, cy] = toPx(M.vlat, M.vlng, N);
    const [vlat, vlng] = toLL((cx + ox) * f - ox, (cy + oy) * f - oy, N2);
    this.setMap({ z, vlat, vlng });
  }
  down = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); this.ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (this.ptrs.size === 1) this.moved = false; else { this.moved = true; this.pinch = this.dist(); } };
  dist() { const [a, b] = [...this.ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  move = (e) => {
    const prev = this.ptrs.get(e.pointerId), M = this.state.map; if (!prev || !M) return;
    const el = e.currentTarget;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.ptrs.size === 2) {
      const [p, q] = [...this.ptrs.values()], d = this.dist();
      if (this.pinch > 0 && d > 0) this.zoomBy(Math.log2(d / this.pinch), { clientX: (p[0] + q[0]) / 2, clientY: (p[1] + q[1]) / 2 }, el);
      this.pinch = d; return;
    }
    const k = el.getBoundingClientRect().width / W, dx = (e.clientX - prev[0]) / k, dy = (e.clientY - prev[1]) / k;
    this.drag = (this.drag || 0) + Math.hypot(dx, dy); if (this.drag > 4) this.moved = true;
    if (!this.moved) return;
    const N = 256 * 2 ** M.z, [cx, cy] = toPx(M.vlat, M.vlng, N);
    const [vlat, vlng] = toLL(Math.min(N, Math.max(0, cx - dx)), Math.min(N, Math.max(0, cy - dy)), N);
    this.setMap({ vlat, vlng });
  };
  up = (e) => { this.ptrs.delete(e.pointerId); this.pinch = 0; if (!this.ptrs.size) this.drag = 0; };
  componentWillUnmount() { clearTimeout(this.mT); }
  // The place picker: a search box, a list of places, a map you can click, and how much the public may see.
  openMap() {
    const pl = this.props.place || {};
    const lat = pl.lat ?? this.props.defaultLat ?? -32.0569, lng = pl.lng ?? this.props.defaultLng ?? 115.7439;
    this.setState({ map: { q: '', name: pl.name || '', address: pl.address || '', kind: pl.kind || '', suburb: pl.suburb || '', city: pl.city || '', lat, lng, vlat: lat, vlng: lng, z: 15, prec: pl.precision || 'exact', picked: pl.name || null, results: [], busy: false, err: '', has: pl.lat != null } });
    if (pl.lat != null && !pl.name) this.reverse(lat, lng);
  }
  setMap(p) { this.setState((s) => ({ map: s.map ? { ...s.map, ...p } : s.map })); }
  async search(q) {
    if (!q.trim()) { this.setMap({ results: [], busy: false, err: '' }); return; }
    const key = 's:' + q.trim().toLowerCase(), hit = cget(key);
    if (hit) { this.setMap({ results: hit, busy: false, err: '' }); return; }
    this.setMap({ busy: true, err: '' });
    try { const r = await this.props.searchPlaces(q); if (Array.isArray(r) && r.length) cset(key, r); if (this.state.map && this.state.map.q === q) this.setMap({ results: r, busy: false }); } catch (e) { this.setMap({ busy: false, results: [], err: e.message || 'Search is not available right now' }); }
  }
  async reverse(lat, lng) {
    const key = 'r:' + lat.toFixed(4) + ',' + lng.toFixed(4), hit = cget(key);
    if (hit) { if (this.state.map) this.setMap({ name: hit.name, address: hit.address, kind: hit.kind, suburb: hit.suburb, city: hit.city, picked: null }); return; }
    try { const r = await this.props.reversePlace(lat, lng); if (r && r.name) cset(key, r); if (this.state.map) this.setMap({ name: r.name, address: r.address, kind: r.kind, suburb: r.suburb, city: r.city, picked: null }); } catch { /* keeps the pin and "Dropped pin" */ }
  }
  mapVals() {
    const S = this.state, P = this.props; const M = S.map;
    if (!M) return { mapOpen: false };
    // Fractional zoom: tiles come from the nearest whole level and are scaled to fit.
    const Z = Math.round(M.z), TS = 256 * 2 ** (M.z - Z), N = 256 * 2 ** M.z, T = 2 ** Z;
    const [cx, cy] = toPx(M.vlat, M.vlng, N); const x0 = cx - W / 2, y0 = cy - H / 2; const tiles = [];
    for (let tx = Math.max(0, Math.floor(x0 / TS)); tx <= Math.min(T - 1, Math.floor((x0 + W) / TS)); tx++) for (let ty = Math.max(0, Math.floor(y0 / TS)); ty <= Math.min(T - 1, Math.floor((y0 + H) / TS)); ty++) tiles.push({ src: '/api/map/tile/' + Z + '/' + tx + '/' + ty, left: Math.round(tx * TS - x0) + 'px', top: Math.round(ty * TS - y0) + 'px', size: Math.ceil(TS) + 1 + 'px' });
    const [pxp, pyp] = toPx(M.lat, M.lng, N);
    const q = M.q.trim();
    const near = M.name ? [{ name: M.name, address: M.address, kind: M.kind || 'place', lat: M.lat, lon: M.lng, suburb: M.suburb, city: M.city }] : [];
    const recent = recents().filter((r) => r.name !== M.name);
    const list = q ? M.results : [...near, ...recent];
    const pick = (p) => this.setMap({ name: p.name, address: p.address, kind: p.kind, suburb: p.suburb, city: p.city, lat: p.lat, lng: p.lon, vlat: p.lat, vlng: p.lon, picked: p.name, q: '', results: [], prec: p.kind === 'city' ? 'city' : p.kind === 'suburb' ? 'suburb' : M.prec });
    const shown = !M.name ? '' : M.prec === 'exact' ? M.name : M.prec === 'suburb' ? (M.suburb || M.city || M.name) : (M.city || M.suburb || M.name);
    const cap = (k) => k[0].toUpperCase() + k.slice(1);
    return {
      mapOpen: true, closeMap: () => this.props.onClose(), mapQ: M.q,
      onMapQ: (e) => { const v = e.target.value; this.setMap({ q: v }); clearTimeout(this.mT); this.mT = setTimeout(() => this.search(v), 900); },
      mapKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (list[0] && q && !M.busy) pick(list[0]); else if (q) { clearTimeout(this.mT); this.search(q); } } if (e.key === 'Escape') this.props.onClose(); },
      mapListTitle: q ? (M.busy ? 'Searching…' : list.length + (list.length === 1 ? ' place' : ' places')) : near.length ? 'Near the pin' : 'Recent places', mapNone: !!q && !M.busy && !list.length,
      mapResults: list.map((p) => ({ name: p.name, sub: p.address, kind: cap(p.kind || 'place'), icon: ICON[p.kind] || 'PL', bg: M.picked === p.name ? 'var(--hair)' : 'transparent', pick: () => pick(p) })),
      mapTiles: tiles, mapRef: this.mapRef, mapDown: this.down, mapMove: this.move, mapUp: this.up, pinLeft: Math.round(pxp - x0) + 'px', pinTop: Math.round(pyp - y0) + 'px', mapCoords: M.lat.toFixed(4) + ', ' + M.lng.toFixed(4),
      mapClick: (e) => { if (this.moved) { this.moved = false; return; } const r = e.currentTarget.getBoundingClientRect(); const k = r.width / W; const [lat, lng] = toLL(cx + ((e.clientX - r.left) / k - W / 2), cy + ((e.clientY - r.top) / k - H / 2), N); this.setMap({ lat, lng, name: M.name || 'Dropped pin', address: '', picked: null }); this.reverse(lat, lng); },
      mapPrec: [['exact', 'Exact'], ['suburb', 'Suburb'], ['city', 'City']].map(([k, label]) => ({ label, bg: M.prec === k ? 'var(--text)' : 'transparent', fg: M.prec === k ? 'var(--bg)' : 'var(--text2)', pick: () => this.setMap({ prec: k }) })),
      mapSummary: M.name ? M.name + (M.picked ? '' : ' · pin moved') + ' · shows as “' + shown + '”' : 'No place yet', mapHasPlace: !!(P.place && P.place.name),
      mapRemove: async () => { this.props.onClose(); await P.onRemovePlace(); this.props.onToast?.('Place removed'); },
      mapSave: async () => { if (!M.name) return; this.props.onClose(); remember({ name: M.name, address: M.address, kind: M.kind, suburb: M.suburb, city: M.city, lat: M.lat, lon: M.lng }); await P.onSavePlace({ name: M.name, address: M.address, kind: M.kind, suburb: M.suburb, city: M.city, lat: M.lat, lng: M.lng, precision: M.prec }); this.props.onToast?.('Place saved · ' + M.name); },
    };
  }
  renderVals() { return { ...this.mapVals(), stop: (e) => e.stopPropagation() }; }
}
