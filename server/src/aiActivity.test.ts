import { expect, it } from 'vitest';
import { aiActivity, tryEach } from './ai.js';
import { saveSources } from './aisources.js';
import { tenantProxy } from './tenants.js';
import { api, makeEnv, cleanup } from './testutil.js';
it('reports concurrent AI jobs per tenant and clears them on success and failure', async () => {
 const one=makeEnv(), two=makeEnv();
 try {
  saveSources(one.db,[{id:'local',type:'ollama',name:'Local',endpoint:'http://localhost:11434',model:'test',embedModel:'',ack:true,color:'#e7b76d'}]);
  await api(one).put('/api/ai/jobs/search',{on:true,order:['local']});
  let selected=one.db;
  const proxy=tenantProxy(()=>selected);
  let finish!:()=>void;
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  const first=tryEach(proxy,'search',async()=>{await gate;return 'found';});
  const second=tryEach(proxy,'search',async()=>{await gate;throw new Error('offline');});
  const rejected=expect(second).rejects.toThrow('offline');
  expect(aiActivity(one.db).jobs.search).toBe(2);
  const status=(await api(one).get('/api/ai/status')).body;
  expect(status.running).toBe(true);expect(status.batchRunning).toBe(false);expect(status.jobs).toEqual(['search']);
  expect(status.providers).toEqual([{ id: 'local', name: 'Local', color: '#e7b76d' }]);
  expect(aiActivity(one.db).providers.local.count).toBe(2);
  selected=two.db;
  expect(aiActivity(proxy).jobs).toEqual({});
  expect((await api(two).get('/api/ai/status')).body.running).toBe(false);
  finish();expect(await first).toBe('found');await rejected;
  expect(aiActivity(one.db).jobs).toEqual({});
  expect(aiActivity(one.db).providers).toEqual({});
  expect((await api(one).get('/api/ai/status')).body.running).toBe(false);
 } finally { await one.app.close();await two.app.close();cleanup(one);cleanup(two); }
});
