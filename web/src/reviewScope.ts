/** Keep an explicit selection, including an empty one, separate from a library review. */
export function reviewUrl(photoIds: number[]) {
  return `/review?ids=${photoIds.join(',')}`;
}

export function reviewRequest(search: string) {
  const q = new URLSearchParams(search);
  if (q.has('ids')) return { photoIds: (q.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) };
  return { early: q.has('early') };
}
