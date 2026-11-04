import { describe, expect, it } from 'vitest';
import { fuzzyNames, wordsOf } from './fuzzy';

describe('matching a composition name to subjects, tags and colours', () => {
  const known = ['bird', 'beach', 'street', 'golden hour', 'blue', 'quokka', 'city', 'harbour', 'sunset', 'people'];
  it('finds the singular for a plural, and ignores filler words', () => {
    expect(fuzzyNames('Birds at the Beach', known)).toEqual(['bird', 'beach']);
    expect(wordsOf('Birds at the Beach')).toEqual(['birds', 'beach']);
  });
  it('finds a plural known name for a singular title word, and y/ies', () => {
    expect(fuzzyNames('Quokka days', ['quokkas', 'days'])).toEqual(['quokkas', 'days']);
    expect(fuzzyNames('Cities by night', known)).toEqual(['city']);
  });
  it('matches a several-word name only when the whole of it is in the title', () => {
    expect(fuzzyNames('Golden Hour Walks', known)).toEqual(['golden hour']);
    expect(fuzzyNames('An hour of gold', known)).toEqual([]);
  });
  it('tolerates a one-letter slip in longer words, not in short ones', () => {
    expect(fuzzyNames('Harbor at sunsett', ['harbour', 'sunset'])).toEqual(['harbour', 'sunset']);
    expect(fuzzyNames('Beech trees', ['beach'])).toEqual([]); // six letters is the shortest it will guess at
  });
  it('matches a colour word, and nothing from an empty or filler-only title', () => {
    expect(fuzzyNames('Blue hour', known)).toEqual(['blue']);
    expect(fuzzyNames('', known)).toEqual([]);
    expect(fuzzyNames('At the', known)).toEqual([]);
  });
});
