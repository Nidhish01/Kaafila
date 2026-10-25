import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { getSetting, setting, queueOther, sync, queue } from './store';
import { api, ApiError, uid } from './api';
const TASK='kaafila-active-trip';
TaskManager.defineTask(TASK,async({data,error})=>{const active=await getSetting<{jobId:string;uid:string}>('tracking');if(!active || active.uid!==uid()){await stopTracking();return;}try{await sync();if((await queue()).some(q=>q.job_id===active.jobId && q.state==='conflict')){await stopTracking();return;}const current=await api('jobs/'+active.jobId);if(!['assigned','accepted','in_progress'].includes(current.status)){await stopTracking();return;}}catch(e){if(e instanceof ApiError && [401,403,404].includes(e.status)){await stopTracking();return;}}if(error){await setting('trackingError',error.message);return;}if(!await getSetting('tracking'))return;const locations=(data as {locations?:Location.LocationObject[]})?.locations || [];const points=locations.filter(l=>l.coords.accuracy!==null).map(l=>({latitude:l.coords.latitude,longitude:l.coords.longitude,accuracy:l.coords.accuracy,at:new Date(l.timestamp).toISOString()}));if(points.length){await setting('trackingError',null);for(let i=0;i<points.length;i+=100)await queueOther(active.jobId,'locations',{locations:points.slice(i,i+100)});await sync().catch(()=>{});}});
export async function startTracking(jobId:string,title:string,body:string){
  const foreground=await Location.requestForegroundPermissionsAsync();if(foreground.status!=='granted')throw new Error('LOCATION_PERMISSION');
  const background=await Location.requestBackgroundPermissionsAsync();if(background.status!=='granted')throw new Error('BACKGROUND_PERMISSION');
  if(!await Location.hasServicesEnabledAsync())throw new Error('LOCATION_DISABLED');
  await setting('tracking',{jobId,uid:uid()});
  try{await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.High,timeInterval:30000,distanceInterval:0,deferredUpdatesInterval:30000,foregroundService:{notificationTitle:title,notificationBody:body,notificationColor:'#215747',killServiceOnDestroy:true},pausesUpdatesAutomatically:false});await setting('trackingError',null);}catch(e){await setting('tracking',null);throw e;}
}
export async function stopTracking(){await setting('tracking',null);if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);}
export async function tracking(){return !!await getSetting('tracking') && !await getSetting('trackingError') && await Location.hasStartedLocationUpdatesAsync(TASK);}
