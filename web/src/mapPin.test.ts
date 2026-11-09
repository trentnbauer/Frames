import { describe, expect, it } from 'vitest';
import { project, unproject } from './components/MapPin';

describe('map projection', () => {
  it('round-trips a point and puts the equator and prime meridian at the middle', () => {
    const p = project(-38.15, 144.36, 10);
    const q = unproject(p.x, p.y, 10);
    expect(q.lat).toBeCloseTo(-38.15, 5);
    expect(q.lon).toBeCloseTo(144.36, 5);
    expect(project(0, 0, 2)).toEqual({ x: 512, y: 512 });
  });
});
