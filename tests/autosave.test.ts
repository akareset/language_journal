import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Autosave } from '../src/autosave.ts';
import { blankNote, defaultTitle, localDateKey, parseTags, wordCount } from '../src/note.ts';

const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('custom titles autosave independently of the date and document', async () => {
  const dateKey = '2026-09-16';
  const initial = blankNote(dateKey);
  assert.equal(initial.title, null);
  assert.equal(defaultTitle(dateKey), 'Mittwoch, 16. September');
  const saved: typeof initial[] = [];
  const queue = new Autosave(initial, async draft => { saved.push(draft); });
  queue.update({ ...initial, title: 'Mein erster Tag an der Universität' });
  await queue.flush();
  assert.equal(saved[0].title, 'Mein erster Tag an der Universität');
  assert.equal(saved[0].dateKey, dateKey);
  assert.deepEqual(saved[0].document, initial.document);
  assert.equal(saved[0].plainText, '');
  queue.update({ ...queue.getSnapshot().draft, title: null });
  await queue.flush();
  assert.equal(saved[1].title, null);
  assert.equal(saved[1].dateKey, dateKey);
  queue.dispose();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('loading a blank or saved note does not cause a write', async () => {
  let writes = 0;
  for (const text of ['', 'Bereits gespeichert']) {
    const queue = new Autosave({ ...blankNote('2026-09-16'), plainText: text }, async () => { writes++; });
    await queue.flush(); queue.dispose();
  }
  assert.equal(writes, 0);
});

test('debounces for 700 ms and saves the latest text and tags', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved: string[] = [];
  const queue = new Autosave(blankNote('2026-09-16'), async draft => { saved.push(`${draft.plainText}:${draft.tags.join(',')}`); });
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Erster' });
  t.mock.timers.tick(699); assert.equal(saved.length, 0);
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Grüße aus Köln', tags: ['daily'] });
  t.mock.timers.tick(699); assert.equal(saved.length, 0);
  t.mock.timers.tick(1); await tick();
  assert.deepEqual(saved, ['Grüße aus Köln:daily']);
  assert.equal(queue.getSnapshot().status, 'Saved');
  queue.dispose();
});

test('serializes overlapping edits; old completion never marks new edits Saved', async () => {
  const first = deferred(); const second = deferred();
  const writes: string[] = []; const savedSnapshots: string[] = [];
  const queue = new Autosave(blankNote('2026-09-16'), draft => {
    writes.push(draft.plainText); return writes.length === 1 ? first.promise : second.promise;
  });
  queue.subscribe(() => { if (queue.getSnapshot().status === 'Saved') savedSnapshots.push(queue.getSnapshot().draft.plainText); });
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Alt' });
  const pending = queue.flush();
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Zwischenstand' });
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Neu' });
  assert.equal(queue.flush(), pending);
  assert.deepEqual(writes, ['Alt']);
  first.resolve(); await tick();
  assert.deepEqual(writes, ['Alt', 'Neu']); assert.deepEqual(savedSnapshots, []);
  second.resolve(); await pending;
  assert.deepEqual(savedSnapshots, ['Neu']); assert.equal(queue.hasChanges, false);
  queue.dispose();
});

test('immediate close flush bypasses debounce and awaits persistence', async () => {
  const database = deferred(); let closed = false;
  const queue = new Autosave(blankNote('2026-09-16'), () => database.promise);
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Sofort schließen' });
  const close = queue.flush().then(() => { closed = true; });
  await tick(); assert.equal(closed, false);
  database.resolve(); await close; assert.equal(closed, true); queue.dispose();
});

test('failure rejects close, retains latest draft, and can be retried', async () => {
  let failing = true; let closed = false;
  const queue = new Autosave(blankNote('2026-09-16'), async () => { if (failing) throw new Error('D: is unavailable'); });
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Nicht verlieren', tags: ['wichtig'] });
  await assert.rejects(queue.flush().then(() => { closed = true; }), /D: is unavailable/);
  assert.equal(closed, false); assert.equal(queue.getSnapshot().status, 'Could not save');
  assert.equal(queue.getSnapshot().draft.plainText, 'Nicht verlieren'); assert.equal(queue.hasChanges, true);
  failing = false; await queue.flush();
  assert.equal(queue.getSnapshot().status, 'Saved'); assert.equal(queue.getSnapshot().error, null);
  queue.dispose();
});

test('dispose cancels timers and subscriptions, including late save completions', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let writes = 0; let notifications = 0;
  const queue = new Autosave(blankNote('2026-09-16'), async () => { writes++; });
  queue.update({ ...queue.getSnapshot().draft, plainText: 'Draft' });
  queue.subscribe(() => { notifications++; });
  queue.dispose(); t.mock.timers.tick(1000); await tick();
  assert.equal(writes, 0); assert.equal(notifications, 0);
  const slow = deferred(); const active = new Autosave(blankNote('2026-09-16'), () => slow.promise);
  active.update({ ...active.getSnapshot().draft, plainText: 'Writing' }); const pending = active.flush();
  active.subscribe(() => { notifications++; }); active.dispose(); slow.resolve(); await pending;
  assert.equal(notifications, 0);
});

test('date remains pinned across midnight and rejects reassignment', async () => {
  const queue = new Autosave(blankNote('2026-09-16'), async () => {});
  assert.throws(() => queue.update(blankNote('2026-09-17')), /cannot change its day/);
  assert.equal(queue.getSnapshot().draft.dateKey, '2026-09-16'); queue.dispose();
});

test('local dates use calendar components, never UTC truncation', () => {
  const local = new Date(2026, 8, 16, 0, 5);
  assert.equal(localDateKey(local), '2026-09-16');
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('German word counting and simple tags', () => {
  assert.equal(wordCount('Grüße aus Köln!\nDie Straße ist schön.'), 7);
  assert.equal(wordCount(' \n — … '), 0);
  assert.equal(wordCount('E-Mail 2026'), 2);
  assert.deepEqual(parseTags('#Universität, #daily #daily  '), ['Universität', 'daily']);
});
