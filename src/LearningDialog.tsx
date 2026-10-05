import {useEffect,useRef,useState} from 'react';
import {learningAdd,learningDefinition,type LearningSeed} from './learning';
import {clozeExample} from './learningText';
import {t} from './i18n';
import './Learning.css';

export function LearningDialog({seed,onClose,onSettings}:{seed:LearningSeed;onClose:()=>void;onSettings:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
  const [draft,setDraft]=useState({...seed,definition:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[needsKey,setNeedsKey]=useState(false);
  useEffect(()=>{dialog.current?.showModal();const node=dialog.current;return()=>node?.close();},[]);
  async function generate(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNeedsKey(false);
    try {const result=await learningDefinition(draft.word,draft.example,draft.language);setDraft(value=>({...value,...result}));}
    catch(e){if(String(e).includes('AI_KEY_REQUIRED')){setNeedsKey(true);setError(t('Add an API key in AI settings to generate a definition.'));}else setError(String(e));}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function save(){
    if(inFlight.current)return;
    if(clozeExample(draft.example,draft.answer)===draft.example){setError(t('The answer must appear as a complete word or phrase in the example.'));return;}
    inFlight.current=true;setBusy(true);setError('');
    try {const result=await learningAdd(draft);setSaved(t(result.created?'Added to your learning set.':'This word is already in your learning set. Its progress was kept.'));}
    catch(e){setError(String(e));}finally{inFlight.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="learning-dialog" aria-labelledby="learning-add-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <h2 id="learning-add-title">{t('Add to learning set')}</h2>
    {saved?<><p role="status">{saved}</p><button onClick={onClose}>{t('Done')}</button></>:<form onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={busy}>
        <label>{t('Word or expression')}<input autoFocus value={draft.word} maxLength={240} required onChange={e=>setDraft({...draft,word:e.target.value})}/></label>
        <label>{t('Example from the note')}<textarea rows={3} value={draft.example} maxLength={6000} required onChange={e=>setDraft({...draft,example:e.target.value})}/></label>
        {seed.sourceKind==='suggestion'&&<p className="learning-hint">{t('This example uses the AI suggestion; adding a card does not accept the correction.')}</p>}
        <label>{t('Answer hidden in the example')}<input value={draft.answer} maxLength={240} required onChange={e=>setDraft({...draft,answer:e.target.value})}/></label>
        <div className="learning-cloze-preview">{clozeExample(draft.example,draft.answer)}</div>
        <label>{t('Definition')}<textarea rows={3} value={draft.definition} maxLength={4000} required onChange={e=>setDraft({...draft,definition:e.target.value})}/></label>
        <button type="button" onClick={()=>void generate()} disabled={!draft.word.trim()||!draft.example.trim()}>{t('Generate definition')}</button>
        <p className="learning-hint">{t('Sends this word and example to your selected AI provider. Check and edit the definition before saving.')}</p>
        {error&&<p className="error-banner" role="alert">{error}</p>}
        {needsKey&&<button type="button" onClick={onSettings}>{t('AI settings')}</button>}
        <div className="learning-actions"><button type="button" onClick={onClose}>{t('Cancel')}</button><button type="submit" disabled={!draft.definition.trim()}>{t('Add to learning set')}</button></div>
      </fieldset>{busy&&<p role="status">{t('Working…')}</p>}
    </form>}
  </dialog>;
}
