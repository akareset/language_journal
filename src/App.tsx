import {ErrorMessage} from './ErrorMessage';
import {applySettings, getSettings, t, type Settings} from './i18n';
import {saveSettings} from './storage';
import {SettingsPage} from './SettingsPage';
import { AIReview } from './AIReview';
import { InsightsPage } from './InsightsPage';
import { flushAI } from './ai';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Autosave } from './autosave';
import { blankNote, localDateKey, uniqueWordCount } from './note';
import type { NoteSummary } from './note';
import { listNotes, loadDailyNote, saveDailyNote } from './storage';
import { NoteEditor } from './NoteEditor';
import { Tags } from './Tags';
import { Sidebar } from './Sidebar';
import { StatsPanel } from './StatsPanel';
import { NoteTitle } from './NoteTitle';
import { Icon } from './Icon';
import { CalendarPage } from './CalendarPage';
import { availableTags } from './calendar';
import './App.css';
import { WritingTimer } from './writingTime';
import { useJournalStats } from './useJournalStats';
import { VocabularyPage } from './VocabularyPage';
import type { JournalStats } from './analytics';
import {LearningDialog} from './LearningDialog';
import type {LearningSeed} from './learning';

type Session = { timer: WritingTimer; queue: Autosave; existed: boolean; generation: number };

function checkpoint(session: Session, pause = true) {
  if (pause) session.timer.pause(); else session.timer.tick();
  const draft = session.queue.getSnapshot().draft;
  if (draft.writingSeconds !== session.timer.seconds) session.queue.update({...draft, writingSeconds: session.timer.seconds});
}

function WritingScreen({ session, knownTags, locked, onEditorReady, showCorrections, onToggleCorrections, onAddLearning }: { session: Session; knownTags: string[]; locked: boolean; onEditorReady: (editor: Editor | null) => void; showCorrections:boolean; onToggleCorrections:()=>void; onAddLearning:(seed:LearningSeed)=>void }) {
  const { queue, existed } = session;
  useEffect(() => {
    const pause = () => checkpoint(session);
    const visibility = () => { if (document.hidden) pause(); };
    const id = setInterval(() => { session.timer.tick(); if (!session.timer.running || session.timer.seconds - session.queue.getSnapshot().draft.writingSeconds >= 10) checkpoint(session, false); }, 1000);
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(id); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); pause(); };
  }, [session]);
  const { draft, status, error } = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const update = (patch: Partial<typeof draft>) => queue.update({ ...queue.getSnapshot().draft, ...patch });
  return <>
    <div className="note-heading">
      <NoteTitle title={draft.title} dateKey={draft.dateKey} disabled={locked} onChange={title => update({ title })} />
      <p className="intro" lang={getSettings().language}>{t("Every day is a new chance to practise your language.")}</p>
    </div>
    {error && <div className="error-banner" role="alert">
      <strong>{t("Your draft is still here.")}</strong> {error}
      <button disabled={locked} onClick={() => { void queue.flush().catch(() => {}); }}>{t("Retry save")}</button>
    </div>}
    <NoteEditor initial={draft} locked={locked} onReady={onEditorReady} showCorrections={showCorrections} onToggleCorrections={onToggleCorrections} onAddLearning={onAddLearning} onBlur={() => checkpoint(session)} onChange={(document, plainText) => { session.timer.activity(); update({ document, plainText, writingSeconds: session.timer.seconds }); }} />
    <div className="note-footer">
      <Tags initial={draft.tags} available={knownTags} disabled={locked} onChange={tags => update({ tags })} />
      <div className="save-indicator" role="status" aria-live="polite">
        {!existed && !queue.hasEdited ? t('Ready to write') : t(status)}
        {status === 'Saved' ? <Icon name="check" size={15} /> : <span className={`status-dot ${status === 'Could not save' ? 'failed' : ''}`} />}
      </div>
    </div>
  </>;
}

function StatusBar({ session, view, stats }: { session: Session | null; view: string; stats: JournalStats | null }) {
  return <footer className="status-bar">
    {view === 'calendar' ? <span>{t("Notes grouped by week · newest first")}</span> : view === 'vocabulary' ? <span>{stats?.totalOccurrences ?? '—'} {t("meaningful word occurrences")}</span> : session ? <WordMetric queue={session.queue} stats={stats} /> : <span>{t("— words")}</span>}
    <span><b>{stats?.totalLemmas ?? '—'}</b> {t("vocabulary")}</span>
    <span className="local-label">{t("On your device")}</span>
  </footer>;
}
function WordMetric({ queue, stats }: { queue: Autosave; stats: JournalStats | null }) {
  const { draft } = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const count = uniqueWordCount(draft.plainText);
  const metric = stats?.notes.find(n => n.dateKey === draft.dateKey);
  const newWords = !stats || stats.analysis.error ? '—' : queue.hasTextChanges || stats.pendingNotes ? '…' : metric?.newLemmas ?? 0;
  return <><span><b>{count}</b> {count === 1 ? t('word') : t('words')}</span><span><b>{newWords}</b> {t("new words")}</span></>;
}

