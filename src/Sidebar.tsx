import {t} from './i18n';
import { Icon, type IconName } from './Icon';

export function Sidebar({ disabled, view, onToday, onCalendar, onVocabulary, onSettings }: {
  disabled: boolean; view: 'editor' | 'calendar' | 'vocabulary' | 'settings'; onToday: () => void; onCalendar: () => void; onVocabulary: () => void; onSettings: () => void;
}) {
  const links: { label: string; icon: IconName }[] = [

    { label: 'Insights', icon: 'chart' }, { label: 'Tags', icon: 'tag' },
  ];
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Icon name="feather" size={21} /></span><span>{t("Language Journal")}</span></div>
    <button className="search-placeholder" disabled title={t("Note search is not available yet")}><Icon name="search" size={16} /><span>{t("Search notes…")}</span><small>{t("Soon")}</small></button>
    <div className="nav-caption">{t("WORKSPACE")}</div>
    <nav aria-label={t("Main navigation")}>
      <button className={`nav-item${view === 'editor' ? ' active' : ''}`} aria-label={t("Today")} aria-current={view === 'editor' ? 'page' : undefined} disabled={disabled} onClick={onToday}><Icon name="home" /><span>{t("Today")}</span>{view === 'editor' && <span className="active-dot" />}</button>
      <button className={`nav-item${view === 'calendar' ? ' active' : ''}`} aria-label={t("Calendar")} aria-current={view === 'calendar' ? 'page' : undefined} disabled={disabled} onClick={onCalendar}><Icon name="calendar" /><span>{t("Calendar")}</span>{view === 'calendar' && <span className="active-dot" />}</button>
      <button className={`nav-item${view === 'vocabulary' ? ' active' : ''}`} aria-label={t("Vocabulary")} aria-current={view === 'vocabulary' ? 'page' : undefined} disabled={disabled} onClick={onVocabulary}><Icon name="book"/><span>{t("Vocabulary")}</span></button>
      {links.map(({ label, icon }) => <button className="nav-item" aria-label={t(label)} key={t(label)} disabled title={t("Not available yet")}><Icon name={icon} /><span>{t(label)}</span></button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-note"><span className="quote-mark">“</span><p>{t("Small steps make")}<br />{t("great progress.")}</p></div>
      <button className={`nav-item${view === 'settings' ? ' active' : ''}`} aria-label={t("Settings")} aria-current={view === 'settings' ? 'page' : undefined} disabled={disabled} onClick={onSettings}><Icon name="settings" /><span>{t("Settings")}</span></button>
    </div>
  </aside>;
}
