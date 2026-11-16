import { describe, expect, it } from 'vitest';
import { columnsAfterPinch, sizeAfterWheel, SIZE } from './thumbZoom';

describe('photograph size', () => {
  it('spreading two fingers means fewer, bigger columns, and pinching more, smaller ones', () => {
    expect(columnsAfterPinch(3, 1.5)).toBe(2);
    expect(columnsAfterPinch(3, 0.5)).toBe(6);
    expect(columnsAfterPinch(3, 1)).toBe(3);
  });
  it('stays between one and six columns', () => {
    expect(columnsAfterPinch(1, 4)).toBe(1);
    expect(columnsAfterPinch(6, 0.1)).toBe(6);
  });
  it('grows when the wheel goes up (a trackpad spread) and shrinks when it goes down, within limits', () => {
    expect(sizeAfterWheel(190, -10)).toBeGreaterThan(190);
    expect(sizeAfterWheel(190, 10)).toBeLessThan(190);
    expect(sizeAfterWheel(SIZE.max, -100)).toBe(SIZE.max);
    expect(sizeAfterWheel(SIZE.min, 100)).toBe(SIZE.min);
  });
});
