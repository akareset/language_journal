import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Analysis, Decision, Finding } from './ai';

export interface Change { from: number; to: number; text: string }
export interface ProjectedFinding extends Finding { currentStart: number; currentEnd: number }
export interface AcceptedChange { from:number; to:number; original:string; replacement:string; category:Finding['category']; explanation:string; key:string }

/** A just-saved decision may still be present in the autosave draft. */
export function mergeDecisions(saved:Decision[], pending:Decision[]):Decision[] {
  return [...new Map([...saved,...pending].map(decision=>[decision.id,decision])).values()];
}

/** Reconstructs accepted edits from persisted snapshots, then maps only unchanged
 * passages onto today's document. Edited/undone passages are never guessed. */
export function acceptedChanges(history:Analysis[], pending:Decision[], current:string):AcceptedChange[] {
  const result:AcceptedChange[]=[];
  for(const analysis of [...history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))) {
    const decisions=mergeDecisions(analysis.decisions,pending.filter(d=>d.analysisId===analysis.id));
    const accepted=new Set(decisions.filter(d=>d.action==='accepted').map(d=>d.findingId));
    const projection=projectAnalysis(analysis.plainText,analysis.findings,decisions);
    if(!projection)continue;
    const later=wordChanges(projection.text,current);
    let shift=0;
    for(const finding of [...analysis.findings].filter(f=>accepted.has(f.id)).sort((a,b)=>a.start-b.start)) {
      let within=0;
      const changes=finding.category==='word_order'?[{from:0,to:finding.quote.length,text:finding.replacement}]:wordChanges(finding.quote,finding.replacement);
      for(const [index,change] of changes.entries()) {
        const from=finding.start+shift+change.from+within,to=from+change.text.length;
        within+=change.text.length-(change.to-change.from);
        let displacement=0,valid=true;
        for(const edit of later) {
          if(edit.to<=from && !(from===to && edit.from===from)) displacement+=edit.text.length-(edit.to-edit.from);
          else if(edit.from<to || (from===to && edit.from<=from)) {valid=false;break;}
        }
        const mappedFrom=from+displacement,mappedTo=to+displacement;
        if(!valid || current.slice(mappedFrom,mappedTo)!==change.text)continue;
        if(result.some(r=>mappedFrom<r.to && mappedTo>r.from || mappedFrom===r.from))continue;
        result.push({from:mappedFrom,to:mappedTo,original:finding.quote.slice(change.from,change.to),replacement:change.text,category:finding.category,explanation:finding.explanation,key:`${analysis.id}:${finding.id}:${index}`});
      }
      shift+=finding.replacement.length-finding.quote.length;
    }
  }
  return result.sort((a,b)=>a.from-b.from);
}
const tokens = (text: string) => text.match(/[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*|\s+|[^\p{L}\p{N}\p{M}\s]/gu) ?? [];
/** Word diff, with unchanged words left intact rather than replacing a sentence. */
export function wordChanges(original: string, replacement: string): Change[] {
  const a=tokens(original), b=tokens(replacement);
  if (a.length*b.length>160000) {
    let prefix=0; while(prefix<Math.min(a.length,b.length) && a[prefix]===b[prefix]) prefix++;
    let suffix=0; while(suffix<Math.min(a.length,b.length)-prefix && a[a.length-1-suffix]===b[b.length-1-suffix]) suffix++;
    return [{from:a.slice(0,prefix).join('').length,to:a.slice(0,a.length-suffix).join('').length,text:b.slice(prefix,b.length-suffix).join('')}];
  }
  const table=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) table[i][j]=a[i]===b[j]?1+table[i+1][j+1]:Math.max(table[i+1][j],table[i][j+1]);
  const changes:Change[]=[]; let i=0,j=0,offset=0,current:Change|null=null;
  const finish=()=>{if(current) changes.push(current);current=null;};
  while(i<a.length || j<b.length) {
    if(i<a.length && j<b.length && a[i]===b[j]) {finish();offset+=a[i++].length;j++;}
    else {
      current ??= {from:offset,to:offset,text:''};
      if(j<b.length && (i===a.length || table[i][j+1]>table[i+1][j])) current.text+=b[j++];
      else {offset+=a[i++].length;current.to=offset;}
    }
  }
  finish();return changes;
}

