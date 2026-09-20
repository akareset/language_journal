import {t} from './i18n';
import {getSettings} from './i18n';
import { useLayoutEffect, useRef } from 'react';
import { defaultTitle } from './note';
import { Icon } from './Icon';

export function NoteTitle({ title, dateKey, disabled, onChange }: {
  title: string | null; dateKey: string; disabled: boolean; onChange: (title: string | null) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const value = title ?? defaultTitle(dateKey);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const resize = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; };
    resize();
    // The layout only changes width on window resize. Avoid observing the
    // textarea's own height, which would feed its autosizing back into itself.
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [value]);
  return <div className="note-title-row">
    <textarea ref={input} className="note-title" aria-label={t("Note title")} title={t("Click to rename this note")} lang={getSettings().language} spellCheck={getSettings().spellcheck} rows={1} maxLength={180} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value.replace(/[\r\n]/g, ' '))}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); input.current?.blur(); } }}
      onBlur={() => { if (title !== null && !title.trim()) onChange(null); }} />
    <button className="icon-button title-edit" title={t("Edit note title")} aria-label={t("Edit note title")} disabled={disabled} onClick={() => { input.current?.focus(); input.current?.select(); }}><Icon name="edit" size={16} /></button>
  </div>;
}
