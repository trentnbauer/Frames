import { describe, expect, it, vi } from 'vitest';
import { envBool } from './env.js';

describe('on/off environment variables', () => {
  it('read true and false, in any case and with stray spaces', () => {
    for (const v of ['true', 'TRUE', ' True ']) expect(envBool('X', false, { X: v })).toBe(true);
    for (const v of ['false', 'FALSE', ' False ']) expect(envBool('X', true, { X: v })).toBe(false);
  });
  it('also understand the spellings people reach for', () => {
    for (const v of ['1', 'yes', 'on']) expect(envBool('X', false, { X: v })).toBe(true);
    for (const v of ['0', 'no', 'off']) expect(envBool('X', true, { X: v })).toBe(false);
  });
  it('treat empty or missing as the default, whichever way that goes', () => {
    expect(envBool('X', true, {})).toBe(true);
    expect(envBool('X', false, {})).toBe(false);
    expect(envBool('X', true, { X: '' })).toBe(true);
    expect(envBool('X', false, { X: '  ' })).toBe(false);
  });
  it('does not guess at a typo: it warns and uses the default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(envBool('AUTH_DISABLE', false, { AUTH_DISABLE: 'ture' })).toBe(false);
      expect(envBool('ALLOW_SIGNUPS', true, { ALLOW_SIGNUPS: 'flase' })).toBe(true);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/AUTH_DISABLE="ture" is not true or false/);
    } finally { warn.mockRestore(); }
  });
});
