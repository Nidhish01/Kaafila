import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const path=resolve('firebase/functions/.secret.local');
const params=resolve('firebase/functions/.env.local');
if(existsSync(path))throw new Error('Move your existing .secret.local aside before running the isolated emulator suite.');
if(existsSync(params))throw new Error('Move your existing .env.local aside before running the isolated emulator suite.');
writeFileSync(path,'DISPATCH_GATEWAY_SECRET=emulator-only-kaafila-gateway-secret-not-for-production\n');
writeFileSync(params,'DISPATCH_ORG_ID=kaafila\nPHOTO_RETENTION_DAYS=90\nLOCATION_RETENTION_DAYS=30\n');
const npm=process.platform==='win32'?'npm.cmd':'npm';const npx=process.platform==='win32'?'npx.cmd':'npx';
try{
 const build=spawnSync(npm,['run','build'],{cwd:resolve('firebase/functions'),stdio:'inherit',shell:process.platform==='win32'});if(build.status)process.exitCode=build.status;
 else {const r=spawnSync(npx,['--yes','firebase-tools@15.1.0','emulators:exec','--project','demo-kaafila','--only','auth,firestore,storage,functions','"node --test ../tests/dispatch.emulator.test.mjs"'],{cwd:resolve('firebase'),stdio:'inherit',shell:true,env:{...process.env,GCLOUD_PROJECT:'demo-kaafila',FUNCTIONS_DISCOVERY_TIMEOUT:'60'}});process.exitCode=r.status||0;}
}finally{unlinkSync(path);unlinkSync(params);}
