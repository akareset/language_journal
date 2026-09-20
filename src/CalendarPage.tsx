import {ErrorMessage} from './ErrorMessage';
import {t,locale} from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { buildActivity, calendarDate, groupNotesByWeek, mondayOf, shiftDate } from './calendar';
import { defaultTitle, tagColor } from './note';
import type { NoteSummary } from './note';
import { Icon } from './Icon';
import './CalendarPage.css';

const dateFormat = () => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const cardDateFormat = () => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function weekRange(start: string, end: string) {
  const first = calendarDate(start), last = calendarDate(end);
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    const month = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(last);
    return `${first.getDate()}.–${last.getDate()}. ${month}`;
  }
  return `${dateFormat().format(first)} – ${dateFormat().format(last)}`;
}

function NoteCard({ note, disabled, onOpen }: { note: NoteSummary; disabled: boolean; onOpen: (dateKey: string) => void }) {
  const title = note.title ?? defaultTitle(note.dateKey);
  return <button className="calendar-note" disabled={disabled} onClick={() => onOpen(note.dateKey)}
    aria-label={`${t('Open')} ${title}, ${dateFormat().format(calendarDate(note.dateKey))}`} title={title}>
    <span className="calendar-note-date"><Icon name="calendar" size={13} /><time dateTime={note.dateKey}>{cardDateFormat().format(calendarDate(note.dateKey))}</time><Icon name="chevron" size={13} /></span>
    <span className="calendar-note-title">{title}</span>
    <span className="calendar-note-tags">{note.tags.length ? note.tags.map(tag => <span className={`tag tag-${tagColor(tag)}`} key={tag}>#{tag}</span>) : <span className="no-tags">{t("No tags")}</span>}</span>
  </button>;
}

function ActivityMap({ notes, today, disabled, onOpen }: {
  notes: NoteSummary[]; today: string; disabled: boolean; onOpen: (dateKey: string) => void;
}) {
  const activity = useMemo(() => buildActivity(notes, today), [notes, today]);
  const [hovered, setHovered] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep recent days visible when the year needs horizontal scrolling.
    const showRecent = () => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth; };
    showRecent();
    window.addEventListener('resize', showRecent);
    return () => window.removeEventListener('resize', showRecent);
  }, [today]);
  const range = `${dateFormat().format(calendarDate(activity.start))} – ${dateFormat().format(calendarDate(today))}`;
  return <section className="activity-card" aria-labelledby="activity-heading">
    <div className="activity-heading">
      <div><span className="activity-icon"><Icon name="chart" size={17} /></span><h2 id="activity-heading">{t("Writing activity")}</h2><span className="activity-period">{t("Last 365 days")}</span></div>
      <span className="activity-total"><b>{activity.activeDays}</b> {activity.activeDays === 1 ? t('day') : t('days')} {t("with notes")}</span>
    </div>
    <div className="heatmap-scroll" ref={scroller} tabIndex={0} role="group" aria-label={t("Daily note activity for the last 365 days; scroll horizontally on smaller windows")}>
      <div className="heatmap-plot" style={{ '--weeks': activity.weeks.length } as CSSProperties}>
        <div className="heatmap-months" aria-hidden="true">{activity.months.map(month => <span key={month.column} style={{ gridColumn: month.column + 1 }}>{month.label}</span>)}</div>
        <div className="heatmap-weekdays" aria-hidden="true">{['Mon', '', 'Wed', '', 'Fri', '', ''].map((day, index) => <span key={index}>{t(day)}</span>)}</div>
        <div className="heatmap-columns" onMouseLeave={() => setHovered(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null); }}>
          {activity.weeks.map((week, index) => <div className="heatmap-week" key={index}>{week.map((day, row) => {
            if (!day) return <span className="activity-spacer" key={`padding-${row}`} aria-hidden="true" />;
            const label = `${cardDateFormat().format(calendarDate(day.dateKey))}: ${day.count} ${day.count === 1 ? t('note') : t('notes')}`;
            const className = `activity-cell activity-level-${day.level}${day.dateKey === today ? ' activity-today' : ''}`;
            return day.count > 0
              ? <button className={className} key={day.dateKey} data-date={day.dateKey} data-count={day.count} title={label} aria-label={`${label}. ${t('Open note')}`} disabled={disabled}
                  onMouseEnter={() => setHovered(label)} onFocus={() => setHovered(label)} onClick={() => onOpen(day.dateKey)} />
              : <span className={className} key={day.dateKey} data-date={day.dateKey} data-count="0" title={label} role="img" aria-label={label} onMouseEnter={() => setHovered(label)} />;
          })}</div>)}
        </div>
      </div>
    </div>
    <div className="activity-footer"><span>{hovered ?? range}</span><div className="activity-legend" aria-label={t("Activity color legend")}>
      {Array.from({ length: activity.maxLevel + 1 }, (_, level) => <span key={level}><i className={`activity-level-${level}`} />{level === 0 ? t('No notes') : `${level === 4 ? '4+' : level} ${level === 1 ? t('note') : t('notes')}`}</span>)}
    </div></div>
  </section>;
}

