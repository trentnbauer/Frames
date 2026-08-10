import { describe, expect, it } from 'vitest';
import { parseTagsFromText } from './parseTags.js';

describe('parseTagsFromText', () => {
  it('parses a clean JSON array', () => {
    expect(parseTagsFromText('["neon", "signage"]')).toEqual(['neon', 'signage']);
  });

  it('strips markdown code fences', () => {
    expect(parseTagsFromText('```json\n["neon", "wet-pavement"]\n```')).toEqual(['neon', 'wet-pavement']);
  });

  it('lowercases and trims each tag', () => {
    expect(parseTagsFromText('[" Neon ", "SIGNAGE"]')).toEqual(['neon', 'signage']);
  });

  it('extracts a JSON array embedded in surrounding prose', () => {
    expect(parseTagsFromText('Sure, here are the tags: ["neon", "night"] — hope that helps!')).toEqual(['neon', 'night']);
  });

  it('drops non-string and empty entries', () => {
    expect(parseTagsFromText('["neon", 42, "", "  "]')).toEqual(['neon']);
  });

  it('returns an empty array for unparseable garbage', () => {
    expect(parseTagsFromText('I cannot help with that.')).toEqual([]);
  });

  it('leniently pulls the inner array out of a {"tags": [...]} wrapper', () => {
    expect(parseTagsFromText('{"tags": ["neon"]}')).toEqual(['neon']);
  });
});
