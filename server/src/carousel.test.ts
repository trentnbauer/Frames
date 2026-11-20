import { expect, it } from 'vitest';
import { zipOf } from './carousel.js';

it('writes a zip that unzip can read', () => {
  const zip = zipOf([{ name: 'one.txt', data: Buffer.from('hello') }]);
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.subarray(30 + 7, 30 + 7 + 5).toString()).toBe('hello');
});
