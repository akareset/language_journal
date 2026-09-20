import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WritingTimer } from '../src/writingTime.ts';
import { streak, growthPoints, averages, type JournalStats } from '../src/analytics.ts';
import { uniqueWordCount } from '../src/note.ts';
const note = (dateKey: string, wordCount = 1) => ({dateKey, wordCount, uniqueWords: wordCount, writingSeconds: 0, analyzed: true, newLemmas: 0});
test('Words count distinct forms and include articles, without conflating inflections', () => {
  assert.equal(uniqueWordCount('Der der Mann ging. Der Mann geht!'), 4);
  assert.equal(uniqueWordCount('Grüße Grüße Straße Straße 123'), 2);
});
test('streak has yesterday grace, ignores empty and future notes, crosses years', () => {
  assert.equal(streak({notes: [note('2025-12-30'), note('2025-12-31'), note('2026-01-01', 0), note('2026-01-02')]}, '2026-01-01'), 2);
  assert.equal(streak({notes: [note('2025-12-30')]}, '2026-01-01'), 0);
  assert.equal(streak({notes: [note('2026-03-28'), note('2026-03-29'), note('2026-03-30')]}, '2026-03-30'), 3);
});
test('growth retains baseline, groups month/year and includes leap day', () => {
  const data = [{dateKey: '2023-12-31', newLemmas: 5}, {dateKey: '2024-02-29', newLemmas: 2}];
  const days = growthPoints(data, '2024-02', false);
  assert.equal(days.length, 29); assert.equal(days[0].total, 5); assert.equal(days[28].total, 7);
  assert.equal(growthPoints(data, '2024', true)[1].added, 2);
});
test('average per day includes inactive days but per note does not', () => {
  const stats = {notes: [note('2026-09-01', 10), note('2026-09-03', 20), note('2026-09-02', 0)]} as JournalStats;
  assert.deepEqual(averages(stats, '2026-09-03'), {perDay: 10, perNote: 15, days: 2});
});
test('timer starts only after editing, pauses after 30 seconds, persists initial time', () => {
  let now = 0; const timer = new WritingTimer(12, () => now);
  now = 10000; timer.tick(); assert.equal(timer.seconds, 12);
  timer.activity();
  for (let i = 0; i < 40; i++) { now += 1000; timer.tick(); }
  assert.equal(timer.seconds, 42);
  timer.activity(); now += 2000; timer.pause(); now += 1000; timer.tick(); assert.equal(timer.seconds, 44);
});
test('suspension never counts a large event-loop gap', () => {
  let now = 0; const timer = new WritingTimer(0, () => now);
  timer.activity(); now += 1000; timer.tick(); now += 3600000; timer.tick(); assert.equal(timer.seconds, 1);
  timer.activity(); now += 1000; timer.pause(); assert.equal(timer.seconds, 2);
});

test('timer metadata does not mark vocabulary text stale and closes through autosave', async () => {
  const { Autosave } = await import('../src/autosave.ts');
  const { blankNote } = await import('../src/note.ts');
  let now = 0;
  const timer = new WritingTimer(0, () => now);
  const saved: number[] = [];
  const queue = new Autosave({...blankNote('2026-09-19'), plainText: 'Hallo'}, async d => { saved.push(d.writingSeconds); });
  timer.activity(); now = 2300; timer.pause();
  queue.update({...queue.getSnapshot().draft, writingSeconds: timer.seconds});
  assert.equal(queue.hasChanges, true); assert.equal(queue.hasTextChanges, false);
  await queue.flush(); assert.deepEqual(saved, [2]);
  queue.update({...queue.getSnapshot().draft, plainText: 'Hallo Welt'});
  assert.equal(queue.hasTextChanges, true); await queue.flush(); assert.equal(queue.hasTextChanges, false);
  queue.dispose();
});
