import fs from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
let env: Env, a: ReturnType<typeof api>, id: number;
beforeEach(async()=>{
 env=makeEnv();a=api(env);fs.writeFileSync(env.lib+'/complete.jpg',await jpg(svg(300,200,'#345678','#bbaacc',[.3,.5]),{exif:{IFD0:{Make:'NORITSU KOKI',Model:'EZ Controller'}}}));await a.scan();id=(await a.get('/api/photos')).body.photos[0].id;
 await a.patch(`/api/photos/${id}`,{place:'Mill Markets',description:'A car interior',camera:''});
 await a.put(`/api/photos/${id}/tags`,{name:'cars',kind:'subject'});await a.put(`/api/photos/${id}/tags`,{name:'interior',kind:'tag'});
 await a.put('/api/settings',{todoReasons:['camera','location','subjects','tags','description'],deleteBelow:0});
});
afterEach(async()=>{await env.app.close();cleanup(env)});
it('includes a photo missing only its camera in Everything, the camera category and total',async()=>{
 const todo=(await a.get('/api/todo')).body,walk=(await a.get('/api/todo/walk')).body;
 expect(todo.items.find((i:any)=>i.key==='camera')).toMatchObject({count:1,ids:[id]});expect(todo.total).toBe(1);
 expect(walk.photos).toMatchObject([{id,need:{camera:true,tags:false,place:false,desc:false}}]);expect(walk.things).toBe(1);
});
it('drops the task after saving the camera and honours turning that reason off',async()=>{
 await a.patch(`/api/photos/${id}`,{camera:'Minolta XD'});expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);expect((await a.get('/api/todo')).body.total).toBe(0);
 await a.patch(`/api/photos/${id}`,{camera:''});await a.put('/api/settings',{todoReasons:['location','subjects','tags','description']});expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);expect((await a.get('/api/todo')).body.total).toBe(0);
});
it('adds the task when a scanner camera is cleared by the blacklist',async()=>{
 await a.patch(`/api/photos/${id}`,{camera:'NORITSU KOKI EZ Controller'});expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);
 await a.post('/api/gear/blacklist',{name:'NORITSU KOKI EZ Controller'});
 expect((await a.get('/api/todo/walk')).body.photos).toMatchObject([{id,need:{camera:true}}]);expect((await a.get('/api/todo')).body.total).toBe(1);
});
it('counts space-only camera values as missing and excludes unavailable photo files',async()=>{
 env.db.prepare("UPDATE photos SET camera='   ' WHERE id=?").run(id);expect((await a.get('/api/todo')).body.total).toBe(1);expect((await a.get('/api/todo/walk')).body.photos).toHaveLength(1);
 env.db.prepare('UPDATE photos SET missing=1 WHERE id=?').run(id);expect((await a.get('/api/todo')).body.total).toBe(0);expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);
});
it('supports lens-only tasks, counts both missing details once each, and clears them independently',async()=>{
 await a.put('/api/settings',{todoReasons:['camera','lens']});
 expect((await a.get('/api/settings')).body.settings.todoReasons).toEqual(['camera','lens']);
 let todo=(await a.get('/api/todo')).body,walk=(await a.get('/api/todo/walk')).body;
 expect(todo.total).toBe(1);expect(walk.things).toBe(2);expect(walk.photos).toHaveLength(1);expect(walk.photos[0].need).toMatchObject({camera:true,lens:true});expect(todo.items.find((i:any)=>i.key==='lens')).toMatchObject({count:1,ids:[id]});
 await a.patch(`/api/photos/${id}`,{camera:'Minolta XD'});
 todo=(await a.get('/api/todo')).body;walk=(await a.get('/api/todo/walk')).body;expect(todo.total).toBe(1);expect(walk.photos[0].need).toMatchObject({camera:false,lens:true});
 await a.patch(`/api/photos/${id}`,{lens:'Rokkor 50mm'});expect((await a.get('/api/todo')).body.total).toBe(0);expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);
});
it('honours the Lens switch and adds a task when blacklisting clears an existing lens',async()=>{
 await a.patch(`/api/photos/${id}`,{camera:'Minolta XD',lens:'Scanner lens'});
 await a.put('/api/settings',{todoReasons:['lens']});await a.post('/api/gear/blacklist',{name:'Scanner lens'});
 expect((await a.get('/api/todo')).body.total).toBe(1);expect((await a.get('/api/todo/walk')).body.photos[0].need).toMatchObject({camera:false,lens:true});
 await a.put('/api/settings',{todoReasons:[]});expect((await a.get('/api/todo')).body.total).toBe(0);expect((await a.get('/api/todo/walk')).body.photos).toEqual([]);
});
it('counts one photograph once when camera, description and removal tasks overlap',async()=>{
 await a.patch(`/api/photos/${id}`,{description:''});await a.put('/api/settings',{sessions:1,deleteBelow:2,archiveSuggest:true});
 env.db.prepare("INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,1,'count-test',?,1)").run(id,new Date().toISOString());
 expect((await a.get('/api/todo')).body.total).toBe(1);
});
