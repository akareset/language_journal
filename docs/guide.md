# Language Journal

A local Windows journal built with Tauri 2, React, TypeScript, Tiptap, SQLite, and spaCy. The interface uses light lavender colors, a compact sidebar, and independently scrolling writing and calendar pages.

## Run

From PowerShell in `D:\Projects\german-notes`:

```powershell
npm.cmd run tauri dev
```

The local German/English analyzer is already installed in this workspace's environment. To set it up on another installation or repair a missing model:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-nlp.ps1
```

This reuses an existing Python 3.12 interpreter and creates `D:\Dev\deutsch-journal-nlp`; pip downloads are cached in `D:\Dev\pip-cache`. It installs spaCy 3.8.16, `de_core_news_sm` 3.8.0, and `en_core_web_sm` 3.8.0. `nlp/requirements.txt` pins these, and `nlp/requirements-lock.txt` records the installed dependency versions. The existing base Python interpreter remains on C:; the environment, model, and caches are on D:. No global settings are changed.

Use Tauri, rather than `npm.cmd run dev` alone, for SQLite, the analyzer, and safe native close handling. The Python analyzer source is embedded in the Rust executable, but the D: Python environment is an external runtime prerequisite, including for release builds. It is not bundled into an installer yet. Writing and saving still work if analysis is unavailable; the UI exposes an analysis error and retry.

## Settings and languages

Open **Einstellungen / Settings** in the sidebar. German is the default. Choosing **Deutsch** or **English** changes the interface, default date titles, date/number formatting, editor language, calendar, writing statistics, and vocabulary analysis. Preferences are autosaved in SQLite. Language switches first flush the current draft and writing time; a failed write retains the current language and exposes retry. Native close also waits for a pending settings write.

Each language has a separate daily journal: you can write a German and an English note on the same date. Existing notes are migrated to German with their IDs, titles, dates, text, formatting, tags, writing time, and timestamps intact. Switching languages never translates or relabels those notes. Lemmas, frequencies, POS counts, growth, streaks, and averages are scoped to the selected language. Identical lemma spellings in different languages have separate identities. Migration 4 rebuilds the derived vocabulary cache, which is automatically analyzed again using the correct model.

**Native spellcheck / Native Rechtschreibprüfung** controls WebView2's underlines in the editor and title. It defaults to **off**, removing the misleading spelling marks reported for German. Enabling it opts back into the system/browser checker; this is not an application-owned grammar checker and the app cannot guarantee that WebView2 has the correct dictionary. The editor always declares its note's `de` or `en` language. Spellcheck and spaCy are independent; disabling underlines does not disable vocabulary analysis.

- `src/i18n.ts`: German translations, English source messages, locales and settings store. User-authored content is never translated.
- `src/LanguageRoot.tsx`: loads persisted preferences before creating an editor. A language change starts a fresh session.
- `src/SettingsPage.tsx`: preference controls, persistence and retry states.
- `src/ErrorMessage.tsx`: translated guidance with expandable original technical diagnostics.
- `src-tauri/src/settings.rs`: validates and persists preferences.
- `src-tauri/src/migration4.sql`: uniqueness on `(date_key, language)`, language-specific lemmas, and the settings row.
- `nlp/analyze.py`: dispatches to cached German or English models. German reflexive/separable-verb handling only runs for German; English uses its own tokenization, lemmas, POS, morphology and function-word filtering.

The visible product/window name is **Language Journal**. The application identifier, internal crate name, runtime folder and `D:\GermanNotesData\notes.db` path remain stable to preserve the installation and data.

## Writing and calendar

The app restores today's note using the local calendar date. An unused day opens blank and is not saved merely by opening it. There is one stable note per date and language. A draft stays on its original date across midnight; **Go to today** opens the new day.

Click the title or pencil to rename it. An empty title falls back to the German weekday, day, and month. The separate date picker opens another day's note; renaming never changes the date. Text, formatting, title, and colored tags autosave after approximately 700 ms without editing.

Calendar lists all saved notes newest first in Monday–Sunday blocks. Cards show title, date, and tags, and open the actual editor. The independently scrolling list sits above a 365-day activity map. Calendar activity includes intentional title-only or tagged notes; the writing streak requires actual words. The current daily uniqueness rule means the map has zero or one note per day, regardless of autosave frequency.

Navigating or normally closing the window first flushes the pending edit queue. Failed saves keep the draft in memory and expose retry. Closing after a failure offers **Keep writing**, **Retry and close**, or explicit **Discard and close**. Forced process termination, power loss, and development hot reload can still lose uncommitted edits.

## What the statistics mean

- **Words:** distinct, case-insensitive surface words in the selected note, including articles and pronouns. `Der der Mann ging. Der Mann geht.` contains four distinct forms. Numbers and punctuation do not count. Inflections remain separate here.
- **New words:** meaningful unique lemmas whose earliest appearance in the current saved journal is on this note's date. `ging` and `geht` both contribute to `gehen`. The count waits for analysis and never treats an analysis failure as zero new words.
- **Writing time:** accumulated active editing time for the note. It starts with an editor change, pauses after 30 seconds without another edit, and pauses when the editor loses focus, the window loses focus, the document is hidden, navigation starts, or closing starts. Reading a note does not start it. A suspended event loop does not add a large sleep interval. Time enters the existing save queue at most every 10 seconds, on idle, and on blur/navigation/close; reopening resumes the saved total. Older notes start at zero because their historical writing time cannot be reconstructed.
- **Writing streak:** consecutive local dates with saved, nonempty words. Today's entry extends it; until today's entry is written, yesterday's streak remains available to continue. Empty, title-only, tag-only, and future notes do not increase it.
- **Vocabulary totals:** distinct meaningful lemmas across the selected language’s saved journal, with actual occurrence counts. Articles, pronouns, prepositions, conjunctions, particles, auxiliaries, and modal/function verbs are excluded. Stop-listed modifiers are excluded too. spaCy's German stop list also contains lexical forms such as `ging` and `geht`, so lexical verbs and content nouns are retained rather than blindly applying that broad list.
- **Averages:** distinct surface words per nonempty note and per calendar day since the first written note, including inactive days. Future entries are excluded from averages.

The vocabulary page shows the total lemma count, averages, writing days, ten most-used lemmas with occurrence and note counts, cumulative growth, a POS donut, and five recent lemmas. Switch between daily points within a month and monthly points within a year, and choose the period. The graph includes vocabulary learned before the selected period as its baseline; points expose dates, cumulative totals, and additions through hover/focus labels.

Growth and recent words use the note's date, not the autosave timestamp. Editing old notes or clearing words recalculates this history. Each lemma contributes once to the POS donut using its most frequent observed part of speech; proper names and interjections are grouped under Other. The UI labels pending analysis because aggregates can be incomplete while notes are being processed.

Expand a word to inspect its observed forms and morphological features. The German dependency parser identifies reflexive uses and separable particles: for example, `freue mich`, `freut sich`, and `habe mich gefreut` are grouped under **sich freuen**. First-/second-person reflexive objects also use subject agreement when the model labels them as ordinary pronouns. Ordinary objects such as `sie sieht mich` are not automatically reflexive.

spaCy is statistical: lemma, POS, dependency, and reflexive predictions can be wrong, especially with ambiguous sentences or learner errors. Manual dictionary corrections are not available. The pipeline uses the official [German model](https://spacy.io/models/de) and its [linguistic annotations](https://spacy.io/usage/linguistic-features). Vocabulary analysis stays local. Optional AI feedback sends a note to a provider only when you press Analyze.

## AI Insights

**KI-Einblicke / AI Insights** appears on the right beneath writing stats and streak, replacing the former vocabulary preview. At narrow widths it appears below the editor. Vocabulary analysis remains available on the Vocabulary page.

1. Open Settings and press **Add API / API hinzufügen**. The dialog asks only for OpenAI or Gemini and the API key.
2. Choose the active saved API in Settings, then its model: GPT-5.6 Luna, Terra, Sol, or Gemini 2.5 Flash/Pro. Models require access on your provider account; a ChatGPT subscription is not an API key or API credit.
3. Select the explanation language independently: German, English, or Ukrainian. Notes/corrections retain the existing German or English journal language. Turn optional orange naturalness suggestions on/off. The tutor prompt can be edited under the expandable advanced setting and saved with **Save prompt**.
4. Press **Analyze text** beside the editor. A missing key opens AI Settings. This flushes autosave and sends only the saved note text and tutor instructions, not other journal entries, tags, vocabulary, or previous analyses. API use can incur provider charges. Provider retention policies still apply.
5. Grammar/articles/spelling use light red, word choice purple, and naturalness orange. Word-level diffs highlight the actual edits within the contextual quote. Word-order previews show a struck-through phrase → its replacement. Meaning-dependent suggestions explain the uncertainty without accuracy scores.
6. **Accept** edits the text, retains formatting, and autosaves the note and acceptance decision atomically. **Dismiss** records the decision before hiding the card. **Ctrl+Z / editor Undo** restores the text; decisions remain an audit trail of past actions, rather than asserting that an accepted correction is still present.

Accepted, non-overlapping corrections are projected onto the original snapshot, so the remaining suggestions shift with the text and can be accepted in any order. A manual edit or Undo that no longer matches that projected text marks the feedback outdated and disables unsafe acceptance until Redo or a new analysis. Corrections cannot cross paragraphs or structural boundaries. Analysis history is available beside each note and through Insights (latest 1,000 analyses); older records remain in SQLite.

The Insights page provides weekly and monthly views. It counts the latest analysis per note so reanalyzing a draft does not inflate its error totals, while showing how many model runs occurred. It reports findings per 100 words, reviewed/open findings, acceptance rate, category mix, recurring stable rule IDs with contextual examples, a correction-density trend between parts of the period, and a suggested practice focus. These are descriptive model-feedback statistics, not measured language proficiency or model accuracy.

The app distinguishes failed requests, malformed/refused/truncated responses, partial validation, and successful responses with no findings. An unanchored or invalid individual finding is excluded with a notice; valid findings remain. Failed AI requests never change the note or masquerade as “no mistakes.” Requests time out after 90 seconds, are size-bounded, and are not automatically retried or sent on each edit. Navigation and normal close await in-flight AI writes/requests along with autosave.

### Credentials and architecture

API keys are stored through the Windows-native `keyring` backend in **Windows Credential Manager**, service `LanguageJournal.AI`, under opaque per-API IDs. They are not in SQLite, source, environment files, or Git. The OS manages their physical location; unlike notes, that may be on the Windows system drive. Keys exist transiently in the password field and Rust memory; stored keys are never returned to the webview. Rust zeroizes its secret buffers. Provider error bodies and keys are not logged, redirects are disabled, and HTTPS destinations are fixed. Removing an API removes its credential. A database backup does not include keys; re-add them on a new Windows account/device.

- `src/AISettings.tsx`, `AI.css`: Add API dialog, active API/model, explanation language, optional style feedback, editable prompt.
- `src/AIReview.tsx`: review cards, ephemeral Tiptap decorations, snapshot/history selection, Accept/Dismiss.
- `src/aiText.ts`: local word diff, UTF-16 to ProseMirror position mapping, formatting-preserving correction transactions.
- `src/ai.ts`: typed IPC plus pending-operation tracking for navigation/close.
- `src/InsightsPage.tsx`: saved analysis history navigation.
- `src-tauri/src/ai.rs`: credentials, fixed provider adapters, strict JSON schema, rule catalog, per-finding validation, snapshots and decisions.
- `src-tauri/src/ai-prompt.txt`: complete default tutor prompt. The mandatory JSON/anchoring contract is appended separately by Rust, with schema version 1.
- `src-tauri/src/migration5.sql`: AI settings, immutable analyses, and timestamped decision events. Acceptance events travel with the existing note autosave and commit in the same transaction; retrying uses the same event ID and cannot duplicate it.

The detailed plan and example JSON contract are in [the AI insights plan](ai-insights-plan.md). Provider request formats follow [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [Gemini GenerationConfig](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig).

## Architecture

- `src/App.tsx`: application shell, loaded-day session, navigation, timer checkpoints, and native close protection.
- `src/NoteEditor.tsx`, `NoteTitle.tsx`, `Tags.tsx`: writing controls; loading an editor does not emit an edit.
- `src/autosave.ts`: one serialized revision queue per session. An older completion cannot mark newer changes saved. Edits made during a write are saved next.
- `src/writingTime.ts`: activity timer, with an injectable clock for deterministic tests.
- `src/StatsPanel.tsx`: live writing statistics, actual streak, and the AI review panel.
- `src/VocabularyPage.tsx`, `src/App.css`: vocabulary cards, SVG growth chart, POS donut, forms, and responsive layout. No chart framework was added.
- `src/analytics.ts`: typed statistics plus pure streak, average, and chart calculations.
- `src/useJournalStats.ts`: refresh after saves and poll only while analysis is pending; stale responses cannot replace newer ones.
- `src/CalendarPage.tsx`, `CalendarPage.css`, `calendar.ts`: weekly previews, rolling activity map, and local date arithmetic across DST boundaries.
- `src/storage.ts`: typed Tauri commands. Components never execute SQL or access files.
- `src-tauri/src/storage.rs`: centralized database path, migrations, transactions, note validation, and surface-word metrics.
- `src-tauri/src/vocabulary.rs`: revision-checked analysis transactions and consistent aggregate snapshots.
- `src-tauri/src/nlp.rs`: background work queue and persistent hidden Python process. It analyzes outside SQLite transactions, handles process errors/timeouts, and retries on request or a later save.
- `nlp/analyze.py`: spaCy tokenization, lemmatization, POS, morphology, reflexive/separable-verb handling, and content-word filtering. JSON lines connect it to Rust; Python owns no SQL or filesystem persistence.

An edit travels through **Tiptap JSON + plain text → revision queue → debounce → typed Tauri command → Rust → atomic SQLite commit → Saved**. Time, tags, and title share that transaction. A successful save wakes the analyzer; it reads the latest text revision, runs spaCy, and atomically stores the result only if that revision is still current. Newer edits invalidate the old derived data immediately. Analysis failures never undo or misreport a successful note save.

## Data

All persistent journal data is stored at:

```text
D:\GermanNotesData\notes.db
```

The app creates the directory/database when needed and never falls back to C:. The database survives source changes and rebuilding. Close the app before copying the database for a backup.

SQLite `user_version` tracks transactional migrations:

1. Daily notes with stable ID, unique local date, editor JSON, text, tags, and timestamps.
2. Nullable editable title, independent of the date.
3. Writing seconds, surface-word metrics, body revision, `note_analysis`, unique `lemmas`, and per-note `note_lemmas` associations with counts, POS, surface forms, and morphology.
4. Persisted language/spellcheck preferences and language-specific daily notes/lemmas; existing notes become German without modifying their content.
5. AI preferences, immutable analysis snapshots and timestamped acceptance/dismissal events. API keys remain in Windows Credential Manager.

Existing notes are backfilled and analyzed by spaCy automatically, without changing their original writing content, IDs, or dates. A body edit invalidates only that note's vocabulary analysis; title, formatting, tags, and timer-only saves do not request redundant linguistic processing. Vocabulary reanalysis replaces associations rather than adding another copy. Saved AI snapshots are retained unchanged. Lemmas no longer used in any note are removed. Unsupported future schemas and database failures produce errors rather than empty success states.

Keep a single app instance open: independent windows/processes do not coordinate simultaneous edits to the same note.

## Verification

```powershell
npm.cmd test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
D:\Dev\deutsch-journal-nlp\Scripts\python.exe -B -m unittest discover -s nlp -p "test_*.py"
```

The Node tests use its built-in runner, without a testing framework. They cover autosave serialization, debounce, failure/retry, close flush, cleanup, dates, calendar arithmetic, distinct words, streak grace/gaps, cumulative growth, averages, idle time, and suspension. Rust tests cover migrations, persistence, atomic failures, daily uniqueness, stale analysis rejection, lemma merging, idempotent reanalysis, removal, and time preservation. Python tests exercise the actual German model on inflections, articles, reflexive/separable verbs, ordinary objects, empty text, and morphology.

The production frontend builds successfully. Vite can warn about the existing editor bundle size. Optional Rust fmt/clippy components are not installed in the inspected toolchain.

`tests/desktop-check.mjs` is a dependency-free WebView2 inspection helper. Its debugging flag is process-local and is not enabled for normal launches. Physical Alt+F4/title-bar close, overnight rollover, and long-term use remain useful manual acceptance checks.

Authentication, synchronization, and configurable paths remain deferred.

### Accepted corrections and learning cards

**Reset analyses** in the note’s AI panel removes all feedback snapshots and acceptance/dismissal decisions for that note and language. It keeps the current editor text and saves pending edits first. Use it after undoing corrections when you want a fresh review; then press **Analyze text**. Reset reviews no longer contribute to recurring-pattern summaries. Saved weekly/monthly reports remain their original snapshots.

Notes open with accepted AI edits in their category colors: deleted wording is crossed out and replacements are highlighted. **Show corrected version** hides review markup. The underlying editor document always contains the corrected text; decorations do not enter autosave, word counts, or vocabulary analysis. Changes later overwritten or undone are not guessed onto unrelated text; their decisions remain in analysis history.

Select text in the editor or use **Add to learning set** on a word-choice suggestion. **Generate definition** sends the word and its example to the selected AI provider and creates an editable draft. Check the definition, the dictionary form (including reflexive expressions), and the answer to hide before saving. Adding a suggested word does not accept the note correction.

**Vocabulary → My learning set** lists saved cards and offers due-card practice. The front shows the definition and a cloze example; reveal the answer, then choose Again, Hard, Good, or Easy. This is a small local spaced-repetition scheduler, not Anki synchronization or the FSRS algorithm. Initial intervals are one minute, six hours, one day, and four days respectively; later successful reviews increase intervals, capped at a year. Duplicate words within one language retain their existing card and progress.

Schema version 7 adds learning cards and review history to `D:\GermanNotesData\notes.db`. Examples remain snapshots even when the source note changes. Ratings and schedule updates commit atomically, and retrying the same review cannot count it twice. UI: `LearningDialog.tsx` and `LearningPage.tsx`; IPC: `learning.ts`; storage and scheduling: `src-tauri/src/learning.rs`; accepted-edit mapping: `aiText.ts` and `AIReview.tsx`.

### AI verification

`npm.cmd test` includes local diffs, German/Unicode anchors, ProseMirror formatting/undo, stale and cross-paragraph rejection, and autosave retry payloads. `cargo test --offline --manifest-path src-tauri/Cargo.toml` covers migrations, partial/malformed feedback, provider refusal/truncation, profile validation, and atomic/idempotent decision storage. `node scripts/check-translations.mjs` checks German UI labels.

The optional `tests/ai-desktop-check.mjs` uses an isolated Chromium browser on debug port 9223 plus Vite on 1420, with all notes, API keys, feedback and writes mocked in memory. It checks the two-field dialog, model selection, missing-key routing, colors, partial feedback, Accept/Undo/Dismiss, save retry, analysis errors, and the narrow layout. No model call or real test note is created. Start Vite using `npm.cmd run dev`, then launch Edge with `--headless=new --remote-debugging-port=9223 --user-data-dir=D:\Projects\german-notes\.ui-test-browser --no-first-run about:blank` and run `node tests/ai-desktop-check.mjs`. That temporary browser profile is ignored by Git and Vite's watcher.

Live-provider verification remains manual: add your own key, select a supported model, analyze a short German/English note, review/accept/dismiss feedback, close and reopen to check history, and repeat with the other provider if used. Automated tests never spend API credit.

### Earlier vocabulary verification

- 24 Node tests, 11 Rust tests, and 4 actual-model Python tests pass; the TypeScript/production frontend build passes.
- The Windows Tauri app analyzed the existing journal using the D: runtime and database. A temporary note confirmed 14 distinct words including articles, three new lemmas, `ging`/`geht` grouped as `gehen`, and three reflexive forms grouped as `sich freuen`.
- The live streak reflected consecutive saved dates. Month and year selectors rendered 30 daily points for September and 12 monthly points for the year. The 540×480 viewport had no horizontal page overflow.
- Writing time resumed its saved value, stopped after 30 seconds idle, and remained unchanged afterward. Typing and immediately emitting the native Tauri close-request event flushed the final text; reopening retained both text and writing seconds.
- Today's empty launch still had no database note. Temporary verification content was cleared; the vocabulary returned to its original six lemmas and only the original written date remained active. Existing journal content was preserved.
- Database/analysis failure and retry invariants are covered by automated tests. Physical title-bar close, overnight rollover, and a missing-runtime UI scenario remain manual checks for this increment.

### Earlier language/settings verification

The current increment passes **25 Node tests, 14 Rust tests, and 5 actual-model Python tests**, plus the production build and translation-key audit. Migration testing includes an existing version-3 database with foreign keys enabled, preserving original note fields and rebuilding only derived vocabulary. A simulated settings write failure leaves the previous language and spellcheck preferences intact.

The Windows app was checked in German and English, including Settings, editor, vocabulary, and Calendar. English `went/goes`, `children/child`, and `writing/wrote` grouped correctly. Immediate navigation flushed an English draft; switching back preserved the existing German note exactly. Reloading the interface reloaded English preferences from SQLite, and an empty English day created no note. The spellcheck checkbox enabled the editor checker and disabling it persisted across reload; the default is off for editor and title. Settings remained usable at 540×480 without horizontal overflow. English fixture text was cleared and German/default spellcheck preferences restored afterward.

Native dictionary accuracy when explicitly enabling WebView2 spellcheck remains system-dependent. Technical diagnostics and model-provided morphology retain their original codes; surrounding UI and error guidance are translated.

### Current AI increment checks

32 frontend tests and 20 Rust tests pass, as do the TypeScript/Vite production build, German translation audit, and seven isolated browser interaction checks. The actual Windows WebView showed the right-hand AI panel and the two-field Add API dialog with no error banner. Isolated UI tests covered both provider/model selectors, missing-key navigation, changed-word highlights, word-order previews, Ukrainian explanations, partial validation notices, Accept/Undo/Dismiss, save failure/retry, failed analysis and responsive layout. The word-order unit test also checks formatting on moved words. Browser fixtures never touched real journal content or credentials. No live provider request was made. Rustfmt/clippy are not installed; the existing Vite bundle-size warning remains.
