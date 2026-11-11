/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Library.dc.html. Behaviour is the spec; the data comes in through props.
import { DCLogic } from './runtime';
import { addShortcuts } from '../components/shortcuts';

/**
 * props:
 *  groupsFor(by)   -> [{ key, name, meta, ids: number[] }]   (by: 'shoot' | 'uploaded' | 'taken'; already filtered and ordered)
 *  photoOf(id)     -> { src, ar, badge }                      (badge: '' or 'In 2')
 *  shoots          -> [{ id, name, meta, src }]               (for "Existing shoot")
 *  comps, onCompDone(ids, names|null, newName)               (composition picker)
 *  onMove(ids, { mode: 'new'|'existing', name, shootId }) / onDelete(ids, mode) / onPortfolio(ids) / onReview(ids) / onOpenPhoto(id) / onSearch()
 */
export class Logic extends DCLogic {
  state = { selMode: false, picked: [], mv: null, cm: null, del: null, delMode: 'frames', sortBy: 'shoot', toast: '', tOp: 0 };
  componentDidMount() { this.offKeys = addShortcuts(() => [
    { key: 'a', label: 'Add photos', run: () => this.props.onAddPhotos(), off: !this.props.canAdd || this.state.selMode },
    { key: 's', label: 'Select photos', run: () => this.setState({ selMode: !this.state.selMode, picked: this.state.selMode ? [] : this.state.picked }) },
  ]); }
  componentWillUnmount() { this.offKeys?.(); clearTimeout(this.tT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const by = S.sortBy;
    const sel = S.selMode;
    const n = S.picked.length;
    const photo = (id) => P.photoOf(id);
    const pick = (id) => this.setState((s) => ({ selMode: true, picked: s.picked.includes(id) ? s.picked.filter((x) => x !== id) : [...s.picked, id] }));
    const groups = (P.groupsFor(by) ?? []).filter((gr) => gr.ids.length).map((gr) => {
      const all = gr.ids.every((id) => S.picked.includes(id));
      return {
        name: gr.name, meta: gr.meta, selAllLabel: all ? 'Deselect all' : 'Select all',
        selAll: () => this.setState((s) => ({ selMode: true, picked: all ? s.picked.filter((x) => !gr.ids.includes(x)) : [...new Set([...s.picked, ...gr.ids])] })),
        photos: gr.ids.map((id) => {
          const p = photo(id); const on = S.picked.includes(id);
          return { src: p.src, ar: p.ar, flex: p.ar + ' ' + p.ar + ' ' + Math.round(p.ar * 190) + 'px', go: '', click: () => { if (sel) pick(id); else P.onOpenPhoto && P.onOpenPhoto(id); }, tickShow: sel ? 'block' : 'none', tick: on ? 'var(--text)' : 'rgba(0,0,0,.35)', mark: on ? '✓' : '', outline: on ? '2px solid var(--text)' : 'none', badge: p.badge || '', badgeShow: p.badge ? 'block' : 'none' };
        }),
      };
    });
    const thumbs = S.picked.slice(0, 3).map((id) => photo(id).src);
    const M = S.mv || { mode: 'new', name: '', q: '', target: null };
    const setMv = (p) => this.setState((s) => ({ mv: { ...(s.mv || M), ...p } }));
    const q = M.q.trim().toLowerCase();
    const ph = 'New shoot';
    const ok = M.mode === 'new' || M.target != null;
    const dm = S.delMode;
    return {
      groups, countLabel: P.countLabel, toggleFilters: P.onToggleFilters, filterCount: (P.chips || []).length, clearAll: P.onClear, showAdd: P.canAdd && !sel, cantAdd: !P.canAdd, addPhotos: P.onAddPhotos,
      sortOpts: [['shoot', 'Photoshoot'], ['uploaded', 'Uploaded'], ['taken', 'Date taken']].map(([k, label]) => ({ label, bg: by === k ? 'var(--text)' : 'transparent', fg: by === k ? 'var(--bg)' : 'var(--text2)', go: () => this.setState({ sortBy: k }) })),
      selBtnLabel: sel ? 'Done' : 'Select', selBtnBg: sel ? 'var(--text)' : 'transparent', selBtnFg: sel ? 'var(--bg)' : 'var(--text)', selBtnRing: sel ? 'none' : 'inset 0 0 0 1px var(--outline)',
      toggleSel: () => this.setState({ selMode: !sel, picked: sel ? [] : S.picked }),
      selMode: sel, actOp: n ? 1 : 0.4, actPe: n ? 'auto' : 'none', pickedLabel: n + ' selected', pickedN: n, mvThumbs: thumbs,
      review: () => P.onReview && P.onReview(S.picked),
      openEdit: () => P.onEditDetails && P.onEditDetails(S.picked),
      addPf: async () => { await P.onPortfolio(S.picked); this.setState({ picked: [], selMode: false }); this.flash(n + (n === 1 ? ' photo' : ' photos') + ' added to your portfolio'); },
      openMove: () => this.setState({ mv: { mode: 'existing', name: '', q: '', target: null } }),
      mvOpen: !!S.mv, closeMv: () => this.setState({ mv: null }), stopMv: (e) => e.stopPropagation(),
      mvTitle: 'Move ' + n + (n === 1 ? ' photo' : ' photos'), mvSub: 'From ' + (P.fromLabel ? P.fromLabel(S.picked) : 'the library'),
      mvModes: [['new', 'New shoot'], ['existing', 'Existing shoot']].map(([k, label]) => ({ label, bg: M.mode === k ? 'var(--text)' : 'transparent', fg: M.mode === k ? 'var(--bg)' : 'var(--text2)', go: () => setMv({ mode: k }) })),
      mvIsNew: M.mode === 'new', mvIsExisting: M.mode === 'existing', mvName: M.name, mvOnName: (e) => setMv({ name: e.target.value }), mvPh: ph, mvQ: M.q, mvOnQ: (e) => setMv({ q: e.target.value }),
      mvList: (P.shoots ?? []).filter((s) => !q || s.name.toLowerCase().includes(q)).map((s) => ({ name: s.name, meta: s.meta, src: s.src, bg: M.target === s.id ? 'var(--hover)' : 'transparent', tick: M.target === s.id ? '✓' : '', pick: () => setMv({ target: s.id }) })),
      mvGoOp: ok ? 1 : 0.4, mvGoLabel: M.mode === 'new' ? 'Create shoot and move' : 'Move ' + n + (n === 1 ? ' photo' : ' photos'),
      mvGo: async () => {
        if (!ok) return;
        const dest = await P.onMove(S.picked, { mode: M.mode, name: M.name.trim(), shootId: M.target });
        this.setState({ mv: null, picked: [], selMode: false });
        this.flash((M.mode === 'new' ? 'Created “' + dest + '” · ' : 'Moved to “' + dest + '” · ') + n + (n === 1 ? ' photo' : ' photos'));
      },
      cmOpen: !!S.cm, openComp: () => this.setState({ cm: true }), closeCm: () => this.setState({ cm: null }),
      compPicker: S.cm ? P.renderCompPicker(S.picked, () => this.setState({ cm: null }), (msg) => { this.setState({ cm: null, picked: [], selMode: false }); this.flash(msg); }) : null,
      delOpen: !!S.del, openDel: () => this.setState({ del: true, delMode: 'frames' }), closeDel: () => this.setState({ del: false }),
      delTitle: 'Delete ' + n + (n === 1 ? ' photo?' : ' photos?'), delSub: 'Their ratings, tags and places in compositions go too.',
      delOpts: [['frames', 'Remove from Frames', 'Originals stay on disk. You can import them again.'], ['trash', 'Also move the originals to the trash', 'Includes RAW files and XMP sidecars']].map(([k, label, hint]) => ({ label, hint, bg: dm === k ? 'var(--hover)' : 'transparent', ring: dm === k ? 'inset 0 0 0 1px color-mix(in srgb, var(--text) 16%, transparent)' : 'none', dot: dm === k ? 'inset 0 0 0 5px var(--text)' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 30%, transparent)', pick: () => this.setState({ delMode: k }) })),
      delLabel: dm === 'trash' ? 'Delete and trash files' : 'Delete ' + n + (n === 1 ? ' photo' : ' photos'),
      confirmDel: async () => { await P.onDelete(S.picked, dm); this.setState({ del: false, picked: [], selMode: false }); this.flash(n + (n === 1 ? ' photo' : ' photos') + (dm === 'trash' ? ' deleted · originals in the trash' : ' removed from Frames · originals kept')); },
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
