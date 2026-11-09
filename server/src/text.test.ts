import { describe, expect, it } from 'vitest';
import { trimEnd, trimStart } from './text.js';
import { openSystemDb, uniqueFolder } from './users.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('trimming without regular expressions', () => {
  it('removes only the given characters from the end or start', () => {
    expect(trimEnd('https://x.test///', '/')).toBe('https://x.test');
    expect(trimEnd('abc', '/')).toBe('abc');
    expect(trimEnd('////', '/')).toBe('');
    expect(trimStart('-._a-b', '-._')).toBe('a-b');
  });

  it('stay fast on very long input', () => {
    const t = Date.now();
    trimEnd('/'.repeat(200_000) + 'x' + '/'.repeat(200_000), '/');
    expect(Date.now() - t).toBeLessThan(500);
  });

  it('still make a safe folder name from an email', () => {
    const sys = openSystemDb(fs.mkdtempSync(path.join(os.tmpdir(), 'frames-txt-')));
    expect(uniqueFolder(sys, '..Jane.Doe--@x.test', '')).toBe('jane.doe');
    expect(uniqueFolder(sys, '---@x.test', '')).toBe('user');
  });
});
