import {locale} from './i18n.ts';
import { localDateKey } from './note.ts';
import type { NoteSummary } from './note.ts';

export function calendarDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

// Calendar arithmetic, rather than 24-hour millisecond increments, preserves
// local days across DST boundaries.
export function shiftDate(dateKey: string, days: number): string {
  const date = calendarDate(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function mondayOf(dateKey: string): string {
  return shiftDate(dateKey, -((calendarDate(dateKey).getDay() + 6) % 7));
}

export interface NoteWeek { start: string; end: string; notes: NoteSummary[] }
export function availableTags(notes: NoteSummary[]): string[] {
  const tags = new Map<string, string>();
  for (const note of notes) for (const tag of note.tags) {
    const key = tag.toLocaleLowerCase();
    if (!tags.has(key)) tags.set(key, tag);
  }
  return [...tags.values()].sort((a, b) => a.localeCompare(b));
}
export function notesWithTag(notes: NoteSummary[], tag: string | null): NoteSummary[] {
  if (tag === null) return notes;
  const wanted = tag.toLocaleLowerCase();
  return notes.filter(note => note.tags.some(value => value.toLocaleLowerCase() === wanted));
}
export function groupNotesByWeek(notes: NoteSummary[]): NoteWeek[] {
  const weeks = new Map<string, NoteWeek>();
  const sorted = [...notes].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.id.localeCompare(b.id));
  for (const note of sorted) {
    const start = mondayOf(note.dateKey);
    const week = weeks.get(start) ?? { start, end: shiftDate(start, 6), notes: [] };
    week.notes.push(note);
    weeks.set(start, week);
  }
  return [...weeks.values()];
}

export interface ActivityDay { dateKey: string; count: number; level: number }
export function activityLevel(count: number): number { return Math.min(4, Math.max(0, count)); }

export function buildActivity(notes: NoteSummary[], today: string) {
  const start = shiftDate(today, -364);
  const counts = new Map<string, number>();
  for (const note of notes) {
    counts.set(note.dateKey, (counts.get(note.dateKey) ?? 0) + 1);
  }
  const days: ActivityDay[] = Array.from({ length: 365 }, (_, index) => {
    const dateKey = shiftDate(start, index);
    const count = counts.get(dateKey) ?? 0;
    return { dateKey, count, level: activityLevel(count) };
  });
  const leading = (calendarDate(start).getDay() + 6) % 7;
  const cells: (ActivityDay | null)[] = Array(leading).fill(null);
  cells.push(...days);
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const months: { column: number; label: string }[] = [];
  days.forEach((day, index) => {
    const date = calendarDate(day.dateKey);
    if (index !== 0 && date.getDate() !== 1) return;
    const column = Math.floor((index + leading) / 7);
    // Avoid overlapping labels when the range starts at the end of a month.
    if (months.length && column - months[months.length - 1].column < 3) months.pop();
    months.push({ column, label: new Intl.DateTimeFormat(locale(), { month: 'short' }).format(date) });
  });
  return {
    start, end: today, days, weeks, months,
    noteCount: days.reduce((total, day) => total + day.count, 0),
    activeDays: days.filter(day => day.count > 0).length,
    maxLevel: Math.max(1, ...days.map(day => day.level)),
  };
}
