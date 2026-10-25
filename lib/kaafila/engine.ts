import { cities, products, stores, type Alert, type ProductId, type DisruptionType } from './data.ts';
import { interpretAlert } from './alert-model.ts';

export type InventoryRow = { storeId: string; name: string; city: string; stock: number; hourlyDemand: number; coverHours: number; shortage: number; revenueAtRisk: number; risk: string };
export type Allocation = { storeId: string; quantity: number; avoidedUnits: number };
export type Option = { id: string; title: string; description: string; etaHours: number; cost: number; avoidedUnits: number; avoidedRevenue: number; remainingRisk: number; netBenefit: number; quantity: number; capacity: number; allocations: Allocation[]; feasible: boolean; reason: string; source: string; recommended?: boolean };
export type Evidence = { id: string; tool: string; label: string; kind: string; summary: string; data: unknown; capturedAt: string };
export type Investigation = ReturnType<typeof investigate>;
const round = (n: number) => Math.round(n * 10) / 10;

export function validateAlert(input: unknown): Alert {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide an alert object.');
  const a = input as Record<string, unknown>;
  const text = (key: string, max: number) => typeof a[key] === 'string' && (a[key] as string).trim().length > 0 && (a[key] as string).length <= max;
  if (!text('title', 160) || !text('description', 2000)) throw new Error('Add a title and a description (up to 2,000 characters).');
  if (typeof a.product !== 'string' || !Object.hasOwn(products, a.product)) throw new Error('Choose a supported product.');
  if (!['weather', 'demand', 'supplier', 'cold-chain', 'delay'].includes(String(a.type))) throw new Error('Choose a disruption type.');
  if (!Array.isArray(a.cities) || a.cities.length < 1 || a.cities.length > 6 || !a.cities.every(c => typeof c === 'string' && cities.some(city => city.name === c))) throw new Error('Select at least one city from the demo network.');
  if (typeof a.delayHours !== 'number' || !Number.isFinite(a.delayHours) || a.delayHours < 1 || a.delayHours > 96) throw new Error('The replenishment gap must be between 1 and 96 hours.');
  if (typeof a.demandMultiplier !== 'number' || !Number.isFinite(a.demandMultiplier) || a.demandMultiplier < 1 || a.demandMultiplier > 4) throw new Error('Demand must be between 1× and 4×.');
  return { id: typeof a.id === 'string' && /^[\w-]{1,64}$/.test(a.id) ? a.id : 'CUSTOM', title: (a.title as string).trim(), description: (a.description as string).trim(), product: a.product as ProductId, type: a.type as DisruptionType, cities: [...new Set(a.cities as string[])], delayHours: a.delayHours, demandMultiplier: a.demandMultiplier };
}

// Seeded inventory tool. Unaffected stores retain a full 24-hour safety reserve.
export function getInventory(alert: Alert): InventoryRow[] {
  const p = products[alert.product];
  return stores.filter(s => alert.cities.includes(s.city)).map(s => {
    const hourlyDemand = round(p.hourlyDemand * s.factor * alert.demandMultiplier);
    const stock = Math.floor(p.hourlyDemand * s.factor * s.baseCover);
    const coverHours = stock / hourlyDemand;
    const shortage = Math.max(0, Math.ceil(hourlyDemand * alert.delayHours - stock));
    return { storeId: s.id, name: s.name, city: s.city, stock, hourlyDemand, coverHours: round(coverHours), shortage, revenueAtRisk: shortage * p.price, risk: shortage === 0 ? 'Covered' : coverHours <= 6 ? 'Critical' : 'At risk' };
  });
}

