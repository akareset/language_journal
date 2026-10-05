import { useEffect, useRef, useState } from 'react';
import { addAPI, aiPreferences, saveAIConfig, type AIPreferences, type AIConfig } from './ai';
import { t } from './i18n';
import './AI.css';

function AddAPIDialog({onClose,onAdded}:{onClose:()=>void;onAdded:()=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [provider,setProvider]=useState<'openai'|'gemini'>('openai'),[key,setKey]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  async function submit(){
    if(busy)return;setBusy(true);setError('');const secret=key.trim();setKey('');
    try{await addAPI(provider,secret);await onAdded();onClose();}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="ai-api-dialog ai-settings" aria-labelledby="add-api-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
      <h2 id="add-api-title">{t('Add API')}</h2><p className="settings-hint">{t('Choose your provider and paste its API key. You can select the model afterwards.')}</p>
      <fieldset disabled={busy}><label>{t('Provider')}<select autoFocus value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}><option value="openai">OpenAI</option><option value="gemini">Gemini</option></select></label>
      <label>{t('API key')}<input type="password" autoComplete="new-password" spellCheck={false} required maxLength={4096} value={key} onChange={e=>setKey(e.target.value)} placeholder={t('Paste API key')}/></label>
      <p className="settings-hint">{t('Stored securely in Windows Credential Manager. Your key is never shown again.')}</p>
      {error&&<p className="error-banner" role="alert">{error}</p>}
      <div className="ai-actions"><button type="button" onClick={onClose}>{t('Cancel')}</button><button className="ai-analyze" type="submit" disabled={!key.trim()}>{busy?t('Saving…'):t('Add API')}</button></div></fieldset>
    </form>
  </dialog>;
}

export function AISettings({disabled}:{disabled:boolean}) {
  const [prefs,setPrefs]=useState<AIPreferences|null>(null),[config,setConfig]=useState<AIConfig|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[adding,setAdding]=useState(false);
  useEffect(()=>{let alive=true;void aiPreferences().then(p=>{if(alive){setPrefs(p);setConfig(p.config);}}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[]);
  async function reload(){const p=await aiPreferences();setPrefs(p);setConfig(p.config);}
  async function save(next:AIConfig){setBusy(true);setError('');setNotice('');try{await saveAIConfig(next);await reload();setNotice(t('Saved'));}catch(e){setError(String(e));}finally{setBusy(false);}}
  const profile=config?.profiles.find(p=>p.id===config.selectedProfile);
  const models=profile?.provider==='gemini'?[['gemini-2.5-flash','Gemini 2.5 Flash'],['gemini-2.5-pro','Gemini 2.5 Pro']]:[['gpt-5.6-luna','GPT-5.6 Luna'],['gpt-5.6-terra','GPT-5.6 Terra'],['gpt-5.6-sol','GPT-5.6 Sol']];
  return <section className="settings-card ai-settings" id="ai-settings" aria-busy={busy}>
    <div className="ai-review-header"><h2>{t('AI Insights')}</h2><button className="ai-analyze" disabled={disabled||busy||!config||(config.profiles.length>=20)} onClick={()=>setAdding(true)}>+ {t('Add API')}</button></div>
    <p className="settings-hint">{t('Only Analyze sends this note and your tutor prompt to the selected provider. API usage may cost money. Keys are stored in Windows Credential Manager, outside the project and database.')}</p>
    {error&&<div className="error-banner" role="alert">{error}<button disabled={busy} onClick={()=>void reload().then(()=>setError('')).catch(e=>setError(String(e)))}>{t('Reload settings')}</button></div>}
    {!config?<p>{t('Loading…')}</p>:<fieldset disabled={disabled||busy||adding}>
      {config.profiles.length===0?<p className="ai-notice">{t('No APIs added yet. Add one to start analyzing your notes.')}</p>:<>
        <label>{t('Active API')}<select value={config.selectedProfile??''} onChange={e=>void save({...config,selectedProfile:e.target.value||null})}><option value="">{t('Choose an API')}</option>{config.profiles.map(p=><option key={p.id} value={p.id}>{p.name}{prefs?.configuredKeys.includes(p.id)?'':` · ${t('No key')}`}</option>)}</select></label>
        {profile&&<><label>{t('Model')}<select value={profile.model} onChange={e=>void save({...config,profiles:config.profiles.map(p=>p.id===profile.id?{...p,model:e.target.value}:p)})}>{!models.some(([id])=>id===profile.model)&&<option value={profile.model}>{profile.model}</option>}{models.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <div className="ai-api-meta"><span>{prefs?.configuredKeys.includes(profile.id)?t('Key stored'):t('No key')}</span><button onClick={()=>void save({...config,profiles:config.profiles.filter(p=>p.id!==profile.id),selectedProfile:config.profiles.find(p=>p.id!==profile.id)?.id??null})}>{t('Remove API')}</button></div>
          <p className="settings-hint">{t('Model availability depends on your provider account.')}</p></>}
      </>}
      <label>{t('Explanation language')}<select value={config.explanationLanguage} onChange={e=>void save({...config,explanationLanguage:e.target.value as AIConfig['explanationLanguage']})}><option value="de">Deutsch</option><option value="en">English</option><option value="uk">Українська</option></select></label>
      <p className="settings-hint">{t('Independent of the note language selected above. Corrections keep the note language.')}</p>
      <label className="ai-checkbox"><input type="checkbox" checked={config.naturalness} onChange={e=>void save({...config,naturalness:e.target.checked})}/>{t('Suggest more natural phrasing (orange)')}</label>
      <details className="ai-prompt-settings"><summary>{t('Customize the tutor prompt')}</summary>
        <label>{t('Tutor prompt')}<textarea rows={10} maxLength={16000} value={config.prompt} onChange={e=>setConfig({...config,prompt:e.target.value})}/></label>
        <p className="settings-hint">{t('The JSON contract, rule IDs and safe text matching remain controlled by the app.')}</p>
        <div className="ai-actions"><button onClick={()=>void save(config)}>{t('Save prompt')}</button><button onClick={()=>void save({...config,prompt:prefs?.defaultPrompt??config.prompt})}>{t('Restore default prompt')}</button></div>
        <details><summary>{t('Supported rule IDs')}</summary><p className="ai-rule-list">{prefs?.rules.join(' · ')}</p></details>
      </details>
      <details className="ai-prompt-settings"><summary>{t('Customize the deep analysis prompt')}</summary>
        <label>{t('Deep analysis prompt')}<textarea rows={10} maxLength={16000} value={config.deepPrompt} onChange={e=>setConfig({...config,deepPrompt:e.target.value})}/></label>
        <p className="settings-hint">{t('This prompt guides period-wide writing analysis. The app still controls the response format and safety rules.')}</p>
        <div className="ai-actions"><button onClick={()=>void save(config)}>{t('Save deep prompt')}</button><button onClick={()=>void save({...config,deepPrompt:prefs?.defaultDeepPrompt??config.deepPrompt})}>{t('Restore default deep prompt')}</button></div>
      </details>
      <p role="status" className="settings-hint">{busy?t('Saving…'):notice}</p>
    </fieldset>}
    {adding&&<AddAPIDialog onClose={()=>setAdding(false)} onAdded={reload}/>}
  </section>;
}
