import { imgUrl } from '../api';
import type { Collection } from '../data';
import { FRAMES, MATS, PAD, frameOf, rectsIn } from '../layout';

/** A composition's wall, small: the grid background, its prints with frames, mats and photographs (the design's wall tile). */
export function MiniWall({ c, height = 150 }: { c: Pick<Collection, 'layout'>; height?: number }) {
  const prints = c.layout?.prints ?? [];
  const f = prints.length ? frameOf(prints, PAD) : null;
  return (
    <div aria-hidden style={{ position: 'relative', width: '100%', height, borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--wall-bg)', backgroundImage: 'linear-gradient(var(--wall-grid) 1px,transparent 1px),linear-gradient(90deg,var(--wall-grid) 1px,transparent 1px)', backgroundSize: '18px 18px', display: 'grid', placeItems: 'center' }}>
      {f && (
        <div style={{ position: 'relative', height: '100%', maxWidth: '100%', aspectRatio: String(f.W / f.H) }}>
          {rectsIn(prints, f).map((r, i) => {
            const p = prints[i], fr = p.frame, photo = p.photoId;
            return (
              <div key={p.id} style={{ position: 'absolute', ...r, background: fr && fr.color !== 'none' ? FRAMES[fr.color] : 'transparent', padding: fr && fr.color !== 'none' ? 3 : 0, boxSizing: 'border-box', boxShadow: '0 4px 10px rgba(0,0,0,.35)' }}>
                <div style={{ width: '100%', height: '100%', background: fr ? MATS[fr.mat] : 'transparent', padding: fr && fr.size !== p.size ? '8%' : 0, boxSizing: 'border-box' }}>
                  <div style={{ width: '100%', height: '100%', background: photo ? `url(${imgUrl(photo, 'thumb')}) center/cover` : 'rgba(0,0,0,.18)', boxShadow: photo ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
