import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getMessaging } from 'firebase-admin/messaging';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { createHash, timingSafeEqual } from 'node:crypto';
import { applyAction, assertEnrollment, authorizeJob, checkEvent, DispatchError, ensure, isActive, validId, validateJob, type Job, type Actor, type Driver, type Action } from '../../../shared/dispatch.ts';

initializeApp();
const db = getFirestore();
const gatewaySecret = defineSecret('DISPATCH_GATEWAY_SECRET');
const orgId = defineString('DISPATCH_ORG_ID', { default: 'kaafila' });
const photoDays = defineInt('PHOTO_RETENTION_DAYS', { default: 90 });
const locationDays = defineInt('LOCATION_RETENTION_DAYS', { default: 30 });
const org = () => db.doc(`orgs/${orgId.value()}`);
const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
const fingerprint = (x: unknown): string => hash(JSON.stringify(canonical(x)));
function canonical(x: any): any { return Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x; }
function sameSecret(a: string, b: string) { return b.length >= 32 && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b))); }
async function authenticate(req: any): Promise<Actor> {
  if (req.get('x-kaafila-manager') && sameSecret(req.get('authorization')?.replace(/^Bearer /, '') || '', gatewaySecret.value())) {
    const id = req.get('x-kaafila-manager'); ensure(typeof id === 'string' && id.length <= 200, 'UNAUTHENTICATED', 'Invalid manager identity.', 401); return { role: 'manager', id, orgId: orgId.value() };
  }
  const bearer = req.get('authorization') || ''; ensure(bearer.startsWith('Bearer '), 'UNAUTHENTICATED', 'Sign in again.', 401);
  let token; try { token = await getAuth().verifyIdToken(bearer.slice(7), true); } catch { throw new DispatchError('UNAUTHENTICATED', 'Your session expired. Sign in again.', 401); }
  ensure(token.firebase?.sign_in_provider === 'phone', 'UNAUTHENTICATED', 'Use phone-number authentication.', 401);
  const found = await org().collection('drivers').where('phone', '==', token.phone_number || '').limit(1).get();
  const driver = found.docs[0]?.data() as Driver | undefined; assertEnrollment(driver, token.phone_number);
  return { role: 'driver', id: driver!.id, orgId: driver!.orgId };
}
async function getJob(id: string, actor: Actor) { validId(id); const snap = await org().collection('jobs').doc(id).get(); ensure(snap.exists, 'NOT_FOUND', 'Job not found.', 404); const job = snap.data() as Job; authorizeJob(job, actor); return job; }
async function notify(driverId: string, jobId: string, type: string) {
  const tokens = await org().collection('drivers').doc(driverId).collection('tokens').get();
  await Promise.all(tokens.docs.map(async d => { try { await getMessaging().send({ token: d.data().token, notification: { title: 'Kaafila Driver', body: type === 'cancelled' ? 'An assignment changed. Refresh your jobs.' : 'You have a new delivery assignment.' }, data: { jobId, type }, android: { priority: 'high', notification: { channelId: 'assignments' } } }); } catch (e: any) { if (['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code)) await d.ref.delete(); else console.warn('Notification delivery unavailable', e.code); } }));
}

export const dispatch = onRequest({ region: 'asia-south1', secrets: [gatewaySecret], cors: false, maxInstances: 10, timeoutSeconds: 60, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff');
  try {
    ensure((req.rawBody?.length || 0) <= 8 * 1024 * 1024, 'TOO_LARGE', 'Photo must be smaller than 8 MB.', 413);
    const actor = await authenticate(req); const p = req.path.replace(/\/$/, '').split('/').filter(Boolean); ensure(p[0] === 'v1', 'NOT_FOUND', 'Use API version v1.', 404);
    const body = req.body || {}; const manager = () => ensure(actor.role === 'manager', 'FORBIDDEN', 'Manager access required.', 403);
    if (req.method === 'GET' && p[1] === 'me') { const d = (await org().collection('drivers').doc(actor.id).get()).data(); res.json({ actor, driver: d }); return; }
    if (req.method === 'GET' && p[1] === 'dashboard') {
      manager(); const [drivers, vehicles, jobs, incidents] = await Promise.all(['drivers','vehicles','jobs','incidents'].map(c => org().collection(c).limit(500).get()));
      res.json({ drivers: drivers.docs.map(d => d.data()), vehicles: vehicles.docs.map(d => d.data()), jobs: jobs.docs.map(d => d.data()), incidents: incidents.docs.map(d => d.data()), retention: { photos: photoDays.value(), locations: locationDays.value() } }); return;
    }
    if (req.method === 'POST' && p[1] === 'drivers' && p.length === 2) {
      manager(); validId(body.id); validId(body.vehicleId); ensure(/^\+[1-9]\d{7,14}$/.test(body.phone) && typeof body.name === 'string' && body.name.trim().length >= 2 && body.name.length <= 120, 'INVALID_DRIVER', 'Enter a driver name and international phone number.');
      const d: Driver = { id: body.id, orgId: actor.orgId, name: body.name.trim(), phone: body.phone, active: true, vehicleId: body.vehicleId, activeJobId: null };
      await db.runTransaction(async tx => { const phone = org().collection('phoneRegistrations').doc(hash(d.phone)); const ref = org().collection('drivers').doc(d.id); const [existing, byId] = await tx.getAll(phone, ref); ensure(!existing.exists && !byId.exists, 'DUPLICATE_DRIVER', 'This phone or driver is already registered.', 409); tx.create(phone, { driverId: d.id }); tx.create(ref, d); }); res.status(201).json(d); return;
    }
    if (req.method === 'POST' && p[1] === 'vehicles') {
      manager(); validId(body.id); ensure(typeof body.registration === 'string' && body.registration.trim().length >= 4 && body.registration.length <= 40, 'INVALID_VEHICLE', 'Enter a vehicle registration.'); const vehicle = { id: body.id, orgId: actor.orgId, registration: body.registration.trim() }; await org().collection('vehicles').doc(body.id).create(vehicle); res.status(201).json(vehicle); return;
    }
    if (req.method === 'POST' && p[1] === 'drivers' && p[3] === 'status') {
      manager(); validId(p[2]); ensure(typeof body.active === 'boolean', 'INVALID_DRIVER', 'Choose active or revoked.');
      await db.runTransaction(async tx => { const ref = org().collection('drivers').doc(p[2]); const snap = await tx.get(ref); ensure(snap.exists, 'NOT_FOUND', 'Driver not found.', 404); ensure(!snap.data()!.activeJobId || body.active, 'ACTIVE_JOB', 'Cancel or reassign the active job before revoking this driver.', 409); tx.update(ref, { active: body.active, location: null }); }); res.json({ ok: true }); return;
    }
    if (req.method === 'POST' && p[1] === 'device-token') {
      ensure(actor.role === 'driver', 'FORBIDDEN', 'Driver access required.', 403); ensure(typeof body.token === 'string' && body.token.length >= 20 && body.token.length <= 4096, 'INVALID_TOKEN', 'Invalid notification token.');
      const ref = org().collection('drivers').doc(actor.id).collection('tokens').doc(hash(body.token)); if (body.remove) await ref.delete(); else await ref.set({ token: body.token, updatedAt: new Date().toISOString() }); res.json({ ok: true }); return;
    }
    if (p[1] === 'jobs' && p.length === 2 && req.method === 'GET') {
      const q = org().collection('jobs'); const found = await (actor.role === 'driver' ? q.where('driverId','==',actor.id) : q).limit(500).get(); res.json({ jobs: found.docs.map(d => d.data()) }); return;
    }
    if (p[1] === 'jobs' && p.length === 2 && req.method === 'POST') {
      manager(); validId(body.eventId); const now = new Date().toISOString();
      const j: Job = { id: body.id, orgId: actor.orgId, driverId: body.driverId, vehicleId: body.vehicleId, title: body.title, date: body.date, pickup: body.pickup, lines: body.lines, stops: body.stops, status: 'assigned', version: 1, reviewReasons: [], tracking: 'unavailable', createdAt: now, updatedAt: now }; validateJob(j);
      const ref = org().collection('jobs').doc(j.id); const fp = fingerprint(body);
      const result = await db.runTransaction(async tx => {
        const [prior, driver, vehicle] = await tx.getAll(ref, org().collection('drivers').doc(j.driverId), org().collection('vehicles').doc(j.vehicleId));
        if (prior.exists) { ensure(prior.data()!.creationFingerprint === fp, 'EVENT_CONFLICT', 'Job ID already exists with different data.', 409); return prior.data(); }
        ensure(driver.data()?.active && vehicle.exists, 'INVALID_ASSIGNMENT', 'Choose an active driver and registered vehicle.'); tx.create(ref, { ...j, creationFingerprint: fp }); tx.create(ref.collection('events').doc(body.eventId), { type: 'assigned', actor, at: now, version: 1, fingerprint: fp }); return j;
      }); await notify(j.driverId,j.id,'assigned'); res.status(201).json(result); return;
    }
    if (p[1] === 'jobs' && p[2]) {
      const job = await getJob(p[2], actor); const ref = org().collection('jobs').doc(job.id);
      if (p.length === 3 && req.method === 'GET') { res.json(job); return; }
      if (p[3] === 'events' && req.method === 'GET') { manager(); const events = await ref.collection('events').orderBy('at').limit(1000).get(); res.json({ events: events.docs.map(d => ({ id: d.id, ...d.data() })) }); return; }
      if (p[3] === 'actions' && req.method === 'POST') {
        const action = body as Action; validId(action.eventId); const fp = fingerprint({ actor, action }); const event = ref.collection('events').doc(action.eventId);
        const result = await db.runTransaction(async tx => {
          const [snapshot, prior] = await tx.getAll(ref, event); const current = snapshot.data() as Job; authorizeJob(current,actor);
          if (checkEvent(prior.exists ? prior.data() as { fingerprint: string } : undefined,fp)) return prior.data()!.result as Job;
          const next = applyAction(current,action,actor,new Date().toISOString());
          const oldDriverRef = org().collection('drivers').doc(current.driverId); const newDriverRef = org().collection('drivers').doc(next.driverId); const driverDocs = await tx.getAll(oldDriverRef, newDriverRef); const oldDriver = driverDocs[0].data() as Driver; const newDriver = driverDocs[1].data() as Driver;
          ensure(actor.role === 'manager' || oldDriver.active, 'NOT_ENROLLED', 'Your driver account was revoked.', 403); ensure(newDriver?.active || action.type === 'cancel', 'INVALID_ASSIGNMENT', 'Driver is inactive.');
          if (isActive(next)) ensure(!newDriver.activeJobId || newDriver.activeJobId === next.id, 'ACTIVE_JOB', 'A driver can have only one active trip.', 409);
          if (action.type === 'deliver') { const proof = await tx.get(ref.collection('proofs').doc(action.photoId!)); ensure(proof.exists && proof.data()!.driverId === actor.id && proof.data()!.stopId === action.stopId && !proof.data()!.used, 'PROOF_REQUIRED', 'Upload a new photo for this stop.'); tx.update(proof.ref,{ used: true }); }
          if (oldDriver.activeJobId === current.id && (!isActive(next) || next.driverId !== current.driverId)) tx.update(oldDriverRef, { activeJobId: null, location: null });
          if (isActive(next)) tx.update(newDriverRef, { activeJobId: next.id });
          tx.update(ref,next); tx.create(event,{ actor, action, at: next.updatedAt, version: next.version, fingerprint: fp, result: next }); return next;
        });
        if (action.type === 'cancel' || action.type === 'reassign') await notify(job.driverId,job.id,'cancelled'); if (action.type === 'reassign') await notify(result.driverId,result.id,'assigned'); res.json(result); return;
      }
      if (p[3] === 'proofs' && p[4]) {
        validId(p[4]); const record = ref.collection('proofs').doc(p[4]); const file = getStorage().bucket().file(`orgs/${actor.orgId}/jobs/${job.id}/proofs/${p[4]}`);
        if (req.method === 'POST') {
          ensure(actor.role === 'driver' && job.status === 'in_progress' && job.loaded, 'STATE_CONFLICT', 'Upload evidence during your active trip.', 409);
          const stopId = String(req.query.stopId || ''); ensure(job.stops.some(s => s.id === stopId && !s.proof), 'STOP_CONFLICT', 'This stop is not awaiting delivery.', 409);
          const bytes = req.rawBody; const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])); ensure(bytes.length > 100 && (jpeg || png), 'INVALID_PHOTO', 'Upload a JPEG or PNG photo.'); const digest = hash(bytes); const prior = await record.get();
          if (prior.exists) { ensure(prior.data()!.digest === digest && prior.data()!.driverId === actor.id && prior.data()!.stopId === stopId, 'EVENT_CONFLICT', 'Photo ID already used.', 409); res.json({ photoId: p[4] }); return; }
          try { await file.save(bytes,{ resumable:false, contentType: jpeg ? 'image/jpeg' : 'image/png', preconditionOpts:{ ifGenerationMatch:0 }, metadata:{ cacheControl:'private, no-store', metadata:{ digest, driverId:actor.id, stopId } } }); } catch (e: any) { if (e.code !== 412) throw e; const [metadata] = await file.getMetadata(); ensure(metadata.metadata?.digest === digest && metadata.metadata?.driverId === actor.id && metadata.metadata?.stopId === stopId,'EVENT_CONFLICT','Photo ID already used.',409); }
          await db.runTransaction(async tx=>{const previous=await tx.get(record);if(previous.exists){ensure(previous.data()!.digest===digest && previous.data()!.driverId===actor.id && previous.data()!.stopId===stopId,'EVENT_CONFLICT','Photo ID already used.',409);return;}tx.create(record,{ id:p[4], stopId, driverId:actor.id, digest, path:file.name, used:false, createdAt:new Date().toISOString(), expiresAt:Timestamp.fromMillis(Date.now()+photoDays.value()*86400000) });}); res.status(201).json({ photoId:p[4] }); return;
        }
        if (req.method === 'GET') { const proof = await record.get(); ensure(proof.exists && (actor.role === 'manager' || proof.data()!.driverId === actor.id), 'NOT_FOUND','Photo unavailable.',404); ensure(proof.data()!.expiresAt.toMillis() > Date.now(), 'NOT_FOUND','Photo retention period ended.',404); const [metadata] = await file.getMetadata(); const [bytes] = await file.download(); res.type(metadata.contentType || 'image/jpeg').send(bytes); return; }
      }
      if (p[3] === 'locations' && req.method === 'POST') {
        ensure(actor.role === 'driver','FORBIDDEN','Driver access required.',403); validId(body.eventId); ensure(Array.isArray(body.locations) && body.locations.length > 0 && body.locations.length <= 100,'INVALID_LOCATION','Submit 1–100 positions.');
        const now = Date.now(); const positions = body.locations.map((v: any) => { ensure(v && Number.isFinite(v.latitude) && Math.abs(v.latitude)<=90 && Number.isFinite(v.longitude) && Math.abs(v.longitude)<=180 && Number.isFinite(v.accuracy) && v.accuracy>=0 && v.accuracy<=10000 && Number.isFinite(Date.parse(v.at)) && Date.parse(v.at)<=now+60000 && Date.parse(v.at)>=now-locationDays.value()*86400000,'INVALID_LOCATION','Invalid location or capture time.'); return { latitude:v.latitude,longitude:v.longitude,accuracy:v.accuracy,at:v.at }; });
        const locationRef = ref.collection('locations').doc(body.eventId); const driverRef = org().collection('drivers').doc(actor.id); const fp=fingerprint(body);
        await db.runTransaction(async tx => { const [current,prior,driver] = await tx.getAll(ref,locationRef,driverRef); const j=current.data() as Job; authorizeJob(j,actor); ensure(driver.data()?.active,'NOT_ENROLLED','Driver revoked.',403); if (checkEvent(prior.exists ? prior.data() as {fingerprint:string}:undefined,fp)) return; ensure(j.status==='in_progress','STATE_CONFLICT','Tracking has ended for this trip.',409); const latest=positions.reduce((a:any,b:any)=>Date.parse(a.at)>Date.parse(b.at)?a:b); tx.create(locationRef,{ positions,fingerprint:fp,driverId:actor.id,expiresAt:Timestamp.fromMillis(now+locationDays.value()*86400000) }); if (j.tracking==='sharing' && (!driver.data()?.location || Date.parse(latest.at)>Date.parse(driver.data()!.location.at))) tx.update(driverRef,{location:{...latest,jobId:j.id}}); }); res.json({ok:true}); return;
      }
      if (p[3] === 'tracking' && req.method === 'POST') { ensure(actor.role==='driver' && ['paused','sharing','stopped'].includes(body.state),'INVALID_TRACKING','Invalid tracking state.'); await db.runTransaction(async tx=>{const snap=await tx.get(ref);const j=snap.data() as Job;authorizeJob(j,actor);ensure(j.status==='in_progress','STATE_CONFLICT','Trip is no longer active.',409);tx.update(ref,{tracking:body.state});if(body.state!=='sharing')tx.update(org().collection('drivers').doc(actor.id),{location:null});});res.json({ok:true});return; }
      if (p[3] === 'incidents' && req.method === 'POST') {
        ensure(actor.role==='driver','FORBIDDEN','Driver access required.',403); validId(body.eventId); ensure(typeof body.reason==='string' && body.reason.trim().length>=3 && body.reason.length<=1000,'REASON_REQUIRED','Describe the incident.'); const incidentRef=org().collection('incidents').doc(body.eventId); const fp=fingerprint({actor,body,jobId:job.id});
        await db.runTransaction(async tx=>{const [prior,current]=await tx.getAll(incidentRef,ref);authorizeJob(current.data() as Job,actor);if(checkEvent(prior.exists?prior.data() as {fingerprint:string}:undefined,fp))return;tx.create(incidentRef,{id:body.eventId,jobId:job.id,driverId:actor.id,orgId:actor.orgId,reason:body.reason.trim(),status:'open',at:new Date().toISOString(),fingerprint:fp});tx.create(ref.collection('events').doc('incident_'+body.eventId),{type:'incident',actor,at:new Date().toISOString(),incidentId:body.eventId});}); res.json({ok:true});return;
      }
    }
    if (p[1]==='incidents' && p[2] && req.method==='POST') { manager();validId(p[2]);ensure(typeof body.reason==='string' && body.reason.trim().length>=3 && body.reason.length<=1000,'REASON_REQUIRED','Add a resolution.');await db.runTransaction(async tx=>{const ref=org().collection('incidents').doc(p[2]);const d=await tx.get(ref);ensure(d.exists,'NOT_FOUND','Incident not found.',404);ensure(d.data()!.status==='open','STATE_CONFLICT','Incident is already resolved.',409);tx.update(ref,{status:'resolved',resolution:body.reason,resolvedBy:actor.id,resolvedAt:new Date().toISOString()});tx.create(org().collection('jobs').doc(d.data()!.jobId).collection('events').doc('resolution_'+p[2]),{type:'incident_resolved',actor,reason:body.reason,at:new Date().toISOString()});});res.json({ok:true});return; }
    throw new DispatchError('NOT_FOUND','Endpoint not found.',404);
  } catch (error: any) { const known=error instanceof DispatchError; if(!known) console.error('Dispatch request failed',error.code || error.name);res.status(known?error.status:500).json({error:known?error.message:'Service unavailable. Retry with the same event ID.',code:known?error.code:'SERVICE_UNAVAILABLE'}); }
});

/** Bounded cleanup; Firestore TTL removes location batches, this also removes storage objects. */
export const retention = onSchedule({ schedule:'every 24 hours',region:'asia-south1',timeoutSeconds:540 },async()=>{
  const proofs=await db.collectionGroup('proofs').where('expiresAt','<=',Timestamp.now()).limit(500).get();
  for(const p of proofs.docs){await getStorage().bucket().file(p.data().path).delete({ignoreNotFound:true});await p.ref.delete();}
  const locations=await db.collectionGroup('locations').where('expiresAt','<=',Timestamp.now()).limit(2000).get();
  for(let i=0;i<locations.docs.length;i+=400){const batch=db.batch();for(const doc of locations.docs.slice(i,i+400))batch.delete(doc.ref);await batch.commit();}
  const drivers=await org().collection('drivers').get();for(const d of drivers.docs){if(d.data().location && Date.parse(d.data().location.at)<Date.now()-locationDays.value()*86400000)await d.ref.update({location:null});}
});
