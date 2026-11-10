export type Hemisphere = 'north' | 'south' | 'none';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
/** Northern: Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov autumn; southern is flipped. */
export function seasonOf(month: number, h: 'north' | 'south'): Season {
  const north: Season = month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn';
  return h === 'north' ? north : ({ winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' } as const)[north];
}
