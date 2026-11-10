/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Search.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { q: 'autumn portraits outdoors', off: [], hi: 0, pick: false };
  componentWillUnmount() { clearTimeout(this.tT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 1800); }
  renderVals() {
    const S = this.state; const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const ph = (n, h) => { const ar = AR[n]; return { src: `photos/p${n + 1}.jpg`, ar, flex: `${ar} ${ar} ${Math.round(ar * h)}px` }; };
    const META = [
      { f: 'DSCF4182.RAF', cam: 'Fujifilm X-T5', lens: 'XF 56mm f/1.2', ap: 'f/1.2', iso: 'ISO 160', ss: '1/500', place: 'Fremantle', date: '8 Nov 2026', film: '' },
      { f: 'DSCF2210.RAF', cam: 'Fujifilm X-T5', lens: 'XF 16mm f/1.4', ap: 'f/8', iso: 'ISO 200', ss: '1/125', place: 'Margaret River', date: 'Dec 2025', film: '' },
      { f: 'DSCF2231.RAF', cam: 'Fujifilm X-T5', lens: 'XF 16mm f/1.4', ap: 'f/5.6', iso: 'ISO 400', ss: '1/60', place: 'Margaret River', date: 'Dec 2025', film: '' },
      { f: 'Roll41_07.tif', cam: 'Nikon FM2', lens: 'Nikkor 50mm f/1.8', ap: 'f/2.8', iso: 'ISO 400', ss: '1/250', place: 'Perth', date: 'Jan 2026', film: 'Portra 400' },
      { f: 'IMG_0912.CR3', cam: 'Canon R6', lens: 'RF 35mm f/1.8', ap: 'f/4', iso: 'ISO 100', ss: '1/1000', place: 'Bunbury', date: 'Sep 2025', film: '' },
      { f: 'Studio_Ana_014.RAF', cam: 'Fujifilm X-T5', lens: 'XF 56mm f/1.2', ap: 'f/2', iso: 'ISO 160', ss: '1/200', place: 'Northbridge', date: 'Oct 2025', film: '' },
      { f: 'Roll41_22.tif', cam: 'Nikon FM2', lens: 'Nikkor 50mm f/1.8', ap: 'f/1.8', iso: 'ISO 400', ss: '1/125', place: 'Perth', date: 'Jan 2026', film: 'Portra 400' },
      { f: 'DSCF4240.RAF', cam: 'Fujifilm X-T5', lens: 'XF 56mm f/1.2', ap: 'f/1.2', iso: 'ISO 320', ss: '1/250', place: 'Fremantle', date: '7 Nov 2026', film: '' },
      { f: 'P67_Roll3_04.tif', cam: 'Pentax 6×7', lens: 'SMC Takumar 150mm f/2.8', ap: 'f/4', iso: 'ISO 160', ss: '1/60', place: 'Kings Park', date: 'Feb 2026', film: 'Portra 160' },
      { f: 'IMG_0930.CR3', cam: 'Canon R6', lens: 'RF 35mm f/1.8', ap: 'f/2.8', iso: 'ISO 800', ss: '1/60', place: 'Bunbury', date: 'Sep 2025', film: '' },
    ];
    const q = S.q.trim().toLowerCase(); const words = q.split(/\s+/).filter(Boolean);
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9./]/g, '');
    const FIELDS = [['f', 'File'], ['cam', 'Camera'], ['lens', 'Lens'], ['film', 'Film'], ['ap', 'Aperture'], ['iso', 'ISO'], ['ss', 'Shutter'], ['place', 'Place']];
    const metaHits = []; const metaChips = [];
    const toks = []; for (let i = 0; i < words.length; i++) { const w = words[i]; if (w === 'iso' && /^\d+$/.test(words[i + 1] || '')) { toks.push(['iso', 'iso' + words[i + 1]]); i++; } else if (/^iso\d+$/.test(w)) toks.push(['iso', w]); else if (/^f\/?\d/.test(w)) toks.push(['ap', 'f/' + w.replace(/^f\/?/, '')]); else if (/^1\/\d+$/.test(w)) toks.push(['ss', w]); else toks.push([null, w]); }
    toks.forEach(([force, w]) => { const nw = norm(w); if (nw.length < 2) return; for (const [k, label] of FIELDS.filter(([k]) => !force || k === force)) { const vals = [...new Set(META.map((m) => m[k]).filter((v) => v && (norm(v).includes(nw) || (k === 'ap' && norm(v) === nw) || (k === 'lens' && /^\d+mm$/.test(nw) && norm(v).includes(nw)))))]; const exact = k === 'ap' || k === 'iso' ? vals.filter((v) => norm(v) === nw) : vals; if (exact.length) { const val = k === 'f' && exact.length > 1 ? w : exact.length === 1 ? exact[0] : w; metaChips.push({ k, label, val, w: nw }); break; } } });
    const DICT = { autumn: 'orange', portraits: 'portrait', portrait: 'portrait', cars: 'car', car: 'car', forest: 'forest', street: 'street', blue: 'blue', film: 'film', beach: 'beach' };
    const tagChips = [...new Set(words.filter((w) => w !== 'iso' && !metaChips.some((m) => m.w === norm(w) || m.w === 'iso' + w || m.w === norm('f/' + w.replace(/^f\/?/, '')))).map((w) => DICT[w]).filter(Boolean))].filter((c) => !S.off.includes(c));
    const mChips = metaChips.filter((m) => !S.off.includes(m.label + ':' + m.val));
    const chips = tagChips;
    const SH = [['Autumn portraits, Kings Park', 'Shoot · 64', 7, 'shoots', ['autumn', 'portrait', 'kings', 'park', 'outdoors']], ['Autumn hallway', 'Composition · 3 × A4', 4, 'editor', ['autumn', 'hallway']], ['Fremantle Markets', 'Shoot · 86', 10, 'shoots', ['fremantle', 'markets', 'street', 'portrait']], ['Cars & chrome', 'Composition · 2 × 50×70', 5, 'editor', ['car', 'cars', 'chrome']], ['Roll 41 · Portra', 'Shoot · 36', 4, 'shoots', ['film', 'portra', 'roll']], ['Margaret River', 'Shoot · 211', 2, 'shoots', ['forest', 'river', 'outdoors']]];
    const hitsRaw = q ? SH.filter(([n, , , , k]) => words.some((w) => k.some((x) => x.startsWith(w)) || n.toLowerCase().includes(w))).slice(0, 4) : SH.slice(0, 3);
    const hi = Math.min(S.hi, Math.max(0, hitsRaw.length - 1));
    const pool = { portrait: [3, 6, 0, 5, 9, 2], orange: [0, 8, 6, 9, 1, 7], car: [4, 9], forest: [1, 2, 8], street: [3, 7, 0], film: [3, 5, 8], blue: [4, 9], beach: [5, 8] };
    let ids = chips.length ? chips.map((c) => pool[c] || []).reduce((a, b) => a.filter((x) => b.includes(x)).length ? a.filter((x) => b.includes(x)) : [...new Set([...a, ...b])]) : q ? [3, 6, 7, 0, 5, 9, 8, 2, 1] : [];
    if (mChips.length) { const mIds = META.map((m, i) => i).filter((i) => mChips.every((c) => (c.k === 'ap' || c.k === 'iso' ? norm(META[i][c.k] || '') === c.w : norm(META[i][c.k] || '').includes(c.w)))); ids = chips.length ? ids.filter((i) => mIds.includes(i)) : mIds; }
    if (q && !chips.length && !mChips.length && !hitsRaw.length) ids = [];
    const fileHits = mChips.some((c) => c.k === 'f') ? ids.map((i) => ({ name: META[i].f, meta: [META[i].cam, META[i].date].join(' · '), src: 'photos/p' + (i + 1) + '.jpg' })) : [];
    const count = mChips.some((c) => c.k === 'f') ? ids.length : mChips.length ? ids.length * (chips.length ? 9 : 37) : ids.length ? (chips.length ? 214 - S.off.length * 60 - (2 - chips.length) * 40 : 380) : 0;
    const open = (i) => { const h = hitsRaw[i]; if (h) location.hash = h[3]; };
    return {
      q: S.q, onQ: (e) => this.setState({ q: e.target.value, off: [], hi: 0 }),
      onKey: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ hi: Math.min(hi + 1, hitsRaw.length - 1) }); } else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ hi: Math.max(hi - 1, 0) }); } else if (e.key === 'Enter') open(hi); else if (e.key === 'Escape') location.hash = 'library'; },
      hasChips: chips.length + mChips.length > 0, chips: [...mChips.map((c) => ({ label: c.label + ': ' + c.val, remove: () => this.setState({ off: [...S.off, c.label + ':' + c.val] }) })), ...chips.map((c) => ({ label: c, remove: () => this.setState({ off: [...S.off, c] }) }))],
      hasFiles: fileHits.length > 0, files: fileHits.slice(0, 5),
      searchRowMeta: ids.map((n) => ({ ...ph(n, 110), tip: META[n].f + ' · ' + META[n].cam + ' · ' + META[n].lens + ' · ' + META[n].ap + ' · ' + META[n].iso })),
      hasHits: hitsRaw.length > 0, hits: hitsRaw.map(([name, meta, src, go], i) => ({ name, meta, go, src: 'photos/p' + src + '.jpg', bg: i === hi ? 'rgba(255,255,255,.06)' : 'transparent', enter: i === hi ? '↵' : '', hover: () => this.setState({ hi: i }) })),
      photoMeta: ids.length ? 'Photos · ' + Math.max(ids.length, count) + ' from ' + Math.max(3, Math.round(count / 7)) + ' shoots' : 'Photos', searchRow: ids.map((n) => ({ ...ph(n, 110), tip: META[n].f + ' · ' + META[n].cam + ' · ' + META[n].lens + ' · ' + META[n].ap + ' · ' + META[n].ss + ' · ' + META[n].iso + (META[n].film ? ' · ' + META[n].film : '') })), noPhotos: !ids.length,
      actOp: ids.length ? 1 : 0.4, pickLabel: ids.length ? 'Pick from these ' + Math.max(ids.length, count) : 'Pick from these',
      pickOpen: S.pick, togglePick: () => ids.length && this.setState({ pick: true }), closePick: () => this.setState({ pick: false }), pickCount: Math.max(ids.length, count), pickThumbs: ids.slice(0, 3).map((n) => 'photos/p' + (n + 1) + '.jpg'), pickDone: (sel, msg) => this.flash(msg),
      comps: [['Kitchen wall', '3 × A3'], ['Autumn hallway', '3 × A4'], ['Portraits 2026', '4 × A4'], ['Studio feature', 'A2 + 2 × A5']].map(([name, meta]) => ({ name, meta, pick: () => { this.setState({ pick: false }); this.flash('Added ' + Math.max(ids.length, count) + ' photos to ' + name + ' as candidates'); } })),
      toast: S.toast || '', toastOp: S.tOp || 0,
    };
  }
}
