export type ProductId = 'milk' | 'bread' | 'rice' | 'medicine';
export type DisruptionType = 'weather' | 'demand' | 'supplier' | 'cold-chain' | 'delay';
export type Alert = { id: string; title: string; description: string; type: DisruptionType; product: ProductId; cities: string[]; delayHours: number; demandMultiplier: number };
export const products = {
  milk: { name: 'Fresh milk', unit: 'packs', price: 60, hourlyDemand: 14, shelfHours: 36 },
  bread: { name: 'Whole wheat bread', unit: 'loaves', price: 45, hourlyDemand: 9, shelfHours: 48 },
  rice: { name: 'Rice · 5 kg', unit: 'bags', price: 320, hourlyDemand: 4, shelfHours: 720 },
  medicine: { name: 'Essential care kits', unit: 'kits', price: 180, hourlyDemand: 3, shelfHours: 720 },
};
export const cities = [
  { name: 'Ludhiana', lat: 30.901, lon: 75.857, x: 215, y: 95 },
  { name: 'Chandigarh', lat: 30.734, lon: 76.779, x: 440, y: 120 },
  { name: 'Patiala', lat: 30.339, lon: 76.386, x: 310, y: 215 },
  { name: 'Ambala', lat: 30.378, lon: 76.776, x: 455, y: 245 },
  { name: 'Karnal', lat: 29.686, lon: 76.990, x: 465, y: 350 },
  { name: 'Panipat', lat: 29.391, lon: 76.963, x: 380, y: 425 },
];
const localities = ['Central', 'Model Town', 'Market Road', 'City Square'];
export const stores = cities.flatMap((city, ci) => localities.map((area, si) => ({
  id: `ST-${String(ci * 4 + si + 1).padStart(3, '0')}`,
  name: `${city.name} ${area}`, city: city.name, lat: city.lat + si * .007, lon: city.lon + si * .006,
  factor: 0.8 + si * .18, baseCover: [4.5, 7, 10, 16][si],
})));
export const scenarios: Alert[] = [
  { id: 'KF-2401', title: 'Flooding on the milk route', description: 'Heavy rain has blocked the Ludhiana–Patiala supply route. Fresh milk deliveries to Patiala and Ambala are delayed by 18 hours.', type: 'weather', product: 'milk', cities: ['Patiala', 'Ambala'], delayHours: 18, demandMultiplier: 1 },
  { id: 'KF-2402', title: 'A festive demand surge', description: 'Rice demand is 2.4× normal in Chandigarh and Ludhiana. The next replenishment is due in 24 hours.', type: 'demand', product: 'rice', cities: ['Chandigarh', 'Ludhiana'], delayHours: 24, demandMultiplier: 2.4 },
  { id: 'KF-2403', title: 'Supplier misses a shipment', description: 'The essential-care supplier has short-shipped its order. Karnal and Panipat stores face a 30-hour replenishment gap.', type: 'supplier', product: 'medicine', cities: ['Karnal', 'Panipat'], delayHours: 30, demandMultiplier: 1 },
  { id: 'KF-2404', title: 'Cold-chain temperature breach', description: 'A refrigerated milk shipment to Chandigarh failed its temperature check. Quarantine the shipment; replacement supply is 24 hours away.', type: 'cold-chain', product: 'milk', cities: ['Chandigarh'], delayHours: 24, demandMultiplier: 1 },
  { id: 'KF-2405', title: 'A short delay, enough stock', description: 'A bread truck serving Ludhiana is delayed by 3 hours. Check whether existing store stock can cover the gap before spending on recovery.', type: 'delay', product: 'bread', cities: ['Ludhiana'], delayHours: 3, demandMultiplier: 1 },
];
export const snapshotLabel = 'Synthetic retail network · demo dataset v1';
