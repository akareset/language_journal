import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Extension, type Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { aiHistory, aiPreferences, analyzeNote, dismissFinding, resetAnalyses, type Analysis, type Decision, type Finding } from './ai';
import { acceptedChanges, correctionTransaction, editableRange, mergeDecisions, projectAnalysis, wordChanges, type ProjectedFinding } from './aiText';
import type { Autosave } from './autosave';
import { t } from './i18n';
import './AI.css';
import type {LearningSeed} from './learning';

const feedbackKey=new PluginKey<DecorationSet>('aiFeedback');
export const FeedbackHighlights=Extension.create({name:'aiFeedback',addProseMirrorPlugins(){return [new Plugin({key:feedbackKey,state:{
  init:()=>DecorationSet.empty,
  apply(tr,old){const decorations=tr.getMeta(feedbackKey) as DecorationSet|undefined;return decorations??(tr.docChanged?DecorationSet.empty:old);},
},props:{decorations:state=>feedbackKey.getState(state)}})];}});
function ranges(f:Finding|ProjectedFinding) { const start='currentStart' in f?f.currentStart:f.start;const end='currentEnd' in f?f.currentEnd:f.end;return f.category==='word_order'?[{from:start,to:end,text:f.replacement}]:wordChanges(f.quote,f.replacement).map(c=>({...c,from:start+c.from,to:start+c.to})); }
function snapshotMarkup(text:string,findings:Finding[]) {
  const output:ReactNode[]=[];let cursor=0;
  const highlights=findings.flatMap(f=>ranges(f).map(r=>({...r,category:f.category}))).sort((a,b)=>a.from-b.from);
  for(const [i,r] of highlights.entries()) {output.push(text.slice(cursor,r.from));output.push(<mark key={i} className={`ai-mark ${r.category}`} title={r.text}>{text.slice(r.from,r.to)||'↥'}</mark>);cursor=r.to;}
  output.push(text.slice(cursor));return output;
}
export function AIReview({editor,queue,locked,onSettings,showCorrections=true,onAddLearning}:{editor:Editor|null;queue:Autosave;locked:boolean;onSettings:()=>void;showCorrections?:boolean;onAddLearning:(seed:LearningSeed)=>void}) {
  const {draft}=useSyncExternalStore(queue.subscribe,queue.getSnapshot);
  const [history,setHistory]=useState<Analysis[]>([]),[selected,setSelected]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(false),inFlight=useRef(false);
  const analysis=history.find(a=>a.id===selected);
  const decisions=mergeDecisions(analysis?.decisions??[],draft.aiDecisions??[]);
  const analysisDecisions=analysis?decisions.filter(d=>d.analysisId===analysis.id):[];
  const projection=analysis?projectAnalysis(analysis.plainText,analysis.findings,analysisDecisions):null;
  const resolved=new Set(analysisDecisions.map(d=>d.findingId));
  const visible=projection?.findings.filter(f=>!resolved.has(f.id))??[];
  const stale=!!analysis && (!projection || projection.text!==draft.plainText);
  useEffect(()=>{alive.current=true;let cancelled=false;void aiHistory(draft.language,draft.dateKey).then(rows=>{if(!cancelled){setHistory(rows);setSelected(rows[0]?.id??'');}}).catch(e=>{if(!cancelled)setError(String(e));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;alive.current=false;};},[draft.dateKey,draft.language]);
  useEffect(()=>{
    if(!editor||editor.isDestroyed)return;
    const marks:Decoration[]=[];
    if(showCorrections) for(const change of acceptedChanges(history,draft.aiDecisions??[],draft.plainText)) {
      const range=editableRange(editor.state.doc,change.from,change.to);if(!range)continue;
      if(change.original) marks.push(Decoration.widget(range.from,()=>{
        const span=document.createElement('span');span.className=`ai-accepted-original ${change.category}`;
        span.textContent=change.original;span.title=change.explanation;span.contentEditable='false';
        span.setAttribute('aria-label',`${t('Original text')}: ${change.original}`);return span;
      },{side:-1,key:change.key,ignoreSelection:true}));
      if(range.to>range.from)marks.push(Decoration.inline(range.from,range.to,{class:`ai-accepted-replacement ${change.category}`,title:change.explanation}));
    }
    if(showCorrections&&analysis&&!stale) for(const f of visible) for(const r of ranges(f)) {
      const range=editableRange(editor.state.doc,r.from,r.to);if(!range)continue;
      if(range.from===range.to) marks.push(Decoration.widget(range.from,()=>{const span=document.createElement('span');span.className=`ai-mark ${f.category}`;span.textContent='↥';span.title=f.replacement;return span;},{side:1}));
      else marks.push(Decoration.inline(range.from,range.to,{class:`ai-mark ${f.category}`,title:f.explanation}));
    }
    editor.view.dispatch(editor.state.tr.setMeta(feedbackKey,DecorationSet.create(editor.state.doc,marks)).setMeta('addToHistory',false));
    return()=>{if(!editor.isDestroyed)editor.view.dispatch(editor.state.tr.setMeta(feedbackKey,DecorationSet.empty).setMeta('addToHistory',false));};
  },[editor,analysis,stale,draft.plainText,draft.aiDecisions,history,showCorrections]);
  async function analyze(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try {
      const preferences=await aiPreferences();
      if(!preferences.config.selectedProfile||!preferences.configuredKeys.includes(preferences.config.selectedProfile)){onSettings();return;}
      await queue.flush();const latest=queue.getSnapshot().draft;
      const result=await analyzeNote(latest.dateKey,latest.language,latest.plainText);
      if(alive.current){setHistory(old=>[result,...old.filter(a=>a.id!==result.id)]);setSelected(result.id);}
    } catch(e){if(alive.current){if(String(e).includes('AI_KEY_REQUIRED'))onSettings();else setError(String(e));}}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  async function reset(){
    if(inFlight.current||loading||locked)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      // Finish accepted writes, then remove their retry payload before deleting
      // history. Later autosaves must never reference deleted analyses.
      await queue.flush();
      const latest=queue.getSnapshot().draft;
      if(latest.aiDecisions?.length){queue.update({...latest,aiDecisions:[]});await queue.flush();}
      await resetAnalyses(latest.dateKey,latest.language);
      if(alive.current){setHistory([]);setSelected('');}
    }catch(e){if(alive.current)setError(String(e));}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  function accept(f:Finding){
    if(!analysis||!editor||stale||locked||busy)return;
    const latest=queue.getSnapshot().draft;
    const projected=projection?.findings.find(item=>item.id===f.id);
    if(!projection||!projected){setError(t('This passage has changed or crosses a formatting boundary. Analyze again.'));return;}
    const tr=correctionTransaction(editor.state,projection.text,projected.currentStart,f.quote,f.replacement);
    if(!tr){setError(t('This passage has changed or crosses a formatting boundary. Analyze again.'));return;}
    const decision:Decision={id:crypto.randomUUID(),analysisId:analysis.id,findingId:f.id,action:'accepted'};
    editor.view.dispatch(closeHistory(tr));
    // onUpdate queued the document synchronously; append its decision before debounce.
    queue.update({...queue.getSnapshot().draft,aiDecisions:[...(latest.aiDecisions??[]),decision]});
    editor.view.dispatch(closeHistory(editor.state.tr));editor.commands.focus();setError('');
  }
  async function dismiss(f:Finding){
    if(!analysis||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    const decision:Decision={id:crypto.randomUUID(),analysisId:analysis.id,findingId:f.id,action:'dismissed'};
    try{await dismissFinding(decision);if(alive.current)setHistory(rows=>rows.map(a=>a.id===analysis.id?{...a,decisions:[...a.decisions,decision]}:a));}
    catch(e){if(alive.current)setError(String(e));}finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  function addWord(f:Finding) {
    const changed=wordChanges(f.quote,f.replacement).map(c=>c.text.trim()).filter(value=>/\p{L}/u.test(value)).sort((a,b)=>b.length-a.length)[0];
    const word=(changed??f.replacement).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
    onAddLearning({word,answer:word,example:f.replacement,dateKey:draft.dateKey,language:draft.language,sourceKind:'suggestion'});
  }
  return <section className="ai-review" aria-label={t('AI Insights')} aria-busy={busy||loading}>
    <div className="ai-review-header"><h2>{t('AI Insights')}</h2><button className="ai-analyze" disabled={locked||busy||loading||!draft.plainText.trim()} onClick={()=>void analyze()}>{busy?t('Working…'):t('Analyze text')}</button></div>
    <div className="ai-reset"><button disabled={locked||busy||loading||(!history.length&&!draft.aiDecisions?.length)} onClick={()=>void reset()}>{t('Reset analyses')}</button><small>{t('Removes this note’s AI feedback and decisions. Keeps the current text. You can then analyze again.')}</small></div>
    <p className="ai-disclosure">{t('Analyze sends this note to your selected AI provider. Suggestions are optional; check them before accepting.')} <button disabled={locked||busy} onClick={onSettings}>{t('AI settings')}</button></p>
    {loading&&<p role="status">{t('Loading…')}</p>}
    {error&&<div className="error-banner" role="alert">{error}<p>{t('The operation failed. Any existing feedback is unchanged.')}</p></div>}
    {history.length>0&&<label><span className="sr-only">{t('Analysis history')}</span><select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{history.map(a=><option value={a.id} key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.profile.name} · {a.profile.model}</option>)}</select></label>}
    {analysis&&<>
      {analysis.excluded>0&&<details className="ai-excluded" role="status"><summary>{analysis.excluded} · {t('Some feedback could not be displayed because it failed validation. This is not a clean bill of health.')}</summary><p>{t('These returned items are shown for review only. They cannot be highlighted or accepted because they did not match this saved text or the supported feedback format.')}</p>{(analysis.excludedFeedback??[]).map(item=><article key={item.index}><strong>{t('Returned suggestion')} {item.index+1}</strong><span>{item.reason}</span><pre>{JSON.stringify(item.feedback,null,2)}</pre></article>)}</details>}
      {stale&&<><p className="ai-notice">{t('Your note has changed. Feedback below belongs to the original snapshot. Analyze again to accept more suggestions.')}</p><div className="ai-snapshot" lang={analysis.language}>{snapshotMarkup(analysis.plainText,visible)}</div></>}
      {analysis.findings.length===0&&analysis.excluded===0&&<p className="ai-notice">{t('No supported corrections were suggested. This is not a guarantee that the text is error-free.')}</p>}
      {analysis.findings.length>0&&visible.length===0&&<p className="ai-notice">{t('All displayed suggestions have been reviewed.')}</p>}
      {visible.map(f=><article key={f.id} className={`ai-finding ${f.category}`}>
        <header><span>{t({grammar:'Grammar & articles',word_order:'Word order',word_choice:'Word choice',naturalness:'Natural phrasing'}[f.category])}</span><span className="ai-rule">{f.ruleId}</span></header>
        <p className="ai-preview" lang={analysis.language}>{f.category==='word_order'?<><del>{f.quote}</del> → <ins>{f.replacement}</ins></>:<>{snapshotMarkup(f.quote,[{...f,start:0,end:f.quote.length}])} → <ins>{f.replacement}</ins></>}</p>
        <p lang={analysis.explanationLanguage}>{f.explanation}</p>
        {f.meaningNote&&<p className="ai-meaning"><strong>{t('Please check the intended meaning.')}</strong> <span lang={analysis.explanationLanguage}>{f.meaningNote}</span></p>}
        <div className="ai-actions"><button disabled={locked||busy||stale||!editor} onClick={()=>accept(f)}>{t('Accept')}</button><button disabled={locked||busy} onClick={()=>void dismiss(f)}>{t('Dismiss')}</button>{f.category==='word_choice'&&<button disabled={locked||busy} onClick={()=>addWord(f)}>{t('Add to learning set')}</button>}</div>
      </article>)}
      <p className="ai-disclosure">{t('Accept autosaves the correction. Ctrl+Z restores text through editor undo. Decisions remain in the review history.')}</p>
      {analysis.findings.filter(f=>f.category==='word_choice'&&resolved.has(f.id)).map(f=><div className="ai-actions" key={f.id}><button disabled={locked||busy} onClick={()=>addWord(f)}>{t('Add to learning set')}: {f.replacement}</button></div>)}
      <details><summary>{t('Review decisions')} ({decisions.filter(d=>d.analysisId===analysis.id).length})</summary>{decisions.filter(d=>d.analysisId===analysis.id).map(d=><p className="ai-disclosure" key={d.id}>{analysis.findings.find(f=>f.id===d.findingId)?.quote} · {t(d.action==='accepted'?'Accepted':'Dismissed')}</p>)}</details>
    </>}
  </section>;
}
