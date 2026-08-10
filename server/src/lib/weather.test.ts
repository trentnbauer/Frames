import { describe, expect, it } from 'vitest';
import { deriveLightConditions, type CurrentWeather } from './weather.js';

function weather(overrides: Partial<CurrentWeather>): CurrentWeather {
  return {
    temperatureC: 18,
    cloudCoverPct: 20,
    precipitationMm: 0,
    isDay: true,
    time: '2026-08-10T12:00',
    sunrise: '2026-08-10T07:00',
    sunset: '2026-08-10T18:00',
    ...overrides,
  };
}

describe('deriveLightConditions', () => {
  it('is night whenever the API says it is not daytime, regardless of clouds', () => {
    expect(deriveLightConditions(weather({ isDay: false, time: '2026-08-10T22:00' }))).toBe('night');
  });

  it('is golden_hour near sunset under clear skies', () => {
    expect(deriveLightConditions(weather({ time: '2026-08-10T17:50', cloudCoverPct: 10 }))).toBe('golden_hour');
  });

  it('is golden_hour near sunrise under clear skies', () => {
    expect(deriveLightConditions(weather({ time: '2026-08-10T07:10', cloudCoverPct: 15 }))).toBe('golden_hour');
  });

  it('is raking_sun near sunset with partial cloud', () => {
    expect(deriveLightConditions(weather({ time: '2026-08-10T17:50', cloudCoverPct: 55 }))).toBe('raking_sun');
  });

  it('is overcast at midday with heavy cloud', () => {
    expect(deriveLightConditions(weather({ time: '2026-08-10T12:30', cloudCoverPct: 80 }))).toBe('overcast');
  });

  it('is dark under heavy rain and heavy cloud', () => {
    expect(deriveLightConditions(weather({ cloudCoverPct: 90, precipitationMm: 2 }))).toBe('dark');
  });

  it('falls back to any for ordinary bright midday conditions', () => {
    expect(deriveLightConditions(weather({ time: '2026-08-10T12:30', cloudCoverPct: 20 }))).toBe('any');
  });
});
