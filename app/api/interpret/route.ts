import { interpretAlert } from '../../../lib/kaafila/alert-model.ts';
export async function POST(request:Request){
  try{const raw=await request.text();if(raw.length>12000)return Response.json({error:'Alert is too large.'},{status:413});const body=JSON.parse(raw);if(typeof body.text!=='string'||body.text.trim().length<8||body.text.length>2160)return Response.json({error:'Enter an alert between 8 and 2,160 characters.'},{status:400});return Response.json(interpretAlert(body.text),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Provide a valid text alert.'},{status:400});}
}
