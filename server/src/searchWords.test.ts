import { describe, expect, it } from 'vitest';
import { searchWords } from './searchWords.js';

describe('search query tokenisation', () => {
  it('ignores interior connectors and their article while preserving standalone words', () => {
    expect(searchWords('Milky Way at the Cape Schanck')).toEqual(['milky', 'way', 'cape', 'schanck']);
    expect(searchWords('birds in London')).toEqual(['birds', 'london']);
    expect(searchWords('birds near the beach')).toEqual(['birds', 'beach']);
    expect(searchWords('at')).toEqual(['at']);
    expect(searchWords('at the')).toEqual(['at', 'the']);
    expect(searchWords('atlantis')).toEqual(['atlantis']);
    expect(searchWords('birds at')).toEqual(['birds', 'at']);
  });

  it('handles long whitespace runs with and without a connector', () => {
    const spaces = ' '.repeat(100_000);
    expect(searchWords(`milky${spaces}way${spaces}cape`)).toEqual(['milky', 'way', 'cape']);
    expect(searchWords(`birds${spaces}at${spaces}the${spaces}beach`)).toEqual(['birds', 'beach']);
    expect(searchWords(spaces)).toEqual([]);
    expect(searchWords('birds\tnear\n the\r\nbeach')).toEqual(['birds', 'beach']);
  });
});
