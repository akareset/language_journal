import { useRef, useState } from 'react';
import {getLanguage, t} from './i18n';
import { parseTags, tagColor } from './note';
import { Icon } from './Icon';

export function Tags({ initial, available, disabled, onChange }: { initial: string[]; available: string[]; disabled: boolean; onChange: (tags: string[]) => void }) {
  const [tags, setTags] = useState(initial);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = new Set(tags.map(tag => tag.toLocaleLowerCase()));
  const suggestions = available.filter(tag => !selected.has(tag.toLocaleLowerCase()) && tag.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 8);

  function update(next: string[]) { setTags(next); onChange(next); }
  function add(value: string) {
    const parsed = parseTags(value);
    if (!parsed.length) return;
    const next = [...tags];
    for (const candidate of parsed) {
      const canonical = available.find(tag => tag.toLocaleLowerCase() === candidate.toLocaleLowerCase()) ?? candidate;
      if (!next.some(tag => tag.toLocaleLowerCase() === canonical.toLocaleLowerCase())) next.push(canonical);
    }
    if (next.length !== tags.length) update(next);
    setQuery('');
  }
  function open() { setEditing(true); requestAnimationFrame(() => input.current?.focus()); }
  return <section className="tags-section" aria-label={t('Note tags')}>
    <div className="tag-list">
      {tags.map(tag => <button type="button" className={`tag tag-${tagColor(tag)}`} key={tag} disabled={disabled} title={t('Remove tag')} aria-label={`${t('Remove tag')} #${tag}`} onClick={() => update(tags.filter(item => item !== tag))}>#{tag} <span aria-hidden="true">×</span></button>)}
      <button type="button" className="add-tag" aria-label={t('Add tags')} title={t('Add tags')} disabled={disabled} onClick={open}><Icon name="plus" size={14} />{!tags.length && <span>{t('Add tags')}</span>}</button>
    </div>
    {editing && <div className="tag-input-wrap" ref={wrap} onBlur={event => { if (!wrap.current?.contains(event.relatedTarget)) { add(query); setEditing(false); } }}>
      <label className="sr-only" htmlFor="tags">{t('Add or select a tag')}</label>
      <input ref={input} id="tags" value={query} disabled={disabled} placeholder={getLanguage() === 'de' ? '#alltag' : '#daily'} spellCheck={false} autoComplete="off"
        onChange={event => { const value = event.target.value; if (/[\s,]$/u.test(value)) add(value); else setQuery(value); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(query); } else if (event.key === 'Escape') { setQuery(''); setEditing(false); } }} />
      {suggestions.length > 0 && <div className="tag-suggestions" role="group" aria-label={t('Existing tags')}>
        <small>{t('Existing tags')}</small>
        <div>{suggestions.map(tag => <button type="button" className={`tag tag-${tagColor(tag)}`} key={tag} disabled={disabled} onClick={() => { add(tag); input.current?.focus(); }}>#{tag}</button>)}</div>
      </div>}
      {query.trim() && !available.some(tag => tag.toLocaleLowerCase() === query.replace(/^#+/, '').toLocaleLowerCase()) && <small>{t('Press Enter to create this tag.')}</small>}
    </div>}
  </section>;
}
