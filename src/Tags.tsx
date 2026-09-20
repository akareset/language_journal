import {getLanguage} from './i18n';
import {t} from './i18n';
﻿import { useRef, useState } from 'react';
import { parseTags, tagColor } from './note';
import { Icon } from './Icon';

export function Tags({ initial, disabled, onChange }: { initial: string[]; disabled: boolean; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState(initial.map(tag => `#${tag}`).join(' '));
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tags = parseTags(text);
  return <section className="tags-section" aria-label={t("Note tags")}>
    <div className="tag-list">
      {tags.map(tag => <button className={`tag tag-${tagColor(tag)}`} key={tag} disabled={disabled} title={t("Edit tags")} onClick={() => { setEditing(true); requestAnimationFrame(() => input.current?.focus()); }}>#{tag}</button>)}
      <button className="add-tag" aria-label={t("Edit tags")} title={t("Add or edit tags")} disabled={disabled} onClick={() => { setEditing(value => !value); requestAnimationFrame(() => input.current?.focus()); }}><Icon name="plus" size={14} />{!tags.length && <span>{t("Add tags")}</span>}</button>
    </div>
    {editing && <div className="tag-input-wrap">
      <label className="sr-only" htmlFor="tags">{t("Tags, separated by spaces or commas")}</label>
      <input ref={input} id="tags" value={text} disabled={disabled} placeholder={getLanguage() === 'de' ? '#alltag #lernen' : '#daily #learning'} spellCheck={false} autoComplete="off"
        onChange={event => { setText(event.target.value); onChange(parseTags(event.target.value)); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') setEditing(false); }} />
      <small>{t("Separate tags with spaces or commas. Enter to finish.")}</small>
    </div>}
  </section>;
}