function App({settings}: {settings: Settings}) {
  const analytics = useJournalStats();
  const [day, setDay] = useState(localDateKey);
  const [today, setToday] = useState(localDateKey);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<'editor' | 'calendar' | 'vocabulary' | 'settings' | 'insights'>('editor');
  const [summaries, setSummaries] = useState<NoteSummary[]>([]);
  const current = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [changingSettings, setChangingSettings] = useState(false);
  const [focusAI, setFocusAI] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showCorrections,setShowCorrections]=useState(true);
  const [learningSeed,setLearningSeed]=useState<LearningSeed|null>(null);
  const settingsWrite = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const closeBusy = useRef(false);
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const requestedDay = useRef(day);
  const lastAction = useRef<'day' | 'calendar' | 'vocabulary' | 'settings' | 'insights'>('day');
  const [ready, setReady] = useState(false);
  const [setupAttempt, setSetupAttempt] = useState(0);

  async function openDay(dateKey: string) {
    if (busy.current || closeBusy.current) return;
    busy.current = true;
    requestedDay.current = dateKey;
    lastAction.current = 'day';
    setLoading(true);
    setError(null);
    const generation = ++loadGeneration.current;
    try {
      if (current.current) checkpoint(current.current);
      await flushAI();
      await current.current?.queue.flush();
      const [note, knownNotes] = await Promise.all([loadDailyNote(dateKey), listNotes()]);
      if (!mounted.current || generation !== loadGeneration.current) return;
      setSummaries(knownNotes);
      const next = { timer: new WritingTimer(note?.writingSeconds ?? 0), queue: new Autosave(note ?? blankNote(dateKey), async draft => { const saved = await saveDailyNote(draft); void analytics.refresh(); return saved; }), existed: note !== null, generation };
      current.current?.queue.dispose();
      current.current = next;
      setSession(next);
      setShowCorrections(true);
      setDay(dateKey);
      setView(sessionStorage.getItem('return-settings') === 'yes' ? 'settings' : 'editor');
      sessionStorage.removeItem('return-settings');
    } catch (reason) {
      if (mounted.current && generation === loadGeneration.current) setError(String(reason));
    } finally {
      if (mounted.current && generation === loadGeneration.current) { busy.current = false; setLoading(false); }
    }
  }

  async function openCalendar(target: 'calendar' | 'vocabulary' | 'settings' | 'insights' = 'calendar') {
    if (busy.current || closeBusy.current) return;
    busy.current = true;
    lastAction.current = target;
    setLoading(true);
    setError(null);
    const generation = ++loadGeneration.current;
    try {
      // Do not leave the editor or fetch stale summaries until its draft commits.
      if (current.current) checkpoint(current.current);
      await flushAI();
      await current.current?.queue.flush();
      const notes = await listNotes();
      if (!mounted.current || generation !== loadGeneration.current) return;
      setSummaries(notes);
      setView(target);
      void analytics.refresh();
    } catch (reason) {
      if (mounted.current && generation === loadGeneration.current) setError(String(reason));
    } finally {
      if (mounted.current && generation === loadGeneration.current) { busy.current = false; setLoading(false); }
    }
  }

  function changeSettings(next: Settings): Promise<void> {
    if (settingsWrite.current) return settingsWrite.current;
    busy.current = true;
    setChangingSettings(true);
    const write = (async () => {
      if (current.current) checkpoint(current.current);
      await flushAI();
      await current.current?.queue.flush();
      await saveSettings(next);
      if (next.language !== settings.language) sessionStorage.setItem('return-settings','yes');
      applySettings(next);
    })();
    settingsWrite.current = write.finally(() => {
      settingsWrite.current = null;
      busy.current = false;
      setChangingSettings(false);
    });
    return settingsWrite.current;
  }
  function retryNavigation() {
    if (lastAction.current !== 'day') void openCalendar(lastAction.current);
    else void openDay(requestedDay.current);
  }
  async function addLearning(seed:LearningSeed) {
    try {await current.current?.queue.flush();setLearningSeed(seed);}
    catch(reason){setError(String(reason));}
  }

  async function finishClose() {
    if (closeBusy.current) return;
    closeBusy.current = true;
    setClosing(true);
    setCloseError(null);
    try {
      await settingsWrite.current;
      await flushAI();
      if (current.current) checkpoint(current.current);
      await current.current?.queue.flush();
      await getCurrentWindow().destroy();
    } catch (reason) {
      setCloseError(String(reason));
    } finally {
      closeBusy.current = false;
      setClosing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    mounted.current = true;
    // Register close protection before enabling editing. Strict Mode can cancel
    // this asynchronous registration; its eventual listener is still removed.
    void Promise.resolve().then(() => getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      if (!cancelled) void finishClose();
    })).then(stop => {
      if (cancelled) { stop(); return; }
      unlisten = stop;
      setReady(true);
      void openDay(localDateKey());
    }).catch(reason => {
      if (!cancelled) { setError(`Could not enable safe window closing: ${String(reason)}`); setLoading(false); }
    });
    const midnightCheck = setInterval(() => setToday(localDateKey()), 30_000);
    return () => {
      cancelled = true;
      mounted.current = false;
      loadGeneration.current++;
      busy.current = false;
      unlisten?.();
      clearInterval(midnightCheck);
      current.current?.queue.dispose();
    };
    // Native close callbacks read the current queue through its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupAttempt]);

  const locked = loading || closing || changingSettings || closeError !== null;
  return <div className="app-shell">
    <div className="workspace">
      <Sidebar disabled={locked || !ready} view={view} onToday={() => void openDay(localDateKey())} onCalendar={() => void openCalendar()} onVocabulary={() => void openCalendar('vocabulary')} onSettings={() => {setFocusAI(false);void openCalendar('settings');}} onInsights={() => void openCalendar('insights')} />
      {view === 'insights' ? <InsightsPage disabled={locked} onOpen={date => void openDay(date)} onSettings={() => {setFocusAI(true);void openCalendar('settings');}} /> : view === 'settings' ? <SettingsPage settings={settings} disabled={locked} onChange={changeSettings} navigationError={error} onRetry={retryNavigation} focusAI={focusAI}/> : view === 'vocabulary' ? <VocabularyPage stats={analytics.stats} error={error || analytics.error} today={today} onRetry={() => { void analytics.retry(); if (error) retryNavigation(); }} /> : view === 'calendar' ? <CalendarPage notes={summaries} today={today} disabled={locked} loading={loading} error={error}
        onOpen={dateKey => void openDay(dateKey)} onRetry={retryNavigation} /> : <>
      <main className="writing-scroll" aria-busy={loading}>
        <article className="writing-page">
          <div className="note-breadcrumb"><span><Icon name="book" size={15} />{t("Journal")}<Icon name="chevron" size={12} /><b>{day === today ? t('Today') : t('Daily note')}</b></span>
            <label className="date-control" title={t("Open a daily note. Renaming its title never changes this date.")}><Icon name="calendar" size={14} /><input aria-label={t("Note date")} type="date" min="0001-01-01" max="9999-12-31" value={day} disabled={locked || !ready}
              onChange={event => { if (event.target.validity.valid && event.target.value) void openDay(event.target.value); }} /></label>
          </div>
          {day !== today && <div className="day-notice">{t("You’re writing for")} {day}{t(". This draft stays on that day.")}<button disabled={locked} onClick={() => void openDay(localDateKey())}>{t("Go to today")}</button></div>}
          {loading && <p role="status">{t("Loading…")}</p>}
          {error && <div className="error-banner" role="alert">{<ErrorMessage error={error}/>}<button disabled={loading} onClick={() => ready ? retryNavigation() : setSetupAttempt(value => value + 1)}>{t("Retry loading")}</button></div>}
          {session && <WritingScreen key={session.generation} session={session} knownTags={availableTags(summaries)} locked={locked} onEditorReady={setEditor} showCorrections={showCorrections} onToggleCorrections={()=>setShowCorrections(value=>!value)} onAddLearning={seed=>void addLearning(seed)} />}
        </article>
      </main>
      <StatsPanel queue={session?.queue} timer={session?.timer} stats={analytics.stats} today={today} error={analytics.error} onRetry={() => void analytics.retry()}>
        {session && <AIReview key={session.generation} editor={editor} queue={session.queue} locked={locked} showCorrections={showCorrections} onAddLearning={seed=>void addLearning(seed)} onSettings={() => {setFocusAI(true);void openCalendar('settings');}} />}
      </StatsPanel>
      </>}
    </div>
    <StatusBar session={session} view={view} stats={analytics.stats} />
    {learningSeed&&<LearningDialog seed={learningSeed} onClose={()=>setLearningSeed(null)} onSettings={()=>{setLearningSeed(null);setFocusAI(true);void openCalendar('settings');}}/>}
    {closeError && <div className="modal-backdrop"><section className="close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-title" aria-describedby="close-detail">
      <h2 id="close-title">{t("Your changes haven’t been saved")}</h2>
      <p id="close-detail">{<ErrorMessage error={closeError}/>}</p><p>{t("Keep this window open to keep your draft. Discard closes the app and loses any changes SQLite has not saved.")}</p>
      <div className="dialog-actions">
        <button autoFocus onClick={() => setCloseError(null)}>{t("Keep writing")}</button>
        <button onClick={() => void finishClose()}>{t("Retry and close")}</button>
        <button className="danger" onClick={() => { void getCurrentWindow().destroy().catch(reason => setCloseError(String(reason))); }}>{t("Discard and close")}</button>
      </div>
    </section></div>}
    {closing && <div className="closing-overlay" role="status">{t("Saving before closing…")}</div>}
  </div>;
}

export default App;
