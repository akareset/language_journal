import {ErrorMessage} from './ErrorMessage';
import {t,locale,getLanguage} from './i18n';
import { useState } from 'react';
import { averages, growthPoints, type JournalStats, type VocabularyWord } from './analytics';
import {LearningPage} from './LearningPage';
const categories = ['Nouns', 'Verbs', 'Adjectives', 'Adverbs', 'Other'];
const colors = ['#8c67d2', '#b49ae4', '#d0bbee', '#a4a9db', '#e3dbea'];
function Forms({word}: {word: VocabularyWord}) {
  return <details className="word-details"><summary><span lang={getLanguage()}>{word.lemma}</span><small>{t(word.pos)} {word.lemma.startsWith('sich ') && t('· reflexive')}</small></summary><div>{word.forms.map((f, i) => <p key={i}><b lang="de">{f.form}</b> × {f.count}<small>{f.morph.split('|').join(' · ') || t('No morphology reported')}</small></p>)}</div></details>;
}
function VocabularyOverview({stats, error, today, onRetry}: {stats: JournalStats | null; error: string | null; today: string; onRetry: () => void}) {
  const [yearly, setYearly] = useState(false), [month, setMonth] = useState(today.slice(0, 7)), [year, setYear] = useState(today.slice(0, 4));
  if (!stats) return <section><h1>{t("Vocabulary")}</h1><p>{error || t('Loading your words…')}</p>{error && <button onClick={onRetry}>{t("Retry")}</button>}</section>;
  const avg = averages(stats, today), points = growthPoints(stats.growth, yearly ? year : month, yearly);
  const max = Math.max(1, ...points.map(p => p.total));
  const coords = points.map((p, i) => `${40 + i * 520 / (points.length - 1)},${170 - p.total / max * 135}`);
  let angle = 0;
  const slices = categories.map((c, i) => { const start = angle; angle += (stats.posCounts[c] || 0) / (stats.totalLemmas || 1) * 360; return `${colors[i]} ${start}deg ${angle}deg`; });
  return <section className="vocabulary-overview">
    <header className="vocabulary-heading"><div><span className="eyebrow">{t("YOUR LANGUAGE, GROWING")}</span><h1>{t("Vocabulary")}</h1><p>{t("A collection of the words you make your own.")}</p></div><span className="local-pill">{t("Local analysis · spaCy")}</span></header>
    {(error || stats.analysis.error) && <div className="error-banner" role="alert">{<ErrorMessage error={error || stats.analysis.error || ''}/>}<button onClick={onRetry}>{t("Retry analysis")}</button><small>{t("Your notes are saved independently.")}</small></div>}
    {stats.pendingNotes > 0 && <p className="analysis-notice" role="status">{stats.analysis.error ? t('Analysis paused') : t('Analyzing your language…')} · {stats.pendingNotes} {t("notes pending. Vocabulary totals reflect completed analysis.")}</p>}
    <div className="vocabulary-summary">{[[stats.totalLemmas.toLocaleString(locale()), 'Unique lemmas'], [avg.perDay.toLocaleString(locale(), {minimumFractionDigits:1,maximumFractionDigits:1}), 'Avg. words / day'], [avg.perNote.toLocaleString(locale(), {minimumFractionDigits:1,maximumFractionDigits:1}), 'Avg. words / note'], [avg.days, 'Writing days']].map(([value, label]) => <section key={t(String(label))}><strong>{value}</strong><span>{t(String(label))}</span></section>)}</div>
    <p className="metric-explanation">{t("Word averages count distinct forms, including articles. Per day includes quiet days since your first entry; future entries are excluded from averages.")}</p>
    <div className="vocabulary-grid">
      <section className="vocabulary-card"><header><h2>{t("Most used words")}</h2><span>{t("TOP 10 · OCCURRENCES")}</span></header>
        {!stats.topWords.length && <p className="empty-vocabulary">{t("Your first words will appear here after you write.")}</p>}
        <ol className="top-words">{stats.topWords.map((word, i) => <li key={word.id}><span className="word-rank">{String(i + 1).padStart(2, '0')}</span><div><Forms word={word}/><div className="usage-track"><i style={{width: `${word.count / stats.topWords[0].count * 100}%`}} /></div></div><span className="usage-count">{word.count}<small>{word.noteCount} {word.noteCount === 1 ? t('note') : t('notes')}</small></span></li>)}</ol>
      </section>
      <section className="vocabulary-card growth-card"><header><div><h2>{t("Learning progress")}</h2><p>{t("Your cumulative vocabulary")}</p></div><div className="chart-switch"><button aria-pressed={!yearly} onClick={() => setYearly(false)}>{t("Month")}</button><button aria-pressed={yearly} onClick={() => setYearly(true)}>{t("Year")}</button></div></header>
        <div className="chart-period">{yearly ? <input aria-label={t("Growth year")} type="number" min="1" max="9999" value={Number(year)} onChange={e => { if (e.target.validity.valid && e.target.value) setYear(e.target.value.padStart(4, '0')); }}/> : <input aria-label={t("Growth month")} type="month" value={month} onChange={e => { if (e.target.value && e.target.validity.valid) setMonth(e.target.value); }}/>}<span>{points[points.length - 1]?.total ?? 0} {t("lemmas by period end")}</span></div>
        <svg className="growth-chart" viewBox="0 0 590 205" role="img" aria-label={`${t('Cumulative vocabulary for')} ${yearly ? year : month}`}>
          <defs><linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b699e7" stopOpacity=".4"/><stop offset="100%" stopColor="#b699e7" stopOpacity=".02"/></linearGradient></defs>
          {[0, .5, 1].map(f => <g key={f}><line x1="40" x2="560" y1={170 - f * 135} y2={170 - f * 135} stroke="#eee8f7"/><text x="30" y={174 - f * 135} textAnchor="end">{Math.round(max * f)}</text></g>)}
          <path d={`M40,170 L${coords.join(' L')} L560,170 Z`} fill="url(#growth-fill)"/><polyline points={coords.join(' ')} fill="none" stroke="#9874d4" strokeWidth="2.5"/>
          {points.map((p, i) => <g key={p.key}><circle tabIndex={0} aria-label={`${p.key}: ${p.total} ${t('lemmas')}, ${p.added} ${t('new')}`} cx={40 + i * 520 / (points.length - 1)} cy={170 - p.total / max * 135} r="4" fill="#9874d4"><title>{p.key}: {p.total} {t("lemmas · +")}{p.added} {t("new")}</title></circle>{(yearly || i % 5 === 0 || i === points.length - 1) && <text x={40 + i * 520 / (points.length - 1)} y="195" textAnchor="middle">{p.label}</text>}</g>)}
        </svg><p className="metric-explanation">{t("First appearance in your saved notes, by note date. Editing or removing words recalculates this history.")}</p>
      </section>
      <section className="vocabulary-card"><header><h2>{t("The shape of your vocabulary")}</h2><span>{t("UNIQUE LEMMAS")}</span></header><div className="pos-breakdown"><div className="pos-donut" role="img" aria-label={categories.map(c => `${t(c)}: ${stats.posCounts[c] || 0}`).join(', ')} style={{background: stats.totalLemmas ? `conic-gradient(${slices.join(',')})` : '#eeeaf3'}}><div><strong>{stats.totalLemmas}</strong><span>{t("lemmas")}</span></div></div><ul>{categories.map((c, i) => <li key={t(c)}><i style={{background: colors[i]}}/><span>{t(c)}</span><b>{stats.posCounts[c] || 0}</b></li>)}</ul></div><p className="metric-explanation">{t("Each lemma uses its most frequent part of speech. Proper names and interjections appear under Other.")}</p></section>
      <section className="vocabulary-card"><header><h2>{t("Recently discovered")}</h2><span>{t("5 NEWEST LEMMAS")}</span></header>{!stats.recentWords.length && <p className="empty-vocabulary">{t("A new word begins with a new note.")}</p>}<div className="recent-words">{stats.recentWords.map(w => <div key={w.id}><Forms word={w}/><time dateTime={w.firstSeen}>{new Date(w.firstSeen + 'T12:00:00').toLocaleDateString(locale(), {day: 'numeric', month: 'short', year: 'numeric'})}</time></div>)}</div><p className="metric-explanation">{t("Open a word to see its forms and grammatical features.")} {getLanguage() === 'de' && t('German reflexive uses are grouped as “sich + verb”.')}</p></section>
    </div>
  </section>;
}

export function VocabularyPage(props:{stats:JournalStats|null;error:string|null;today:string;onRetry:()=>void}) {
  const [learning,setLearning]=useState(false);
  const [learningBusy,setLearningBusy]=useState(false);
  return <main className="vocabulary-page vocabulary-container"><nav className="vocabulary-tabs" aria-label={t('Vocabulary views')}><button disabled={learningBusy} aria-pressed={!learning} onClick={()=>setLearning(false)}>{t('Overview')}</button><button disabled={learningBusy} aria-pressed={learning} onClick={()=>setLearning(true)}>{t('My learning set')}</button></nav>{learning?<LearningPage onBusyChange={setLearningBusy}/>:<VocabularyOverview {...props}/>}</main>;
}