/** Applies accepted, non-overlapping findings to an immutable analysis snapshot.
 * Remaining findings are shifted onto the resulting text. This lets a user
 * accept several independent corrections from one response in any order. */
export function projectAnalysis(source:string,findings:Finding[],decisions:Decision[]) {
  const accepted=new Set(decisions.filter(d=>d.action==='accepted').map(d=>d.findingId));
  const edits=findings.filter(f=>accepted.has(f.id)).sort((a,b)=>a.start-b.start);
  let text=source,cumulative=0;
  for(const edit of edits) {
    const start=edit.start+cumulative;
    if(text.slice(start,start+edit.quote.length)!==edit.quote)return null;
    text=text.slice(0,start)+edit.replacement+text.slice(start+edit.quote.length);
    cumulative+=edit.replacement.length-edit.quote.length;
  }
  const remaining:ProjectedFinding[]=[];
  for(const finding of findings) {
    if(accepted.has(finding.id))continue;
    let shift=0;
    for(const edit of edits) {
      if(edit.end<=finding.start)shift+=edit.replacement.length-edit.quote.length;
      else if(edit.start<finding.end)return null;
    }
    remaining.push({...finding,currentStart:finding.start+shift,currentEnd:finding.end+shift});
  }
  return {text,findings:remaining};
}

/** Mirrors Tiptap's getText({blockSeparator:'\n'}), including nested lists.
 * Structural separators have no editable position; never replace across them. */
export function textPositions(doc: PMNode) {
  let text='';const positions:(number|null)[]=[];
  doc.descendants((node,pos)=>{
    if(node.isBlock && pos>0) {text+='\n';positions.push(null);}
    if(node.isText) {text+=node.text;for(let i=0;i<node.text!.length;i++)positions.push(pos+i);}
    if(node.type.name==='hardBreak') {text+='\n';positions.push(null);}
  });
  return {text,positions};
}
export function editableRange(doc:PMNode, start:number, end:number) {
  const {positions}=textPositions(doc);
  if(start===end) {
    const p=positions[start] ?? (start>0 && positions[start-1]!==null ? positions[start-1]!+1 : null);
    return p===null || p===undefined ? null : {from:p,to:p};
  }
  const selected=positions.slice(start,end);
  if(selected.length!==end-start || selected.some(p=>p===null))return null;
  const from=selected[0]!,to=selected[selected.length-1]!+1;
  return to-from===end-start?{from,to}:null;
}
export function correctionTransaction(state:EditorState, source:string, start:number, quote:string, replacement:string):Transaction|null {
  if(textPositions(state.doc).text!==source || source.slice(start,start+quote.length)!==quote || !editableRange(state.doc,start,start+quote.length))return null;
  const changes=wordChanges(quote,replacement);
  const tr=state.tr;
  for(const change of [...changes].reverse()) {
    const range=editableRange(state.doc,start+change.from,start+change.to);
    if(!range)return null;
    // Only changed text is replaced; inherit the corrected word's marks.
    const resolved=state.doc.resolve(range.from);
    const marks=resolved.nodeAfter?.isText ? resolved.nodeAfter.marks : resolved.marks();
    if(change.text) {
      const content=tokens(change.text).map(token=>{
        const occurrences=[...quote.matchAll(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gu'))];
        const original=occurrences.length===1?editableRange(state.doc,start+occurrences[0].index!,start+occurrences[0].index!+token.length):null;
        const originalNode=original?state.doc.resolve(original.from).nodeAfter:null;
        return state.schema.text(token,originalNode?.isText?originalNode.marks:marks);
      });
      tr.replaceWith(range.from,range.to,content);
    }
    else tr.delete(range.from,range.to);
  }
  return tr;
}
