import {ErrorMessage} from './ErrorMessage';
import {t,getLanguage} from './i18n';
import type { ReactNode } from 'react';
﻿import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Autosave } from './autosave';
import type { WritingTimer } from './writingTime';
import { uniqueWordCount } from './note';
import { streak, type JournalStats } from './analytics';
import { mondayOf, shiftDate } from './calendar';
import { Icon, type IconName } from './Icon';
function CardHeading({icon, title}: {icon: IconName; title: string}) { return <div className="card-heading"><span className={`card-icon ${icon}`}><Icon name={icon} size={17}/></span><h2>{t(title)}</h2></div>; }
function Metrics({queue, timer, stats}: {queue: Autosave; timer: WritingTimer; stats: JournalStats | null}) {
  const {draft} = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const [seconds, setSeconds] = useState(timer.seconds);
  useEffect(() => { const id = setInterval(() => setSeconds(timer.seconds), 1000); return () => clearInterval(id); }, [timer]);
  const metric = stats?.notes.find(n => n.dateKey === draft.dateKey);
  const pending = queue.hasTextChanges || (stats?.pendingNotes ?? 0) > 0;
  return <div className="writing-metrics"><div><strong>{uniqueWordCount(draft.plainText)}</strong><span>{t("Words")}</span></div><div><strong>{!stats || stats.analysis.error ? '—' : pending ? '…' : metric?.newLemmas ?? 0}</strong><span>{t("New words")}</span></div><div title={t("Active editing; pauses after 30 seconds idle or when you leave")}><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong><span>{t("Writing time")}</span></div></div>;
}
export function StatsPanel({queue, timer, stats, today, error, onRetry, children}: {queue?: Autosave; timer?: WritingTimer; stats: JournalStats | null; today: string; error: string | null; onRetry: () => void; children: ReactNode}) {
  const days = new Set(stats?.notes.filter(n => n.wordCount > 0).map(n => n.dateKey));
  return <aside className="stats-panel" aria-label={t("Writing overview")}>
    <section className="stats-card"><CardHeading icon="clock" title={t("Writing stats")}/>{queue && timer ? <Metrics key={queue.getSnapshot().draft.dateKey} queue={queue} timer={timer} stats={stats}/> : <p>{t("Loading…")}</p>}<p className="card-footnote">{t("Distinct words, including articles.")}</p></section>
    <section className="stats-card streak-card"><CardHeading icon="flame" title={t("Writing streak")}/><div className="streak-value">{stats ? `${streak(stats, today)} ${t('days')}` : '—'}</div><p>{t("A few words. A daily rhythm.")}</p><div className="streak-week">{(getLanguage() === 'de' ? ['M','D','M','D','F','S','S'] : ['M','T','W','T','F','S','S']).map((label, i) => { const date = shiftDate(mondayOf(today), i); return <div key={i} title={`${date}: ${days.has(date) ? t('written') : t('no writing')}`}><span className={`day-circle ${days.has(date) && date <= today ? 'written' : ''}`}/><small>{label}</small></div>; })}</div><p className="card-footnote">{t("Today can still continue yesterday’s streak.")}</p></section>
    <div className="stats-card ai-sidebar">{children}</div>
    {(error || stats?.analysis.error) ? <section className="stats-card" role="alert"><p>{<ErrorMessage error={error || stats?.analysis.error || ''}/>}</p><button onClick={onRetry}>{t("Retry analysis")}</button><p className="card-footnote">{t("Note saving is independent.")}</p></section> : stats?.pendingNotes ? <p className="card-footnote" role="status">{t("Analyzing")} {stats.pendingNotes} {t("notes locally…")}</p> : null}
  </aside>;
}
