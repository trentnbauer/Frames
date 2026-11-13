import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrate, openDb } from './db.js';
import { scan } from './ingest.js';
import { removePhotos } from './remove.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
let env: Env, a: ReturnType<typeof api>;
const shoot = (name: string) => Number(env.db.prepare("INSERT INTO shoots(name, source, imported_at) VALUES(?, 'Manual', ?)").run(name,new Date().toISOString()).lastInsertRowid);
const photo = (sid: number, n: number) => Number(env.db.prepare("INSERT INTO photos(shoot_id,path,file,hash,title,file_type,size_bytes,added_at) VALUES(?,?,?,?,?,'JPG',1,?)").run(sid,path.join(env.lib,`${n}.jpg`),`${n}.jpg`,`hash${n}`,`Photo ${n}`,new Date().toISOString()).lastInsertRowid);
const exists = (sid: number) => !!env.db.prepare('SELECT 1 FROM shoots WHERE id = ?').get(sid);
const share = (id: number, kind='shoot') => env.db.prepare('INSERT INTO shares(token,kind,target_id,created_at) VALUES(?,?,?,?)').run(`local-${kind}-${id}`,kind,id,new Date().toISOString());
beforeEach(()=>{env=makeEnv();a=api(env)});
afterEach(async()=>{await env.app.close();cleanup(env)});
it('deletes a shoot and its links only when the final photo is removed',async()=>{
 const source=shoot('Source'),other=shoot('Other'),p1=photo(source,1),p2=photo(source,2);photo(other,3);share(source);share(other);
 expect((await a.del(`/api/photos/${p1}`)).status).toBe(200);expect(exists(source)).toBe(true);
 expect((await a.post('/api/photos/remove',{ids:[p2],originals:'keep'})).status).toBe(200);expect(exists(source)).toBe(false);expect(exists(other)).toBe(true);
 expect(env.db.prepare("SELECT 1 FROM shares WHERE kind='shoot' AND target_id=?").get(source)).toBeUndefined();expect(env.db.prepare("SELECT 1 FROM shares WHERE kind='shoot' AND target_id=?").get(other)).toBeDefined();
});
it('handles bulk moves into an existing or new shoot and individual photo reassignment',async()=>{
 const s1=shoot('Source'),s2=shoot('Destination'),p1=photo(s1,1),p2=photo(s1,2);share(s1);
 expect((await a.post(`/api/shoots/${s2}/move`,{photoIds:[p1]})).status).toBe(200);expect(exists(s1)).toBe(true);
 expect((await a.patch(`/api/photos/${p2}`,{shootId:s2})).status).toBe(200);expect(exists(s1)).toBe(false);expect(exists(s2)).toBe(true);
 const made=await a.post('/api/shoots',{name:'New destination',photoIds:[p1,p2]});expect(made.status).toBe(200);expect(made.body.count).toBe(2);expect(exists(s2)).toBe(false);expect(exists(made.body.id)).toBe(true);
});
it('keeps archived/missing photo records and newly created empty destinations',async()=>{
 const s=shoot('Hidden photos'),p1=photo(s,1),p2=photo(s,2),dest=shoot('Empty target');
 env.db.prepare('UPDATE photos SET missing=1,archived=1 WHERE id=?').run(p2);removePhotos(env.db,env.cfg,[p1],'keep');expect(exists(s)).toBe(true);expect(exists(dest)).toBe(true);
 expect((await a.post(`/api/shoots/${dest}/move`,{photoIds:[p2]})).status).toBe(200);expect(exists(s)).toBe(false);expect(exists(dest)).toBe(true);
});
it('does not delete a shoot on a no-op move and rolls back shoot/link cleanup with a failed transaction',()=>{
 const s=shoot('Source'),p=photo(s,1);share(s);env.db.prepare('UPDATE photos SET shoot_id=? WHERE id=?').run(s,p);expect(exists(s)).toBe(true);
 expect(()=>env.db.transaction(()=>{env.db.prepare('DELETE FROM photos WHERE id=?').run(p);throw new Error('rollback')})()).toThrow('rollback');expect(exists(s)).toBe(true);expect(env.db.prepare('SELECT 1 FROM shares WHERE target_id=?').get(s)).toBeDefined();
});
it('migrates legacy empty shoots and shares without touching populated shoots or composition shares',()=>{
 const empty=shoot('Legacy empty'),full=shoot('Populated');photo(full,1);share(empty);share(full);
 const c=Number(env.db.prepare("INSERT INTO collections(name) VALUES('Composition')").run().lastInsertRowid);share(c,'collection');
 const version=Number(env.db.pragma('user_version',{simple:true}));env.db.pragma(`user_version=${version-1}`);migrate(env.db);
 expect(exists(empty)).toBe(false);expect(exists(full)).toBe(true);expect(env.db.prepare("SELECT 1 FROM shares WHERE kind='collection' AND target_id=?").get(c)).toBeDefined();expect(env.db.prepare("SELECT 1 FROM shares WHERE kind='shoot' AND target_id=?").get(empty)).toBeUndefined();
 migrate(env.db);expect(exists(full)).toBe(true);
});
it('does not leave a shoot after a duplicate-only scan or a removed file reappears',async()=>{
 const bytes=await jpg(svg(100,80,'#123456','#abcdef',[.2,.4]));fs.writeFileSync(path.join(env.lib,'original.jpg'),bytes);await scan(env.db,env.cfg);
 env.db.prepare("UPDATE shoots SET source='Manual'").run();fs.writeFileSync(path.join(env.lib,'copy.jpg'),bytes);
 const duplicate=await scan(env.db,env.cfg);expect(duplicate.duplicates).toBe(1);expect(duplicate.shootId).toBeNull();expect(env.db.prepare('SELECT COUNT(*) n FROM shoots').get()).toEqual({n:1});
 const p=(env.db.prepare('SELECT id FROM photos').get() as {id:number}).id;removePhotos(env.db,env.cfg,[p],'keep');expect(env.db.prepare('SELECT COUNT(*) n FROM shoots').get()).toEqual({n:0});
 const removed=await scan(env.db,env.cfg);expect(removed.imported).toBe(0);expect(removed.shootId).toBeNull();expect(env.db.prepare('SELECT COUNT(*) n FROM shoots').get()).toEqual({n:0});expect(fs.existsSync(path.join(env.lib,'original.jpg'))).toBe(true);
});
it('can continue importing if the user empties the current shoot between files',async()=>{
 for(let i=0;i<2;i++)fs.writeFileSync(path.join(env.lib,`${i}.jpg`),await jpg(svg(100,80,i?'#345678':'#123456','#abcdef',[.2,.4])));
 let cleared=false;const result=await scan(env.db,env.cfg,()=>{if(cleared)return;const row=env.db.prepare('SELECT id FROM photos').get() as {id:number}|undefined;if(row){removePhotos(env.db,env.cfg,[row.id],'keep');cleared=true}});
 expect(result.errors).toEqual([]);expect(result.imported).toBe(2);expect(result.shootId).not.toBeNull();expect(env.db.prepare('SELECT COUNT(*) n FROM photos').get()).toEqual({n:1});expect(exists(result.shootId!)).toBe(true);
});
it('keeps cleanup local to the database owning the photographs',()=>{
 const s=shoot('First library'),p=photo(s,1);const other=openDb(path.join(env.tmp,'another-library'));other.prepare("INSERT INTO shoots(id,name,imported_at) VALUES(?, 'Other library', ?)").run(s,new Date().toISOString());
 removePhotos(env.db,env.cfg,[p],'keep');expect(exists(s)).toBe(false);expect(other.prepare('SELECT 1 FROM shoots WHERE id=?').get(s)).toBeDefined();other.close();
});
