import { describe, expect, it } from 'vitest';
import { ppiAt, sharpSizes } from './components/NewComposition';
import { duration } from './screens/Home';
import type { Print } from './layout';
import { deviceOf } from './data';
import { taskTotals } from './todoTasks';

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

describe('phone fixes', () => {
  it('names a device instead of showing the raw browser string', () => {
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceOf('')).toBe('Device not recorded');
  });
  it('counts every photograph missing a thing, not just the ones it is first in line for', () => {
    const t = taskTotals([{ key: 'place', count: 1285 }, { key: 'camera', count: 20 }, { key: 'lens', count: 24 }, { key: 'orphaned', count: 7 }, { key: 'unknown', count: 3 }]);
    expect(t).toEqual({ location: 1285, camera: 24, orphaned: 7 });
  });
});
