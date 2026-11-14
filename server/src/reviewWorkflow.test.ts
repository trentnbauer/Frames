import fs from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
let env: Env,a:ReturnType<typeof api>,ids:number[],shoot:number;
beforeEach(async()=>{env=makeEnv();a=api(env);for(let i=0;i<5;i++)fs.writeFileSync(env.lib+`/${i}.jpg`,await jpg(svg(200,140,i%2?'#345678':'#987654','#aabbcc',[.15+i*.12,.4])));await a.scan();ids=(await a.get('/api/photos')).body.photos.map((p:any)=>p.id);shoot=(await a.get('/api/photos')).body.photos[0].shootId;await a.put('/api/settings',{sessions:2,todoReasons:[],archiveSuggest:false});env.db.prepare("UPDATE photos SET next_review_at='2099-01-01T00:00:00Z'").run()});
afterEach(async()=>{await env.app.close();cleanup(env)});
const rate=(id:number,values:number[])=>values.forEach((rating,i)=>env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,?,NULL,?,?)').run(id,i+1,new Date().toISOString(),rating));
const photoIds=async(query:string)=>(await a.get('/api/photos?'+query)).body.photos.map((p:any)=>p.id);
it('uses the removal toggle, configured session count and strict personal-average threshold everywhere',async()=>{
 rate(ids[0],[1,1]);rate(ids[1],[2,2]);rate(ids[2],[1]);
 expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);expect((await a.get('/api/todo')).body.items.some((i:any)=>i.key==='delete')).toBe(false);
 await a.put('/api/settings',{archiveSuggest:true});let list=(await a.get('/api/photos/delete-suggestions')).body;expect(list.photos.map((p:any)=>p.id)).toEqual([ids[0]]);expect((await a.get('/api/todo')).body.items.find((i:any)=>i.key==='delete').ids).toEqual([ids[0]]);expect((await a.get('/api/recommendations')).body.archive.map((p:any)=>p.id)).toEqual([ids[0]]);
 await a.put('/api/settings',{deleteBelow:2.5});expect((await a.get('/api/photos/delete-suggestions')).body.photos.map((p:any)=>p.id).sort()).toEqual([ids[0],ids[1]].sort());
 await a.put('/api/settings',{sessions:3});expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);
 expect((await a.get('/api/photos')).body.photos).toHaveLength(5);
});
it('shoot due counts and Library due filters match the actual review queue, including repeat reviews',async()=>{
 rate(ids[0],[3]);env.db.prepare("UPDATE photos SET next_review_at='2000-01-01T00:00:00Z' WHERE id IN (?,?)").run(ids[0],ids[1]);env.db.prepare("UPDATE photos SET next_review_at='2000-01-01T00:00:00Z',archived=1 WHERE id=?").run(ids[2]);env.db.prepare("UPDATE photos SET next_review_at='2000-01-01T00:00:00Z',missing=1 WHERE id=?").run(ids[3]);
 const s=(await a.get('/api/shoots/'+shoot)).body;expect(s.dueCount).toBe(2);expect(s.waitingCount).toBe(1);expect(s.duePhotoIds.sort()).toEqual([ids[0],ids[1]].sort());
 expect((await photoIds('review=due')).sort()).toEqual(s.duePhotoIds.sort());expect((await a.post('/api/review/start',{})).body.queue.map((p:any)=>p.id).sort()).toEqual(s.duePhotoIds.sort());
 expect(await photoIds('review=due&shoot=9999')).toEqual([]);
});
it('filters unrated, waiting, completed and excluded photos and preserves all browsing by default',async()=>{
 rate(ids[0],[3,4]);env.db.prepare('UPDATE photos SET next_review_at=NULL WHERE id=?').run(ids[0]);rate(ids[1],[3]);env.db.prepare('UPDATE photos SET archived=1 WHERE id=?').run(ids[2]);env.db.prepare('UPDATE photos SET missing=1 WHERE id=?').run(ids[3]);
 expect(await photoIds('review=complete')).toEqual([ids[0]]);expect((await photoIds('review=waiting')).sort()).toEqual([ids[1],ids[4]].sort());expect(await photoIds('review=excluded')).toEqual([ids[2]]);expect(await photoIds('review=unrated')).toEqual([ids[4]]);expect((await photoIds('')).sort()).toEqual(ids.sort());
});