export function CalendarPage({ notes, today, disabled, loading, error, onOpen, onRetry }: {
  notes: NoteSummary[]; today: string; disabled: boolean; loading: boolean; error: string | null;
  onOpen: (dateKey: string) => void; onRetry: () => void;
}) {
  const weeks = useMemo(() => groupNotesByWeek(notes), [notes]);
  const currentWeek = mondayOf(today);
  return <main className="calendar-page" aria-busy={loading}>
    <header className="calendar-header">
      <div><div className="calendar-eyebrow"><Icon name="book" size={13} />{t("YOUR JOURNAL, OVER TIME")}</div><h1 id="calendar-heading">{t("Calendar")}<span className="calendar-count">{notes.length} {notes.length === 1 ? t('note') : t('notes')}</span></h1><p>{t("Little moments. Collected, week by week.")}</p></div>
      <button className="calendar-today-button" aria-label={t("Write today's note")} title={t("Write today's note")} disabled={disabled} onClick={() => onOpen(today)}><Icon name="edit" size={15} /><span>{t("Write today")}</span></button>
    </header>
    <section className="calendar-list-area">
      {loading && <p className="calendar-loading" role="status">{t("Loading…")}</p>}
      {error && <div className="error-banner" role="alert">{<ErrorMessage error={error}/>}<button disabled={disabled} onClick={onRetry}>{t("Retry")}</button></div>}
      <div className="calendar-notes-scroll" tabIndex={0} role="region" aria-label={t("Notes grouped by week, newest first")}>
        {weeks.length ? weeks.map(week => {
          const relative = week.start === currentWeek ? t('This week') : week.start === shiftDate(currentWeek, -7) ? t('Last week') : null;
          const range = weekRange(week.start, week.end);
          return <section className="week-block" key={week.start} data-week={week.start} aria-label={range}>
            <div className="week-heading"><span className="week-dot" /><h2>{relative ?? range}</h2>{relative && <span className="week-range">{range}</span>}<span className="week-count">{week.notes.length} {week.notes.length === 1 ? t('note') : t('notes')}</span></div>
            <div className="week-notes">{week.notes.map(note => <NoteCard key={note.id} note={note} disabled={disabled} onOpen={onOpen} />)}</div>
          </section>;
        }) : <div className="calendar-empty"><span><Icon name="feather" size={31} /></span><h2>{t("Your first week starts here.")}</h2><p>{t("Write a few words today. Your notes will find their place here.")}</p><button disabled={disabled} onClick={() => onOpen(today)}>{t("Start today's note")}<Icon name="chevron" size={14} /></button></div>}
        {weeks.length > 0 && <p className="calendar-list-end">{t("Every little note is part of your progress.")}</p>}
      </div>
    </section>
    <ActivityMap notes={notes} today={today} disabled={disabled} onOpen={onOpen} />
  </main>;
}
