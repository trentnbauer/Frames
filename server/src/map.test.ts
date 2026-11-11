import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';
import { mapSource, searchVariants } from './routes/map.js';

/** The map pin: a place can be pinned by hand, the pin survives a re-read of the file, and the map is fetched through this server. */
let env: Env, A: ReturnType<typeof api>, id: number;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  fs.writeFileSync(path.join(env.lib, 'a.jpg'), await jpg(svg(900, 600, '#336699', '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  id = (await A.get('/api/photos')).body.photos[0].id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('the map pin', () => {
  it('saves a pin, refuses a bad one, and clears it', async () => {
    expect((await A.patch(`/api/photos/${id}`, { lat: -38.15, lon: 144.36 })).status).toBe(200);
    expect((await A.get(`/api/photos/${id}`)).body).toMatchObject({ lat: -38.15, lon: 144.36 });
    for (const bad of [{ lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: 'x', lon: 1 }, { lat: 5 }, { lat: NaN, lon: 1 }]) expect((await A.patch(`/api/photos/${id}`, bad)).status).toBe(400);
    expect((await A.get(`/api/photos/${id}`)).body).toMatchObject({ lat: -38.15, lon: 144.36 }); // a refused pin changes nothing
    await A.patch(`/api/photos/${id}`, { lat: null, lon: null });
    expect((await A.get(`/api/photos/${id}`)).body).toMatchObject({ lat: null, lon: null });
  });

  it('keeps a hand-set pin when the file is read again', async () => {
    await A.patch(`/api/photos/${id}`, { lat: 10, lon: 20 });
    await A.post('/api/library/rebuild?all=1').catch(() => undefined);
    env.db.prepare("UPDATE photos SET size_bytes = size_bytes + 1 WHERE id = ?").run(id);
    await A.post('/api/library/scan?wait=1');
    expect((await A.get(`/api/photos/${id}`)).body).toMatchObject({ lat: 10, lon: 20 });
  });
});

describe('searching for a business', () => {
  it('tries "name, place" when the words as typed find nothing, so "Geelong Mill Market" is found', async () => {
    await new Promise((r) => setTimeout(r, 1100));
    const asked: string[] = [];
    mapSource.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q')!;
      asked.push(q);
      return new Response(JSON.stringify(q === 'Mill Market, Geelong' ? [{ display_name: 'Mill Market, Geelong, Victoria', lat: '-38.14', lon: '144.35' }] : []), { status: 200 });
    };
    const r = await A.get('/api/map/search?q=Geelong%20Mill%20Market');
    expect(r.body).toMatchObject([{ lat: -38.14, lon: 144.35 }]);
    expect(r.body[0].address).toContain('Geelong');
    expect(asked).toEqual(['Geelong Mill Market', 'Geelong Mill Markets', 'Mill Market, Geelong']); // stops at the first that finds something
  });

  it('finds a business whose name is a plural of what was typed (issue 206)', async () => {
    await new Promise((r) => setTimeout(r, 1100));
    const asked: string[] = [];
    mapSource.fetch = async (url) => {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      asked.push(q);
      return new Response(JSON.stringify(q === 'geelong mill markets' ? [{ display_name: 'The Amazing Mill Markets, 114, Bellarine Highway, Newcomb, Geelong, Victoria', name: 'The Amazing Mill Markets', lat: '-38.17', lon: '144.39', category: 'shop', type: 'second_hand', address: { shop: 'second_hand' } }] : []), { status: 200 });
    };
    const r = await A.get('/api/map/search?q=geelong%20mill%20market');
    expect(r.body).toMatchObject([{ name: 'The Amazing Mill Markets', kind: 'business' }]);
    expect(asked).toEqual(['geelong mill market', 'geelong mill markets']);
  });

  it('makes a few sensible variants and no more', () => {
    expect(searchVariants('Geelong Mill Market')).toEqual(['Geelong Mill Market', 'Geelong Mill Markets', 'Mill Market, Geelong', 'Mill Markets, Geelong', 'Market, Geelong Mill', 'Markets, Geelong Mill']);
    expect(searchVariants('Geelong')).toEqual(['Geelong']);
    expect(searchVariants('Mill Market')).toEqual(['Mill Market', 'Mill Markets', 'Market, Mill', 'Markets, Mill']);
    expect(searchVariants('Mill Markets')).toEqual(['Mill Markets', 'Mill Market', 'Markets, Mill', 'Market, Mill']); // and the other way round
  });
});

describe('the map proxy', () => {
  it('fetches a tile with an identifying User-Agent, and refuses tiles that do not exist', async () => {
    let seen: { url: string; ua: string } | null = null;
    mapSource.fetch = async (url, init) => { seen = { url, ua: String((init?.headers as Record<string, string>)['User-Agent']) }; return new Response(Buffer.from([1, 2, 3]), { status: 200 }); };
    const r = await env.app.inject({ method: 'GET', url: '/api/map/tile/3/2/1' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(seen).toMatchObject({ url: 'https://tile.openstreetmap.org/3/2/1.png' });
    expect(seen!.ua).toContain('Frames');
    for (const u of ['/api/map/tile/3/8/0', '/api/map/tile/20/0/0', '/api/map/tile/x/0/0', '/api/map/tile/2/-1/0']) expect((await env.app.inject({ method: 'GET', url: u })).statusCode).toBe(404);
  });

  it('searches by name, and says so when the service is down', async () => {
    await new Promise((r) => setTimeout(r, 1100)); // the one-a-second limit
    mapSource.fetch = async () => new Response(JSON.stringify([{ display_name: 'Geelong, Victoria, Australia', lat: '-38.14', lon: '144.36' }, { display_name: 'Nowhere', lat: '999', lon: '0' }]), { status: 200 });
    expect((await A.get('/api/map/search?q=Geelong')).body).toMatchObject([{ name: 'Geelong', lat: -38.14, lon: 144.36 }]);
    await new Promise((r) => setTimeout(r, 1100));
    mapSource.fetch = async () => { throw new Error('down'); };
    expect((await A.get('/api/map/search?q=Geelong')).status).toBe(404);
  });
});
