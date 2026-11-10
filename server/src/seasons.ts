/**
 * Seasons from a date and a hemisphere. Northern: Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov autumn; southern is flipped.
 * The hemisphere comes from the country (Settings, Profile) unless the person chose one; near the equator Auto shows no seasons.
 */
export type Seasons = 'auto' | 'north' | 'south' | 'off';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

const SOUTH = ['Australia', 'New Zealand', 'South Africa', 'Argentina', 'Brazil', 'Chile', 'Uruguay', 'Paraguay', 'Peru', 'Bolivia', 'Madagascar', 'Mozambique', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia', 'Lesotho', 'Eswatini', 'Fiji', 'Samoa', 'Tonga', 'Mauritius'];
/** Within about 10 degrees of the equator: there is no useful winter, so Auto shows no seasons. */
const EQUATOR = ['Indonesia', 'Ecuador', 'Kenya', 'Singapore', 'Malaysia', 'Colombia', 'Uganda', 'Gabon', 'Congo', 'Somalia', 'Sri Lanka', 'Maldives', 'Papua New Guinea', 'Venezuela', 'Guyana', 'Suriname', 'Nigeria', 'Ghana', 'Ethiopia', 'Tanzania', 'Thailand', 'Philippines', 'Vietnam', 'Cambodia', 'Brunei', 'Panama', 'Costa Rica', 'Ivory Coast', 'Cameroon', 'Rwanda', 'Burundi'];
export const COUNTRIES_SOUTH = SOUTH;
export const COUNTRIES_EQUATOR = EQUATOR;

export function hemisphere(country: string, seasons: Seasons): 'north' | 'south' | 'none' {
  if (seasons === 'off') return 'none';
  if (seasons === 'north' || seasons === 'south') return seasons;
  const c = country.trim().toLowerCase();
  if (!c) return 'north';
  if (EQUATOR.some((e) => e.toLowerCase() === c)) return 'none';
  return SOUTH.some((s) => s.toLowerCase() === c) ? 'south' : 'north';
}

/** The season for a calendar month (1-12) in a hemisphere. */
export function seasonOf(month: number, h: 'north' | 'south'): Season {
  const north: Season = month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn';
  if (h === 'north') return north;
  return ({ winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' } as const)[north];
}
/** The months (1-12) that are this season, for a search filter. */
export const monthsOf = (s: Season, h: 'north' | 'south'): number[] => Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => seasonOf(m, h) === s);
