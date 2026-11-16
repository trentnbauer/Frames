import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { api, makeEnv, cleanup, jpg, svg } from './testutil.js';

it('persists automatic-analysis opt-out while imports and manual analysis keep working', async () => {
  const env=makeEnv(), a=api(env);
  let calls=0, hold=false;
  let release: (()=>void) | undefined;
  const model=http.createServer((req,res)=>{req.resume();req.on('end',async()=>{calls++;if(hold) await new Promise<void>(resolve=>{release=resolve;});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message:{content:JSON.stringify({description:'A test photograph',subjects:['tree'],tags:['green']})}}));});});
  await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));
  try {
    expect((await a.get('/api/settings')).body.settings.aiAutoAnalyse).toBe(true);
    expect((await a.put('/api/settings',{aiAutoAnalyse:false})).body.aiAutoAnalyse).toBe(false);
    for(const invalid of ['false',0,null,{}]) expect((await a.put('/api/settings',{aiAutoAnalyse:invalid})).status).toBe(400);
    const response=await a.post('/api/ai/sources',{type:'ollama',name:'Local fixture',endpoint:`http://127.0.0.1:${(model.address() as AddressInfo).port}`,model:'fixture',embedModel:''});
    await a.put('/api/ai/active',{id:response.body.sources.at(-1).id});
    fs.writeFileSync(env.lib+'/first.jpg',await jpg(svg(240,160,'#445566','#ddeeff',[.3,.4])));
    await a.scan();
    expect((await a.get('/api/ai/status')).body).toMatchObject({enabled:true,running:false,pending:1});
    expect(calls).toBe(0);
    expect((await a.raw('POST','/api/ai/run?wait=1',{})).body).toMatchObject({pending:0,done:1});
    expect(calls).toBe(1);
    const photo=(await a.get('/api/photos')).body.photos[0];
    expect((await a.post(`/api/photos/${photo.id}/recheck`)).body.ai).toBe(true);
    expect(calls).toBe(2);
    fs.writeFileSync(env.lib+'/second.jpg',await jpg(svg(260,160,'#998877','#ddeeff',[.7,.6])));
    await a.scan();expect(calls).toBe(2);
    expect((await a.get('/api/settings')).body.settings.aiAutoAnalyse).toBe(false);
    await a.put('/api/settings',{aiAutoAnalyse:true});
    await expect.poll(()=>calls).toBe(3);
    await expect.poll(async()=>(await a.get('/api/ai/status')).body.running).toBe(false);
    expect((await a.get('/api/ai/status')).body.pending).toBe(0);
    await a.put('/api/settings',{aiAutoAnalyse:false});
    for(const [index,name] of ['third','fourth'].entries()) fs.writeFileSync(env.lib+'/'+name+'.jpg',await jpg(svg(280+index*30,180,'#337799','#eeeeff',[.2+index*.4,.3])));
    await a.scan();hold=true;
    await a.put('/api/settings',{aiAutoAnalyse:true});
    await expect.poll(()=>calls).toBe(4);
    await a.put('/api/settings',{aiAutoAnalyse:false});
    hold=false;release?.();
    await expect.poll(async()=>(await a.get('/api/ai/status')).body.running).toBe(false);
    expect(calls).toBe(4);
    expect((await a.get('/api/ai/status')).body.pending).toBe(1);
    expect((await a.raw('POST','/api/ai/run?wait=1',{})).body.pending).toBe(0);
    expect(calls).toBe(5);

  } finally { release?.(); await env.app.close();await new Promise<void>(resolve=>model.close(()=>resolve()));cleanup(env); }
});
