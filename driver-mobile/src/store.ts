import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { File, Directory, Paths } from 'expo-file-system';
import { api, ApiError, uid } from './api';
import { applyAction, type Job, type Action } from '../../shared/dispatch';
let opening: ReturnType<typeof SQLite.openDatabaseAsync> | undefined;
export async function database(){if(!opening)opening=(async()=>{const d=await SQLite.openDatabaseAsync('kaafila-driver.db');await d.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, photo TEXT, state TEXT NOT NULL DEFAULT \'saved\', error TEXT);');await d.runAsync("UPDATE outbox SET state='saved' WHERE state='syncing'");return d;})();return opening;}
export async function getSetting<T>(key:string):Promise<T|null>{const d=await database();const r=await d.getFirstAsync<{value:string}>('SELECT value FROM kv WHERE key=?',key);return r?JSON.parse(r.value):null;}
export async function setting(key:string,value:unknown){await(await database()).runAsync('INSERT OR REPLACE INTO kv VALUES (?,?)',key,JSON.stringify(value));}
export type QueueItem={seq:number;id:string;job_id:string;kind:string;payload:string;photo:string|null;state:string;error:string|null};
export async function queue(){return(await database()).getAllAsync<QueueItem>('SELECT * FROM outbox ORDER BY seq');}
export async function jobs(){return(await(await database()).getAllAsync<{payload:string}>('SELECT payload FROM jobs')).map(x=>JSON.parse(x.payload) as Job);}
export async function saveJob(j:Job){await(await database()).runAsync('INSERT OR REPLACE INTO jobs VALUES (?,?)',j.id,JSON.stringify(j));}
export async function bindAccount(account:string){const old=await getSetting<string>('account');if(old && old!==account){await clearPrivateData();}await setting('account',account);}
export async function clearPrivateData(){const d=await database();await d.execAsync('DELETE FROM jobs; DELETE FROM outbox; DELETE FROM kv;');const folder=new Directory(Paths.document,'proofs');if(folder.exists)folder.delete();}
export function id(){return Crypto.randomUUID();}
export async function savePhoto(uri:string){const folder=new Directory(Paths.document,'proofs');if(!folder.exists)folder.create();const target=new File(folder,id()+'.jpg');new File(uri).copy(target);return target.uri;}
export async function enqueue(j:Job,action:Omit<Action,'eventId'|'expectedVersion'>,photo?:string){
  const a:Action={...action,eventId:id(),expectedVersion:j.version};if(photo)a.photoId=id();const next=applyAction(j,a,{role:'driver',id:j.driverId,orgId:j.orgId},new Date().toISOString());
  const d=await database();await d.withExclusiveTransactionAsync(async tx=>{const block=await tx.getFirstAsync("SELECT id FROM outbox WHERE job_id=? AND state='conflict'",j.id);if(block)throw new Error('Resolve the pending conflict first.');await tx.runAsync('INSERT INTO outbox (id,job_id,kind,payload,photo) VALUES (?,?,?,?,?)',a.eventId,j.id,'action',JSON.stringify(a),photo || null);await tx.runAsync('INSERT OR REPLACE INTO jobs VALUES (?,?)',j.id,JSON.stringify(next));});return next;
}
export async function queueOther(jobId:string,kind:'locations'|'incidents'|'tracking',body:object){const eventId=id();await(await database()).runAsync('INSERT INTO outbox (id,job_id,kind,payload) VALUES (?,?,?,?)',eventId,jobId,kind,JSON.stringify({...body,eventId}));}
let running:Promise<void>|null=null;
export function sync(){if(!running)running=runSync().finally(()=>{running=null;});return running;}
async function runSync(){
  if(!uid())return; const d=await database();const account=uid();
  for(const item of await queue()){
    if(account!==uid())return;
    if(item.state==='conflict')continue;
    const blocked=await d.getFirstAsync("SELECT id FROM outbox WHERE job_id=? AND state='conflict'",item.job_id);if(blocked)continue;
    await d.runAsync("UPDATE outbox SET state='syncing',error=NULL WHERE id=?",item.id);
    try{
      const payload=JSON.parse(item.payload);
      if(item.photo){const file=new File(item.photo);if(!file.exists)throw new ApiError(409,'PHOTO_MISSING','The saved photo is missing. Review this event.');await api(`jobs/${item.job_id}/proofs/${payload.photoId}?stopId=${encodeURIComponent(payload.stopId)}`,undefined,{bytes:await file.bytes(),contentType:'image/jpeg'});}
      const result=await api(`jobs/${item.job_id}/${item.kind==='action'?'actions':item.kind}`,payload);
      if(account!==uid())return;
      await d.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('DELETE FROM outbox WHERE id=?',item.id);const pending=await tx.getFirstAsync("SELECT id FROM outbox WHERE job_id=? AND kind='action'",item.job_id);if(!pending && item.kind==='action')await tx.runAsync('INSERT OR REPLACE INTO jobs VALUES (?,?)',result.id,JSON.stringify(result));});
      if(item.photo){const file=new File(item.photo);if(file.exists)file.delete();}
    }catch(e){const conflict=e instanceof ApiError && [400,403,404,409].includes(e.status);await d.runAsync('UPDATE outbox SET state=?,error=? WHERE id=?',conflict?'conflict':'saved',e instanceof Error?e.message:String(e),item.id);if(e instanceof ApiError && [401,403].includes(e.status))throw e;if(!conflict)break;}
  }
}
export async function refreshJobs(){const result=await api('jobs');const pending=await queue();const d=await database();const remoteIds=new Set<string>(result.jobs.map((j:Job)=>j.id));for(const local of await jobs()){if(!remoteIds.has(local.id)){if(pending.some(p=>p.job_id===local.id))await d.runAsync("UPDATE outbox SET state='conflict',error='Assignment no longer available' WHERE job_id=?",local.id);else await d.runAsync('DELETE FROM jobs WHERE id=?',local.id);}}
  for(const j of result.jobs as Job[])if(!pending.some(p=>p.job_id===j.id && p.kind==='action'))await saveJob(j);return result.jobs as Job[];
}
/** Explicit driver choice: discard the conflicted job's entire dependent chain, then load authoritative state. */
export async function discardConflict(jobId:string){const remote=await api('jobs/'+jobId).catch((e:unknown)=>{if(e instanceof ApiError && [403,404].includes(e.status))return null;throw e;});const d=await database();for(const q of (await queue()).filter(q=>q.job_id===jobId)){if(q.photo){const f=new File(q.photo);if(f.exists)f.delete();}}await d.runAsync('DELETE FROM outbox WHERE job_id=?',jobId);if(remote)await saveJob(remote);else await d.runAsync('DELETE FROM jobs WHERE id=?',jobId);}
