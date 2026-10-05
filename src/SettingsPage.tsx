import {ErrorMessage} from './ErrorMessage';
import { useEffect, useState } from 'react';
import { AISettings } from './AISettings';
import { t, type Settings } from './i18n';
export function SettingsPage({settings,onChange,disabled,navigationError,onRetry,focusAI=false}:{settings:Settings;onChange:(next:Settings)=>Promise<void>;disabled:boolean;navigationError:string|null;onRetry:()=>void;focusAI?:boolean}) {
 useEffect(()=>{if(focusAI)document.getElementById('ai-settings')?.scrollIntoView();},[focusAI]);
 const [requested,setRequested]=useState(settings);
 const [saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
 async function change(next:Settings){setRequested(next);setSaving(true);setError(null);try{await onChange(next);}catch(e){setError(String(e));}finally{setSaving(false);}}
 return <main className="settings-page"><header><span className="eyebrow">LANGUAGE JOURNAL</span><h1>{t('Settings')}</h1><p>{t('Make this space your own.')}</p></header>
 {navigationError && <div className="error-banner" role="alert"><ErrorMessage error={navigationError}/><button disabled={disabled} onClick={onRetry}>{t('Retry')}</button></div>}
 <section className="settings-card"><h2>{t('Language & writing')}</h2><div className="setting-row"><div><label htmlFor="journal-language">{t('Language')}</label><p>{t('Choose the language for the interface, notes, and vocabulary analysis.')}</p></div><select id="journal-language" value={settings.language} disabled={saving||disabled} onChange={e=>void change({...settings,language:e.target.value as Settings['language']})}><option value="de">Deutsch</option><option value="en">English</option></select></div><p className="settings-hint">{t('Each language has its own daily notes and vocabulary. Your existing notes stay in German.')}</p>
 <div className="setting-row"><div><label htmlFor="native-spellcheck">{t('Native spellcheck')}</label><p>{t('Optional underlines from Windows / WebView2. Available dictionaries depend on your system, not just the keyboard layout. Disabled by default to avoid incorrect language warnings.')}</p></div><input id="native-spellcheck" type="checkbox" checked={settings.spellcheck} disabled={saving||disabled} onChange={e=>void change({...settings,spellcheck:e.target.checked})}/></div>
 <p role="status" className="settings-hint">{saving?t('Saving…'):t('Changes are saved automatically.')}</p>{error&&<div className="error-banner" role="alert">{t('Could not save settings.')}<details><summary>{t('Technical details')}</summary>{error}</details><button onClick={()=>void change(requested)}>{t('Retry')}</button></div>}</section><AISettings disabled={disabled||saving}/></main>;
}
