import { describe, expect, it } from 'vitest';
import { parseMb, parseSize, showMb, showSize } from './size';

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

describe('file size limits', () => {
  it('reads MB and GB, at least 1 MB', () => {
    expect(parseMb('500')).toBe(500);
    expect(parseMb('500 MB')).toBe(500);
    expect(parseMb('2 GB')).toBe(2048);
    expect(parseMb('1.5g')).toBe(1536);
    for (const bad of ['', '0', 'abc', '-3', '0.2 MB']) expect(parseMb(bad)).toBeNull();
  });
  it('shows them back', () => {
    expect(showMb(2048)).toBe('2 GB');
    expect(showMb(1536)).toBe('1536 MB');
    expect(showMb(500)).toBe('500 MB');
  });
});
