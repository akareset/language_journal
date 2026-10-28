// Synthetic journal only. Executed in the isolated demo browser, never in Tauri.
export function installDemo() {
  const key = date => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const today=key(new Date()), day=offset=>key(new Date(Date.now()-offset*86400000));
  const source='Heute ich gehe in die Bibliothek. Ich lese ein Buch über Kunst.\nDanach treffe ich meine Freundin im Café. Der Kuchen schmeckt sensibel. Wir sprechen über unsere Pläne für das Wochenende.\nJeden Tag ein paar Sätze: So wird Deutsch langsam ein Teil meines Alltags.';
  const documentFor=text=>({type:'doc',content:text.split('\n').map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}))});
  const note=(date,text,title,tags)=>({id:'demo-'+date,dateKey:date,language:'de',title,document:documentFor(text),plainText:text,tags,writingSeconds:180,createdAt:date+'T09:00:00Z',updatedAt:date+'T09:00:00Z'});
  const notes=[note(today,source,'Kleine Schritte, jeden Tag',['alltag','lernen']),...Array.from({length:17},(_,i)=>note(day(i+1),'Ich freue mich auf einen ruhigen Abend. Heute habe ich etwas Neues gelernt.',['Ein Nachmittag im Café','Gedanken nach dem Spaziergang','Ein neues Kapitel','Zeit für Freunde'][i%4],i%2?['alltag']:['lernen']))];
  const profile={id:'demo-api',name:'Demo provider',provider:'openai',model:'demo-model'};
  const prefs={config:{profiles:[profile],selectedProfile:profile.id,explanationLanguage:'en',naturalness:true,prompt:'Give concise, supportive feedback.',deepPrompt:'Find recurring writing patterns and suggest focused practice.'},configuredKeys:[profile.id],defaultPrompt:'Give concise, supportive feedback.',defaultDeepPrompt:'Find recurring writing patterns and suggest focused practice.',rules:[]};
  let run=0;
  function analysis(n){const pairs=[['Heute ich gehe in die Bibliothek.','Heute gehe ich in die Bibliothek.','word_order','grammar.word_order','After a time expression, keep the conjugated verb in second position.'],['Der Kuchen schmeckt sensibel.','Der Kuchen schmeckt köstlich.','word_choice','vocabulary.word_choice','Köstlich means delicious. Sensibel describes sensitivity, not taste.']];return {id:'demo-review-'+(++run),noteId:n.id,dateKey:n.dateKey,language:'de',document:n.document,plainText:n.plainText,profile,explanationLanguage:'en',prompt:prefs.config.prompt,naturalness:true,schemaVersion:1,createdAt:n.dateKey+'T10:00:00Z',excluded:0,excludedFeedback:[],decisions:[],findings:pairs.filter(p=>n.plainText.includes(p[0])).map(([quote,replacement,category,ruleId,explanation],i)=>({id:'f'+i,quote,replacement,category,ruleId,explanation,meaningNote:'',occurrence:0,start:n.plainText.indexOf(quote),end:n.plainText.indexOf(quote)+quote.length}))};}
  const history=notes.slice(1,8).map(n=>analysis({...n,plainText:source,document:documentFor(source)}));
  const vocabulary=[['Tag','NOUN',24],['lernen','VERB',19],['sich freuen','VERB',16],['Buch','NOUN',12],['neu','ADJ',11],['sprechen','VERB',9],['ruhig','ADJ',8],['gern','ADV',7],['Freundin','NOUN',6],['langsam','ADV',5],['köstlich','ADJ',4],['Berlin','PROPN',3]].map(([lemma,pos,count],i)=>({id:i,lemma,pos,count,noteCount:Math.min(count,10),firstSeen:day(17-i),lastSeen:today,forms:[{form:lemma==='sich freuen'?'freue mich':lemma,morph:pos==='VERB'?'Tense=Pres|VerbForm=Fin':'',count}]}));
  const category=pos=>({NOUN:'Nouns',VERB:'Verbs',ADJ:'Adjectives',ADV:'Adverbs'}[pos]??'Other');
  const categoryWords=Object.fromEntries(['Nouns','Verbs','Adjectives','Adverbs','Other'].map(c=>[c,vocabulary.filter(w=>category(w.pos)===c)]));
  const stats={notes:notes.map(n=>({dateKey:n.dateKey,wordCount:44,uniqueWords:33,writingSeconds:180,analyzed:true,newLemmas:1})),totalLemmas:vocabulary.length,totalOccurrences:vocabulary.reduce((s,w)=>s+w.count,0),posCounts:Object.fromEntries(Object.entries(categoryWords).map(([c,words])=>[c,words.length])),categoryWords,topWords:vocabulary.slice(0,10),recentWords:vocabulary.slice(-5),growth:vocabulary.map(w=>({dateKey:w.firstSeen,newLemmas:1})),pendingNotes:0,analysis:{running:false,error:null}};
  const cards=[{id:'card-1',language:'de',word:'köstlich',definition:'Very pleasant to taste; delicious.',example:'Der Kuchen schmeckt köstlich.',answer:'köstlich',sourceDate:today,sourceKind:'suggestion',dueAt:0,intervalSeconds:0,reviews:0},{id:'card-2',language:'de',word:'sich freuen',definition:'To feel joy or look forward to something.',example:'Ich freue mich auf einen ruhigen Abend.',answer:'freue',sourceDate:day(1),sourceKind:'note',dueAt:0,intervalSeconds:0,reviews:0}];
  const reports=[];
  window.__demo={today,notes,history,cards,reports,stats};
  let callbackId=0;
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++callbackId,unregisterCallback:()=>{}};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  window.__TAURI_INTERNALS__.invoke=async(cmd,args={})=>{
    if(cmd==='load_settings')return {language:'de',spellcheck:false};
    if(cmd==='journal_stats')return structuredClone(stats);
    if(cmd==='plugin:event|listen')return args.handler;
    if(cmd==='plugin:event|unlisten')return;
    if(cmd==='load_daily_note')return structuredClone(notes.find(n=>n.dateKey===args.dateKey)??null);
    if(cmd==='list_notes')return notes.map(({id,dateKey,title,tags})=>({id,dateKey,title,tags}));
    if(cmd==='save_daily_note'){let n=notes.find(n=>n.dateKey===args.draft.dateKey);if(!n){n=note(args.draft.dateKey,'',null,[]);notes.push(n);}Object.assign(n,structuredClone(args.draft));for(const d of args.draft.aiDecisions??[]){const a=history.find(a=>a.id===d.analysisId);if(a&&!a.decisions.some(old=>old.id===d.id))a.decisions.push(d);}return structuredClone(n);}
    if(cmd==='ai_preferences')return structuredClone(prefs);
    if(cmd==='ai_history')return structuredClone(history.filter(a=>!args.dateKey||a.dateKey===args.dateKey));
    if(cmd==='ai_analyze'){await new Promise(r=>setTimeout(r,600));const a=analysis(notes.find(n=>n.dateKey===args.dateKey));history.unshift(a);return structuredClone(a);}
    if(cmd==='ai_period_insight_history')return structuredClone(reports.filter(r=>r.startDate===args.startDate&&r.endDate===args.endDate));
    if(cmd==='ai_period_insight'){await new Promise(r=>setTimeout(r,600));const report={id:'deep-demo',language:'de',startDate:args.startDate,endDate:args.endDate,profile,explanationLanguage:'en',createdAt:new Date().toISOString(),overview:'Your notes tell clear stories about daily life. The next step is to connect ideas more naturally and make descriptions more precise.',patterns:[{title:'Time first, verb second',explanation:'When you begin with Heute or Danach, the subject sometimes stays before the verb.',evidence:'Heute ich gehe → Heute gehe ich',nextStep:'Try three openings: Heute gehe ich … / Danach lese ich … / Am Abend treffe ich …'},{title:'Choose words for the situation',explanation:'Some descriptions use familiar words whose meaning does not fit the context.',evidence:'Der Kuchen schmeckt sensibel → Der Kuchen schmeckt köstlich',nextStep:'Learn phrases together: köstlich schmecken, ein spannendes Buch, ein ruhiger Abend.'}],topics:[{topic:'Connect your ideas',reason:'Most ideas stand in separate short sentences.',practice:'Combine two sentences using weil, obwohl or deshalb.'},{topic:'A small phrase bank',reason:'Useful word combinations make your writing sound more natural.',practice:'Save one new expression from each note and use it again tomorrow.'}],prompt:prefs.config.deepPrompt};reports.push(report);return structuredClone(report);}
    if(cmd==='learning_list')return structuredClone(cards);
    if(cmd==='learning_review'){const c=cards.find(c=>c.id===args.cardId);c.reviews++;c.intervalSeconds=86400;c.dueAt=Date.now()/1000+86400;return structuredClone(c);}
    throw Error('Unsupported demo command: '+cmd);
  };
}
