import { imgUrl } from '../api';
import type { Collection } from '../data';
import { FRAMES, MATS, or, chosenIn } from '../layout';

/** The miniature wall the design draws for a composition: its prints at one scale (px per mm, held back so the row fits in `maxW`), with frames, mats and photographs. */
export function miniWall(c: Collection, k = 0.2, maxW = 340) {
  const prints = c.layout.prints;
  const totalW = prints.reduce((n, p) => n + or(p.size, p.orientation)[0], 0);
  const scale = Math.min(k, maxW / Math.max(totalW, 1));
  return prints.map((p) => {
    const [w, h] = or(p.size, p.orientation);
    const fr = p.frame;
    return {
      w: `${Math.round(w * scale)}px`, h: `${Math.round(h * scale)}px`, frame: fr && fr.color !== 'none' ? FRAMES[fr.color] : 'transparent', mat: fr ? MATS[fr.mat] : 'transparent',
      matPad: fr && fr.size !== p.size ? `${Math.max(3, Math.round(scale * 30))}px` : '0',
      img: p.photoId ? `url(${imgUrl(p.photoId, 'thumb')}) center/cover` : 'rgba(0,0,0,.18)', empty: p.photoId ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)',
    };
  });
}

/** "3 × A3", "A2 + 2 × A5". */
export const printsSummary = (c: Collection) => {
  const sizes = new Map<string, number>();
  c.layout.prints.forEach((p) => sizes.set(p.size, (sizes.get(p.size) ?? 0) + 1));
  return [...sizes].map(([s, n]) => (n > 1 ? `${n} × ${s}` : s)).join(' + ');
};

export const slotsOf = (c: Collection) => c.layout.prints.reduce((n, p) => n + (p.stack ? 2 : 1), 0);
export const isReady = (c: Collection) => c.stage === 'done';
export const chosenCount = (c: Collection) => chosenIn(c.layout.prints).length;
