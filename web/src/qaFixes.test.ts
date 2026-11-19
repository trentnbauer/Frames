import { describe, expect, it } from 'vitest';
import { ppiAt, sharpSizes } from './components/NewComposition';
import { duration } from './screens/Home';
import type { Print } from './layout';

const print = (size: string): Print => ({ id: 1, size, orientation: 'portrait', frame: null, photoId: null, stack: false, photoId2: null, x: 0, y: 0 }) as Print;

describe('default print sizes', () => {
  it('are lowered to what the sharpest photograph can fill', () => {
    // 4000 x 6000 px is 342 PPI at A3 but only 256 at A2.
    expect(ppiAt(4000, 6000, 'A3')).toBeGreaterThan(300);
    expect(ppiAt(4000, 6000, 'A2')).toBeLessThan(300);
    expect(sharpSizes([print('A2'), print('A5')], [{ w: 6000, h: 4000 }]).map((p) => p.size)).toEqual(['A3', 'A5']);
  });
  it('leave a pool that is sharp enough, and sizes that are not A-series, alone', () => {
    expect(sharpSizes([print('A3'), print('8×10″')], [{ w: 9000, h: 6000 }]).map((p) => p.size)).toEqual(['A3', '8×10″']);
  });
});

describe('duration', () => {
  it('says hours once it is long', () => {
    expect([duration(1), duration(12), duration(253)]).toEqual(['1 minute', '12 minutes', '4 hours']);
  });
});
