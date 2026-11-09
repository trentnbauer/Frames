import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';

/**
 * The map behind the location pin. The browser never talks to OpenStreetMap itself: this server fetches the tiles and the place
 * search for it, with a User-Agent that names the app (OpenStreetMap's usage policy requires one), so the page's security policy
 * stays as strict as before and only this server's address reaches OpenStreetMap. Only signed-in people reach these addresses.
 */
export const mapSource = {
  /** Replaced in tests, which must never reach the real service. */
  fetch: (url: string, init?: RequestInit): Promise<Response> => fetch(url, init),
  tileUrl: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  searchUrl: (q: string) => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`,
};
const UA = 'Frames (self-hosted photo archive; https://github.com/trentnbauer/Frames)';
let lastSearch = 0; // the search service allows one request a second: instance-wide, not a person's data

export function registerMap(app: FastifyInstance, _x: Ctx) {
  app.get('/api/map/tile/:z/:x/:y', async (req, rep) => {
    const p = req.params as Row;
    const [z, x, y] = [p.z, p.x, p.y].map((v) => (/^\d{1,8}$/.test(String(v)) ? Number(v) : NaN));
    if (!(z >= 0 && z <= 19) || !(x >= 0 && x < 2 ** z) || !(y >= 0 && y < 2 ** z)) return rep.code(404).send({ error: 'No such map tile' });
    try {
      const r = await mapSource.fetch(mapSource.tileUrl(z, x, y), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return rep.code(404).send({ error: 'The map is not available right now' });
      return rep.header('Content-Type', 'image/png').header('Cache-Control', 'private, max-age=86400').send(Buffer.from(await r.arrayBuffer()));
    } catch { return rep.code(404).send({ error: 'The map is not available right now' }); }
  });

  // Search by name, to move the map. Runs when asked (not as you type), within the service's one-a-second limit.
  app.get('/api/map/search', async (req, rep) => {
    const q = String(((req.query ?? {}) as Row).q ?? '').trim().slice(0, 200);
    if (!q) return [];
    const now = Date.now();
    if (now - lastSearch < 1000) return rep.code(429).send({ error: 'One search a second. Try again.' });
    lastSearch = now;
    try {
      const r = await mapSource.fetch(mapSource.searchUrl(q), { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return rep.code(404).send({ error: 'Search is not available right now' });
      const rows = (await r.json()) as { display_name?: unknown; lat?: unknown; lon?: unknown }[];
      return (Array.isArray(rows) ? rows : []).slice(0, 5)
        .map((o) => ({ name: String(o.display_name ?? '').slice(0, 200), lat: Number(o.lat), lon: Number(o.lon) }))
        .filter((o) => o.name && Number.isFinite(o.lat) && Number.isFinite(o.lon) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180);
    } catch { return rep.code(404).send({ error: 'Search is not available right now' }); }
  });
}
