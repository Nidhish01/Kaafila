import weights from '../../model/alertnet.json' with { type: 'json' };
import { cities, type ProductId, type DisruptionType } from './data.ts';

type Head = { labels: string[]; logPrior: number[]; logLikelihood: number[][] };
const vocab = new Map(weights.vocabulary.map((token,index)=>[token,index]));
export function textFeatures(text: string) {
  const words=text.toLowerCase().match(/[a-z]+/g)||[];
  const features=new Map<string,number>();
  const add=(token:string)=>features.set(token,(features.get(token)||0)+1);
  words.forEach((word,index)=>{add('w:'+word);if(index)add('b:'+words[index-1]+'_'+word);if(word.length>=3){const padded='^'+word+'$';for(let i=0;i<padded.length-2;i++)add('c:'+padded.slice(i,i+3));}});
  return features;
}
function classify(features:Map<string,number>,head:Head){
  const scores=[...head.logPrior];
  for(const [token,count] of features){const index=vocab.get(token);if(index!==undefined)for(let i=0;i<scores.length;i++)scores[i]+=count*head.logLikelihood[i][index];}
  const max=Math.max(...scores);const exps=scores.map(s=>Math.exp((s-max)/weights.temperature));const sum=exps.reduce((a,b)=>a+b,0);
  return head.labels.map((label,i)=>({label,score:Math.round(exps[i]/sum*1000)/1000})).sort((a,b)=>b.score-a.score);
}
const productWords:Record<ProductId,RegExp>={milk:/\b(milk|dairy|doodh)\b/,bread:/\b(bread|loaves)\b/,rice:/\b(rice|basmati|chawal)\b/,medicine:/\b(medicine|medicines|medical|pharmacy|healthcare|care kits?|aid kits?)\b/};
const eventSignal=/\b(flood\w*|rain\w*|storm\w*|weather|cyclone|fog|monsoon|landslide\w*|demand|surge\w*|spik\w*|sales|orders?|purchases?|supplier|vendor|factory|wholesaler|manufacturer|production|refrigerat\w*|temperature|chill\w*|spoil\w*|quarantin\w*|cold|freezer|cooling|delay\w*|late|traffic|truck|carrier|driver|vehicle|strike|shipment|transport|delivery)\b/;

export function interpretAlert(text:string){
  const lower=text.toLowerCase();const features=textFeatures(text);
  const types=classify(features,weights.heads.type);const products=classify(features,weights.heads.product);
  const productMentions=(Object.entries(productWords) as [ProductId,RegExp][]).filter(([,regex])=>regex.test(lower)).map(([id])=>id);
  const namedCities=cities.filter(c=>new RegExp(`\\b${c.name.toLowerCase()}\\b`).test(lower)).map(c=>c.name);
  // Explicit durations only. Do not guess missing delay or silently use a default.
  const durations=[...lower.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*(hours?|hrs?|h|days?)\b/g)].map(m=>Number(m[1])*(m[2].startsWith('day')?24:1));
  const uniqueDurations=[...new Set(durations)];
  const multiplierMatch=lower.match(/\b(\d+(?:\.\d+)?)\s*(?:x\b|×|times\b)/);
  const demandMultiplier=multiplierMatch?Number(multiplierMatch[1]):/\b(doubled?|twice)\b/.test(lower)?2:/\b(tripled?|triple)\b/.test(lower)?3:null;
  const hasNegation=/\b(no|not|never|isn't|wasn't|without|resolved|cancelled alert|false alarm)\b/.test(lower);
  const knownWordCount=[...features.keys()].filter(f=>f.startsWith('w:')&&vocab.has(f)).length;
  const warnings:string[]=[];
  if(productMentions.length!==1)warnings.push(productMentions.length?'Multiple products mentioned. Select one product per investigation.':'No supported product identified. Choose one manually.');
  if(!namedCities.length)warnings.push('No supported city identified. Choose a city from the demo network.');
  if(uniqueDurations.length!==1)warnings.push(uniqueDurations.length?'Multiple time periods found. Confirm the replenishment gap.':'No explicit replenishment gap found. Enter the hours until supply resumes.');
  if(hasNegation)warnings.push('Negation or resolution language found. Review the disruption type manually.');
  const typeReliable=eventSignal.test(lower)&&knownWordCount>=3&&types[0].score>=.65&&!hasNegation;
  const productReliable=productMentions.length===1&&products[0].score>=.65&&products[0].label===productMentions[0];
  if(!typeReliable)warnings.push('Disruption classification needs review.');
  const delayHours=uniqueDurations.length===1&&uniqueDurations[0]>=1&&uniqueDurations[0]<=96?uniqueDurations[0]:null;
  if(uniqueDurations.length===1&&delayHours===null)warnings.push('The time gap must be between 1 and 96 hours.');
  if(demandMultiplier!==null&&(demandMultiplier<1||demandMultiplier>4))warnings.push('Demand multiplier must be between 1× and 4×.');
  return {model:weights.name,version:weights.version,architecture:weights.architecture,type:typeReliable?types[0].label as DisruptionType:null,product:productReliable?products[0].label as ProductId:null,typeScores:types,productScores:products,cities:namedCities,delayHours,demandMultiplier:demandMultiplier!==null&&demandMultiplier>=1&&demandMultiplier<=4?demandMultiplier:null,warnings,requiresReview:warnings.length>0||!productReliable,scoreNotice:'Model scores are uncalibrated, not probabilities of correctness. Confirm all extracted fields.',trainingExamples:weights.trainingExamples};
}
export type ModelPrediction=ReturnType<typeof interpretAlert>;
