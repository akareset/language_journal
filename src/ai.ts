import { invoke } from '@tauri-apps/api/core';
import type { JSONContent } from '@tiptap/react';
import type { Language } from './i18n';

export interface AIProfile { id: string; name: string; provider: 'openai' | 'gemini'; model: string }
export interface AIConfig { profiles: AIProfile[]; selectedProfile: string | null; explanationLanguage: 'de' | 'en' | 'uk'; naturalness: boolean; prompt: string; deepPrompt: string }
export interface AIPreferences { config: AIConfig; configuredKeys: string[]; defaultPrompt: string; defaultDeepPrompt: string; rules: string[] }
export interface Finding { id: string; ruleId: string; category: 'grammar' | 'word_order' | 'word_choice' | 'naturalness'; quote: string; replacement: string; occurrence: number; explanation: string; meaningNote: string; start: number; end: number }
export interface Decision { id: string; analysisId: string; findingId: string; action: 'accepted' | 'dismissed' }
export interface ExcludedFinding { index: number; reason: string; feedback: unknown }
export interface Analysis { id: string; noteId: string; dateKey: string; language: Language; document: JSONContent; plainText: string; profile: AIProfile; explanationLanguage: string; prompt: string; naturalness: boolean; schemaVersion: number; findings: Finding[]; excluded: number; excludedFeedback?: ExcludedFinding[]; createdAt: string; decisions: Decision[] }
export interface PeriodPattern { title: string; explanation: string; evidence: string; nextStep: string }
export interface PeriodTopic { topic: string; reason: string; practice: string }
export interface PeriodInsight { id: string; language: Language; startDate: string; endDate: string; profile: AIProfile; explanationLanguage: string; overview: string; patterns: PeriodPattern[]; topics: PeriodTopic[]; createdAt: string; prompt?: string }

// Native close and navigation await these operations as well as note autosave.
const pending = new Set<Promise<unknown>>();
export function track<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise);
  void promise.then(() => pending.delete(promise), () => pending.delete(promise));
  return promise;
}
export async function flushAI() { while (pending.size) await Promise.all([...pending]); }
export const aiPreferences = () => invoke<AIPreferences>('ai_preferences');
export const saveAIConfig = (config: AIConfig) => track(invoke<void>('ai_save_preferences', { config }));
export const setAIKey = (profileId: string, key: string) => track(invoke<void>('ai_set_key', { profileId, key }));
export const addAPI = (provider: 'openai' | 'gemini', key: string) => track(invoke<void>('ai_add_api', { provider, key }));
export const analyzeNote = (dateKey: string, language: Language, expectedText: string) => track(invoke<Analysis>('ai_analyze', { dateKey, language, expectedText }));
export const dismissFinding = (decision: Decision) => track(invoke<void>('ai_dismiss', { decision }));
export const aiHistory = (language: Language, dateKey: string | null = null) => invoke<Analysis[]>('ai_history', { dateKey, language });
export const analyzePeriod = (startDate: string, endDate: string, language: Language) => track(invoke<PeriodInsight>('ai_period_insight', { startDate, endDate, language }));
export const periodInsightHistory = (startDate: string, endDate: string, language: Language) => invoke<PeriodInsight[]>('ai_period_insight_history', { startDate, endDate, language });
