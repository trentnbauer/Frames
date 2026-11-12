/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Editor.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import React from 'react';
import { DCLogic } from './runtime';
import { HOME_VIEW } from '../components/wallView';


export class Logic extends DCLogic {
  SIZES = { A5: [14.8, 21], A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1], '5×7″': [12.7, 17.8], '8×10″': [20.3, 25.4], '11×14″': [27.9, 35.6], '16×20″': [40.6, 50.8], '50×70': [50, 70] };
  GROUPS = [['ISO paper', ['A5', 'A4', 'A3', 'A2', 'A1']], ['Photo & poster', ['5×7″', '8×10″', '11×14″', '16×20″', '50×70']]];
  ORDER = ['A5', '5×7″', '8×10″', 'A4', '11×14″', 'A3', '16×20″', 'A2', '50×70', 'A1'];
  ph(n) { return this.props.photoMeta(n); }
  px(n) { return this.props.photoDims(n); }
  pr() { return this.state.prints ?? this.props.prints ?? []; }
  save() { const ps = this.state.prints; if (ps && !this.state.dragging) this.props.onPrints(ps); }
  /** The space one photo fills, in cm: the whole print, or half of it when two photos share the print. */
  cellCm(size, or, stack) { let [w, h] = this.SIZES[size]; if (or === 'L') [w, h] = [h, w]; return stack ? (or === 'P' ? [w, h / 2] : [w / 2, h]) : [w, h]; }
  crop(n, size, or, z, stack) { z = z || 1; let [pw, ph] = this.cellCm(size, or, stack); const [W, H] = this.px(n); const pa = pw / ph; let [cw, ch] = W / H > pa ? [H * pa, H] : [W, W / pa]; cw /= z; ch /= z; return { ppi: Math.round(ch / (ph / 2.54)), cw: Math.round(cw), ch: Math.round(ch), cut: Math.round((1 - (cw * ch) / (W * H)) * 100) }; }
  ppiFor(n, size, or, z, stack) { return this.crop(n, size, or, z, stack).ppi; }
  held(p) { return [p.photo, p.stack ? p.photo2 : null]; }
  area(k) { const [w, h] = this.SIZES[k]; return w * h; }
  fits(frame, print) { const [fw, fh] = this.SIZES[frame], [pw, ph] = this.SIZES[print]; return fw >= pw && fh >= ph; }
  COL = { Black: '#151514', White: '#e9e7e1', Oak: '#b08a5e', Walnut: '#5b3f2c', Silver: '#a3a3a0' };
  MAT = { White: '#f4f2ec', Ivory: '#e6dfcc', Black: 'var(--raised)' };
  wallRef = React.createRef();
  state = { view: { ...HOME_VIEW }, shDraft: null, sel: null, full: false, wall: { w: 964, h: 560 }, candTab: 'best', dragging: null, toast: '', tOp: 0 };
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
  baseScale() { const { w, h } = this.state.wall; return Math.max(1, Math.min(w / 330, h / 180)); }
  scale() { return this.baseScale() * this.state.view.zoom; }
  cancelDrag() { this.endDrag(); if (this.dragOriginal) this.setState({ prints: this.dragOriginal, dragging: null }); this.dragOriginal = null; }
  dims(p) { let [w, h] = this.SIZES[p.size]; let [fw, fh] = this.SIZES[p.framed ? p.frame : p.size]; if (p.or === 'L') { [w, h] = [h, w]; [fw, fh] = [fh, fw]; } const b = p.framed ? 2 : 0; return { pw: w, ph: h, fw, fh, ow: fw + 2 * b, oh: fh + 2 * b, b }; }
  bg(p, n = p.photo) { const [pw, ph] = this.cellCm(p.size, p.or, p.stack); const [W, H] = this.px(n); const z = Math.round((p.stack ? 1 : p.zoom || 1) * 100); const sz = W / H > pw / ph ? 'auto ' + z + '%' : z + '% auto'; return `url(${this.props.photoUrl(n)}) ${50 + (p.stack ? 0 : p.sx || 0)}% ${50 + (p.stack ? 0 : p.sy || 0)}% / ${sz} no-repeat`; }
  upd(id, patch) { this.setState((s) => ({ prints: (s.prints ?? this.pr()).map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) })); this.save(); }
  endDrag() { window.removeEventListener('pointermove', this.mv); window.removeEventListener('pointerup', this.up); window.removeEventListener('pointercancel', this.cancel); }
  startDrag(e, p) {
    if (e.button !== 0) return; e.stopPropagation();
    const el = this.wallRef.current; const z = el ? el.getBoundingClientRect().width / el.offsetWidth : 1; const s = this.scale();
    const d = this.dims(p); const { w, h } = this.state.wall; const base = this.baseScale(); const mx = Math.max(0, (w / base - d.ow) / 2 - 2), my = Math.max(0, (h / base - d.oh) / 2 - 6);
    this.dragOriginal = this.pr();
    const st = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    this.setState({ sel: p.id, sizeMenu: false });
    this.mv = (ev) => { const dx = (ev.clientX - st.sx) / (s * z), dy = (ev.clientY - st.sy) / (s * z); if (!st.moved && Math.abs(dx) + Math.abs(dy) < 1) return; st.moved = true; if (this.state.dragging !== p.id) this.setState({ dragging: p.id }); this.upd(p.id, { x: Math.round(Math.max(-mx, Math.min(mx, st.ox + dx))), y: Math.round(Math.max(-my, Math.min(my, st.oy + dy))) }); };
    this.up = () => { this.endDrag(); this.setState({ dragging: null }); this.dragOriginal = null; this.save(); };
    this.cancel = () => this.cancelDrag();
    window.addEventListener('pointermove', this.mv); window.addEventListener('pointerup', this.up); window.addEventListener('pointercancel', this.cancel);
  }
  place(n, id, slot) {
    this.setState((s) => {
      const ps = (s.prints ?? this.pr()).map((p) => ({ ...p })); const target = ps.find((p) => p.id === id); if (!target) return null;
      const key = (slot ?? (target.stack && target.photo ? 1 : 0)) && target.stack ? 'photo2' : 'photo'; const old = target[key] ?? null;
      // A photo already on the wall (another print, or the other half of this one) swaps places with whatever was here.
      ps.forEach((p) => { for (const k of ['photo', 'photo2']) if ((k === 'photo' || p.stack) && p[k] === n && !(p === target && k === key)) p[k] = old; });
      target[key] = n; if (key === 'photo') { delete target.zoom; delete target.sx; delete target.sy; }
      return { sel: id, prints: ps };
    });
    this.save();
    this.flash(this.ph(n)[0] + ' → Print ' + (this.pr().findIndex((p) => p.id === id) + 1));
  }
  /** Which half of a two-photo print a drop landed on: the top or bottom of a portrait print, the left or right of a landscape one. */
  slotAt(e, p) { const r = e.currentTarget.getBoundingClientRect(); return (p.or === 'P' ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width) < 0.5 ? 0 : 1; }
  wallVals() {
    const S = this.state; const s = this.scale(); const { w: W, h: H } = S.wall; const px = (v) => Math.round(v * s) + 'px';
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const prints = this.pr().map((p, i) => {
      const d = this.dims(p); minX = Math.min(minX, p.x - d.ow / 2); maxX = Math.max(maxX, p.x + d.ow / 2); minY = Math.min(minY, p.y - d.oh / 2); maxY = Math.max(maxY, p.y + d.oh / 2);
      const on = S.sel === p.id; const mx = (d.fw - d.pw) / 2, my = (d.fh - d.ph) / 2;
      return {
        left: Math.round(W / 2 + S.view.x + (p.x - d.ow / 2) * s) + 'px', top: Math.round(H / 2 + S.view.y + (p.y - d.oh / 2) * s) + 'px', w: px(d.ow), h: px(d.oh), pad: px(d.b),
        frameBg: p.framed ? this.COL[p.colour] : 'transparent', matBg: p.framed && p.mat !== 'None' ? this.MAT[p.mat] : 'transparent', matPad: px(my) + ' ' + px(mx),
        cells: this.held(p).slice(0, p.stack ? 2 : 1).map((n, k) => ({ img: n ? this.bg(p, n) : 'rgba(0,0,0,.22)', empty: n ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)', emptyLabel: n ? '' : p.stack ? (p.or === 'P' ? ['Top', 'Bottom'] : ['Left', 'Right'])[k] : 'Drop a candidate here' })),
        dir: p.or === 'P' ? 'column' : 'row', gap: p.stack ? '2%' : '0', paper: p.stack ? '#fff' : 'transparent', slotsFull: this.held(p).slice(0, p.stack ? 2 : 1).every(Boolean),
        shadow: S.dragging === p.id ? '0 18px 40px rgba(0,0,0,.55)' : '0 6px 16px rgba(0,0,0,.4)', outline: on ? '2px solid var(--text)' : '2px solid transparent', cursor: S.dragging === p.id ? 'grabbing' : 'grab', trans: S.dragging ? 'box-shadow .15s' : 'left .25s, top .25s, width .25s, height .25s, box-shadow .15s',
        label: 'Print ' + (i + 1) + ' · ' + p.size + (p.or === 'L' ? ' landscape' : '') + (p.stack ? ' · two photos' : ''),
        sub: (p.framed ? p.frame + ' frame' : 'no frame') + (p.photo ? ' · ' : ''),
        ...(() => { if (!p.photo) return { ppi: '', ppiFg: 'var(--muted)' }; const v = Math.min(...this.held(p).filter(Boolean).map((n) => this.ppiFor(n, p.size, p.or, p.zoom, p.stack))); return v >= 300 ? { ppi: v + ' PPI', ppiFg: 'var(--muted)' } : { ppi: '⚠ ' + v + ' PPI', ppiFg: 'oklch(0.72 0.16 28)' }; })(), labelFg: on ? 'var(--text)' : 'var(--text2)',
        down: (e) => this.startDrag(e, p), drop: (e) => { e.preventDefault(); const n = +e.dataTransfer.getData('text/plain'); if (n) this.place(n, p.id, p.stack ? this.slotAt(e, p) : 0); },
      };
    });
    const spanW = this.pr().length ? ((maxX - minX) / 100).toFixed(1) : '0', spanH = this.pr().length ? ((maxY - minY) / 100).toFixed(1) : '0';
    const counts = {}; this.pr().forEach((p) => { counts[p.size] = (counts[p.size] || 0) + 1; });
    const sizes = Object.entries(counts).map(([k, n]) => (n > 1 ? n + ' × ' + k : k)).join(' + ');
    const isFull = !!S.full; const overlay = S.full === 'overlay';
    const sp = this.pr().find((p) => p.id === S.sel); let popLeft = '0px', popTop = '0px';
    if (sp) { const d = this.dims(sp); const l = W / 2 + (sp.x - d.ow / 2) * s, r = W / 2 + (sp.x + d.ow / 2) * s, t = H / 2 + (sp.y - d.oh / 2) * s; const PW = 280, PH = 470; const right = r + 24 + PW <= W - 12 && (sp.x <= 0 || l - 24 - PW < 12); popLeft = Math.round(right ? r + 24 : Math.max(12, l - 24 - PW)) + 'px'; popTop = Math.round(Math.max(60, Math.min(H - PH - 12, t))) + 'px'; }
    const empty = this.pr().filter((p) => !p.photo || (p.stack && !p.photo2)).length;
    return {
      popShow: isFull && !!sp, popLeft, popTop, stopDown: (e) => e.stopPropagation(), deselect: () => this.setState({ sel: null }),
      view: S.view, onView: (view) => this.setState({ view }), onPinchStart: () => this.cancelDrag(),
      gridPosition: `${W / 2 + S.view.x}px ${H / 2 + S.view.y}px`,
      prints, allowDrop: (e) => e.preventDefault(), wallRef: this.wallRef, gridSize: px(10) + ' ' + px(10),
      wallDown: () => this.setState({ sel: null, sizeMenu: false }),
      wallPos: overlay ? 'fixed' : 'absolute', wallZ: overlay ? 80 : 1, wallRadius: overlay ? '0' : '8px',
      isFull, fullLabel: isFull ? 'Exit fullscreen · Esc' : 'Fullscreen', toggleFull: () => this.setFull(!isFull),
      compName: this.props.name, compMeta: (sizes || 'No prints') + ' · ' + spanW + ' × ' + spanH + ' m', spanLabel: 'spans ' + spanW + ' × ' + spanH + ' m',
      addPrint: () => { const id = Math.max(0, ...this.pr().map((p) => p.id)) + 1; const xs = this.pr().map((p) => p.x + this.dims(p).ow / 2); const x = xs.length ? Math.min(Math.max(...xs) + 30, 130) : 0; this.setState({ prints: [...this.pr(), { id, x, y: 0, size: 'A3', or: 'P', photo: null, stack: false, photo2: null, framed: true, colour: 'Black', frame: 'A3', mat: 'None' }], sel: id }); this.save(); this.flash('Print added · drag it into place'); },
      tidy: () => { const ps = [...this.pr()].sort((a, b) => a.x - b.x); const gap = 8; const total = ps.reduce((t, p) => t + this.dims(p).ow, 0) + gap * (ps.length - 1); let cur = -total / 2; const pos = {}; ps.forEach((p) => { const w = this.dims(p).ow; pos[p.id] = Math.round(cur + w / 2); cur += w + gap; }); this.setState({ prints: this.pr().map((p) => ({ ...p, x: pos[p.id], y: 0 })) }); this.save(); this.flash('Lined up · 8 cm apart, centred'); },
      exportLabel: empty ? 'Export · ' + empty + (empty === 1 ? ' print empty' : ' prints empty') : 'Export ' + this.pr().length + ' prints', exportBg: empty ? 'rgba(239,237,232,.35)' : 'var(--text)',
      exportGo: () => { if (empty) { this.flash('Fill every print before exporting'); return; } this.flash('Exporting originals'); this.props.onExport(); },
    };
  }
  selVals() {
    const S = this.state; const p = this.pr().find((x) => x.id === S.sel); const idx = this.pr().findIndex((x) => x.id === S.sel);
    if (!p) return { hasSel: false, noSel: true, framed: false };
    const rank = (k) => this.area(k); const set = (patch) => this.upd(p.id, patch); const menu = S.sizeMenu;
    const d = this.dims(p); const wp = this.held(p).filter(Boolean).sort((x, y) => this.ppiFor(x, p.size, p.or, p.zoom, p.stack) - this.ppiFor(y, p.size, p.or, p.zoom, p.stack))[0] ?? null; const ph = wp ? this.ph(wp) : null; const cr = wp ? this.crop(wp, p.size, p.or, p.zoom, p.stack) : null; const sharp = !ph || cr.ppi >= 300; const upTo = ph ? [...this.ORDER].reverse().find((k) => this.ppiFor(wp, k, p.or, 1, p.stack) >= 300) || 'none' : '';
    return {
      hasSel: true, noSel: false,
      cropZoom: Math.round((p.zoom || 1) * 100), cropZoomLabel: Math.round((p.zoom || 1) * 100) + '%', cropX: p.sx || 0, cropY: p.sy || 0, cropOff: !p.photo || !!p.stack, cropOp: p.photo && !p.stack ? 1 : 0.4,
      onZoom: (e) => set({ zoom: +e.target.value / 100 }), onCropX: (e) => set({ sx: +e.target.value }), onCropY: (e) => set({ sy: +e.target.value }), cropReset: () => set({ zoom: 1, sx: 0, sy: 0 }), cropChanged: !!((p.zoom && p.zoom !== 1) || p.sx || p.sy),
      ...(() => { if (!wp) return { cropPpi: '—', cropPpiFg: 'var(--muted)', cropPpiSub: 'Place a photo to crop it', cropBar: '0%', cropBarBg: 'var(--outline)' }; const v = this.ppiFor(wp, p.size, p.or, p.zoom, p.stack), base = this.ppiFor(wp, p.size, p.or, 1, p.stack); const ok = v >= 300; return { cropPpi: (ok ? '' : '⚠ ') + v + ' PPI', cropPpiFg: ok ? 'var(--text)' : 'oklch(0.75 0.14 28)', cropPpiSub: (p.zoom && p.zoom !== 1 ? 'was ' + base + ' at 100% · ' : '') + (ok ? 'sharp at ' + p.size : 'below 300 · may look soft at ' + p.size), cropBar: Math.min(100, Math.round(v / Math.max(base, 300) * 100)) + '%', cropBarBg: ok ? 'var(--text)' : 'oklch(0.7 0.16 28)' }; })(), selTitle: 'Print ' + (idx + 1), selStatus: p.photo ? 'filled' : 'empty',
      selThumb: p.photo ? `url(${this.props.photoUrl(p.photo)}) center/cover` : 'rgba(0,0,0,.25)', selStack: !!p.stack, selThumb2: p.photo2 ? `url(${this.props.photoUrl(p.photo2)}) center/cover` : 'rgba(0,0,0,.25)', selHasPhoto: !!(p.photo || (p.stack && p.photo2)),
      selPhotoHint: p.stack ? (p.or === 'P' ? 'Two landscape photos, one above the other, with a white gap between.' : 'Two portrait photos, side by side, with a white gap between.') : '',
      stackOpts: [[false, 'One photo'], [true, 'Two photos']].map(([k, label]) => ({ label, bg: !!p.stack === k ? 'var(--text)' : 'transparent', fg: !!p.stack === k ? 'var(--bg)' : 'var(--text2)', pick: () => set(k ? { stack: true } : { stack: false, photo2: null }) })),
      clearPhoto: () => set({ photo: null, photo2: null, zoom: 1, sx: 0, sy: 0 }),
      printSize: p.size, printMenuOpen: menu === 'print', togglePrintMenu: () => this.setState({ sizeMenu: menu === 'print' ? false : 'print' }),
      printGroups: this.GROUPS.map(([name, ks]) => ({ name, sizes: ks.map((k) => { const on = p.size === k; const soft = ph && this.ppiFor(wp, k, p.or, 1, p.stack) < 300; const [w, h] = this.SIZES[k]; return { label: k, note: on ? '✓' : soft ? 'soft' : Math.round(w) + ' × ' + Math.round(h) + ' cm', fg: soft ? 'var(--muted)' : 'var(--text)', bg: on ? 'var(--hair)' : 'transparent', pick: () => { this.setState({ sizeMenu: false }); set((q) => { const fr = this.fits(q.frame, k) ? q.frame : k; return { size: k, frame: fr, mat: fr === k ? 'None' : q.mat === 'None' ? 'White' : q.mat }; }); } }; }) })),
      orientOpts: [['P', 'Portrait', '9px', '12px'], ['L', 'Landscape', '12px', '9px']].map(([k, label, iw, ih]) => ({ label, iw, ih, bg: p.or === k ? 'var(--text)' : 'transparent', fg: p.or === k ? 'var(--bg)' : 'var(--text2)', pick: () => set({ or: k }) })),
      framed: p.framed, frameLabel: p.framed ? 'Framed' : 'No frame', frameTrack: p.framed ? 'var(--text)' : 'color-mix(in srgb, var(--text) 14%, transparent)', frameKnob: p.framed ? '21px' : '3px', frameKnobBg: p.framed ? 'var(--bg)' : 'var(--text2)',
      toggleFrame: () => set({ framed: !p.framed }),
      frameColours: Object.entries(this.COL).map(([name, bg]) => ({ name, bg, ring: p.colour === name ? '0 0 0 2px var(--surface),0 0 0 4px var(--text)' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent)', pick: () => set({ colour: name }) })),
      frameSize: p.frame, sizeMenuOpen: menu === 'frame', toggleSizeMenu: () => this.setState({ sizeMenu: menu === 'frame' ? false : 'frame' }),
      frameGroups: this.GROUPS.map(([name, ks]) => ({ name, sizes: ks.map((k) => { const small = !this.fits(k, p.size); const exact = k === p.size; return { label: k, note: k === p.frame ? '✓' : small ? 'too small' : exact ? 'no mat' : 'with a mat', fg: small ? 'var(--disabled)' : 'var(--text)', bg: k === p.frame ? 'var(--hair)' : 'transparent', pick: () => { if (small) return; this.setState({ sizeMenu: false }); set({ frame: k, mat: exact ? 'None' : p.mat === 'None' ? 'White' : p.mat }); } }; }) })),
      mats: ['None', 'White', 'Ivory', 'Black'].map((x) => { const exact = p.frame === p.size; const off = exact ? x !== 'None' : x === 'None'; const on = p.mat === x; return { label: x, bg: on ? 'var(--text)' : 'transparent', fg: on ? 'var(--bg)' : off ? '#4a4845' : 'var(--text2)', pick: () => { if (!off) set({ mat: x }); } }; }),
      frameSummary: !p.framed ? `Print only, ${d.pw} × ${d.ph} cm, edge to edge on the wall.` : p.mat === 'None' ? `${p.colour} ${p.frame} frame, no mat · outside ${d.ow.toFixed(0)} × ${d.oh.toFixed(0)} cm` : `${p.colour} ${p.frame} frame, ${p.mat.toLowerCase()} mat around the ${p.size} print · outside ${d.ow.toFixed(0)} × ${d.oh.toFixed(0)} cm`,
      sharpLine: !ph ? 'Sharpness: pick a photo first' : (sharp ? '' : '⚠ ') + `${cr.ppi} PPI at ${p.size} after cropping` + (sharp ? '' : ` · sharp up to ${upTo}`), sharpFg: sharp ? 'var(--muted)' : 'oklch(0.78 0.11 35)',
      sharpSub: !ph ? '' : `Uses ${cr.cw} × ${cr.ch} of ${this.px(wp)[0]} × ${this.px(wp)[1]} px` + (cr.cut ? ` · ${cr.cut}% cropped to fit` : ' · no crop') + (sharp ? '' : ` · looks sharp from ${(0.85 * 300 / cr.ppi).toFixed(1)} m away`),
      removePrint: () => { const rest = this.pr().filter((x) => x.id !== p.id); this.setState({ prints: rest, sel: rest.length ? rest[Math.max(0, idx - 1)].id : null }); this.save(); this.flash('Print ' + (idx + 1) + ' removed'); },
    };
  }
  candVals() {
    const S = this.state; const sel = this.pr().find((x) => x.id === S.sel); const rank = (k) => this.area(k);
    const order = this.props.order || []; const unrated = this.props.unrated || [];
    const fits = (n) => !sel || this.ppiFor(n, sel.size, sel.or, 1, sel.stack) >= 300;
    const lists = { best: order, fits: order.filter(fits), unrated };
    const used = {}; this.pr().forEach((p, i) => { this.held(p).forEach((n) => { if (n) used[n] = i + 1; }); });
    return {
      candTabs: [['best', 'Best first'], ['fits', sel ? 'Fits ' + sel.size : 'Fits'], ['unrated', 'Unrated']].map(([k, l]) => ({ label: l + ' · ' + lists[k].length, bg: S.candTab === k ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'transparent', fg: S.candTab === k ? 'var(--text)' : 'var(--text2)', go: () => this.setState({ candTab: k }) })),
      candHint: sel ? 'Click a photo to put it in Print ' + (this.pr().indexOf(sel) + 1) + '. If it’s already on the wall, the two swap.' : 'Select a print on the wall, then click a photo to fill it.',
      cands: lists[S.candTab].map((n) => { const u = used[n]; const ok = fits(n); return { src: (this.props.photoThumb ?? this.props.photoUrl)(n), remove: !this.props.guest && this.props.onRemoveCandidate ? async () => { try { await this.props.onRemoveCandidate(n); } catch (e) { this.flash(e.message); } } : null, score: this.ph(n)[2].toFixed(1), name: this.ph(n)[0], tag: u ? 'Print ' + u : ok ? 'Fits' : 'Too small', tagBg: u ? 'var(--text)' : 'rgba(0,0,0,.62)', tagFg: u ? 'var(--bg)' : ok ? 'var(--text)' : 'oklch(0.78 0.11 35)', ring: u ? 'inset 0 0 0 1px var(--text)' : 'none', popRing: sel && this.held(sel).includes(n) ? '0 0 0 2px var(--raised),0 0 0 3px var(--text)' : 'none', popOp: ok ? 1 : 0.4, use: () => { if (sel) this.place(n, sel.id); else this.flash('Select a print first'); }, drag: (e) => { e.dataTransfer.setData('text/plain', String(n)); e.dataTransfer.effectAllowed = 'copy'; } }; }),
    };
  }
  shareVals() {
    const S = this.state, P = this.props; const H0 = P.share || { active: false };
    // Before a link exists the settings are a draft, kept here and sent when the link is created (the last step). With a link they change it at once.
    const D = { allowReview: true, allowSuggest: true, allowDownload: false, onlyWall: false, askName: true, pin: '', expOpt: '3 weeks', ...(S.shDraft || {}) };
    const H = H0.active ? H0 : { ...H0, ...D };
    const tog = (on) => ({ track: on ? 'var(--text)' : 'color-mix(in srgb, var(--text) 14%, transparent)', knob: on ? '21px' : '3px', knobBg: on ? 'var(--bg)' : 'var(--text2)' });
    const nm = tog(H.askName), pw = tog(!!H.pin);
    const pin4 = () => { let p; do { p = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (/^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)); return p; };
    const email = S.shEmailText || ''; const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
    const send = async () => { if (!okEmail) return; try { await P.onInvite(email.trim()); this.setState({ shEmailText: '' }); this.flash('Link sent to ' + email.trim()); } catch (e) { this.flash(e.message || 'Could not send'); } };
    const patch = (b) => (H0.active ? P.onSharePatch(b) : this.setState({ shDraft: { ...D, ...b } }));
    return {
      shOpen: !!S.shOpen, openSh: () => this.setState({ shOpen: true, gOpen: false }), closeSh: () => this.setState({ shOpen: false, shCopied: false }),
      shPreview: () => { if (H0.url) window.open(H0.url, '_blank', 'noopener'); }, shActive: !!H0.active, shInactive: !H0.active, shStart: async () => { await P.onShareStart(D); this.setState({ shDraft: null }); },
      shLink: H0.display || '', shLinkBg: S.shFresh ? 'rgba(239,237,232,.12)' : 'var(--bg)',
      shCopyLabel: S.shCopied ? 'Copied ✓' : 'Copy link', shCopy: async () => { try { await navigator.clipboard.writeText(H0.url); } catch (e) { window.prompt('Copy this', H0.url); } this.setState({ shCopied: true }); },
      shLinkNote: H0.active ? 'Expires ' + H0.expLabel + (H0.pin ? ' · PIN ' + H0.pin : '') : '',
      shRegen: async () => { await P.onShareRegen(); this.setState({ shCopied: false, shFresh: true }); clearTimeout(this.fT); this.fT = setTimeout(() => this.setState({ shFresh: false }), 900); this.flash('New link made · the old one stops working'); },
      shPerms: [['rate', 'Rate photos', 'allowReview'], ['suggest', 'Suggest changes', 'allowSuggest'], ['dl', 'Download files', 'allowDownload']].map(([k, l, f]) => ({ label: (H[f] ? '✓ ' : '') + l, bg: H[f] ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', fg: H[f] ? 'var(--text)' : 'var(--muted)', ring: H[f] ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 16%, transparent)', go: () => patch({ [f]: !H[f] }) })),
      shShow: [['All candidates', false], ['Only the wall', true]].map(([l, v]) => ({ label: l, bg: !!H.onlyWall === v ? 'var(--text)' : 'transparent', fg: !!H.onlyWall === v ? 'var(--bg)' : 'var(--text2)', go: () => patch({ onlyWall: v }) })),
      shExp: ['1 week', '3 weeks', '3 months', 'Never'].map((l) => ({ label: l, bg: H.expOpt === l ? 'var(--text)' : 'transparent', fg: H.expOpt === l ? 'var(--bg)' : 'var(--text2)', go: () => (H0.active ? P.onShareExpiry(l) : this.setState({ shDraft: { ...D, expOpt: l } })) })),
      shNameTrack: nm.track, shNameKnob: nm.knob, shNameKnobBg: nm.knobBg, shNameTog: () => patch({ askName: !H.askName }),
      shPw: !!H.pin, shPwTrack: pw.track, shPwKnob: pw.knob, shPwKnobBg: pw.knobBg, shPwTog: () => patch({ pin: H.pin ? '' : pin4() }), shPwVal: H.pin || '', shOnPw: (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length === 4) patch({ pin: v }); },
      shPwNew: () => { patch({ pin: pin4() }); this.setState({ pinCopied: false }); }, shPwCopyLabel: S.pinCopied ? 'Copied ✓' : 'Copy', shPwCopy: async () => { try { await navigator.clipboard.writeText(H.pin); } catch (e) {} this.setState({ pinCopied: true }); },
      shEmail: email, shOnEmail: (e) => this.setState({ shEmailText: e.target.value }), shEmailKey: (e) => { if (e.key === 'Enter') send(); }, shSend: send, shSendOp: okEmail && H0.canEmail !== false ? 1 : 0.4,
      shSent: (H0.invites || []).map((i) => ({ email: i.email, state: i.status === 'failed' ? 'failed' : 'sent', remove: () => P.onRemoveInvite(i.email) })),
      shStop: async () => { if (!H0.active) return; await P.onShareStop(); this.flash('Sharing stopped · the link no longer works'); }, shStopOp: H0.active ? 1 : 0.35,
      shBtnMeta: H0.active ? '· on' : '', shSummary: H0.active ? 'Shared · link expires ' + H0.expLabel : 'Not shared right now',
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
      seeTabs: [['mine', 'Current'], ['theirs', (ch ? ch.who : '') + '’s version']].map(([k, label]) => ({ label, bg: view === k ? 'var(--text)' : 'transparent', fg: view === k ? 'var(--bg)' : 'var(--text2)', go: () => this.setState({ gView: k }) })),
      gTabs: [['changes', 'Suggested changes · ' + pending], ['ratings', 'Ratings · ' + G.people.length + (G.people.length === 1 ? ' guest' : ' guests')]].map(([k, label]) => ({ label, fg: tab === k ? 'var(--text)' : 'var(--muted)', line: tab === k ? '2px solid var(--text)' : '2px solid transparent', go: () => this.setState({ gTab: k }) })),
      gChanges: G.changes.map((c) => ({ initial: c.initial, who: c.who, what: c.what, count: c.what.includes(' · ') ? 'changes' : 'a change', from: c.from, to: c.to, pending: true, resolved: false, status: '', see: () => this.setState({ gSee: c.id, gView: 'theirs' }), op: 1, undo: () => undefined, approve: c.approve, deny: c.deny })),
      gPeople: G.people.map((q) => { const on = !off.includes(q.name); return { name: q.name, initial: q.initial, when: q.when, pct: q.pct + '%', rated: q.pct + '%', avg: q.avg, tick: on ? '✓' : '', boxBg: on ? 'var(--text)' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 30%, transparent)', toggle: () => this.setState({ gOff: on ? [...off, q.name] : off.filter((x) => x !== q.name) }) }; }),
    };
  }
  /** The guest's version against the photographer's: what they changed, as the lines the send window lists. */
  guestModeVals() {
    const S = this.state, P = this.props; const guest = !!P.guest;
    const base = P.basePrints || []; const cur = this.pr(); const ch = [];
    cur.forEach((p, i) => {
      const o = base.find((x) => x.id === p.id); const n = 'Print ' + (i + 1);
      if (!o) { ch.push(['Added', n + (p.photo ? ' · ' + this.ph(p.photo)[0] : '')]); return; }
      if (o.photo !== p.photo || !!o.stack !== !!p.stack || (p.stack && o.photo2 !== p.photo2)) ch.push(['Photo', n + ' → ' + (p.photo ? this.ph(p.photo)[0] : 'empty') + (p.stack ? ' + ' + (p.photo2 ? this.ph(p.photo2)[0] : 'empty') : '')]);
      if (o.framed !== p.framed || o.colour !== p.colour || o.frame !== p.frame || o.mat !== p.mat) ch.push(['Frame', n + ' · ' + (p.framed ? [p.colour, p.frame + ' frame', p.mat && p.mat !== 'None' ? p.mat.toLowerCase() + ' mat' : ''].filter(Boolean).join(', ') : 'no frame')]);
      if (o.size !== p.size || o.or !== p.or) ch.push(['Size', n + ' · ' + p.size + (p.or === 'L' ? ' landscape' : ' portrait')]);
      if (o.x !== p.x || o.y !== p.y) ch.push(['Moved', n]);
    });
    base.forEach((o) => { if (!cur.some((p) => p.id === o.id)) ch.push(['Removed', 'A print']); });
    const moved = ch.filter((c) => c[0] === 'Moved').length; const list = [...ch.filter((c) => c[0] !== 'Moved'), ...(moved ? [['Layout', moved + (moved === 1 ? ' print moved' : ' prints moved')]] : [])];
    const n = list.length; const sd = S.sendState; const owner = P.owner || 'them';
    return {
      isGuest: guest, isHost: !guest,
      gSteps: [['✓ 1 Rate', 'done'], ['2 Try changes', S.sentOnce ? 'done' : 'cur'], [(S.sentOnce ? '✓ ' : '') + '3 Send to ' + owner, S.sentOnce ? 'cur' : 'todo']].map(([label, st], i) => ({ label, bg: st === 'cur' ? 'var(--hair)' : 'transparent', fg: st === 'todo' ? 'var(--muted)' : 'var(--text)', arrow: i < 2 ? 'inline' : 'none' })),
      gChangeN: String(n), gChangeShow: n ? 'inline' : 'none', gDiscardOp: n ? 1 : 0.35, gDiscard: () => { if (n) { this.state = { ...this.state, prints: base }; this.__update(); this.flash('Back to ' + owner + '’s version'); } },
      sendOpen: !!sd, sendForm: sd === 'form', sendDone: sd === 'done', openSend: () => this.setState({ sendState: 'form' }), closeSend: () => this.setState({ sendState: null }),
      sendSub: n ? n + (n === 1 ? ' change' : ' changes') + ' to ' + P.name : 'No changes. ' + owner + ' will see you’re happy with their version.',
      sendList: (n ? list : [['', 'Looks good as it is']]).map(([what, text], i, a) => ({ what, text, border: i < a.length - 1 ? '1px solid var(--hover)' : 'none' })),
      sendNote: S.sendNote || '', onSendNote: (e) => this.setState({ sendNote: e.target.value }), sendLabel: n ? 'Send my version' : 'Send “looks good”',
      doSend: async () => { try { await P.onSend(S.sendNote || ''); this.setState({ sendState: 'done', sentOnce: true }); } catch (e) { this.flash(e.message || 'Could not send'); } },
    };
  }
  renderVals() {
    const P = this.props;
    return { ...this.guestModeVals(), ...this.wallVals(), ...this.selVals(), ...this.candVals(), ...this.shareVals(), ...this.guestVals(), delOpen: !!this.state.delOpen, openDel: () => this.setState({ delOpen: true }), closeDel: () => this.setState({ delOpen: false }), confirmDel: async () => { this.setState({ delOpen: false }); await P.onDelete(); }, toast: this.state.toast || '', toastOp: this.state.tOp || 0 };
  }
}
