// Open-Meteo (open-meteo.com) — free, keyless geocoding + forecast API.
// Chosen specifically so "what can I shoot today" works out of the box on a
// self-hosted install with zero API keys to configure.

export interface GeocodeResult {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  temperatureC: number;
  cloudCoverPct: number;
  precipitationMm: number;
  isDay: boolean;
  time: string;
  sunrise: string;
  sunset: string;
}

export type LightConditions = 'any' | 'overcast' | 'raking_sun' | 'golden_hour' | 'dark' | 'night';

export async function geocodeLocation(location: string): Promise<GeocodeResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding request failed: ${res.status}`);
  const json = await res.json();
  const hit = json.results?.[0];
  if (!hit) return null;
  return { name: hit.name, country: hit.country ?? null, latitude: hit.latitude, longitude: hit.longitude };
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,cloud_cover,precipitation,is_day&daily=sunrise,sunset&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast request failed: ${res.status}`);
  const json = await res.json();
  return {
    temperatureC: json.current.temperature_2m,
    cloudCoverPct: json.current.cloud_cover,
    precipitationMm: json.current.precipitation,
    isDay: json.current.is_day === 1,
    time: json.current.time,
    sunrise: json.daily.sunrise[0],
    sunset: json.daily.sunset[0],
  };
}

// Heuristic, not astronomy: buckets current conditions into the same
// light_pref vocabulary ideas are tagged with, so "what can I shoot today"
// can match on it directly. Sunrise/sunset are used as the golden-hour /
// raking-sun window rather than computing real sun altitude.
export function deriveLightConditions(w: CurrentWeather): LightConditions {
  if (!w.isDay) return 'night';

  const now = new Date(w.time).getTime();
  const sunrise = new Date(w.sunrise).getTime();
  const sunset = new Date(w.sunset).getTime();
  const minsFromSunrise = Math.abs(now - sunrise) / 60000;
  const minsFromSunset = Math.abs(now - sunset) / 60000;
  const nearLowSun = Math.min(minsFromSunrise, minsFromSunset) <= 45;

  if (w.precipitationMm > 0.5 && w.cloudCoverPct > 80) return 'dark';
  if (nearLowSun && w.cloudCoverPct < 40) return 'golden_hour';
  if (nearLowSun && w.cloudCoverPct < 70) return 'raking_sun';
  if (w.cloudCoverPct > 65) return 'overcast';
  return 'any';
}
