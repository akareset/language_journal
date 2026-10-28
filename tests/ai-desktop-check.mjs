// Optional integration check against isolated headless Edge (port 9223) and Vite.
// All AI calls and note writes below are intercepted in memory. No provider is
// contacted and no test key, note, or feedback is written to the real database.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const pages=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=pages.find(p=>p.type==='page');
if(!page)throw Error('Start isolated Edge with remote debugging on port 9223');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),consoleErrors=[];
socket.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value??a.description).join(' '));if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.result.description);return r.result.value;}
async function until(expression){for(let i=0;i<80;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,75));}throw Error('Timed out: '+expression);}
async function clickText(root,text){const expression=`[...document.querySelectorAll(${JSON.stringify(root+' button')})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;await until(`!!(${expression}) && !(${expression}).disabled`);return evaluate(`${expression}.click()`);}
async function inject(){
  const source='Ich sehe der Hund. Ich werde ein Foto machen. Heute ich gehe heim. Das Essen war sensibel.';
  const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Ich sehe '},{type:'text',text:'der',marks:[{type:'bold'}]},{type:'text',text:source.slice(12)}]}]};
  const prefs={config:{profiles:[],selectedProfile:null,explanationLanguage:'uk',naturalness:true,prompt:'Test tutor prompt',deepPrompt:'Test deep prompt'},configuredKeys:[],defaultPrompt:'Test tutor prompt',defaultDeepPrompt:'Test deep prompt',rules:['grammar.article']};
  const categories=[['Ich sehe der Hund.','Ich sehe den Hund.','grammar','grammar.article'],['Ich werde ein Foto machen.','Ich mache ein Foto.','naturalness','style.naturalness'],['Heute ich gehe heim.','Heute gehe ich heim.','word_order','grammar.word_order'],['Das Essen war sensibel.','Das Essen war köstlich.','word_choice','vocabulary.word_choice']];
  const analysis={id:'test-analysis',noteId:'test-note',dateKey:'2026-09-20',language:'de',document:doc,plainText:source,profile:{id:'test-profile',name:'OpenAI 1',provider:'openai',model:'gpt-5.6-luna'},explanationLanguage:'uk',prompt:'Test tutor prompt',naturalness:true,schemaVersion:1,createdAt:'2026-09-20T12:00:00Z',excluded:1,decisions:[],findings:categories.map(([quote,replacement,category,ruleId],i)=>({id:'f'+i,quote,replacement,category,ruleId,occurrence:0,explanation:'Перевірте форму слова в цьому реченні.',meaningNote:i===3?'Якщо ви маєте на увазі смак їжі.':'',start:source.indexOf(quote),end:source.indexOf(quote)+quote.length}))};
  const state={prefs,analysis,history:[],writes:[],failSave:false,failAnalysis:false,note:{id:'test-note',dateKey:'2026-09-20',language:'de',title:'UI test — in memory',document:doc,plainText:source,tags:[],writingSeconds:0,createdAt:'test',updatedAt:'test'}};
  const words=Array.from({length:10},(_,i)=>({id:i+1,lemma:'verb'+i,pos:'VERB',count:20-i,noteCount:2,firstSeen:'2026-09-20',lastSeen:'2026-09-20',forms:[{form:'verb'+i,morph:'Tense=Pres',count:20-i}]}));
  const noun={...words[0],id:11,lemma:'Haus',pos:'NOUN',count:1};
  state.stats={notes:[],totalLemmas:11,totalOccurrences:156,posCounts:{Nouns:1,Verbs:10,Adjectives:0,Adverbs:0,Other:0},topWords:words,recentWords:[noun],categoryWords:{Nouns:[noun],Verbs:words,Adjectives:[],Adverbs:[],Other:[]},growth:[],pendingNotes:0,analysis:{running:false,error:null}};
  const initialization=`(() => {
    window.__aiTest=${JSON.stringify(state)};
    let callbackId=0;const callbacks=new Map();
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(fn)=>{callbacks.set(++callbackId,fn);return callbackId;},unregisterCallback:id=>callbacks.delete(id)};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    window.__TAURI_INTERNALS__.invoke=async (cmd,args={})=>{
      const s=window.__aiTest;
      if(cmd==='load_settings')return {language:'de',spellcheck:false};
      if(cmd==='journal_stats')return structuredClone(s.stats);
      if(cmd==='plugin:event|listen')return args.handler;
      if(cmd==='plugin:event|unlisten')return;
      if(cmd==='load_daily_note')return {...s.note,dateKey:args.dateKey};
      if(cmd==='save_daily_note'){if(s.failSave)throw Error('Simulated database failure');s.writes.push(args.draft);s.note={...s.note,...args.draft};for(const decision of args.draft.aiDecisions??[]){const a=s.history.find(a=>a.id===decision.analysisId);if(a&&!a.decisions.some(d=>d.findingId===decision.findingId))a.decisions.push(decision);}return s.note;}
      if(cmd==='ai_learning_definition')return {word:'köstlich',definition:'Sehr angenehm im Geschmack.'};
      if(cmd==='learning_list')return structuredClone(s.cards??[]);
      if(cmd==='learning_add'){s.cards??=[];const card={...args.draft,id:'card-1',sourceDate:args.draft.dateKey,dueAt:0,intervalSeconds:0,reviews:0};s.cards.push(card);return {card,created:true};}
      if(cmd==='learning_review'){const card=s.cards.find(c=>c.id===args.cardId);card.reviews++;card.intervalSeconds=86400;card.dueAt=Date.now()/1000+86400;return structuredClone(card);}
      if(cmd==='list_notes')return [{id:'test-note',dateKey:'2026-09-20',title:'UI test',tags:s.note.tags},{id:'older-note',dateKey:'2026-09-19',title:'Earlier note',tags:['daily','university']}];
      if(cmd==='ai_preferences')return structuredClone(s.prefs);
      if(cmd==='ai_save_preferences'){s.prefs.config=structuredClone(args.config);return;}
      if(cmd==='ai_add_api'){const id='api-'+(s.prefs.config.profiles.length+1);s.prefs.config.profiles.push({id,name:args.provider==='openai'?'OpenAI 1':'Gemini 1',provider:args.provider,model:args.provider==='openai'?'gpt-5.6-luna':'gemini-2.5-flash'});s.prefs.config.selectedProfile=id;s.prefs.configuredKeys.push(id);return;}
      if(cmd==='ai_history')return structuredClone(s.history);
      if(cmd==='ai_reset'){if(s.failReset)throw Error('Simulated reset failure');if(s.note.aiDecisions?.length)throw Error('Pending decisions were not cleared before reset');s.history=[];return;}
      if(cmd==='ai_period_insight_history')return [];
      if(cmd==='ai_analyze'){if(s.failAnalysis)throw Error('Simulated malformed provider response');s.history=[structuredClone(s.analysis)];return structuredClone(s.analysis);}
      if(cmd==='ai_dismiss'){s.history[0].decisions.push(args.decision);return;}
      if(cmd.startsWith('ai_')||cmd==='save_settings')throw Error('Unexpected test mutation: '+cmd);
      throw Error('Unexpected native command in isolated test: '+cmd);
    };
    document.querySelector('dialog')?.close();
  })()`;
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:initialization});
  await send('Page.navigate',{url:'http://localhost:1420'});
}
try {
  // Close any currently open real dialog through its Cancel button first.
  await evaluate(`document.querySelector('dialog[open] button[type=button]')?.click()`);
  await inject();
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await until(`document.querySelector('.note-title')?.value==='UI test — in memory'`);
  await evaluate(`document.querySelector('.add-tag').click()`);
  await until(`document.querySelector('.tag-suggestions')?.textContent.includes('#university')`);
  await clickText('.tag-suggestions','#university');
  await until(`window.__aiTest.writes.some(d=>d.tags.includes('university'))`);
  console.log('PASS: a saved tag from another day is suggested and autosaved when selected');
  assert.equal(await evaluate(`!!document.querySelector('.stats-panel .ai-review')`),true);
  await clickText('.ai-review','Text analysieren');
  await until(`!!document.querySelector('#ai-settings')`);
  await until(`[...document.querySelectorAll('#ai-settings details')].some(d=>d.querySelector('summary')?.textContent.includes('vertiefte Analyse'))`);
  await evaluate(`[...document.querySelectorAll('#ai-settings details')].find(d=>d.querySelector('summary')?.textContent.includes('vertiefte Analyse')).open=true`);
  assert.equal(await evaluate(`[...document.querySelectorAll('#ai-settings details')].find(d=>d.querySelector('summary')?.textContent.includes('vertiefte Analyse')).querySelector('textarea').value`),'Test deep prompt');
  await evaluate(`const field=[...document.querySelectorAll('#ai-settings details')].find(d=>d.querySelector('summary')?.textContent.includes('vertiefte Analyse')).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Custom deep review prompt');field.dispatchEvent(new Event('input',{bubbles:true}));`);
  await clickText('#ai-settings','Anweisung für vertiefte Analyse speichern');
  await until(`window.__aiTest.prefs.config.deepPrompt==='Custom deep review prompt'`);
  console.log('PASS: deep-analysis prompt is visible and saved independently');
  console.log('PASS: Analyze without a key opens AI settings');
  await clickText('#ai-settings','+ API hinzufügen');
  await until(`document.querySelector('dialog')?.open`);
  assert.equal(await evaluate(`document.querySelectorAll('dialog input,dialog select').length`),2);
  await evaluate(`document.querySelector('dialog input').focus()`);await send('Input.insertText',{text:'test-key-never-stored'});
  await clickText('dialog','API hinzufügen');
  await until(`!document.querySelector('dialog') && window.__aiTest.prefs.config.profiles.length===1`);
  await evaluate(`const model=[...document.querySelectorAll('#ai-settings select')].find(s=>[...s.options].some(o=>o.value==='gpt-5.6-terra'));model.value='gpt-5.6-terra';model.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`window.__aiTest.prefs.config.profiles[0].model==='gpt-5.6-terra'`);
  console.log('PASS: two-field API dialog, secret field cleared, model selected in Settings');
  await clickText('#ai-settings','+ API hinzufügen');
  await evaluate(`const p=document.querySelector('dialog select');p.value='gemini';p.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('dialog input').focus();`);
  await send('Input.insertText',{text:'test-key-never-stored'});await clickText('dialog','API hinzufügen');
  await until(`!document.querySelector('dialog') && window.__aiTest.prefs.config.profiles.length===2`);
  assert.equal(await evaluate(`!!document.querySelector('#ai-settings option[value="gemini-2.5-pro"]') && !document.querySelector('#ai-settings option[value="gpt-5.6-sol"]')`),true);
  console.log('PASS: Gemini selection offers Gemini models');
  await evaluate(`document.querySelector('.sidebar button[aria-label="Heute"]').click()`);
  await until(`!!document.querySelector('.ai-review')`);
  await clickText('.ai-review','Text analysieren');
  await until(`document.querySelectorAll('.ai-finding').length===4`);
  assert.equal(await evaluate(`document.querySelector('.tiptap .ai-mark.grammar').textContent`),'der');
  assert.equal(await evaluate(`!!document.querySelector('.tiptap .ai-mark.word_choice') && !!document.querySelector('.tiptap .ai-mark.naturalness') && !!document.querySelector('.ai-finding.word_order del')`),true);
  assert.equal(await evaluate(`document.querySelector('.ai-review').textContent.includes('Einige Vorschläge')`),true);
  if(process.argv.includes('--screenshots')) {const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('ai-insights-preview.png',Buffer.from(shot.data,'base64'));}
  await clickText('.ai-finding.grammar','Übernehmen');
  await until(`window.__aiTest.writes.some(d=>d.aiDecisions?.some(e=>e.action==='accepted'))`);
  assert.equal(await evaluate(`document.querySelector('.tiptap strong .ai-accepted-replacement, .tiptap .ai-accepted-replacement strong')?.textContent ?? document.querySelector('.tiptap .ai-accepted-replacement').textContent`),'den');
  assert.equal(await evaluate(`document.querySelector('.tiptap .ai-accepted-original').textContent.trim()`),'der');
  await clickText('.editor-view-controls','Korrigierte Version anzeigen');
  assert.equal(await evaluate(`!!document.querySelector('.ai-accepted-original')`),false);
  await clickText('.editor-view-controls','Übernommene Änderungen anzeigen');
  await until(`!!document.querySelector('.ai-accepted-original')`);
  assert.equal(await evaluate(`window.__aiTest.note.plainText.includes('Ich sehe den Hund.')`),true);
  console.log('PASS: colored accepted changes and polished toggle leave saved text clean');
  assert.equal(await evaluate(`!!document.querySelector('.ai-snapshot')`),false);
  await clickText('.ai-finding.word_order','Übernehmen');
  await until(`document.querySelector('.tiptap').textContent.includes('Heute gehe ich heim.')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.ai-finding button')].filter(b=>b.textContent==='Übernehmen').every(b=>!b.disabled)`),true);
  console.log('PASS: changed-word highlight, category colors, partial notice and multiple independent accepts');
  await evaluate(`document.querySelector('.editor-toolbar button[aria-label="Rückgängig"]').click()`);
  await until(`document.querySelector('.tiptap').textContent.includes('Heute ich gehe heim.') && !!document.querySelector('.ai-snapshot')`);
  await evaluate(`document.querySelector('.editor-toolbar button[aria-label="Wiederholen"]').click()`);
  await until(`document.querySelector('.tiptap').textContent.includes('Heute gehe ich heim.') && !document.querySelector('.ai-snapshot')`);
  await clickText('.ai-finding.word_choice','Zum Lernset hinzufügen');
  await until(`!!document.querySelector('.learning-dialog[open]')`);
  await clickText('.learning-dialog','Definition erstellen');
  await until(`document.querySelectorAll('.learning-dialog textarea')[1].value==='Sehr angenehm im Geschmack.'`);
  await evaluate(`{const field=document.querySelectorAll('.learning-dialog textarea')[1];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Ein besonders guter Geschmack.');field.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await clickText('.learning-dialog','Zum Lernset hinzufügen');
  await until(`window.__aiTest.cards?.length===1`);
  assert.equal(await evaluate(`window.__aiTest.cards[0].definition`),'Ein besonders guter Geschmack.');
  await clickText('.learning-dialog','Fertig');
  console.log('PASS: vocabulary suggestion becomes a card with an editable AI definition');
  await clickText('.ai-finding.word_choice','Verwerfen');
  await until(`!document.querySelector('.ai-finding.word_choice')`);
  console.log('PASS: normal Undo restores formatting and dismissal hides only its suggestion');
  await evaluate(`window.__aiTest.failSave=true`);
  await clickText('.ai-finding.naturalness','Übernehmen');
  await until(`!!document.querySelector('.writing-page .error-banner')`);
  assert.equal(await evaluate(`(()=>{const copy=document.querySelector('.tiptap').cloneNode(true);copy.querySelectorAll('.ai-accepted-original').forEach(n=>n.remove());return copy.textContent.includes('Ich mache ein Foto.');})()`),true);
  await evaluate(`window.__aiTest.failSave=false`);await clickText('.writing-page .error-banner','Erneut speichern');
  await until(`!document.querySelector('.writing-page .error-banner')`);
  await evaluate(`window.__aiTest.failAnalysis=true`);await clickText('.ai-review','Text analysieren');
  await until(`document.querySelector('.ai-review .error-banner')?.textContent.includes('Simulated malformed')`);
  console.log('PASS: failed autosave retains accepted draft and retries; failed analysis remains an error');
  await evaluate(`window.__aiTest.failAnalysis=false;for(let i=0;i<3;i++)document.querySelector('.editor-toolbar button[aria-label="Rückgängig"]').click()`);
  await until(`!!document.querySelector('.ai-snapshot')`);
  const beforeReset=await evaluate(`(()=>{const copy=document.querySelector('.tiptap').cloneNode(true);copy.querySelectorAll('.ai-accepted-original').forEach(n=>n.remove());return copy.textContent;})()`);
  await evaluate(`window.__aiTest.failReset=true`);
  await clickText('.ai-review','Analysen zurücksetzen');
  await until(`document.querySelector('.ai-review .error-banner')?.textContent.includes('Simulated reset failure')`);
  assert.equal(await evaluate(`window.__aiTest.history.length`),1);
  await evaluate(`window.__aiTest.failReset=false`);
  await clickText('.ai-review','Analysen zurücksetzen');
  await until(`window.__aiTest.history.length===0&&!document.querySelector('.ai-snapshot')`);
  assert.equal(await evaluate(`document.querySelector('.tiptap').textContent`),beforeReset);
  assert.equal(await evaluate(`document.querySelectorAll('.ai-mark,.ai-accepted-original,.ai-finding').length`),0);
  await clickText('.ai-review','Text analysieren');
  await until(`document.querySelectorAll('.ai-finding').length===4`);
  await clickText('.ai-finding.grammar','Übernehmen');
  await until(`document.querySelector('.ai-accepted-replacement')?.textContent==='den'`);
  await until(`window.__aiTest.note.plainText.includes('Ich sehe den Hund.')`);
  console.log('PASS: repeated Undo, reset failure/retry and fresh analysis restore working Accept buttons');
  await evaluate(`document.querySelector('.sidebar button[aria-label="Einblicke"]').click()`);
  await until(`!!document.querySelector('.insights-page')`);
  for(let week=0;week<8;week++) {if(await evaluate(`document.querySelector('.insight-summary strong')?.textContent==='1'`))break;await evaluate(`document.querySelector('button[aria-label="Vorheriger Zeitraum"]').click()`);await new Promise(resolve=>setTimeout(resolve,100));}
  await until(`document.querySelector('.insight-summary strong')?.textContent==='1'`);
  assert.equal(await evaluate(`!!document.querySelector('.trend-card') && !!document.querySelector('.recurring-card') && !!document.querySelector('.focus-card')`),true);
  if(process.argv.includes('--screenshots')) {const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('insights-page-preview.png',Buffer.from(shot.data,'base64'));}
  console.log('PASS: weekly Insights show trend, recurring rules and practice focus');
  await send('Emulation.setDeviceMetricsOverride',{width:700,height:700,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  console.log('PASS: narrow Insights layout has no horizontal overflow');
  await evaluate(`document.querySelector('.sidebar button[aria-label="Kalender"]').click()`);
  await until(`!!document.querySelector('#calendar-tag-filter')`);
  await evaluate(`const filter=document.querySelector('#calendar-tag-filter');filter.value='daily';filter.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`document.querySelectorAll('.calendar-note').length===1`);
  assert.equal(await evaluate(`document.querySelector('.activity-total').textContent.includes('1')`),true);
  console.log('PASS: calendar tag filter narrows weekly cards and activity');
  await evaluate(`document.querySelector('.sidebar button[aria-label="Heute"]').click()`);
  await until(`!!document.querySelector('.ai-accepted-original')`);
  console.log('PASS: reopening a note restores accepted correction colors from history');
  await evaluate(`{const editor=document.querySelector('.tiptap');editor.focus();const node=editor.querySelector('p').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,3);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));}`);
  await until(`document.querySelector('.selection-learning')?.textContent.includes('Ich')`);
  await evaluate(`document.querySelector('.selection-learning').click()`);
  await until(`!!document.querySelector('.learning-dialog[open]')`);
  assert.equal(await evaluate(`document.querySelector('.learning-dialog input').value`),'Ich');
  assert.equal(await evaluate(`document.querySelector('.learning-dialog textarea').value.includes('Ich sehe den Hund.')`),true);
  await clickText('.learning-dialog','Abbrechen');
  console.log('PASS: selecting editor text opens a card with the clean note context');
  await evaluate(`document.querySelector('.sidebar button[aria-label="Wortschatz"]').click()`);
  await until(`!!document.querySelector('.top-words-scroll')`);
  assert.equal(await evaluate(`(()=>{const list=document.querySelector('.top-words-scroll');list.scrollTop=100;return list.scrollHeight>list.clientHeight&&list.scrollTop>0;})()`),true);
  await evaluate(`document.querySelector('.category-card').click()`);
  await until(`document.querySelector('.category-dialog')?.open`);
  assert.equal(await evaluate(`document.querySelectorAll('.category-detail').length`),5);
  assert.equal(await evaluate(`document.querySelector('.category-detail').textContent.includes('Haus')`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.category-detail')[1].querySelectorAll('li').length`),10);
  await evaluate(`document.querySelector('.category-detail .word-details').open=true`);
  await clickText('.category-dialog','Schließen');
  await evaluate(`document.querySelector('.category-card').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(`document.querySelector('.category-dialog')?.open`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await clickText('.category-dialog','Schließen');
  console.log('PASS: top words scroll and category details include separate rankings, forms and keyboard access');
  await clickText('.vocabulary-page','Mein Lernset');
  await until(`document.querySelectorAll('.learning-card').length===1`);
  await clickText('.learning-page','Fällige Karten lernen');
  await until(`!!document.querySelector('.learning-flashcard')`);
  assert.equal(await evaluate(`document.querySelector('.learning-flashcard').textContent.includes('köstlich')`),false);
  assert.equal(await evaluate(`document.querySelector('.learning-example').textContent.includes('[…]')`),true);
  await clickText('.learning-page','Antwort anzeigen');
  assert.equal(await evaluate(`document.querySelector('.learning-answer').textContent`),'köstlich');
  await clickText('.learning-page','Gut');
  await until(`document.querySelector('.learning-empty')?.textContent.includes('Alle fälligen Karten')`);
  assert.equal(await evaluate(`window.__aiTest.cards[0].reviews`),1);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  console.log('PASS: flashcard hides the word, reveals it and persists its next review');
  assert.deepEqual(consoleErrors,[],'Browser console must have no React errors');
} catch(error) {
  console.error(await evaluate(`JSON.stringify({body:document.body.innerText,errors:[...document.querySelectorAll('.error-banner')].map(e=>e.textContent)})`));
  throw error;
} finally {
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.navigate',{url:'about:blank'});
  if(process.argv.includes('--close-browser'))await send('Browser.close');
  socket.close();
}
