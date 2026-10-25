import test from 'node:test';
import assert from 'node:assert/strict';
import parity from '../model/parity-cases.json' with {type:'json'};
import { interpretAlert } from '../lib/kaafila/alert-model.ts';

test('TypeScript predictions match trained Python model on 40 parity examples',()=>{
  for(const p of parity){const r=interpretAlert(p.text);assert.equal(r.typeScores[0].label,p.type);assert.equal(r.productScores[0].label,p.product);}
});
test('extracts multiple cities, explicit hours and demand multipliers',()=>{const p=interpretAlert('Rice demand has surged 2.4x in Chandigarh and Ludhiana. Replenishment is 24 hours away.');assert.equal(p.type,'demand');assert.equal(p.product,'rice');assert.deepEqual(p.cities,['Ludhiana','Chandigarh']);assert.equal(p.delayHours,24);assert.equal(p.demandMultiplier,2.4);});
test('cold-chain breach is classified independently from transit delay',()=>{const p=interpretAlert('The refrigeration failed and the milk cargo is unsafe in Patiala. Replacement supply is 18 hours away.');assert.equal(p.type,'cold-chain');assert.equal(p.product,'milk');});
test('unknown content, negation and ambiguity require human review',()=>{
  assert.equal(interpretAlert('What is the capital of France?').type,null);
  assert.equal(interpretAlert('No flooding in Patiala. Milk delivery is not delayed.').type,null);
  assert.equal(interpretAlert('Milk and bread shipments are late in Ambala.').product,null);
  assert.equal(interpretAlert('Milk truck is delayed 8 hours, after departing 3 hours ago.').delayHours,null);
  assert.equal(interpretAlert('Something happened.').requiresReview,true);
});
test('missing quantities are not invented and day duration converts to hours',()=>{const p=interpretAlert('Supplier cancelled essential care kits in Karnal. Replacement due in 2 days.');assert.equal(p.product,'medicine');assert.equal(p.type,'supplier');assert.equal(p.delayHours,48);assert.equal(p.demandMultiplier,null);assert.equal(interpretAlert('Milk truck is late in Patiala.').delayHours,null);});
