import { AsyncLocalStorage } from 'node:async_hooks';
type DispatchEnv={DISPATCH_API_URL?:string;DISPATCH_GATEWAY_SECRET?:string;DISPATCH_MANAGER_IDS?:string};
const context=new AsyncLocalStorage<DispatchEnv>();
export const runWithDispatchEnv=<T>(env:DispatchEnv,fn:()=>T)=>context.run(env,fn);
export const dispatchEnv=()=>context.getStore() || {};
