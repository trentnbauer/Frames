/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Editor.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import React from 'react';
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  SIZES = { A5: [14.8, 21], A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1], '5×7″': [12.7, 17.8], '8×10″': [20.3, 25.4], '11×14″': [27.9, 35.6], '16×20″': [40.6, 50.8], '50×70': [50, 70] };
  GROUPS = [['ISO paper', ['A5', 'A4', 'A3', 'A2', 'A1']], ['Photo & poster', ['5×7″', '8×10″', '11×14″', '16×20″', '50×70']]];
  ORDER = ['A5', '5×7″', '8×10″', 'A4', '11×14″', 'A3', '16×20″', 'A2', '50×70', 'A1'];
  ph(n) { return this.props.photoMeta(n); }
  px(n) { return this.props.photoDims(n); }
  pr() { return this.state.prints ?? this.props.prints ?? []; }
  save() { const ps = this.state.prints; if (ps && !this.state.dragging) this.props.onPrints(ps); }
  crop(n, size, or, z) { z = z || 1; let [pw, ph] = this.SIZES[size]; if (or === 'L') [pw, ph] = [ph, pw]; const [W, H] = this.px(n); const pa = pw / ph; let [cw, ch] = W / H > pa ? [H * pa, H] : [W, W / pa]; cw /= z; ch /= z; return { ppi: Math.round(ch / (ph / 2.54)), cw: Math.round(cw), ch: Math.round(ch), cut: Math.round((1 - (cw * ch) / (W * H)) * 100) }; }
  ppiFor(n, size, or, z) { return this.crop(n, size, or, z).ppi; }
  area(k) { const [w, h] = this.SIZES[k]; return w * h; }
  fits(frame, print) { const [fw, fh] = this.SIZES[frame], [pw, ph] = this.SIZES[print]; return fw >= pw && fh >= ph; }
  COL = { Black: '#151514', White: '#e9e7e1', Oak: '#b08a5e', Walnut: '#5b3f2c', Silver: '#a3a3a0' };
  MAT = { White: '#f4f2ec', Ivory: '#e6dfcc', Black: '#1a1a19' };
  wallRef = React.createRef();
  state = { sel: null, full: false, wall: { w: 964, h: 560 }, candTab: 'best', dragging: null, toast: '', tOp: 0 };
  componentDidUpdate(pp) { if (pp.printsKey !== this.props.printsKey && !this.state.dragging) { this.state = { ...this.state, prints: this.props.prints }; this.__update(); } }
  applyDeep(d) { if (!d || this.props.guest || !String(d.what || '').startsWith('guests')) return; window.__framesDeep = null; const t = String(d.what).split(':')[1]; this.setState({ gOpen: true, gSee: null, ...(t ? { gTab: t } : {}) }); }
  componentDidMount() {
    this.onDeep = (ev) => this.applyDeep(ev.detail); window.addEventListener('frames-deep', this.onDeep); this.applyDeep(window.__framesDeep);
    this.ro = new ResizeObserver(() => this.measure()); if (this.wallRef.current) this.ro.observe(this.wallRef.current); this.measure();
    this.onKey = (e) => { if (e.key === 'Escape' && this.state.full) this.setFull(false); };
    this.onFs = () => { if (!document.fullscreenElement && this.state.full === 'native') this.setState({ full: false }); };
    window.addEventListener('keydown', this.onKey); document.addEventListener('fullscreenchange', this.onFs);
  }
  componentWillUnmount() { window.removeEventListener('frames-deep', this.onDeep); this.ro && this.ro.disconnect(); window.removeEventListener('keydown', this.onKey); document.removeEventListener('fullscreenchange', this.onFs); this.endDrag(); clearTimeout(this.tT); }
  measure() { const el = this.wallRef.current; if (!el) return; const w = el.offsetWidth, h = el.offsetHeight; if (w && (w !== this.state.wall.w || h !== this.state.wall.h)) this.setState({ wall: { w, h } }); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 1800); }
  setFull(on) {
    if (on) { const el = this.wallRef.current; const p = el && el.requestFullscreen ? el.requestFullscreen() : null; if (p && p.then) p.then(() => this.setState({ full: 'native' })).catch(() => { this.setState({ full: 'overlay' }); window.scrollTo(0, 0); }); else { this.setState({ full: 'overlay' }); window.scrollTo(0, 0); } }
    else { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); this.setState({ full: false }); }
  }
  scale() { const { w, h } = this.state.wall; return Math.max(1, Math.min(w / 330, h / 180)); }
  dims(p) { let [w, h] = this.SIZES[p.size]; let [fw, fh] = this.SIZES[p.framed ? p.frame : p.size]; if (p.or === 'L') { [w, h] = [h, w]; [fw, fh] = [fh, fw]; } const b = p.framed ? 2 : 0; return { pw: w, ph: h, fw, fh, ow: fw + 2 * b, oh: fh + 2 * b, b }; }
  bg(p) { let [pw, ph] = this.SIZES[p.size]; if (p.or === 'L') [pw, ph] = [ph, pw]; const [W, H] = this.px(p.photo); const z = Math.round((p.zoom || 1) * 100); const sz = W / H > pw / ph ? 'auto ' + z + '%' : z + '% auto'; return `url(${this.props.photoUrl(p.photo)}) ${50 + (p.sx || 0)}% ${50 + (p.sy || 0)}% / ${sz} no-repeat`; }
  upd(id, patch) { this.setState((s) => ({ prints: (s.prints ?? this.pr()).map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) })); this.save(); }
  endDrag() { window.removeEventListener('pointermove', this.mv); window.removeEventListener('pointerup', this.up); }
  startDrag(e, p) {
    if (e.button !== 0) return; e.stopPropagation();
    const el = this.wallRef.current; const z = el ? el.getBoundingClientRect().width / el.offsetWidth : 1; const s = this.scale();
    const d = this.dims(p); const { w, h } = this.state.wall; const mx = (w / s - d.ow) / 2 - 2, my = (h / s - d.oh) / 2 - 6;
    const st = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    this.setState({ sel: p.id, sizeMenu: false });
    this.mv = (ev) => { const dx = (ev.clientX - st.sx) / (s * z), dy = (ev.clientY - st.sy) / (s * z); if (!st.moved && Math.abs(dx) + Math.abs(dy) < 1) return; st.moved = true; if (this.state.dragging !== p.id) this.setState({ dragging: p.id }); this.upd(p.id, { x: Math.round(Math.max(-mx, Math.min(mx, st.ox + dx))), y: Math.round(Math.max(-my, Math.min(my, st.oy + dy))) }); };
    this.up = () => { this.endDrag(); this.setState({ dragging: null }); this.save(); };
    window.addEventListener('pointermove', this.mv); window.addEventListener('pointerup', this.up);
  }
  place(n, id) {
    this.setState((s) => { const target = (s.prints ?? this.pr()).find((p) => p.id === id); if (!target) return null; const old = target.photo; return { sel: id, prints: (s.prints ?? this.pr()).map((p) => (p.id === id ? { ...p, photo: n } : p.photo === n ? { ...p, photo: old } : p)) }; });
    this.save();
    this.flash(this.ph(n)[0] + ' → Print ' + (this.pr().findIndex((p) => p.id === id) + 1));
  }
  wallVals() {
    const S = this.state; const s = this.scale(); const { w: W, h: H } = S.wall; const px = (v) => Math.round(v * s) + 'px';
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const prints = this.pr().map((p, i) => {
      const d = this.dims(p); minX = Math.min(minX, p.x - d.ow / 2); maxX = Math.max(maxX, p.x + d.ow / 2); minY = Math.min(minY, p.y - d.oh / 2); maxY = Math.max(maxY, p.y + d.oh / 2);
      const on = S.sel === p.id; const mx = (d.fw - d.pw) / 2, my = (d.fh - d.ph) / 2;
      return {
        left: Math.round(W / 2 + (p.x - d.ow / 2) * s) + 'px', top: Math.round(H / 2 + (p.y - d.oh / 2) * s) + 'px', w: px(d.ow), h: px(d.oh), pad: px(d.b),
        frameBg: p.framed ? this.COL[p.colour] : 'transparent', matBg: p.framed && p.mat !== 'None' ? this.MAT[p.mat] : 'transparent', matPad: px(my) + ' ' + px(mx),
        img: p.photo ? this.bg(p) : 'rgba(0,0,0,.22)', empty: p.photo ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)', emptyLabel: p.photo ? '' : 'Drop a candidate here',
        shadow: S.dragging === p.id ? '0 18px 40px rgba(0,0,0,.55)' : '0 6px 16px rgba(0,0,0,.4)', outline: on ? '2px solid #efede8' : '2px solid transparent', cursor: S.dragging === p.id ? 'grabbing' : 'grab', trans: S.dragging ? 'box-shadow .15s' : 'left .25s, top .25s, width .25s, height .25s, box-shadow .15s',
        label: 'Print ' + (i + 1) + ' · ' + p.size + (p.or === 'L' ? ' landscape' : ''),
        sub: (p.framed ? p.frame + ' frame' : 'no frame') + (p.photo ? ' · ' : ''),
        ...(() => { if (!p.photo) return { ppi: '', ppiFg: '#8f8c86' }; const v = this.ppiFor(p.photo, p.size, p.or, p.zoom); return v >= 300 ? { ppi: v + ' PPI', ppiFg: '#8f8c86' } : { ppi: '⚠ ' + v + ' PPI', ppiFg: 'oklch(0.72 0.16 28)' }; })(), labelFg: on ? '#efede8' : '#a8a59f',
        down: (e) => this.startDrag(e, p), drop: (e) => { e.preventDefault(); const n = +e.dataTransfer.getData('text/plain'); if (n) this.place(n, p.id); },
      };
    });
    const spanW = this.pr().length ? ((maxX - minX) / 100).toFixed(1) : '0', spanH = this.pr().length ? ((maxY - minY) / 100).toFixed(1) : '0';
    const counts = {}; this.pr().forEach((p) => { counts[p.size] = (counts[p.size] || 0) + 1; });
    const sizes = Object.entries(counts).map(([k, n]) => (n > 1 ? n + ' × ' + k : k)).join(' + ');
    const isFull = !!S.full; const overlay = S.full === 'overlay';
    const sp = this.pr().find((p) => p.id === S.sel); let popLeft = '0px', popTop = '0px';
    if (sp) { const d = this.dims(sp); const l = W / 2 + (sp.x - d.ow / 2) * s, r = W / 2 + (sp.x + d.ow / 2) * s, t = H / 2 + (sp.y - d.oh / 2) * s; const PW = 280, PH = 470; const right = r + 24 + PW <= W - 12 && (sp.x <= 0 || l - 24 - PW < 12); popLeft = Math.round(right ? r + 24 : Math.max(12, l - 24 - PW)) + 'px'; popTop = Math.round(Math.max(60, Math.min(H - PH - 12, t))) + 'px'; }
    const empty = this.pr().filter((p) => !p.photo).length;
    return {
      popShow: isFull && !!sp, popLeft, popTop, stopDown: (e) => e.stopPropagation(), deselect: () => this.setState({ sel: null }),
      prints, allowDrop: (e) => e.preventDefault(), wallRef: this.wallRef, gridSize: px(10) + ' ' + px(10),
      wallDown: () => this.setState({ sel: null, sizeMenu: false }),
      wallPos: overlay ? 'fixed' : 'absolute', wallZ: overlay ? 80 : 1, wallRadius: overlay ? '0' : '8px',
      isFull, fullLabel: isFull ? 'Exit fullscreen · Esc' : 'Fullscreen', toggleFull: () => this.setFull(!isFull),
      compName: this.props.name, compMeta: (sizes || 'No prints') + ' · ' + spanW + ' × ' + spanH + ' m', spanLabel: 'spans ' + spanW + ' × ' + spanH + ' m',
      addPrint: () => { const id = Math.max(0, ...this.pr().map((p) => p.id)) + 1; const xs = this.pr().map((p) => p.x + this.dims(p).ow / 2); const x = xs.length ? Math.min(Math.max(...xs) + 30, 130) : 0; this.setState({ prints: [...this.pr(), { id, x, y: 0, size: 'A3', or: 'P', photo: null, framed: true, colour: 'Black', frame: 'A3', mat: 'None' }], sel: id }); this.save(); this.flash('Print added · drag it into place'); },
      tidy: () => { const ps = [...this.pr()].sort((a, b) => a.x - b.x); const gap = 8; const total = ps.reduce((t, p) => t + this.dims(p).ow, 0) + gap * (ps.length - 1); let cur = -total / 2; const pos = {}; ps.forEach((p) => { const w = this.dims(p).ow; pos[p.id] = Math.round(cur + w / 2); cur += w + gap; }); this.setState({ prints: this.pr().map((p) => ({ ...p, x: pos[p.id], y: 0 })) }); this.save(); this.flash('Lined up · 8 cm apart, centred'); },
      exportLabel: empty ? 'Export · ' + empty + (empty === 1 ? ' print empty' : ' prints empty') : 'Export ' + this.pr().length + ' prints', exportBg: empty ? 'rgba(239,237,232,.35)' : '#efede8',
      exportGo: () => { if (empty) { this.flash('Fill every print before exporting'); return; } this.flash('Exporting originals'); this.props.onExport(); },
    };
  }
  selVals() {
    const S = this.state; const p = this.pr().find((x) => x.id === S.sel); const idx = this.pr().findIndex((x) => x.id === S.sel);
    if (!p) return { hasSel: false, noSel: true, framed: false };
    const rank = (k) => this.area(k); const set = (patch) => this.upd(p.id, patch); const menu = S.sizeMenu;
    const d = this.dims(p); const ph = p.photo ? this.ph(p.photo) : null; const cr = p.photo ? this.crop(p.photo, p.size, p.or, p.zoom) : null; const sharp = !ph || cr.ppi >= 300; const upTo = ph ? [...this.ORDER].reverse().find((k) => this.ppiFor(p.photo, k, p.or) >= 300) || 'none' : '';
    return {
      hasSel: true, noSel: false,
      cropZoom: Math.round((p.zoom || 1) * 100), cropZoomLabel: Math.round((p.zoom || 1) * 100) + '%', cropX: p.sx || 0, cropY: p.sy || 0, cropOff: !p.photo, cropOp: p.photo ? 1 : 0.4,
      onZoom: (e) => set({ zoom: +e.target.value / 100 }), onCropX: (e) => set({ sx: +e.target.value }), onCropY: (e) => set({ sy: +e.target.value }), cropReset: () => set({ zoom: 1, sx: 0, sy: 0 }), cropChanged: !!((p.zoom && p.zoom !== 1) || p.sx || p.sy),
      ...(() => { if (!p.photo) return { cropPpi: '—', cropPpiFg: '#8f8c86', cropPpiSub: 'Place a photo to crop it', cropBar: '0%', cropBarBg: 'rgba(255,255,255,.2)' }; const v = this.ppiFor(p.photo, p.size, p.or, p.zoom), base = this.ppiFor(p.photo, p.size, p.or, 1); const ok = v >= 300; return { cropPpi: (ok ? '' : '⚠ ') + v + ' PPI', cropPpiFg: ok ? '#efede8' : 'oklch(0.75 0.14 28)', cropPpiSub: (p.zoom && p.zoom !== 1 ? 'was ' + base + ' at 100% · ' : '') + (ok ? 'sharp at ' + p.size : 'below 300 · may look soft at ' + p.size), cropBar: Math.min(100, Math.round(v / Math.max(base, 300) * 100)) + '%', cropBarBg: ok ? '#efede8' : 'oklch(0.7 0.16 28)' }; })(), selTitle: 'Print ' + (idx + 1), selStatus: p.photo ? 'filled' : 'empty',
      selThumb: p.photo ? `url(${this.props.photoUrl(p.photo)}) center/cover` : 'rgba(0,0,0,.25)', selHasPhoto: !!p.photo,
      selPhotoHint: p.photo ? ph[0] + ' · score ' + ph[2].toFixed(1) + '. Click a candidate below to swap.' : 'Click a candidate below, or drag one onto the print.',
      clearPhoto: () => set({ photo: null, zoom: 1, sx: 0, sy: 0 }),
      printSize: p.size, printMenuOpen: menu === 'print', togglePrintMenu: () => this.setState({ sizeMenu: menu === 'print' ? false : 'print' }),
      printGroups: this.GROUPS.map(([name, ks]) => ({ name, sizes: ks.map((k) => { const on = p.size === k; const soft = ph && this.ppiFor(p.photo, k, p.or) < 300; const [w, h] = this.SIZES[k]; return { label: k, note: on ? '✓' : soft ? 'soft' : Math.round(w) + ' × ' + Math.round(h) + ' cm', fg: soft ? '#8f8c86' : '#efede8', bg: on ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => { this.setState({ sizeMenu: false }); set((q) => { const fr = this.fits(q.frame, k) ? q.frame : k; return { size: k, frame: fr, mat: fr === k ? 'None' : q.mat === 'None' ? 'White' : q.mat }; }); } }; }) })),
      orientOpts: [['P', 'Portrait', '9px', '12px'], ['L', 'Landscape', '12px', '9px']].map(([k, label, iw, ih]) => ({ label, iw, ih, bg: p.or === k ? '#efede8' : 'transparent', fg: p.or === k ? '#0d0d0d' : '#a8a59f', pick: () => set({ or: k }) })),
      framed: p.framed, frameLabel: p.framed ? 'Framed' : 'No frame', frameTrack: p.framed ? '#efede8' : 'rgba(255,255,255,.14)', frameKnob: p.framed ? '21px' : '3px', frameKnobBg: p.framed ? '#0d0d0d' : '#a8a59f',
      toggleFrame: () => set({ framed: !p.framed }),
      frameColours: Object.entries(this.COL).map(([name, bg]) => ({ name, bg, ring: p.colour === name ? '0 0 0 2px #161615,0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.12)', pick: () => set({ colour: name }) })),
      frameSize: p.frame, sizeMenuOpen: menu === 'frame', toggleSizeMenu: () => this.setState({ sizeMenu: menu === 'frame' ? false : 'frame' }),
      frameGroups: this.GROUPS.map(([name, ks]) => ({ name, sizes: ks.map((k) => { const small = !this.fits(k, p.size); const exact = k === p.size; return { label: k, note: k === p.frame ? '✓' : small ? 'too small' : exact ? 'no mat' : 'with a mat', fg: small ? '#5c5a56' : '#efede8', bg: k === p.frame ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => { if (small) return; this.setState({ sizeMenu: false }); set({ frame: k, mat: exact ? 'None' : p.mat === 'None' ? 'White' : p.mat }); } }; }) })),
      mats: ['None', 'White', 'Ivory', 'Black'].map((x) => { const exact = p.frame === p.size; const off = exact ? x !== 'None' : x === 'None'; const on = p.mat === x; return { label: x, bg: on ? '#efede8' : 'transparent', fg: on ? '#0d0d0d' : off ? '#4a4845' : '#a8a59f', pick: () => { if (!off) set({ mat: x }); } }; }),
      frameSummary: !p.framed ? `Print only, ${d.pw} × ${d.ph} cm, edge to edge on the wall.` : p.mat === 'None' ? `${p.colour} ${p.frame} frame, no mat · outside ${d.ow.toFixed(0)} × ${d.oh.toFixed(0)} cm` : `${p.colour} ${p.frame} frame, ${p.mat.toLowerCase()} mat around the ${p.size} print · outside ${d.ow.toFixed(0)} × ${d.oh.toFixed(0)} cm`,
      sharpLine: !ph ? 'Sharpness: pick a photo first' : (sharp ? '' : '⚠ ') + `${cr.ppi} PPI at ${p.size} after cropping` + (sharp ? '' : ` · sharp up to ${upTo}`), sharpFg: sharp ? '#8f8c86' : 'oklch(0.78 0.11 35)',
      sharpSub: !ph ? '' : `Uses ${cr.cw} × ${cr.ch} of ${this.px(p.photo)[0]} × ${this.px(p.photo)[1]} px` + (cr.cut ? ` · ${cr.cut}% cropped to fit` : ' · no crop') + (sharp ? '' : ` · looks sharp from ${(0.85 * 300 / cr.ppi).toFixed(1)} m away`),
      removePrint: () => { const rest = this.pr().filter((x) => x.id !== p.id); this.setState({ prints: rest, sel: rest.length ? rest[Math.max(0, idx - 1)].id : null }); this.save(); this.flash('Print ' + (idx + 1) + ' removed'); },
    };
  }
  candVals() {
    const S = this.state; const sel = this.pr().find((x) => x.id === S.sel); const rank = (k) => this.area(k);
    const order = this.props.order || []; const unrated = this.props.unrated || [];
    const fits = (n) => !sel || this.ppiFor(n, sel.size, sel.or) >= 300;
    const lists = { best: order, fits: order.filter(fits), unrated };
    const used = {}; this.pr().forEach((p, i) => { if (p.photo) used[p.photo] = i + 1; });
    return {
      candTabs: [['best', 'Best first'], ['fits', sel ? 'Fits ' + sel.size : 'Fits'], ['unrated', 'Unrated']].map(([k, l]) => ({ label: l + ' · ' + lists[k].length, bg: S.candTab === k ? 'rgba(255,255,255,.1)' : 'transparent', fg: S.candTab === k ? '#efede8' : '#a8a59f', go: () => this.setState({ candTab: k }) })),
      candHint: sel ? 'Click a photo to put it in Print ' + (this.pr().indexOf(sel) + 1) + '. If it’s already on the wall, the two swap.' : 'Select a print on the wall, then click a photo to fill it.',
      cands: lists[S.candTab].map((n) => { const u = used[n]; const ok = fits(n); return { src: this.props.photoUrl(n), score: this.ph(n)[2].toFixed(1), name: this.ph(n)[0], tag: u ? 'Print ' + u : ok ? 'Fits' : 'Too small', tagBg: u ? '#efede8' : 'rgba(0,0,0,.62)', tagFg: u ? '#0d0d0d' : ok ? '#efede8' : 'oklch(0.78 0.11 35)', ring: u ? 'inset 0 0 0 1px #efede8' : 'none', popRing: sel && sel.photo === n ? '0 0 0 2px #1a1a19,0 0 0 3px #efede8' : 'none', popOp: ok ? 1 : 0.4, use: () => { if (sel) this.place(n, sel.id); else this.flash('Select a print first'); }, drag: (e) => { e.dataTransfer.setData('text/plain', String(n)); e.dataTransfer.effectAllowed = 'copy'; } }; }),
    };
  }
  shareVals() {
    const S = this.state, P = this.props; const H = P.share || { active: false };
    const tog = (on) => ({ track: on ? '#efede8' : 'rgba(255,255,255,.14)', knob: on ? '21px' : '3px', knobBg: on ? '#0d0d0d' : '#a8a59f' });
    const nm = tog(H.askName), pw = tog(!!H.pin);
    const pin4 = () => { let p; do { p = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (/^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)); return p; };
    const email = S.shEmailText || ''; const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
    const send = async () => { if (!okEmail) return; try { await P.onInvite(email.trim()); this.setState({ shEmailText: '' }); this.flash('Link sent to ' + email.trim()); } catch (e) { this.flash(e.message || 'Could not send'); } };
    const patch = (b) => P.onSharePatch(b);
    return {
      shOpen: !!S.shOpen, openSh: () => this.setState({ shOpen: true, gOpen: false }), closeSh: () => this.setState({ shOpen: false, shCopied: false }),
      shPreview: () => { if (H.url) window.open(H.url, '_blank', 'noopener'); }, shActive: !!H.active, shInactive: !H.active, shStart: () => P.onShareStart(),
      shLink: H.display || '', shLinkBg: S.shFresh ? 'rgba(239,237,232,.12)' : '#0d0d0d',
      shCopyLabel: S.shCopied ? 'Copied ✓' : 'Copy link', shCopy: async () => { try { await navigator.clipboard.writeText(H.url); } catch (e) { window.prompt('Copy this', H.url); } this.setState({ shCopied: true }); },
      shLinkNote: H.active ? 'Expires ' + H.expLabel + (H.pin ? ' · PIN ' + H.pin : '') : '',
      shRegen: async () => { await P.onShareRegen(); this.setState({ shCopied: false, shFresh: true }); clearTimeout(this.fT); this.fT = setTimeout(() => this.setState({ shFresh: false }), 900); this.flash('New link made · the old one stops working'); },
      shPerms: [['rate', 'Rate photos', 'allowReview'], ['suggest', 'Suggest changes', 'allowSuggest'], ['dl', 'Download files', 'allowDownload']].map(([k, l, f]) => ({ label: (H[f] ? '✓ ' : '') + l, bg: H[f] ? 'rgba(255,255,255,.12)' : 'transparent', fg: H[f] ? '#efede8' : '#8f8c86', ring: H[f] ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.16)', go: () => patch({ [f]: !H[f] }) })),
      shShow: [['All candidates', false], ['Only the wall', true]].map(([l, v]) => ({ label: l, bg: !!H.onlyWall === v ? '#efede8' : 'transparent', fg: !!H.onlyWall === v ? '#0d0d0d' : '#a8a59f', go: () => patch({ onlyWall: v }) })),
      shExp: ['1 week', '3 weeks', '3 months', 'Never'].map((l) => ({ label: l, bg: H.expOpt === l ? '#efede8' : 'transparent', fg: H.expOpt === l ? '#0d0d0d' : '#a8a59f', go: () => P.onShareExpiry(l) })),
      shNameTrack: nm.track, shNameKnob: nm.knob, shNameKnobBg: nm.knobBg, shNameTog: () => patch({ askName: !H.askName }),
      shPw: !!H.pin, shPwTrack: pw.track, shPwKnob: pw.knob, shPwKnobBg: pw.knobBg, shPwTog: () => patch({ pin: H.pin ? '' : pin4() }), shPwVal: H.pin || '', shOnPw: (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length === 4) patch({ pin: v }); },
      shPwNew: () => { patch({ pin: pin4() }); this.setState({ pinCopied: false }); }, shPwCopyLabel: S.pinCopied ? 'Copied ✓' : 'Copy', shPwCopy: async () => { try { await navigator.clipboard.writeText(H.pin); } catch (e) {} this.setState({ pinCopied: true }); },
      shEmail: email, shOnEmail: (e) => this.setState({ shEmailText: e.target.value }), shEmailKey: (e) => { if (e.key === 'Enter') send(); }, shSend: send, shSendOp: okEmail && H.canEmail !== false ? 1 : 0.4,
      shSent: (H.invites || []).map((i) => ({ email: i.email, state: i.status === 'failed' ? 'failed' : 'sent', remove: () => P.onRemoveInvite(i.email) })),
      shStop: async () => { if (!H.active) return; await P.onShareStop(); this.flash('Sharing stopped · the link no longer works'); }, shStopOp: H.active ? 1 : 0.35,
      shBtnMeta: H.active ? '· on' : '', shSummary: H.active ? 'Shared · link expires ' + H.expLabel : 'Not shared right now',
    };
  }
  guestVals() {
    const S = this.state, P = this.props; const G = P.guests || { changes: [], people: [] };
    const tab = S.gTab || 'changes'; const off = S.gOff || [];
    const ch = G.changes.find((c) => c.id === S.gSee) || G.changes[0]; const view = S.gView || 'theirs'; const theirs = view === 'theirs';
    const pending = G.changes.length;
    return {
      gOpen: !!S.gOpen, openG: () => this.setState({ gOpen: true }), closeG: () => this.setState({ gOpen: false, gSee: null }), stop: (e) => e.stopPropagation(), gToShare: () => this.setState({ gOpen: false, shOpen: true }),
      gBadge: String(pending), gIsRatings: tab === 'ratings' && !S.gSee, gSeeing: tab === 'changes' && !!S.gSee && !!ch, gListChanges: tab === 'changes' && !S.gSee,
      seeWall: ch ? (theirs ? ch.theirs : ch.mine) : [], seeInitial: ch ? ch.initial : '', seeWho: ch ? ch.who : '', seeWhat: ch ? ch.what : '',
      seeApprove: async () => { await ch.approve(); this.setState({ gSee: null }); }, seeDeny: async () => { await ch.deny(); this.setState({ gSee: null }); }, backG: () => this.setState({ gSee: null }),
      seeTabs: [['mine', 'Current'], ['theirs', (ch ? ch.who : '') + '’s version']].map(([k, label]) => ({ label, bg: view === k ? '#efede8' : 'transparent', fg: view === k ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ gView: k }) })),
      gTabs: [['changes', 'Suggested changes · ' + pending], ['ratings', 'Ratings · ' + G.people.length + (G.people.length === 1 ? ' guest' : ' guests')]].map(([k, label]) => ({ label, fg: tab === k ? '#efede8' : '#8f8c86', line: tab === k ? '2px solid #efede8' : '2px solid transparent', go: () => this.setState({ gTab: k }) })),
      gChanges: G.changes.map((c) => ({ initial: c.initial, who: c.who, what: c.what, count: c.what.includes(' · ') ? 'changes' : 'a change', from: c.from, to: c.to, pending: true, resolved: false, status: '', see: () => this.setState({ gSee: c.id, gView: 'theirs' }), op: 1, undo: () => undefined, approve: c.approve, deny: c.deny })),
      gPeople: G.people.map((q) => { const on = !off.includes(q.name); return { name: q.name, initial: q.initial, when: q.when, pct: q.pct + '%', rated: q.pct + '%', avg: q.avg, tick: on ? '✓' : '', boxBg: on ? '#efede8' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.3)', toggle: () => this.setState({ gOff: on ? [...off, q.name] : off.filter((x) => x !== q.name) }) }; }),
    };
  }
  /** The guest's version against the photographer's: what they changed, as the lines the send window lists. */
  guestModeVals() {
    const S = this.state, P = this.props; const guest = !!P.guest;
    const base = P.basePrints || []; const cur = this.pr(); const ch = [];
    cur.forEach((p, i) => {
      const o = base.find((x) => x.id === p.id); const n = 'Print ' + (i + 1);
      if (!o) { ch.push(['Added', n + (p.photo ? ' · ' + this.ph(p.photo)[0] : '')]); return; }
      if (o.photo !== p.photo) ch.push(['Photo', n + ' → ' + (p.photo ? this.ph(p.photo)[0] : 'empty')]);
      if (o.framed !== p.framed || o.colour !== p.colour || o.frame !== p.frame || o.mat !== p.mat) ch.push(['Frame', n + ' · ' + (p.framed ? [p.colour, p.frame + ' frame', p.mat && p.mat !== 'None' ? p.mat.toLowerCase() + ' mat' : ''].filter(Boolean).join(', ') : 'no frame')]);
      if (o.size !== p.size || o.or !== p.or) ch.push(['Size', n + ' · ' + p.size + (p.or === 'L' ? ' landscape' : ' portrait')]);
      if (o.x !== p.x || o.y !== p.y) ch.push(['Moved', n]);
    });
    base.forEach((o) => { if (!cur.some((p) => p.id === o.id)) ch.push(['Removed', 'A print']); });
    const moved = ch.filter((c) => c[0] === 'Moved').length; const list = [...ch.filter((c) => c[0] !== 'Moved'), ...(moved ? [['Layout', moved + (moved === 1 ? ' print moved' : ' prints moved')]] : [])];
    const n = list.length; const sd = S.sendState; const owner = P.owner || 'them';
    return {
      isGuest: guest, isHost: !guest,
      gSteps: [['✓ 1 Rate', 'done'], ['2 Try changes', S.sentOnce ? 'done' : 'cur'], [(S.sentOnce ? '✓ ' : '') + '3 Send to ' + owner, S.sentOnce ? 'cur' : 'todo']].map(([label, st], i) => ({ label, bg: st === 'cur' ? 'rgba(255,255,255,.08)' : 'transparent', fg: st === 'todo' ? '#8f8c86' : '#efede8', arrow: i < 2 ? 'inline' : 'none' })),
      gChangeN: String(n), gChangeShow: n ? 'inline' : 'none', gDiscardOp: n ? 1 : 0.35, gDiscard: () => { if (n) { this.state = { ...this.state, prints: base }; this.__update(); this.flash('Back to ' + owner + '’s version'); } },
      sendOpen: !!sd, sendForm: sd === 'form', sendDone: sd === 'done', openSend: () => this.setState({ sendState: 'form' }), closeSend: () => this.setState({ sendState: null }),
      sendSub: n ? n + (n === 1 ? ' change' : ' changes') + ' to ' + P.name : 'No changes. ' + owner + ' will see you’re happy with their version.',
      sendList: (n ? list : [['', 'Looks good as it is']]).map(([what, text], i, a) => ({ what, text, border: i < a.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' })),
      sendNote: S.sendNote || '', onSendNote: (e) => this.setState({ sendNote: e.target.value }), sendLabel: n ? 'Send my version' : 'Send “looks good”',
      doSend: async () => { try { await P.onSend(S.sendNote || ''); this.setState({ sendState: 'done', sentOnce: true }); } catch (e) { this.flash(e.message || 'Could not send'); } },
    };
  }
  renderVals() {
    const P = this.props;
    return { ...this.guestModeVals(), ...this.wallVals(), ...this.selVals(), ...this.candVals(), ...this.shareVals(), ...this.guestVals(), delOpen: !!this.state.delOpen, openDel: () => this.setState({ delOpen: true }), closeDel: () => this.setState({ delOpen: false }), confirmDel: async () => { this.setState({ delOpen: false }); await P.onDelete(); }, toast: this.state.toast || '', toastOp: this.state.tOp || 0 };
  }
}
