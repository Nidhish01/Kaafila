import { cities } from '../../../lib/kaafila/data';
export async function GET(request:Request){
  const city=cities.find(c=>c.name===new URL(request.url).searchParams.get('city'));
  if(!city)return Response.json({error:'Choose a city from the demo network.'},{status:400});
  const source=`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,precipitation&timezone=UTC&forecast_days=1`;
  try{const response=await fetch(source,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Weather provider unavailable.');const data=await response.json() as {current?:{temperature_2m:number;precipitation:number;time:string}};if(!data.current||!Number.isFinite(data.current.temperature_2m)||!Number.isFinite(data.current.precipitation)||!data.current.time)throw new Error('Incomplete weather observation.');return Response.json({city:city.name,temperature:data.current.temperature_2m,precipitation:data.current.precipitation,time:data.current.time,source},{headers:{'Cache-Control':'public, max-age=300'}});}catch{return Response.json({error:'Live weather unavailable. Replay evidence remains unchanged.'},{status:502});}
}
