import {getLanguage, locale, type Language} from './i18n.ts';
import type { JSONContent } from '@tiptap/react';

export interface Draft {
  dateKey: string;
  language: Language;
  title: string | null;
  document: JSONContent;
  plainText: string;
  tags: string[];
  writingSeconds: number;
}
export interface Note extends Draft {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export type NoteSummary = Pick<Note, 'id' | 'dateKey' | 'title' | 'tags'>;

export function tagColor(tag: string): number {
  return [...tag].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
}
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function blankNote(dateKey: string, language: Language = getLanguage()): Draft {
  return { dateKey, language, title: null, document: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: '', tags: [], writingSeconds: 0 };
}
export function defaultTitle(dateKey: string): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${dateKey}T12:00:00`));
}
export function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
export function uniqueWordCount(text: string): number {
  return new Set((text.normalize('NFC').toLowerCase().match(/[\p{L}]+(?:[’'\-][\p{L}]+)*/gu) ?? [])).size;
}
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/u).map(tag => tag.replace(/^#+/, '')).filter(Boolean))];
}
