/** Real dispatch domain. No dependency on synthetic inventory or the investigation engine. */
export type Status = 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled' | 'review_required';
export type Quantities = Record<string, number>;
export type Place = { name: string; address: string; latitude: number; longitude: number; contactName: string; phone: string };
export type Line = { id: string; name: string; unit: string; quantity: number };
export type Stop = { id: string; place: Place; quantities: Quantities; proof?: { quantities: Quantities; receiver: string; photoId: string; reason: string; outcome: 'delivered' | 'failed'; at: string } };
export type Job = { id: string; orgId: string; driverId: string; vehicleId: string; title: string; date: string; pickup: Place; lines: Line[]; stops: Stop[]; status: Status; version: number; loaded?: Quantities; pickupReason?: string; reviewReasons: string[]; createdAt: string; updatedAt: string; tracking: 'unavailable' | 'sharing' | 'paused' | 'stopped' };
export type Driver = { id: string; orgId: string; name: string; phone: string; active: boolean; activeJobId?: string | null; vehicleId: string };
export type Action = { eventId: string; expectedVersion: number; type: 'accept' | 'decline' | 'start' | 'pickup' | 'deliver' | 'complete' | 'cancel' | 'reassign' | 'resolve'; reason?: string; quantities?: Quantities; stopId?: string; receiver?: string; photoId?: string; outcome?: 'delivered' | 'failed'; driverId?: string; sharing?: boolean };
export type Actor = { role: 'driver' | 'manager'; id: string; orgId: string };
export class DispatchError extends Error { code: string; status: number; constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; } }
export function ensure(condition: unknown, code: string, message: string, status = 400): asserts condition { if (!condition) throw new DispatchError(code, message, status); }
export const isActive = (j: Job) => j.status === 'accepted' || j.status === 'in_progress';
export function authorizeJob(job: Job, actor: Actor) { ensure(job.orgId === actor.orgId && (actor.role === 'manager' || job.driverId === actor.id), 'FORBIDDEN', 'This job is not assigned to your account.', 403); }
export function validId(value: unknown): asserts value is string { ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value), 'INVALID_ID', 'Invalid record identifier.'); }
export function validatePlace(p: Place) { ensure(p && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 120 && typeof p.address === 'string' && p.address.trim().length > 4 && p.address.length <= 500 && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && typeof p.phone === 'string' && /^\+[1-9]\d{7,14}$/.test(p.phone) && typeof p.contactName === 'string' && p.contactName.trim().length > 0 && p.contactName.length <= 120, 'INVALID_PLACE', 'Enter a name, address, coordinates, contact and international phone number.'); }
function quantity(v: unknown): asserts v is number { ensure(Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000, 'INVALID_QUANTITY', 'Quantities must be whole units from 0 to 1,000,000.'); }
export function validateQuantities(q: Quantities | undefined, allowed: string[]) { ensure(q && typeof q === 'object' && !Array.isArray(q), 'INVALID_QUANTITY', 'Enter all quantities.'); ensure(Object.keys(q).length === allowed.length && Object.keys(q).every(id => allowed.includes(id)), 'INVALID_QUANTITY', 'Manifest lines must match exactly.'); for (const id of allowed) quantity(q[id]); }
export function validateJob(j: Job) {
  validId(j.id); validId(j.driverId); validId(j.vehicleId); validId(j.orgId);
  ensure(typeof j.title === 'string' && j.title.trim().length > 0 && j.title.length <= 160 && /^\d{4}-\d{2}-\d{2}$/.test(j.date) && !Number.isNaN(Date.parse(j.date)), 'INVALID_JOB', 'Enter a title and delivery date.'); validatePlace(j.pickup);
  ensure(Array.isArray(j.lines) && j.lines.length > 0 && j.lines.length <= 40, 'INVALID_MANIFEST', 'Add 1–40 stock lines.');
  for (const l of j.lines) { validId(l.id); quantity(l.quantity); ensure(l.quantity > 0 && typeof l.name === 'string' && l.name.trim().length > 0 && l.name.length <= 120 && typeof l.unit === 'string' && l.unit.trim().length > 0 && l.unit.length <= 30, 'INVALID_MANIFEST', 'Each stock line needs a name, unit and positive quantity.'); }
  const ids = j.lines.map(l => l.id); ensure(new Set(ids).size === ids.length, 'INVALID_MANIFEST', 'Stock IDs must be unique.');
  ensure(Array.isArray(j.stops) && j.stops.length > 0 && j.stops.length <= 20, 'INVALID_STOPS', 'Add 1–20 delivery stops.');
  for (const s of j.stops) { validId(s.id); validatePlace(s.place); validateQuantities(s.quantities, ids); ensure(Object.values(s.quantities).some(q => q > 0), 'INVALID_STOPS', 'Each stop must receive stock.'); ensure(!s.proof, 'INVALID_STOPS', 'New jobs cannot include delivery proofs.'); }
  ensure(new Set(j.stops.map(s => s.id)).size === j.stops.length, 'INVALID_STOPS', 'Stop IDs must be unique.');
  for (const l of j.lines) ensure(j.stops.reduce((sum, s) => sum + s.quantities[l.id], 0) === l.quantity, 'INVALID_ALLOCATION', 'Stop allocations must equal the ordered manifest.');
}
function reason(a: Action) { ensure(typeof a.reason === 'string' && a.reason.trim().length >= 3 && a.reason.length <= 1000, 'REASON_REQUIRED', 'Add a reason (3–1,000 characters).'); return a.reason.trim(); }
export function applyAction(original: Job, a: Action, actor: Actor, at: string): Job {
  authorizeJob(original, actor); validId(a.eventId);
  ensure(Number.isSafeInteger(a.expectedVersion) && a.expectedVersion === original.version, 'VERSION_CONFLICT', 'This job changed. Refresh and review the manager’s latest decision.', 409);
  const j: Job = JSON.parse(JSON.stringify(original)); const manager = ['cancel', 'reassign', 'resolve'].includes(a.type);
  ensure(manager ? actor.role === 'manager' : actor.role === 'driver', 'FORBIDDEN', 'Your role cannot perform this action.', 403);
  const state = (...s: Status[]) => ensure(s.includes(j.status), 'STATE_CONFLICT', 'This action is no longer available for this job.', 409);
  switch (a.type) {
    case 'accept': state('assigned'); j.status = 'accepted'; break;
    case 'decline': state('assigned'); j.status = 'declined'; j.reviewReasons.push(reason(a)); break;
    case 'start': state('accepted'); ensure(a.sharing === true, 'CONSENT_REQUIRED', 'Enable location sharing explicitly to start.'); j.status = 'in_progress'; j.tracking = 'sharing'; break;
    case 'pickup': {
      state('in_progress'); ensure(!j.loaded, 'ALREADY_LOADED', 'Pickup is already recorded.', 409); validateQuantities(a.quantities, j.lines.map(l => l.id)); j.loaded = a.quantities;
      if (j.lines.some(l => a.quantities![l.id] !== l.quantity)) { j.pickupReason = reason(a); j.reviewReasons.push('Pickup: ' + j.pickupReason); }
      break;
    }
    case 'deliver': {
      state('in_progress'); ensure(j.loaded, 'PICKUP_REQUIRED', 'Confirm pickup before delivery.');
      const s = j.stops.find(s => !s.proof); ensure(s && s.id === a.stopId, 'STOP_CONFLICT', 'Complete stops in their assigned order.', 409);
      validateQuantities(a.quantities, j.lines.map(l => l.id));
      for (const l of j.lines) {
        const delivered = j.stops.reduce((sum, s) => sum + (s.proof?.quantities[l.id] || 0), 0);
        ensure(a.quantities![l.id] <= s.quantities[l.id] && delivered + a.quantities![l.id] <= j.loaded[l.id], 'STOCK_EXCEEDED', 'Delivery exceeds the stop allocation or stock loaded.');
      }
      ensure(a.outcome === 'delivered' || a.outcome === 'failed', 'INVALID_OUTCOME', 'Select a delivery outcome.');
      ensure(a.outcome !== 'failed' || Object.values(a.quantities!).every(q => q === 0), 'INVALID_OUTCOME', 'Failed deliveries must record zero delivered units.');
      ensure(typeof a.receiver === 'string' && a.receiver.trim().length >= 2 && a.receiver.length <= 120, 'RECEIVER_REQUIRED', 'Enter the receiver name, or “No receiver” for a failed delivery.'); validId(a.photoId);
      const discrepancy = j.lines.some(l => a.quantities![l.id] !== s.quantities[l.id]) || a.outcome === 'failed';
      if (discrepancy) j.reviewReasons.push(s.place.name + ': ' + reason(a));
      else if (a.reason?.trim()) j.reviewReasons.push(s.place.name + ': ' + reason(a));
      s.proof = { quantities: a.quantities!, receiver: a.receiver.trim(), photoId: a.photoId, reason: a.reason?.trim() || '', outcome: a.outcome, at }; break;
    }
    case 'complete': state('in_progress'); ensure(j.stops.every(s => s.proof), 'STOPS_INCOMPLETE', 'Record all stops before completing the trip.'); if (j.loaded && j.lines.some(l => j.loaded![l.id] > j.stops.reduce((sum,s) => sum+(s.proof?.quantities[l.id]||0),0))) j.reviewReasons.push('Undelivered loaded stock requires reconciliation.'); j.status = j.reviewReasons.length ? 'review_required' : 'completed'; j.tracking = 'stopped'; break;
    case 'cancel': state('assigned', 'accepted', 'in_progress'); j.reviewReasons.push('Cancelled: ' + reason(a)); j.status = 'cancelled'; j.tracking = 'stopped'; break;
    case 'reassign': state('assigned', 'accepted', 'in_progress', 'declined'); validId(a.driverId); ensure(a.driverId !== j.driverId, 'SAME_DRIVER', 'Choose a different driver.'); ensure(!j.loaded, 'CUSTODY_CONFLICT', 'Loaded stock requires cancellation and physical handover before creating a replacement job.', 409); j.reviewReasons.push('Reassigned: ' + reason(a)); j.driverId = a.driverId; j.status = 'assigned'; j.tracking = 'stopped'; break;
    case 'resolve': state('review_required'); j.reviewReasons.push('Manager resolution: ' + reason(a)); j.status = 'completed'; break;
    default: throw new DispatchError('INVALID_ACTION', 'Unknown job action.');
  }
  j.version++; j.updatedAt = at; return j;
}
export function assertEnrollment(driver: Driver | undefined, phone?: string) { ensure(driver?.active && phone === driver.phone, 'NOT_ENROLLED', 'Your driver account is not active. Contact your manager.', 403); }
export function checkEvent(prior: { fingerprint: string } | undefined, fingerprint: string) { if (prior) ensure(prior.fingerprint === fingerprint, 'EVENT_CONFLICT', 'This event ID was already used for different data.', 409); return !!prior; }
export function trackingState(timestamp?: string, now = Date.now()) { if (!timestamp) return 'unavailable'; return now - Date.parse(timestamp) > 120000 ? 'stale' : 'current'; }
