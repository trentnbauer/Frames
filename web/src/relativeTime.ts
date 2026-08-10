export function relativeTime(isoDate: string): string {
  const then = new Date(isoDate.replace(' ', 'T') + 'Z').getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;
  const diffMonth = Math.round(diffDay / 30);
  return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;
}
