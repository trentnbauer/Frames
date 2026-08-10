import { describe, expect, it } from 'vitest';
import { slugify } from './types.js';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Neon Signage')).toBe('neon-signage');
  });

  it('strips leading/trailing whitespace and punctuation', () => {
    expect(slugify('  Wet Pavement!! ')).toBe('wet-pavement');
  });

  it('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(slugify('cast---shadow / not paint')).toBe('cast-shadow-not-paint');
  });

  it('returns an empty string for input with no alphanumerics', () => {
    expect(slugify('!!!')).toBe('');
  });
});
