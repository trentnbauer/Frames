/* eslint-disable */
// @ts-nocheck
// The place picker (search, a list of places, a map you can click, how much the public may see), lifted out of Proto Photo so the
// photo page and a photoshoot open the same dialog. props: place, defaultLat, defaultLng, searchPlaces, reversePlace, onSavePlace,
// onRemovePlace, onClose, onToast.
import { DCLogic } from './runtime';

const ICON = { business: 'BU', suburb: 'SU', city: 'CI', landmark: 'LM', place: 'PL' };

export class Logic extends DCLogic {
  state = { map: null };
  mT = 0;
  componentDidMount() { this.openMap(); }
  componentWillUnmount() { clearTimeout(this.mT); }
  // The place picker: a search box, a list of places, a map you can click, and how much the public may see.
  openMap() {
    const pl = this.props.place || {};
    const lat = pl.lat ?? this.props.defaultLat ?? -32.0569, lng = pl.lng ?? this.props.defaultLng ?? 115.7439;
    this.setState({ map: { q: '', name: pl.name || '', address: pl.address || '', kind: pl.kind || '', suburb: pl.suburb || '', city: pl.city || '', lat, lng, prec: pl.precision || 'exact', picked: pl.name || null, results: [], busy: false, err: '', has: pl.lat != null } });
    if (pl.lat != null && !pl.name) this.reverse(lat, lng);
  }
  setMap(p) { this.setState((s) => ({ map: s.map ? { ...s.map, ...p } : s.map })); }
  async search(q) {
    if (!q.trim()) { this.setMap({ results: [], busy: false, err: '' }); return; }
    this.setMap({ busy: true, err: '' });
    try { const r = await this.props.searchPlaces(q); if (this.state.map && this.state.map.q === q) this.setMap({ results: r, busy: false }); } catch (e) { this.setMap({ busy: false, results: [], err: e.message || 'Search is not available right now' }); }
  }
  async reverse(lat, lng) {
    try { const r = await this.props.reversePlace(lat, lng); if (this.state.map) this.setMap({ name: r.name, address: r.address, kind: r.kind, suburb: r.suburb, city: r.city, picked: null }); } catch { /* keeps the pin and "Dropped pin" */ }
  }
  mapVals() {
    const S = this.state, P = this.props; const M = S.map;
    if (!M) return { mapOpen: false };
    const Z = 15, TS = 256, W = 552, H = 280, N = TS * Math.pow(2, Z);
    const toPx = (lat, lng) => { const r = lat * Math.PI / 180; return [(lng + 180) / 360 * N, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N]; };
    const toLL = (x, y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI, x / N * 360 - 180];
    const [cx, cy] = toPx(M.lat, M.lng); const x0 = cx - W / 2, y0 = cy - H / 2; const tiles = [];
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x0 + W) / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y0 + H) / TS); ty++) tiles.push({ src: '/api/map/tile/' + Z + '/' + tx + '/' + ty, left: Math.round(tx * TS - x0) + 'px', top: Math.round(ty * TS - y0) + 'px' });
    const q = M.q.trim();
    const near = M.name ? [{ name: M.name, address: M.address, kind: M.kind || 'place', lat: M.lat, lon: M.lng, suburb: M.suburb, city: M.city }] : [];
    const list = q ? M.results : near;
    const pick = (p) => this.setMap({ name: p.name, address: p.address, kind: p.kind, suburb: p.suburb, city: p.city, lat: p.lat, lng: p.lon, picked: p.name, q: '', results: [], prec: p.kind === 'city' ? 'city' : p.kind === 'suburb' ? 'suburb' : M.prec });
    const shown = !M.name ? '' : M.prec === 'exact' ? M.name : M.prec === 'suburb' ? (M.suburb || M.city || M.name) : (M.city || M.suburb || M.name);
    const cap = (k) => k[0].toUpperCase() + k.slice(1);
    return {
      mapOpen: true, closeMap: () => this.props.onClose(), mapQ: M.q,
      onMapQ: (e) => { const v = e.target.value; this.setMap({ q: v }); clearTimeout(this.mT); this.mT = setTimeout(() => this.search(v), 900); },
      mapKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (list[0] && q && !M.busy) pick(list[0]); else if (q) { clearTimeout(this.mT); this.search(q); } } if (e.key === 'Escape') this.props.onClose(); },
      mapListTitle: q ? (M.busy ? 'Searching…' : list.length + (list.length === 1 ? ' place' : ' places')) : 'Near the pin', mapNone: !!q && !M.busy && !list.length,
      mapResults: list.map((p) => ({ name: p.name, sub: p.address, kind: cap(p.kind || 'place'), icon: ICON[p.kind] || 'PL', bg: M.picked === p.name ? 'var(--hair)' : 'transparent', pick: () => pick(p) })),
      mapTiles: tiles, mapCoords: M.lat.toFixed(4) + ', ' + M.lng.toFixed(4),
      mapClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); const k = r.width / W; const [lat, lng] = toLL(cx + ((e.clientX - r.left) / k - W / 2), cy + ((e.clientY - r.top) / k - H / 2)); this.setMap({ lat, lng, name: M.name || 'Dropped pin', address: '', picked: null }); this.reverse(lat, lng); },
      mapPrec: [['exact', 'Exact'], ['suburb', 'Suburb'], ['city', 'City']].map(([k, label]) => ({ label, bg: M.prec === k ? 'var(--text)' : 'transparent', fg: M.prec === k ? 'var(--bg)' : 'var(--text2)', pick: () => this.setMap({ prec: k }) })),
      mapSummary: M.name ? M.name + (M.picked ? '' : ' · pin moved') + ' · shows as “' + shown + '”' : 'No place yet', mapHasPlace: !!(P.place && P.place.name),
      mapRemove: async () => { this.props.onClose(); await P.onRemovePlace(); this.props.onToast?.('Place removed'); },
      mapSave: async () => { if (!M.name) return; this.props.onClose(); await P.onSavePlace({ name: M.name, address: M.address, kind: M.kind, suburb: M.suburb, city: M.city, lat: M.lat, lng: M.lng, precision: M.prec }); this.props.onToast?.('Place saved · ' + M.name); },
    };
  }
  renderVals() { return { ...this.mapVals(), stop: (e) => e.stopPropagation() }; }
}
