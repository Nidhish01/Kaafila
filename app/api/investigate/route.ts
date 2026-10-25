import { investigate } from '../../../lib/kaafila/engine.ts';
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 12_000) return Response.json({error:'Alert is too large.'},{status:413});
    const result = investigate(JSON.parse(body));
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Could not investigate this alert.'},{status:400});
  }
}
