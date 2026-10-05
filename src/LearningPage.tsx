import {useEffect,useRef,useState} from 'react';
import {getLanguage,locale,t} from './i18n';
import {learningList,learningReview,type LearningCard,type Rating} from './learning';
import {clozeExample} from './learningText';
import './Learning.css';

export function LearningPage({onBusyChange}:{onBusyChange:(busy:boolean)=>void}){
  const [cards,setCards]=useState<LearningCard[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reviewing,setReviewing]=useState(false),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[now,setNow]=useState(()=>Date.now()/1000);
  const pending=useRef<{card:LearningCard;rating:Rating;id:string}|null>(null),inFlight=useRef(false);
  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  async function reload(){setLoading(true);setError('');try{setCards(await learningList(getLanguage()));pending.current=null;setRevealed(false);}catch(e){setError(String(e));}finally{setLoading(false);}}
  useEffect(()=>{let alive=true;void learningList(getLanguage()).then(rows=>{if(alive)setCards(rows);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setLoading(false);});const timer=setInterval(()=>setNow(Date.now()/1000),10000);return()=>{alive=false;clearInterval(timer);};},[]);
  const due=cards.filter(card=>card.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt),card=pending.current?.card??due[0];
  const nextDue=cards.filter(item=>item.dueAt>now).sort((a,b)=>a.dueAt-b.dueAt)[0];
  async function rate(rating:Rating){
    if(!card||!revealed||inFlight.current)return;
    pending.current??={card,rating,id:crypto.randomUUID()};const attempt=pending.current;
    inFlight.current=true;setBusy(true);setError('');
    try {const saved=await learningReview(attempt.card,attempt.rating,attempt.id);setCards(rows=>rows.map(row=>row.id===saved.id?saved:row));pending.current=null;setRevealed(false);setNow(Date.now()/1000);}
    catch(e){setError(String(e));}finally{inFlight.current=false;setBusy(false);}
  }
  return <section className="learning-page" aria-busy={loading||busy}>
    <header className="learning-heading"><div><h2>{t('My learning set')}</h2><p>{cards.length} {t('cards')} · {due.length} {t('due now')}</p></div><div className="chart-switch"><button disabled={busy} aria-pressed={!reviewing} onClick={()=>setReviewing(false)}>{t('All cards')}</button><button disabled={busy} aria-pressed={reviewing} onClick={()=>{setReviewing(true);setRevealed(false);}}>{t('Learn due cards')}</button></div></header>
    {loading&&<p role="status">{t('Loading…')}</p>}
    {error&&<div className="error-banner" role="alert">{error}<button disabled={busy} onClick={()=>pending.current?void rate(pending.current.rating):void reload()}>{t('Retry')}</button><button disabled={busy} onClick={()=>void reload()}>{t('Reload cards')}</button></div>}
    {!loading&&reviewing&&(card?<article key={card.id} className="learning-flashcard"><span className="eyebrow">{t('Recall the hidden word')}</span><h3>{card.definition}</h3><p className="learning-example" lang={card.language}>{revealed?card.example:clozeExample(card.example,card.answer)}</p><small>{card.sourceDate} · {t(card.sourceKind==='suggestion'?'Corrected example':'Note example')}</small>
      {revealed?<><div className="learning-answer" lang={card.language}>{card.word}<small>{card.answer!==card.word?card.answer:''}</small></div><p>{t('How hard was it to recall?')}</p><div className="learning-ratings">{(['again','hard','good','easy'] as Rating[]).map(rating=><button key={rating} disabled={busy||!!pending.current} onClick={()=>void rate(rating)}>{t({again:'Again',hard:'Hard',good:'Good',easy:'Easy'}[rating])}</button>)}</div></>:<button className="learning-reveal" onClick={()=>setRevealed(true)}>{t('Reveal answer')}</button>}
    </article>:<div className="learning-empty"><h3>{t('All due cards are done.')}</h3>{nextDue&&<p>{t('Next review')}: {new Date(nextDue.dueAt*1000).toLocaleString(locale())}</p>}</div>)}
    {!loading&&!reviewing&&(!cards.length?<div className="learning-empty"><h3>{t('Your learning set starts with a word.')}</h3><p>{t('Select a word in a note, or add one from a word-choice suggestion.')}</p></div>:<div className="learning-grid">{cards.map(item=><article key={item.id} className="learning-card"><h3 lang={item.language}>{item.word}</h3><p>{item.definition}</p><blockquote lang={item.language}>{item.example}</blockquote><small>{item.sourceDate} · {t(item.sourceKind==='suggestion'?'Corrected example':'Note example')}</small><footer>{item.reviews} {t('reviews')} · {item.dueAt<=now?t('Due now'):new Date(item.dueAt*1000).toLocaleString(locale())}</footer></article>)}</div>)}
    <p className="learning-hint">{t('Again repeats in one minute. Hard, Good and Easy schedule progressively longer intervals. Your ratings and next review dates are saved on this device.')}</p>
  </section>;
}
