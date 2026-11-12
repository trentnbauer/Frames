import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
import { readInto } from './ingest.js';
import { notify } from './notifications.js';

let env: Env, a: ReturnType<typeof api>, photo: number, file: string;
const found = async () => (await a.get('/api/notifications')).body.items.filter((n: { kind: string }) => n.kind === 'gear-found');
const metadata = (camera = 'Atlas Body 1', lens = 'Atlas 50mm') => readInto(env.db, photo, { Model: camera, LensModel: lens } as any, file);
beforeEach(async () => {
  env = makeEnv(); a = api(env); file = env.lib + '/photo.jpg';
  fs.writeFileSync(file, await jpg(svg(900, 600, '#645080', '#ae5050', [.4, .5])));
  await a.scan(); photo = (await a.get('/api/photos')).body.photos[0].id;
});
afterEach(async () => { await env.app.close(); cleanup(env); });

describe('gear discovery notifications', () => {
  it('emits one camera and one lens alert on metadata import, without adding either to owned gear', async () => {
    metadata(); const first = await found();
    expect(first).toHaveLength(2);
    expect(first.map((n: any) => n.gear.type).sort()).toEqual(['camera', 'lens']);
    expect(first.every((n: any) => n.gear.state === 'new')).toBe(true);
    expect((await a.get('/api/gear/items')).body.own).toEqual([]);
    metadata('ATLAS BODY-1', 'ATLAS 50 MM');
    expect((await found()).map((n: any) => n.id).sort()).toEqual(first.map((n: any) => n.id).sort());
  });
  it('adds only the chosen piece and blacklists the other, preserving photo metadata and the original', async () => {
    const original = fs.readFileSync(file); metadata();
    const rows = await found(), camera = rows.find((n: any) => n.gear.type === 'camera'), lens = rows.find((n: any) => n.gear.type === 'lens');
    expect((await a.post(`/api/notifications/${camera.id}/gear`, { action: 'add' })).status).toBe(200);
    expect((await a.post(`/api/notifications/${camera.id}/gear`, { action: 'add' })).status).toBe(200);
    expect((await a.get('/api/gear/items')).body.own).toMatchObject([{ name: 'Atlas Body 1', type: 'camera' }]);
    expect((await a.post(`/api/notifications/${lens.id}/gear`, { action: 'blacklist' })).status).toBe(200);
    const gear = (await a.get('/api/gear/items')).body;
    expect(gear.found).toEqual([]); expect(gear.blacklisted).toMatchObject([{ name: 'Atlas 50mm' }]);
    expect(await found()).toEqual([]);
    metadata(); expect(await found()).toEqual([]);
    expect((await a.get(`/api/photos/${photo}`)).body.lens).toBe('Atlas 50mm');
    expect(fs.readFileSync(file).equals(original)).toBe(true);
  });
  it('dismisses individual notifications of any kind without repeating discoveries', async () => {
    metadata(); const rows = await found();
    expect((await a.del(`/api/notifications/${rows[0].id}`)).status).toBe(200);
    expect(await found()).toHaveLength(1); metadata(); expect(await found()).toHaveLength(1);
    const normal = notify(env.db, 'summary', 'Ordinary notice', { screen: '/' });
    expect((await a.del(`/api/notifications/${normal}`)).status).toBe(200);
    expect((await a.get('/api/notifications')).body.items.some((n: any) => n.id === normal)).toBe(false);
    expect((await a.del('/api/notifications/99999')).status).toBe(404);
    env.db.prepare("DELETE FROM notifications WHERE kind = 'gear-found'").run();
    expect(await found()).toEqual([]); // discovery memory survives bell retention
  });
  it('supports manually entered blacklist tags and removing them, with immediate found-list filtering', async () => {
    metadata();
    const added = await a.post('/api/gear/blacklist', { name: 'Atlas Body 1' });
    expect(added.body.items).toHaveLength(1);
    await a.post('/api/gear/blacklist', { name: 'ATLAS BODY-1' });
    expect((await a.get('/api/gear/items')).body.blacklisted).toHaveLength(1);
    expect((await a.get('/api/gear/items')).body.found.map((g: any) => g.name)).toEqual(['Atlas 50mm']);
    expect((await a.del(`/api/gear/blacklist/${added.body.items[0].id}`)).status).toBe(200);
    expect((await a.get('/api/gear/items')).body.found).toHaveLength(2);
    const scanner = (await a.post('/api/gear/blacklist', { name: 'Scanner 42' })).body.items[0];
    await a.del('/api/notifications'); metadata('Scanner 42', '');
    expect((await a.get('/api/gear/items')).body.found).toEqual([]); expect(await found()).toEqual([]);
    await a.del(`/api/gear/blacklist/${scanner.id}`);
    expect((await a.get('/api/gear/items')).body.found).toMatchObject([{ name: 'Scanner 42', type: 'camera' }]);
    for (const name of ['', '   ', null, {}, '---']) expect((await a.post('/api/gear/blacklist', { name })).status).toBe(400);
  });
  it('excludes owned gear and differentiates models and piece types', async () => {
    await a.post('/api/gear/items', { name: 'Atlas Body', kind: 'own', type: 'camera' });
    metadata('Atlas Body', 'Atlas Body');
    expect((await found()).map((n: any) => n.gear.type)).toEqual(['lens']);
    metadata('Atlas Body 2', 'Atlas Body');
    expect((await found()).some((n: any) => n.gear.name === 'Atlas Body 2')).toBe(true);
    await a.post('/api/gear/items', { name: 'Atlas Body 2', kind: 'own', type: 'camera' });
    expect((await found()).some((n: any) => n.gear.name === 'Atlas Body 2')).toBe(false);
    await a.post('/api/gear/items', { name: 'Nikon D850', kind: 'own', type: 'camera' });
    metadata('NIKON CORPORATION NIKON D850', '');
    expect((await a.get('/api/gear/items')).body.found).toEqual([]);
    expect((await found()).some((n: any) => n.gear.name === 'NIKON CORPORATION NIKON D850')).toBe(false);
  });
  it('validates actions and cannot turn an unrelated notification into gear', async () => {
    metadata(); const row = (await found())[0];
    for (const action of [null, '', 'delete', {}, []]) expect((await a.post(`/api/notifications/${row.id}/gear`, { action })).status).toBe(400);
    const ordinary = notify(env.db, 'idea', 'Idea', { screen: '/' });
    expect((await a.post(`/api/notifications/${ordinary}/gear`, { action: 'add' })).status).toBe(404);
    expect((await a.post('/api/notifications/99999/gear', { action: 'add' })).status).toBe(404);
  });
});
