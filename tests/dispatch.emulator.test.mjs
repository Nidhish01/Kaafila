import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleJob } from '../shared/sample-job.ts';
const project='demo-kaafila';
const root=`http://127.0.0.1:5001/${project}/asia-south1/dispatch/v1`;
const secret='emulator-only-kaafila-gateway-secret-not-for-production';
const manager={Authorization:'Bearer '+secret,'x-kaafila-manager':'test-manager'};
async function request(path,body,headers=manager,method=body?'POST':'GET'){const r=await fetch(root+'/'+path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,value:await r.json()};}
async function phoneLogin(phone){const base='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';const sent=await fetch(base+'sendVerificationCode?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone,recaptchaToken:'emulator'})}).then(r=>r.json());const all=await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/verificationCodes`).then(r=>r.json());const code=all.verificationCodes.find(v=>v.sessionInfo===sent.sessionInfo).code;const login=await fetch(base+'signInWithPhoneNumber?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionInfo:sent.sessionInfo,code})}).then(r=>r.json());assert(login.idToken,JSON.stringify(login));return {Authorization:'Bearer '+login.idToken};}
let driverA,driverB;let current;
const phoneA='+919000000001',phoneB='+919000000002';
test('Firebase emulator acceptance suite',async t=>{
  await t.test('enroll drivers, register vehicles and phone-authenticate',async()=>{
    for(const id of ['vehicle-a','vehicle-b'])assert.equal((await request('vehicles',{id,registration:id.toUpperCase()})).status,201);
    for(const [id,phone,vehicleId] of [['driver-a',phoneA,'vehicle-a'],['driver-b',phoneB,'vehicle-b']])assert.equal((await request('drivers',{id,phone,vehicleId,name:id})).status,201);
    driverA=await phoneLogin(phoneA);driverB=await phoneLogin(phoneB);assert.equal((await request('me',undefined,driverA)).status,200);
  });
  await t.test('invalid ID token, invalid OTP, unknown and revoked enrollment fail',async()=>{
    assert.equal((await request('jobs',undefined,{Authorization:'Bearer invalid'})).status,401);
    const token=driverA.Authorization.slice(7).split('.');const payload=JSON.parse(Buffer.from(token[1],'base64url').toString());payload.exp=Math.floor(Date.now()/1000)-60;token[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');assert.equal((await request('jobs',undefined,{Authorization:'Bearer '+token.join('.')})).status,401);
    const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionInfo:'expired-session',code:'123456'})});assert.equal(r.status,400);
    const unknown=await phoneLogin('+919000000003');assert.equal((await request('jobs',undefined,unknown)).status,403);
    assert.equal((await request('drivers/driver-b/status',{active:false})).status,200);assert.equal((await request('jobs',undefined,driverB)).status,403);assert.equal((await request('drivers/driver-b/status',{active:true})).status,200);
  });
  await t.test('job creation and all read/write surfaces isolate drivers',async()=>{
    const j=sampleJob();const {status,version,orgId,reviewReasons,tracking,createdAt,updatedAt,...draft}=j;const made=await request('jobs',{...draft,id:'pilot-test',eventId:'create-pilot',driverId:'driver-a',vehicleId:'vehicle-a'});assert.equal(made.status,201,JSON.stringify(made));current=made.value;
    for(const path of ['jobs/pilot-test','jobs/pilot-test/proofs/photo-1'])assert.equal((await request(path,undefined,driverB)).status,403);
    assert.equal((await request('jobs/pilot-test/locations',{eventId:'bad-location',locations:[]},driverB)).status,403);
    assert.equal((await request('jobs/pilot-test/actions',{eventId:'bad-action',expectedVersion:1,type:'accept'},driverB)).status,403);
    assert.equal((await request('dashboard',undefined,driverA)).status,403);assert.equal((await request('jobs',undefined,driverB)).value.jobs.length,0);
    const direct=await fetch('http://127.0.0.1:8080/v1/projects/demo-kaafila/databases/(default)/documents/orgs/kaafila/jobs/pilot-test');assert.equal(direct.status,403);
  });
  async function action(a,auth=driverA){const r=await request('jobs/pilot-test/actions',{eventId:'event-'+crypto.randomUUID(),expectedVersion:current.version,...a},auth);if(r.status===200)current=r.value;return r;}
  await t.test('duplicate retries return one transition and conflicts are explicit',async()=>{
    const event={eventId:'accept-once',expectedVersion:1,type:'accept'};const a=await request('jobs/pilot-test/actions',event,driverA);const b=await request('jobs/pilot-test/actions',event,driverA);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.value.version,2);assert.equal(b.value.version,2);current=b.value;
    assert.equal((await request('jobs/pilot-test/actions',{...event,type:'decline',reason:'No shift'},driverA)).status,409);
    assert.equal((await action({type:'start',expectedVersion:1,sharing:true})).status,409);
    assert.equal((await action({type:'start',sharing:true})).status,200);
  });
  await t.test('one active trip per driver enforced transactionally',async()=>{const j=sampleJob();const made=await request('jobs',{...j,id:'second-job',eventId:'create-second',driverId:'driver-a',vehicleId:'vehicle-a',stops:j.stops});assert.equal(made.status,201);assert.equal((await request('jobs/second-job/actions',{eventId:'second-accept',expectedVersion:1,type:'accept'},driverA)).status,409);});
  await t.test('pickup, private proof and idempotent partial delivery',async()=>{
    assert.equal((await action({type:'pickup',quantities:{milk:60,bread:20}})).status,200);
    const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(200)]);const upload=await fetch(root+'/jobs/pilot-test/proofs/photo-1?stopId=stop-1',{method:'POST',headers:{...driverA,'Content-Type':'image/jpeg'},body:bytes});assert.equal(upload.status,201,await upload.text());
    const event={eventId:'delivery-once',expectedVersion:current.version,type:'deliver',stopId:'stop-1',quantities:{milk:30,bread:12},receiver:'Test receiver',photoId:'photo-1',outcome:'delivered',reason:'Ten cartons damaged'};
    const first=await request('jobs/pilot-test/actions',event,driverA);assert.equal(first.status,200,JSON.stringify(first));const second=await request('jobs/pilot-test/actions',event,driverA);assert.equal(second.status,200);assert.equal(second.value.version,first.value.version);current=second.value;
    assert.equal((await fetch(root+'/jobs/pilot-test/proofs/photo-1',{headers:manager})).status,200);assert.equal((await request('jobs/pilot-test/proofs/photo-1',undefined,driverB)).status,403);
    const direct=await fetch('http://127.0.0.1:9199/v0/b/demo-kaafila.appspot.com/o/orgs%2Fkaafila%2Fjobs%2Fpilot-test%2Fproofs%2Fphoto-1?alt=media');assert.equal(direct.status,403);
    assert.equal((await action({type:'deliver',stopId:'stop-2',quantities:{milk:31,bread:8},receiver:'Test receiver',photoId:'photo-2',outcome:'delivered'})).value.code,'STOCK_EXCEEDED');
    const history=await request('jobs/pilot-test/events');assert.equal(history.value.events.filter(e=>e.id==='delivery-once').length,1);
  });
  await t.test('locations preserve capture time, cancellation blocks stale offline work',async()=>{
    const point={eventId:'location-one',locations:[{latitude:30.3,longitude:76.3,accuracy:15,at:new Date().toISOString()}]};assert.equal((await request('jobs/pilot-test/locations',point,driverA)).status,200);assert.equal((await request('jobs/pilot-test/locations',point,driverA)).status,200);
    const previous=current.version;assert.equal((await action({type:'cancel',reason:'Store closed'},manager)).status,200);assert.equal((await action({type:'complete',expectedVersion:previous})).status,409);assert.equal((await request('jobs/pilot-test/locations',{...point,eventId:'after-cancel'},driverA)).status,409);
    assert.equal((await request('dashboard')).value.drivers.find(d=>d.id==='driver-a').location,null);
  });
  await t.test('concurrent accepts serialize and reassignment revokes the original driver',async()=>{
    const results=await Promise.all(['concurrent-a','concurrent-b'].map(eventId=>request('jobs/second-job/actions',{eventId,type:'accept',expectedVersion:1},driverA)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const moved=await request('jobs/second-job/actions',{eventId:'manager-reassign',expectedVersion:2,type:'reassign',driverId:'driver-b',reason:'Shift handover'});assert.equal(moved.status,200);assert.equal(moved.value.version,3);
    assert.equal((await request('jobs/second-job',undefined,driverA)).status,403);assert.equal((await request('jobs/second-job',undefined,driverB)).status,200);
    assert.equal((await request('jobs/second-job/actions',{eventId:'old-driver-start',expectedVersion:2,type:'start',sharing:true},driverA)).status,403);
  });
});
