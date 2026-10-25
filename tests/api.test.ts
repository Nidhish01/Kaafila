import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../lib/kaafila/data.ts';
const base=process.env.KAAFILA_TEST_URL||'http://127.0.0.1:5173';
const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
test('all five scenarios complete through the real investigation API',async()=>{for(const scenario of scenarios){const response=await post('/api/investigate',scenario);assert.equal(response.status,200);const data=await response.json() as {evidence:unknown[];mode:string;recommended:{feasible:boolean}};assert.equal(data.evidence.length,7);assert.equal(data.mode,'custom-model');assert.equal(data.recommended.feasible,true);}});
test('API rejects invalid scope and oversized request',async()=>{assert.equal((await post('/api/investigate',{...scenarios[0],delayHours:-1})).status,400);assert.equal((await post('/api/investigate',{description:'x'.repeat(12001)})).status,413);});
test('model parsing endpoint detects rice demand and preserves unknown quantities',async()=>{const response=await post('/api/interpret',{text:'Rice demand doubled in Chandigarh.'});assert.equal(response.status,200);const data=await response.json() as {type:string;product:string;delayHours:null;demandMultiplier:number};assert.equal(data.type,'demand');assert.equal(data.product,'rice');assert.equal(data.delayHours,null);assert.equal(data.demandMultiplier,2);assert.equal((await post('/api/interpret',{text:'x'})).status,400);});
test('weather endpoint rejects locations outside the demo network',async()=>{const response=await fetch(base+'/api/weather?city=unknown');assert.equal(response.status,400);});
