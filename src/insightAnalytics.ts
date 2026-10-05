import type { Analysis, Finding } from './ai';

export type InsightScope='week'|'month';
export interface InsightPoint { key:string; label:string; findings:number; words:number }
export interface InsightSummary {
  start:string; end:string; analyses:number; notes:number; words:number; findings:number;
  reviewed:number; accepted:number; dismissed:number; acceptanceRate:number|null;
  findingsPer100:number|null; categories:{category:Finding['category'];count:number}[];
  rules:{ruleId:string;count:number;accepted:number;example:string;replacement:string;category:Finding['category']}[];
  points:InsightPoint[]; focus:string|null; improvement:number|null;
}
const parse=(key:string)=>new Date(`${key}T12:00:00Z`);
const key=(date:Date)=>date.toISOString().slice(0,10);
export function shiftDate(keyValue:string,days:number){const date=parse(keyValue);date.setUTCDate(date.getUTCDate()+days);return key(date);}
export function scopeBounds(scope:InsightScope,anchor:string){
  const date=parse(anchor);
  if(scope==='week'){const monday=(date.getUTCDay()+6)%7;return {start:shiftDate(anchor,-monday),end:shiftDate(anchor,6-monday)};}
  return {start:`${anchor.slice(0,7)}-01`,end:key(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12)))};
}
function latestPerNote(rows:Analysis[],start:string,end:string){
  const latest=new Map<string,Analysis>();
  for(const row of rows)if(row.dateKey>=start&&row.dateKey<=end){const old=latest.get(row.noteId);if(!old||old.createdAt<row.createdAt)latest.set(row.noteId,row);}
  return [...latest.values()];
}
export function buildInsightSummary(rows:Analysis[],scope:InsightScope,anchor:string):InsightSummary {
  const {start,end}=scopeBounds(scope,anchor), analyses=rows.filter(row=>row.dateKey>=start&&row.dateKey<=end);
  const notes=latestPerNote(rows,start,end),decisionMap=new Map<string,'accepted'|'dismissed'>();
  for(const analysis of analyses)for(const decision of analysis.decisions)decisionMap.set(`${decision.analysisId}:${decision.findingId}`,decision.action);
  const findings=notes.flatMap(analysis=>analysis.findings.map(finding=>({analysis,finding,decision:decisionMap.get(`${analysis.id}:${finding.id}`)})));
  const accepted=findings.filter(item=>item.decision==='accepted').length,dismissed=findings.filter(item=>item.decision==='dismissed').length;
  const words=notes.reduce((sum,row)=>sum+(row.plainText.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length??0),0);
  const categoryMap=new Map<Finding['category'],number>(),ruleMap=new Map<string,{count:number;accepted:number;example:string;replacement:string;category:Finding['category']}>();
  for(const {finding,decision} of findings){
    categoryMap.set(finding.category,(categoryMap.get(finding.category)??0)+1);
    const value=ruleMap.get(finding.ruleId)??{count:0,accepted:0,example:finding.quote,replacement:finding.replacement,category:finding.category};value.count++;if(decision==='accepted')value.accepted++;ruleMap.set(finding.ruleId,value);
  }
  const categories=[...categoryMap].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count);
  const rules=[...ruleMap].map(([ruleId,value])=>({ruleId,...value})).sort((a,b)=>b.count-a.count||a.ruleId.localeCompare(b.ruleId)).slice(0,6);
  const pointKeys:string[]=[];
  if(scope==='week')for(let i=0;i<7;i++)pointKeys.push(shiftDate(start,i));
  else for(let cursor=start;cursor<=end;cursor=shiftDate(cursor,7))pointKeys.push(cursor);
  const points=pointKeys.map((pointStart,index)=>{const pointEnd=scope==='week'?pointStart:(pointKeys[index+1]?shiftDate(pointKeys[index+1],-1):end);const selected=notes.filter(row=>row.dateKey>=pointStart&&row.dateKey<=pointEnd);return {key:pointStart,label:scope==='week'?new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(parse(pointStart)):`${parse(pointStart).getUTCDate()}–${parse(pointEnd).getUTCDate()}`,findings:selected.reduce((sum,row)=>sum+row.findings.length,0),words:selected.reduce((sum,row)=>sum+(row.plainText.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length??0),0)};});
  const half=Math.ceil(points.length/2),first=points.slice(0,half),second=points.slice(half);
  const rate=(items:InsightPoint[])=>{const total=items.reduce((s,p)=>s+p.words,0);return total?items.reduce((s,p)=>s+p.findings,0)/total*100:null;};
  const before=rate(first),after=rate(second),improvement=before!==null&&after!==null&&before>0?Math.round((before-after)/before*100):null;
  return {start,end,analyses:analyses.length,notes:notes.length,words,findings:findings.length,reviewed:accepted+dismissed,accepted,dismissed,acceptanceRate:accepted+dismissed?Math.round(accepted/(accepted+dismissed)*100):null,findingsPer100:words?Math.round(findings.length/words*1000)/10:null,categories,rules,points,focus:rules[0]?.ruleId??null,improvement};
}

export const ruleInfo:Record<string,{name:string;explanation:string}>={
  'grammar.article':{name:'Articles and endings',explanation:'Checks article gender, case, and declension.'},
  'grammar.case':{name:'Case endings',explanation:'Checks noun and adjective case forms after verbs or prepositions.'},
  'grammar.agreement':{name:'Agreement',explanation:'Checks agreement in number, gender, or person.'},
  'grammar.verb_form':{name:'Verb forms',explanation:'Checks conjugation, infinitives, participles, and auxiliaries.'},
  'grammar.tense':{name:'Tense',explanation:'Checks the tense selected for the context.'},
  'grammar.preposition':{name:'Prepositions',explanation:'Checks prepositions and the forms they require.'},
  'grammar.pronoun':{name:'Pronouns and reflexives',explanation:'Checks pronoun case and reflexive verb forms.'},
  'grammar.word_order':{name:'Word order',explanation:'Checks where words belong in a sentence.'},
  'mechanics.spelling':{name:'Spelling',explanation:'Checks conventional spelling.'},
  'mechanics.punctuation':{name:'Punctuation',explanation:'Checks punctuation marks and sentence boundaries.'},
  'mechanics.capitalization':{name:'Capitalization',explanation:'Checks upper- and lower-case spelling.'},
  'vocabulary.word_choice':{name:'Word choice',explanation:'Checks whether a word fits the intended meaning.'},
  'vocabulary.collocation':{name:'Natural word combinations',explanation:'Checks words that native speakers commonly combine.'},
  'style.naturalness':{name:'Natural phrasing',explanation:'Suggests a more idiomatic or simpler expression.'},
  other:{name:'Other language pattern',explanation:'A supported pattern that does not fit a more specific category.'},
};
export const fallbackRuleInfo={name:'Language pattern',explanation:'A language pattern identified by the review.'};
