import { expect, it } from 'vitest';
import { AI_COLOURS, aiTint, tintedChip } from './aiColours';

it('uses the origin provider tint only while its identifier is known', () => {
  const sources = [{ id: 'ollama', name: 'Ollama', color: '#e7b76d' }, { id: 'claude', name: 'Claude', color: '#a6c5aa' }];
  expect(aiTint('ollama', sources)).toBe('#e7b76d');
  expect(aiTint('claude', sources)).toBe('#a6c5aa');
  expect(aiTint('old-provider', sources)).toBe('');
  expect(aiTint(undefined, sources)).toBe('');
  expect(tintedChip(aiTint(undefined, sources)).background).toBe('transparent');
  expect(tintedChip('#a6c5aa').background).toContain('#a6c5aa');
});

it('offers the eight colours in the issue mockup', () => {
  expect(AI_COLOURS).toHaveLength(8);
  expect(AI_COLOURS[0]).toEqual({ name: 'Default grey', value: '' });
});
