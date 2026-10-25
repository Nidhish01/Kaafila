import { getChatGPTUser } from '../../../chatgpt-auth';
import { dispatchEnv } from '../../../../lib/dispatch-env';
export const dynamic='force-dynamic';
async function proxy(req:Request,{params}:{params:Promise<{path:string[]}>}){
  const env=dispatchEnv();const path=(await params).path;const user=await getChatGPTUser();
  if(path.join('/')==='status')return Response.json({configured:!!(env.DISPATCH_API_URL&&env.DISPATCH_GATEWAY_SECRET&&env.DISPATCH_MANAGER_IDS),signedIn:!!user,managerId:user?.userId || null},{headers:{'Cache-Control':'no-store'}});
  if(!user)return Response.json({error:'Sign in to the private manager website.'},{status:401});
  if(!env.DISPATCH_API_URL||!env.DISPATCH_GATEWAY_SECRET||!env.DISPATCH_MANAGER_IDS)return Response.json({error:'Firebase dispatch is not configured yet. Follow the setup guide to activate real operations.'},{status:503});
  if(!env.DISPATCH_MANAGER_IDS.split(',').map(x=>x.trim()).includes(user.userId))return Response.json({error:'Your signed-in account is not enrolled as a dispatch manager.'},{status:403});
  if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
  if(path.some(p=>!p || !/^[A-Za-z0-9_-]+$/.test(p)))return Response.json({error:'Invalid API path.'},{status:400});
  try{
    const body=req.method==='POST'?await req.text():undefined;if(body&&body.length>200000)return Response.json({error:'Request is too large.'},{status:413});
    const response=await fetch(env.DISPATCH_API_URL.replace(/\/$/,'')+'/v1/'+path.join('/'),{method:req.method,headers:{Authorization:'Bearer '+env.DISPATCH_GATEWAY_SECRET,'x-kaafila-manager':user.userId,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(30000)});
    return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')||'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'Dispatch is unavailable. Retry with the same event ID.'},{status:502});}
}
export const GET=proxy;export const POST=proxy;
