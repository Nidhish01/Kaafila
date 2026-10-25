import test from 'node:test';
import assert from 'node:assert/strict';
import { investigate, validateAlert } from '../lib/kaafila/engine.ts';
import { scenarios, cities, products } from '../lib/kaafila/data.ts';

test('flood replay has a hand-checkable inventory and shortage calculation',()=>{
  const r=investigate(scenarios[0]);const row=r.inventory.find(s=>s.storeId==='ST-009')!;
  assert.equal(row.stock,50);assert.equal(row.hourlyDemand,11.2);assert.equal(row.shortage,152);
  assert.equal(row.revenueAtRisk,9120);assert.equal(r.metrics.affectedStores,8);
  assert.equal(r.recommended.id,'transfer');assert.equal(r.recommended.cost,3588);
  assert.equal(r.recommended.avoidedRevenue,56640);
});
test('a covered three-hour delay avoids unnecessary recovery spending',()=>{
  const r=investigate(scenarios[4]);assert.equal(r.metrics.riskScore,0);assert.equal(r.metrics.totalShortage,0);assert.equal(r.recommended.id,'monitor');assert.equal(r.recommended.cost,0);
});
test('cold-chain compromised shipment and missing supplier shipment cannot be expedited',()=>{
  for(const index of [2,3]){const r=investigate(scenarios[index]);const expedite=r.options.find(o=>o.id==='expedite')!;assert.equal(expedite.feasible,false);assert.equal(expedite.quantity,0);assert.notEqual(r.recommended.id,'expedite');}
});
test('all options conserve capacity, allocations and exposure under 80 replay variations',()=>{
  for(const scenario of scenarios)for(const delayHours of [1,8,24,96])for(const demandMultiplier of [1,1.5,2.4,4]){
    const r=investigate({...scenario,delayHours,demandMultiplier});
    assert.ok(r.metrics.riskScore>=0&&r.metrics.riskScore<=100);
    assert.equal(r.metrics.revenueAtRisk,r.inventory.reduce((n,s)=>n+s.revenueAtRisk,0));
    assert.equal(r.options.filter(o=>o.recommended).length,1);assert.ok(r.recommended.feasible);
    for(const o of r.options){assert.ok(o.quantity<=o.capacity);assert.ok(o.remainingRisk>=0);assert.ok(o.avoidedRevenue<=r.metrics.revenueAtRisk);assert.equal(o.remainingRisk+o.avoidedRevenue,r.metrics.revenueAtRisk);assert.equal(o.quantity,o.allocations.reduce((n,a)=>n+a.quantity,0));
      for(const allocation of o.allocations){const row=r.inventory.find(s=>s.storeId===allocation.storeId)!;assert.ok(allocation.quantity<=row.shortage);assert.ok(allocation.quantity<=Math.floor(Math.min(r.product.shelfHours,Math.max(0,delayHours-o.etaHours))*row.hourlyDemand)+1);}
    }
  }
});
test('all-network disruption provides no unaffected donor stock',()=>{const r=investigate({...scenarios[0],cities:cities.map(c=>c.name)});assert.equal(r.options.find(o=>o.id==='transfer')!.feasible,false);});
test('reject malformed alerts and deduplicate city selection',()=>{
  for(const patch of [{delayHours:-1},{delayHours:Infinity},{delayHours:97},{demandMultiplier:0},{demandMultiplier:NaN},{cities:[]},{cities:['Delhi']},{product:'__proto__'},{type:'fake'},{description:''}])assert.throws(()=>validateAlert({...scenarios[0],...patch}));
  assert.throws(()=>validateAlert(null));assert.throws(()=>validateAlert([]));
  assert.equal(validateAlert({...scenarios[0],cities:['Patiala','Patiala']}).cities.length,1);
  assert.equal(Object.keys(products).length,4);
});
