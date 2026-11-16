import { expect, it } from 'vitest';
import { statusName } from './Imports';

it('shows import statuses as plain words', () => {
  expect(statusName('upload-failed')).toBe('Upload failed');
  expect(statusName('done')).toBe('Done');
  expect(statusName('needs_attention')).toBe('Needs attention');
  expect(statusName('')).toBe('');
});