export function investigate(raw: unknown, capturedAt = new Date().toISOString()) {
  const alert = validateAlert(raw);
  const modelPrediction = interpretAlert(alert.title + '. ' + alert.description);
  const product = products[alert.product];
  const inventory = getInventory(alert).sort((a,b) => a.coverHours - b.coverHours || a.storeId.localeCompare(b.storeId));
  const totalShortage = inventory.reduce((n,r) => n + r.shortage, 0);
  const revenueAtRisk = totalShortage * product.price;
  const affectedStores = inventory.filter(r => r.shortage > 0).length;
  const earliestStockout = affectedStores ? Math.min(...inventory.filter(r=>r.shortage>0).map(r=>r.coverHours)) : null;
  const totalDemand = inventory.reduce((n,r)=>n + r.hourlyDemand * alert.delayHours,0);
  const shortageRatio = totalDemand ? totalShortage / totalDemand : 0;
  const riskScore = affectedStores ? Math.min(100, Math.round(shortageRatio * 55 + Math.max(0, 1 - (earliestStockout ?? 24) / 24) * 30 + (product.shelfHours <= 48 ? 15 : 5))) : 0;
  const donors = stores.filter(s => !alert.cities.includes(s.city)).map(s=>({storeId:s.id, city:s.city, available:Math.floor(product.hourlyDemand * s.factor * 10), safetyReserve:Math.ceil(product.hourlyDemand * s.factor * 24)}));
  const donorCapacity = donors.reduce((n,d)=>n+d.available,0);
  const quoteCapacity = Math.ceil(product.hourlyDemand * 140);
  const inboundCapacity = Math.floor(stores.filter(s=>alert.cities.includes(s.city)).reduce((n,s)=>n+product.hourlyDemand*s.factor*24,0));
  const sources = [
    { id:'transfer', title:'Rebalance nearby store stock', description:'Move available stock from unaffected stores, keeping a 24-hour reserve at every donor.', eta:alert.type === 'weather' ? 4 : 3, capacity:donorCapacity, fixed:1200 + alert.cities.length * 250, perUnit:2, source:'E3 · Inventory transfer tool', feasible:donorCapacity>0 },
    { id:'supplier', title:'Activate a backup supplier', description:'Place an emergency order with the seeded regional backup supplier. Product cost is already budgeted; this compares the incremental premium.', eta:alert.type==='demand'?6:5, capacity:quoteCapacity, fixed:1800, perUnit:product.price * .16, source:'E4 · Supplier quote tool', feasible:true },
    { id:'expedite', title:'Expedite the inbound shipment', description:'Use the alternative delivery route for the original shipment, capped at its planned one-day normal-demand load.', eta:round(Math.max(2,alert.delayHours*.42)), capacity:inboundCapacity, fixed:3400, perUnit:1.5, source:'E5 · Route estimate tool', feasible:alert.type !== 'cold-chain' && alert.type !== 'supplier' },
  ];
  const options: Option[] = sources.map(s=>{
    let capacity = s.capacity;
    const allocations: Allocation[]=[];
    for (const row of inventory) {
      const preArrivalLost = Math.max(0, row.hourlyDemand * Math.min(s.eta, alert.delayHours) - row.stock);
      const protectable = Math.max(0, row.shortage - Math.ceil(preArrivalLost));
      const shelfSafe = Math.floor(Math.min(product.shelfHours, Math.max(0, alert.delayHours-s.eta)) * row.hourlyDemand);
      const quantity = s.feasible ? Math.max(0, Math.min(capacity,protectable,shelfSafe)) : 0;
      if (quantity) allocations.push({storeId:row.storeId,quantity,avoidedUnits:quantity});
      capacity -= quantity;
    }
    const quantity=allocations.reduce((n,a)=>n+a.quantity,0);
    const avoidedRevenue=quantity*product.price;
    const cost=quantity?Math.ceil(s.fixed+quantity*s.perUnit):0;
    const feasible=s.feasible && quantity>0 && s.eta<alert.delayHours;
    return {id:s.id,title:s.title,description:s.description,etaHours:round(s.eta),cost,avoidedUnits:quantity,avoidedRevenue,remainingRisk:Math.max(0,revenueAtRisk-avoidedRevenue),netBenefit:avoidedRevenue-cost,quantity,capacity:s.capacity,allocations,feasible,reason:!s.feasible?(alert.type==='cold-chain'?'Unsafe shipment: quarantine; do not reroute.':'The missing shipment cannot be expedited.'):!quantity?'No preventable shortage within this arrival window.':'Within source capacity and shelf-life limits.',source:s.source};
  });
  options.push({id:'monitor',title:affectedStores?'Monitor without intervention':'Keep the scheduled delivery',description:affectedStores?'Accept the projected stockout exposure and review the case in one hour.':'Current stock covers the delay. Avoid unnecessary recovery spending and monitor the delivery.',etaHours:alert.delayHours,cost:0,avoidedUnits:0,avoidedRevenue:0,remainingRisk:revenueAtRisk,netBenefit:0,quantity:0,capacity:0,allocations:[],feasible:true,reason:'Baseline comparison. No additional stock is moved.',source:'E2 · Stock coverage calculation'});
  const recommended=options.filter(o=>o.feasible).sort((a,b)=>b.netBenefit-a.netBenefit || a.cost-b.cost)[0];
  options.forEach(o=>o.recommended=o.id===recommended.id);
  const summary = affectedStores
    ? `${affectedStores} stores could run out of ${product.name.toLowerCase()} before the next delivery. The earliest shortage is in ${earliestStockout} hours. ${recommended.title} offers the best estimated sales protection after incremental recovery cost among the feasible options.`
    : `All ${inventory.length} stores have enough ${product.name.toLowerCase()} to cover the ${alert.delayHours}-hour delay. Keep the scheduled delivery and monitor its arrival.`;
  const evidence: Evidence[]=[
    {id:'E1',tool:'read_disruption_alert',label:'Disruption alert',kind:'User / sample input',summary:alert.description,data:alert,capturedAt},
    {id:'E2',tool:'get_inventory_and_demand',label:'Inventory & demand',kind:'Synthetic dataset',summary:`Checked ${inventory.length} store-product positions; ${affectedStores} have projected shortages.`,data:{product,rows:inventory,formulas:{coverHours:'on-hand / hourly demand',shortage:'max(0, ceil(hourly demand × replenishment gap − on-hand))',salesExposure:'shortage units × retail price'}},capturedAt},
    {id:'E3',tool:'find_safe_transfer_stock',label:'Transfer availability',kind:'Synthetic dataset',summary:`${donorCapacity.toLocaleString('en-IN')} units available across ${donors.length} donor stores after protecting a 24-hour safety reserve.`,data:{reserveHours:24,donors},capturedAt},
    {id:'E4',tool:'get_backup_supplier_quote',label:'Backup supplier quote',kind:'Synthetic quote',summary:`Regional supplier can provide ${quoteCapacity} units, with a 16% emergency premium and ₹1,800 delivery charge.`,data:{supplier:'Northstar Wholesale (fictional)',capacity:quoteCapacity,premiumPercent:16,deliveryFee:1800,etaHours:alert.type==='demand'?6:5},capturedAt},
    {id:'E5',tool:'estimate_recovery_routes',label:'Route & safety checks',kind:'Scenario assumptions',summary:alert.type==='cold-chain'?'Temperature-compromised shipment excluded. Only safe replacement stock is considered.':'Compared arrival times, source capacities and shelf-life constraints.',data:{routeEstimates:sources.map(s=>({option:s.id,etaHours:s.eta,capacity:s.capacity,available:s.feasible})),inboundCapacity,inboundBasis:'One day of normal demand across the selected stores; not increased by a demand spike.',caveat:'Travel times are scenario estimates, not live road routing. Unaffected on-hand stock is assumed safe.'},capturedAt},
    {id:'E6',tool:'rank_recovery_options',label:'Recovery comparison',kind:'Code calculation',summary:`Ranked feasible options by estimated avoided retail sales minus incremental recovery cost. Selected: ${recommended.title}.`,data:{options,ranking:'avoided retail sales − incremental recovery cost; this is not profit or guaranteed savings',riskFormula:'55 × shortage/demand + 30 × max(0, 1 − earliest cover/24) + perishability (15 or 5); zero when no shortage'},capturedAt},
  ];
  evidence.push({id:'E7',tool:'classify_alert_with_alertnet',label:'Custom model interpretation',kind:'Locally trained model',summary:`AlertNet suggests ${modelPrediction.type??'manual review'} / ${modelPrediction.product??'manual product selection'}. Confirmed structured fields drive risk calculations.`,data:{...modelPrediction,confirmedFields:{type:alert.type,product:alert.product,cities:alert.cities,delayHours:alert.delayHours,demandMultiplier:alert.demandMultiplier},trainingData:'2,560 synthetic examples. No pretrained weights or external AI API.'},capturedAt});
  return {alert,product,inventory,options,recommended,summary,evidence,modelPrediction,metrics:{affectedStores,checkedStores:inventory.length,earliestStockout,revenueAtRisk,riskScore,totalShortage},capturedAt,mode:'custom-model' as const,assumptions:['All inventory, supplier quotes and routes are synthetic demo data.','AlertNet is a small text classifier trained on synthetic English alerts; model suggestions require review.','Demand is constant during the replenishment gap; original supply resumes at the end.','Recovery quantities are allocated to the earliest stockouts first; each option is an independent plan.','Retail sales exposure is not margin, profit, or guaranteed lost sales.','Decision history is saved only in this browser. Approval does not place an order.']};
}
