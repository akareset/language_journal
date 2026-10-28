import {locale} from './i18n.ts';
﻿import { shiftDate } from './calendar.ts';
export interface VocabularyWord { id: number; lemma: string; pos: string; count: number; noteCount: number; firstSeen: string; lastSeen: string; forms: {form: string; morph: string; count: number}[] }
export interface JournalStats {
  notes: {dateKey: string; wordCount: number; uniqueWords: number; writingSeconds: number; analyzed: boolean; newLemmas: number}[];
  totalLemmas: number; totalOccurrences: number; posCounts: Record<string, number>;
  topWords: VocabularyWord[]; recentWords: VocabularyWord[]; categoryWords: Record<string,VocabularyWord[]>;
  growth: {dateKey: string; newLemmas: number}[]; pendingNotes: number;
  analysis: {running: boolean; error: string | null};
}
export function streak(stats: Pick<JournalStats, 'notes'>, today: string): number {
  const days = new Set(stats.notes.filter(n => n.wordCount > 0 && n.dateKey <= today).map(n => n.dateKey));
  let day = days.has(today) ? today : shiftDate(today, -1), count = 0;
  while (days.has(day)) { count++; day = shiftDate(day, -1); }
  return count;
}
export function averages(stats: JournalStats, today: string) {
  const notes = stats.notes.filter(n => n.wordCount > 0 && n.dateKey <= today);
  const first = notes.map(n => n.dateKey).sort()[0];
  const days = first ? Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) / 86400000) + 1 : 0;
  const words = notes.reduce((n, note) => n + note.uniqueWords, 0);
  return { perDay: days ? words / days : 0, perNote: notes.length ? words / notes.length : 0, days: notes.length };
}
export function growthPoints(growth: JournalStats['growth'], period: string, yearly: boolean) {
  const start = yearly ? `${period}-01-01` : `${period}-01`;
  const size = yearly ? 12 : new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate();
  let total = growth.filter(g => g.dateKey < start).reduce((n, g) => n + g.newLemmas, 0);
  return Array.from({length: size}, (_, i) => {
    const key = yearly ? `${period}-${String(i + 1).padStart(2, '0')}` : `${period}-${String(i + 1).padStart(2, '0')}`;
    const added = growth.filter(g => yearly ? g.dateKey.startsWith(key) : g.dateKey === key).reduce((n, g) => n + g.newLemmas, 0);
    total += added;
    return {key, total, added, label: yearly ? new Date(2024, i, 1).toLocaleDateString(locale(), {month: 'short'}) : String(i + 1)};
  });
}
