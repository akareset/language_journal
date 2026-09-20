import { invoke } from '@tauri-apps/api/core';
import type { Draft, Note, NoteSummary } from './note';

export const loadDailyNote = (dateKey: string) => invoke<Note | null>('load_daily_note', { dateKey });
export const saveDailyNote = (draft: Draft) => invoke<Note>('save_daily_note', { draft });
export const listNotes = () => invoke<NoteSummary[]>('list_notes');

export const journalStats = () => invoke<import('./analytics').JournalStats>('journal_stats');
export const retryAnalysis = () => invoke<void>('retry_analysis');

export const loadSettings = () => invoke<import('./i18n').Settings>('load_settings');
export const saveSettings = (settings: import('./i18n').Settings) => invoke<void>('save_settings', {settings});
