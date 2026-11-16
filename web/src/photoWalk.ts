/**
 * The photographs the arrows on the photo page step through when a photograph is opened from a list (search results, or the Library with
 * its filters): exactly that list, in that order. Kept for the browser tab, so a reload still steps through the same ones.
 */
const KEY = 'frames.photoWalk';

export function setPhotoWalk(ids: number[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(ids.slice(0, 5000))); } catch { /* storage blocked: the arrows stay in the shoot */ }
}

export function getPhotoWalk(): number[] | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(ids) && ids.every((i) => typeof i === 'number') ? (ids as number[]) : null;
  } catch { return null; }
}
