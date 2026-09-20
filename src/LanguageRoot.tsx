import {useEffect, useState, useSyncExternalStore} from 'react';
import App from './App';
import {applySettings, getSettings, subscribeSettings, t} from './i18n';
import {loadSettings} from './storage';
export function LanguageRoot() {
 const settings=useSyncExternalStore(subscribeSettings,getSettings);
 const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false; void loadSettings().then(s=>{if(!cancelled){applySettings(s);setReady(true);setError(null);}}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[attempt]);
 if(!ready) return <main className="settings-page"><h1>Language Journal</h1><p>{error ? t('Could not load settings.') : t('Loading…')}</p>{error && <><pre>{error}</pre><button onClick={()=>setAttempt(n=>n+1)}>{t('Retry')}</button></>}</main>;
 return <App key={settings.language} settings={settings}/>;
}
