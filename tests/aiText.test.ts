import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getSchema,generateText} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {EditorState} from '@tiptap/pm/state';
import {history,undo,redo,closeHistory} from '@tiptap/pm/history';
import {acceptedChanges,mergeDecisions,wordChanges,textPositions,correctionTransaction,projectAnalysis} from '../src/aiText.ts';
import type {Analysis} from '../src/ai.ts';
import {Autosave} from '../src/autosave.ts';
import {blankNote} from '../src/note.ts';

const schema=getSchema([StarterKit]);
test('saved decisions still in the draft appear only once in review history',()=>{
  const decision={id:'saved',analysisId:'a',findingId:'f',action:'accepted' as const};
  const pending={id:'pending',analysisId:'a',findingId:'g',action:'dismissed' as const};
  assert.deepEqual(mergeDecisions([decision],[{...decision},pending]),[decision,pending]);
});
const reviewFixture=():Analysis=>({id:'a',noteId:'note',dateKey:'2026-10-01',language:'de',document:{type:'doc'},plainText:'Ich sehe der Hund. Das Essen war sensibel.',profile:{id:'p',name:'P',provider:'openai',model:'test'},explanationLanguage:'en',prompt:'',naturalness:true,schemaVersion:1,excluded:0,createdAt:'2026-10-01',decisions:[{id:'d',analysisId:'a',findingId:'f1',action:'accepted'},{id:'d2',analysisId:'a',findingId:'f2',action:'accepted'}],findings:[
  {id:'f1',ruleId:'grammar.article',category:'grammar',quote:'Ich sehe der Hund.',replacement:'Ich sehe den Hund.',start:0,end:18,occurrence:0,explanation:'Accusative',meaningNote:''},
  {id:'f2',ruleId:'vocabulary.word_choice',category:'word_choice',quote:'Das Essen war sensibel.',replacement:'Das Essen war köstlich.',start:19,end:41,occurrence:0,explanation:'Taste',meaningNote:''},
]});
test('accepted markup reconstructs persisted decisions and keeps category colors after reopening',()=>{
  const review=reviewFixture(),text='Ich sehe den Hund. Das Essen war köstlich.';
  const changes=acceptedChanges([review],[],text);
  assert.deepEqual(changes.map(c=>[c.original,c.replacement,c.category]),[['der','den','grammar'],['sensibel','köstlich','word_choice']]);
  for(const change of changes)assert.equal(text.slice(change.from,change.to),change.replacement);
  const shifted=acceptedChanges([review],[],`Heute: ${text}\nEin neuer Absatz.`);
  assert.equal(shifted[0].from,changes[0].from+7);assert.equal(shifted.length,2);
});
test('undo and manual edits remove only mismatched accepted markup',()=>{
  const review=reviewFixture();
  assert.deepEqual(acceptedChanges([review],[],'Ich sehe der Hund. Das Essen war köstlich.').map(c=>c.replacement),['köstlich']);
  assert.deepEqual(acceptedChanges([review],[],review.plainText),[]);
  const pending=review.decisions;review.decisions=[];
  assert.equal(acceptedChanges([review],pending,'Ich sehe den Hund. Das Essen war köstlich.').length,2);
});
test('article correction highlights only the changed word',()=>{
  assert.deepEqual(wordChanges('Ich sehe der Hund.','Ich sehe den Hund.'),[{from:9,to:12,text:'den'}]);
  assert.deepEqual(wordChanges('Grüße','Grüße'),[]);
});
test('diff reconstructs Unicode, punctuation, insertion, deletion and reordering',()=>{
  for(const [a,b] of [['😀 Ich geht.','😀 Ich gehe.'],['Hello world','Hello, world!'],['the the cat','the cat'],['Heute ich gehe nach Hause.','Heute gehe ich nach Hause.'],['Grüße, Straße','Viele Grüße, Straße'],['Ich sehe der Hund.','Ich sehe den Hund.'],['A\u0308rger','Ärger']]) {
    let result=a;for(const c of wordChanges(a,b).reverse())result=result.slice(0,c.from)+c.text+result.slice(c.to);assert.equal(result,b);
  }
});
test('positions mirror Tiptap serialization for paragraphs, nested lists, breaks and emoji',()=>{
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'😀 Grüße'},{type:'hardBreak'},{type:'text',text:'Straße'}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'eins'}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'zwei'}]}]}]}]}]},{type:'paragraph'}]});
  assert.equal(textPositions(doc).text,generateText(doc.toJSON(),[StarterKit],{blockSeparator:'\n'}));
});
test('accept preserves marks and paragraphs, is one undo step, and supports redo',()=>{
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Ich sehe '},{type:'text',text:'der',marks:[{type:'bold'}]},{type:'text',text:' Hund.',marks:[{type:'italic'}]}]},{type:'paragraph',content:[{type:'text',text:'Grüße 😀'}]}]});
  let state=EditorState.create({doc,plugins:[history()]});const source=textPositions(doc).text;
  const tr=correctionTransaction(state,source,0,'Ich sehe der Hund.','Ich sehe den Hund.');assert.ok(tr);
  state=state.apply(closeHistory(tr));state=state.apply(closeHistory(state.tr));
  assert.equal(state.doc.firstChild?.child(1).text,'den');assert.equal(state.doc.firstChild?.child(1).marks[0].type.name,'bold');
  assert.equal(state.doc.lastChild?.textContent,'Grüße 😀');assert.equal(state.doc.firstChild?.lastChild?.marks[0].type.name,'italic');
  assert.ok(undo(state,tr=>{state=state.apply(tr);}));assert.deepEqual(state.doc.toJSON(),doc.toJSON());
  assert.ok(redo(state,tr=>{state=state.apply(tr);}));assert.equal(state.doc.firstChild?.textContent,'Ich sehe den Hund.');
});
test('stale and cross-paragraph feedback never changes a document',()=>{
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'eins'}]},{type:'paragraph',content:[{type:'text',text:'zwei'}]}]});
  const state=EditorState.create({doc});
  assert.equal(correctionTransaction(state,'old',0,'eins','one'),null);
  assert.equal(correctionTransaction(state,textPositions(doc).text,0,'eins\nzwei','one two'),null);
});
test('word-order corrections retain marks on words that move',()=>{
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Heute '},{type:'text',text:'ich',marks:[{type:'bold'}]},{type:'text',text:' gehe heim.'}]}]});
  const state=EditorState.create({doc});const source=textPositions(doc).text;
  const tr=correctionTransaction(state,source,0,source,'Heute gehe ich heim.');assert.ok(tr);
  const changed=state.apply(tr).doc;assert.equal(changed.textContent,'Heute gehe ich heim.');
  let boldText='';changed.descendants(n=>{if(n.isText&&n.marks.some(m=>m.type.name==='bold'))boldText+=n.text;});
  assert.equal(boldText,'ich');
});
test('accepted corrections shift independent remaining findings in either order',()=>{
  const source='Ich sehe der Hund. Heute ich gehe heim.';
  const findings=[
    {id:'article',ruleId:'grammar.article',category:'grammar' as const,quote:'Ich sehe der Hund.',replacement:'Ich sehe den Hund.',occurrence:0,explanation:'',meaningNote:'',start:0,end:18},
    {id:'order',ruleId:'grammar.word_order',category:'word_order' as const,quote:'Heute ich gehe heim.',replacement:'Heute gehe ich heim.',occurrence:0,explanation:'',meaningNote:'',start:19,end:39},
  ];
  const first=projectAnalysis(source,findings,[{id:'d1',analysisId:'a',findingId:'article',action:'accepted'}]);
  assert.equal(first?.text,'Ich sehe den Hund. Heute ich gehe heim.');assert.equal(first?.findings[0].currentStart,19);
  const both=projectAnalysis(source,findings,[{id:'d2',analysisId:'a',findingId:'order',action:'accepted'},{id:'d1',analysisId:'a',findingId:'article',action:'accepted'}]);
  assert.equal(both?.text,'Ich sehe den Hund. Heute gehe ich heim.');assert.deepEqual(both?.findings,[]);
});
test('autosave retries a correction together with its idempotent decision',async()=>{
  const draft=blankNote('2026-09-20');const writes:unknown[]=[];let fail=true;
  const queue=new Autosave(draft,async d=>{writes.push(d);if(fail)throw Error('database unavailable');},10000);
  const accepted={...draft,plainText:'den',aiDecisions:[{id:'event-1',analysisId:'analysis-1',findingId:'f0',action:'accepted' as const}]};
  queue.update(accepted);await assert.rejects(queue.flush());assert.equal(queue.getSnapshot().status,'Could not save');assert.deepEqual(queue.getSnapshot().draft,accepted);
  fail=false;await queue.flush();assert.equal(queue.getSnapshot().status,'Saved');assert.deepEqual(writes,[accepted,accepted]);queue.dispose();
});
