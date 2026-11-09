/** Trailing and leading characters removed by plain loops, so long input from the network cannot make a regular expression slow. */
export const trimEnd = (s: string, chars: string): string => { let n = s.length; while (n > 0 && chars.includes(s[n - 1])) n--; return s.slice(0, n); };
export const trimStart = (s: string, chars: string): string => { let i = 0; while (i < s.length && chars.includes(s[i])) i++; return s.slice(i); };
