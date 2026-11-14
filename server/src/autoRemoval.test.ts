import { buildApp } from './app.js';
import { openDb } from './db.js';
import fs from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
import { autoRemoveLowRated } from './remove.js';
let env:Env,a:ReturnType<typeof api>,id:number,file:string;
beforeEach(async()=>{env=makeEnv();a=api(env);file=env.lib+'/low.jpg';fs.writeFileSync(file,await jpg(svg(200,140,'#345678','#aabbcc',[.3,.5])));await a.scan();id=(await a.get('/api/photos')).body.photos[0].id;await a.put('/api/settings',{sessions:2,archiveSuggest:true,deleteBelow:2});for(let i=1;i<=2;i++)env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,?,NULL,?,1)').run(id,i,new Date().toISOString())});
afterEach(async()=>{await env.app.close();cleanup(env)});
it('keeps a suggestion dismissed until personal rating history changes',async()=>{
 expect((await a.get('/api/photos/delete-suggestions')).body.photos).toHaveLength(1);expect((await a.post(`/api/photos/${id}/removal/keep`,{})).status).toBe(200);expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
 env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,3,NULL,?,1)').run(id,new Date().toISOString());expect((await a.get('/api/photos/delete-suggestions')).body.photos).toHaveLength(1);
});
it('defaults off, validates automatic settings and removes existing qualifiers only on explicit enable',async()=>{
 const settings=(await a.get('/api/settings')).body.settings;expect(settings).toMatchObject({autoRemove:false,autoRemoveBelow:2,autoRemoveAfter:4});expect(autoRemoveLowRated(env.db,env.cfg).removed).toBe(0);
 await a.put('/api/settings',{autoRemoveAfter:2,autoRemoveBelow:1});expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
 await a.put('/api/settings',{autoRemove:true,autoRemoveBelow:2});expect((await a.get('/api/photos')).body.photos).toEqual([]);expect(fs.existsSync(file)).toBe(true);
});
it('respects minimum ratings and strict threshold after saving new reviews',async()=>{
 await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:3,autoRemoveBelow:1});expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
 await a.put('/api/settings',{autoRemoveBelow:2});expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
 await a.post('/api/review/start',{photoIds:[id]});expect((await a.post('/api/review/rate',{photoId:id,rating:1})).status).toBe(200);expect((await a.get('/api/photos')).body.photos).toEqual([]);expect(fs.existsSync(file)).toBe(true);
 expect((await a.post('/api/review/rate',{photoId:id,rating:1})).status).not.toBe(500);
});
it('protects every composition member from suggestions, automatic and stale confirmed deletion',async()=>{
 const c=await a.post('/api/collections',{name:'Protected',photoIds:[id]});expect(c.status).toBe(200);expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);
 await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:1});expect((await a.get(`/api/photos/${id}`)).status).toBe(200);expect((await a.post(`/api/photos/${id}/removal/delete`,{confirm:true})).status).toBe(409);
});
it('protects active shared shoots and allows eligibility after revocation',async()=>{
 const shoot=(await a.get(`/api/photos/${id}`)).body.shootId;const shared=await a.post('/api/shares',{kind:'shoot',id:shoot,allowReview:true});expect(shared.status).toBe(200);expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);
 await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:1});expect((await a.get(`/api/photos/${id}`)).status).toBe(200);expect((await a.post(`/api/photos/${id}/removal/delete`,{confirm:true})).status).toBe(409);
 env.db.prepare('UPDATE shares SET revoked=1').run();expect(autoRemoveLowRated(env.db,env.cfg).removed).toBe(1);expect(fs.existsSync(file)).toBe(true);
});
it('keeps explicit Keep decisions respected by automatic cleanup without deleting its record',async()=>{
 await a.post(`/api/photos/${id}/removal/keep`,{});await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:1});expect((await a.get(`/api/photos/${id}`)).status).toBe(200);
 expect((await a.post(`/api/photos/${id}/removal/delete`,{confirm:true})).status).toBe(409);
});
it('requires explicit deletion confirmation and preserves originals on manual removal',async()=>{
 expect((await a.post(`/api/photos/${id}/removal/delete`,{})).status).toBe(400);expect((await a.post(`/api/photos/${id}/removal/delete`,{confirm:true})).status).toBe(200);expect(fs.existsSync(file)).toBe(true);
});

it('retains Frames-owned upload copies when automatic removal runs',async()=>{
 const upload=env.data+'/originals/upload.jpg';fs.mkdirSync(env.data+'/originals',{recursive:true});fs.writeFileSync(upload,await jpg(svg(210,150,'#887766','#bbaaee',[.6,.3])));await a.scan();const photo=(await a.get('/api/photos')).body.photos.find((p:any)=>p.file==='upload.jpg');expect(photo).toBeDefined();
 env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,1,NULL,?,1)').run(photo.id,new Date().toISOString());await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:1});expect((await a.get('/api/photos')).body.photos).toEqual([]);expect(fs.existsSync(upload)).toBe(true);expect(fs.existsSync(file)).toBe(true);
});
it('protects candidates and every composition stage, including Done',async()=>{
 const collection=await a.post('/api/collections',{name:'Candidate protection',photoIds:[id]});
 for(const stage of ['progress','review','done']){env.db.prepare('UPDATE collections SET stage=? WHERE id=?').run(stage,collection.body.id);env.db.prepare('UPDATE collection_photos SET chosen=0 WHERE photo_id=?').run(id);expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);}
});
it('allows expired shoot links without treating them as active shares',async()=>{
 const shoot=(await a.get(`/api/photos/${id}`)).body.shootId;await a.post('/api/shares',{kind:'shoot',id:shoot});env.db.prepare("UPDATE shares SET expires_at='2000-01-01T00:00:00Z'").run();expect((await a.get('/api/photos/delete-suggestions')).body.photos).toHaveLength(1);
});

it('rejects invalid automatic-removal settings before enabling or removing anything',async()=>{
 for(const patch of [{autoRemove:'yes'},{autoRemove:true,autoRemoveBelow:1.75},{autoRemove:true,autoRemoveBelow:null},{autoRemove:true,autoRemoveAfter:0},{autoRemove:true,autoRemoveAfter:'1'},{autoRemove:true,autoRemoveAfter:2.5}])expect((await a.put('/api/settings',patch)).status).toBe(400);
 expect((await a.get('/api/settings')).body.settings.autoRemove).toBe(false);expect((await a.get(`/api/photos/${id}`)).status).toBe(200);
});

it('resumes previously enabled cleanup after restart',async()=>{
 await a.put('/api/settings',{autoRemove:true,autoRemoveAfter:4});for(let i=3;i<=4;i++)env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,?,NULL,?,1)').run(id,i,new Date().toISOString());
 await env.app.close();env.db=openDb(env.data);env.app=buildApp(env.db,env.cfg);a=api(env);await env.app.ready();
 for(let i=0;i<60 && (await a.get(`/api/photos/${id}`)).status===200;i++)await new Promise(resolve=>setTimeout(resolve,50));
 expect((await a.get(`/api/photos/${id}`)).status).toBe(404);expect(fs.existsSync(file)).toBe(true);
});
