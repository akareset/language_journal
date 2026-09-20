import {useState} from 'react';
import {t} from './i18n';
export function ErrorMessage({error}: {error: string}) {
 const [expanded,setExpanded]=useState(false);
 return <span className="error-message">{t('The operation could not be completed. Your saved notes are unchanged.')} <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('Technical details')}</button>{expanded&&<span className="technical-error">{error}</span>}</span>;
}
