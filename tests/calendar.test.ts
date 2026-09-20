import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivity, groupNotesByWeek, mondayOf, shiftDate } from '../src/calendar.ts';
import type { NoteSummary } from '../src/note.ts';

function note(dateKey: string, id = dateKey): NoteSummary {
  return { id, dateKey, title: null, tags: ['daily'] };
}

test('notes sort newest first in Monday–Sunday blocks without mutating input', () => {
  const notes = [note('2026-09-13'), note('2026-09-17'), note('2026-09-14'), note('2026-08-30')];
  const before = [...notes];
  const weeks = groupNotesByWeek(notes);
  assert.deepEqual(weeks.map(week => [week.start, week.end]), [
    ['2026-09-14', '2026-09-20'], ['2026-09-07', '2026-09-13'], ['2026-08-24', '2026-08-30'],
  ]);
  assert.deepEqual(weeks[0].notes.map(note => note.dateKey), ['2026-09-17', '2026-09-14']);
  assert.deepEqual(notes, before);
});

test('a week crossing New Year remains one block', () => {
  const weeks = groupNotesByWeek([note('2025-12-31'), note('2026-01-04'), note('2026-01-05')]);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[1].start, '2025-12-29');
  assert.equal(weeks[1].end, '2026-01-04');
  assert.equal(weeks[1].notes.length, 2);
});

test('365-day activity includes today and start, excluding older and future notes', () => {
  const activity = buildActivity([
    note('2025-09-17'), note('2025-09-18'), note('2026-09-17'), note('2026-09-18'),
  ], '2026-09-17');
  assert.equal(activity.start, '2025-09-18');
  assert.equal(activity.days.length, 365);
  assert.equal(new Set(activity.days.map(day => day.dateKey)).size, 365);
  assert.equal(activity.days[0].count, 1);
  assert.equal(activity.days.at(-1)?.dateKey, '2026-09-17');
  assert.equal(activity.days.at(-1)?.count, 1);
  assert.equal(activity.noteCount, 2);
  assert.equal(activity.activeDays, 2);
  assert.equal(activity.weeks.flat().filter(Boolean).length, 365);
  assert.ok(activity.weeks.every(week => week.length === 7));
});

test('empty calendar has no week blocks and 365 gray days', () => {
  assert.deepEqual(groupNotesByWeek([]), []);
  const activity = buildActivity([], '2026-09-17');
  assert.ok(activity.days.every(day => day.level === 0 && day.count === 0));
  assert.equal(activity.activeDays, 0);
  assert.equal(activity.noteCount, 0);
});

test('heatmap colors use note count, not title, word count, or save count', () => {
  const notes = [note('2026-09-17', 'a'), note('2026-09-17', 'b'), note('2026-09-16')];
  const activity = buildActivity(notes, '2026-09-17');
  assert.equal(activity.days.at(-1)?.level, 2);
  assert.equal(activity.days.at(-2)?.level, 1);
  assert.equal(activity.noteCount, 3);
  assert.equal(activity.activeDays, 2);
});

test('calendar arithmetic survives Berlin DST transitions and leap day', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    assert.equal(shiftDate('2026-03-28', 2), '2026-03-30');
    assert.equal(shiftDate('2026-10-24', 2), '2026-10-26');
    assert.equal(mondayOf('2026-03-29'), '2026-03-23');
    assert.equal(mondayOf('2026-10-25'), '2026-10-19');
    const year = buildActivity([], '2026-10-31');
    assert.equal(new Set(year.days.map(day => day.dateKey)).size, 365);
    const leap = buildActivity([], '2024-03-01');
    assert.equal(leap.start, '2023-03-03');
    assert.ok(leap.days.some(day => day.dateKey === '2024-02-29'));
    assert.equal(leap.days.length, 365);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('heatmap places each day in the correct Monday-first row', () => {
  const activity = buildActivity([], '2026-09-17');
  for (const week of activity.weeks) {
    week.forEach((day, row) => {
      if (day) assert.equal((new Date(`${day.dateKey}T12:00:00`).getDay() + 6) % 7, row);
    });
  }
  assert.ok(activity.months.every(month => month.column >= 0 && month.column < activity.weeks.length));
});
