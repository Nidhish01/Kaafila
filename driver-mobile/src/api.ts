import Constants from 'expo-constants';
import { getAuth, getIdToken, onAuthStateChanged, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';
import { getMessaging, setBackgroundMessageHandler, getToken, onMessage, onTokenRefresh, deleteToken } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
export const apiUrl = String(Constants.expoConfig?.extra?.apiUrl || '').replace(/\/$/, '');
export const configured = !!Constants.expoConfig?.extra?.firebaseConfigured && /^https:\/\//.test(apiUrl);
export class ApiError extends Error { status: number; code: string; constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;} }
export async function api(path:string, body?:unknown, options?:{ bytes?:Uint8Array; contentType?:string }) {
  if (!configured) throw new ApiError(503,'SETUP_REQUIRED','Firebase setup is required.');
  const user=getAuth().currentUser; if(!user)throw new ApiError(401,'UNAUTHENTICATED','Sign in again.');
  let token:string;try{token=await getIdToken(user);}catch(error:any){if(['auth/user-disabled','auth/user-token-expired','auth/invalid-user-token','auth/user-not-found'].includes(error?.code))throw new ApiError(401,'UNAUTHENTICATED','Sign in again.');throw error;} const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),25000);
  try { const r=await fetch(apiUrl+'/v1/'+path,{method:body!==undefined || options?.bytes?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':options?.contentType || 'application/json'},body:options?.bytes ? options.bytes as unknown as BodyInit : body!==undefined?JSON.stringify(body):undefined,signal:controller.signal});const value=await r.json();if(!r.ok)throw new ApiError(r.status,value.code,value.error);return value; } finally { clearTimeout(timeout); }
}
export const login=(phone:string)=>signInWithPhoneNumber(getAuth(),phone);
export const authWatch=(fn:(user:unknown)=>void)=>configured?onAuthStateChanged(getAuth(),fn):()=>{};
export const uid=()=>configured?getAuth().currentUser?.uid || null:null;
export const logout=()=>configured?signOut(getAuth()):Promise.resolve();
export function configureMessaging(){ if(configured)setBackgroundMessageHandler(getMessaging(),async()=>{/* The notification prompts a refresh; it cannot mutate cached assignments. */}); }
export async function notifications(refresh:()=>void){
  if(!configured)return()=>{};
  if(Platform.OS==='android' && Number(Platform.Version)>=33){const granted=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);if(granted!==PermissionsAndroid.RESULTS.GRANTED)return()=>{};}
  await api('device-token',{token:await getToken(getMessaging())});
  const a=onMessage(getMessaging(),refresh);const b=onTokenRefresh(getMessaging(),token=>{void api('device-token',{token}).catch(()=>{});});return()=>{a();b();};
}
export async function unregisterNotifications(){if(!configured)return;try{const token=await getToken(getMessaging());await api('device-token',{token,remove:true});await deleteToken(getMessaging());}catch{/* Expired sessions are still signed out locally. */}}
