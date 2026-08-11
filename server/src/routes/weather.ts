import { Router } from 'express';
import db from '../db.js';
import { deriveLightConditions, fetchCurrentWeather, geocodeLocation } from '../lib/weather.js';
import type { IdeaRow } from '../types.js';

export const weatherRouter = Router();

weatherRouter.get('/today', async (req, res) => {
  const location = (req.query.location as string | undefined)?.trim();
  if (!location) return res.status(400).json({ error: 'location is required' });

  try {
    const place = await geocodeLocation(location);
    if (!place) return res.status(404).json({ error: `No location found matching "${location}"` });

    const weather = await fetchCurrentWeather(place.latitude, place.longitude);
    const lightConditions = deriveLightConditions(weather);

    const ideas = db
      .prepare(
        `SELECT * FROM ideas WHERE status = 'active' AND (light_pref = ? OR light_pref = 'any')
         ORDER BY (light_pref = ?) DESC, created_at DESC LIMIT 12`
      )
      .all(lightConditions, lightConditions) as IdeaRow[];

    res.json({
      place: { name: place.name, country: place.country },
      weather: {
        temperatureC: weather.temperatureC,
        cloudCoverPct: weather.cloudCoverPct,
        precipitationMm: weather.precipitationMm,
        isDay: weather.isDay,
      },
      lightConditions,
      ideas,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Weather lookup failed' });
  }
});
