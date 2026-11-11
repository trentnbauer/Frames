import { describe, expect, it } from 'vitest';
import { parseSize, showSize } from './size';

describe('storage sizes', () => {
  it('reads what a person types', () => {
    expect(parseSize('10')).toBe(10);
    expect(parseSize('2.5 GB')).toBe(2.5);
    expect(parseSize('500mb')).toBe(0.488);
    expect(parseSize('1 TB')).toBe(1024);
    expect(parseSize('1,5g')).toBe(1.5);
    for (const none of ['', '  ', 'none', 'No limit', '0']) expect(parseSize(none)).toBe(0);
    for (const bad of ['abc', '-5', '10 parsecs', '1.2.3']) expect(parseSize(bad)).toBeNull();
  });
  it('shows a size back', () => {
    expect(showSize(0)).toBe('');
    expect(showSize(10)).toBe('10 GB');
    expect(showSize(0.5)).toBe('512 MB');
    expect(showSize(2.5)).toBe('2.5 GB');
  });
});
