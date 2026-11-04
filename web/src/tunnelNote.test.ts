import { describe, expect, it } from 'vitest';
import { tunnelNote } from './tunnelNote';

describe('the note about the Cloudflare tunnel after an address changes', () => {
  it('says nothing when the tunnel was not involved', () => {
    expect(tunnelNote(null)).toBe('');
    expect(tunnelNote(undefined)).toBe('');
    expect(tunnelNote({ updated: false })).toBe('');
  });
  it('says the tunnel was updated, and whether Cloudflare itself was too', () => {
    expect(tunnelNote({ updated: true, applied: true })).toMatch(/tunnel was updated to match/);
    expect(tunnelNote({ updated: true, applied: false })).toMatch(/address list was updated to match/);
  });
  it('passes on what Cloudflare said when it would not take the update', () => {
    expect(tunnelNote({ updated: true, applied: false, error: 'Cloudflare said: Authentication error' })).toMatch(/would not take it yet: Cloudflare said: Authentication error/);
  });
});
