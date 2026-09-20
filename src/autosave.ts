import type { Draft } from './note';

export type SaveStatus = 'Unsaved changes' | 'Saving…' | 'Saved' | 'Could not save';
export interface Snapshot { draft: Draft; status: SaveStatus; error: string | null }

// One controller per loaded day. React renders snapshots; this queue owns persistence.
export class Autosave {
  private revision = 0;
  private savedRevision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  private savedText: string;
  private disposed = false;
  private save: (draft: Draft) => Promise<unknown>;
  private delay: number;

  constructor(draft: Draft, save: (draft: Draft) => Promise<unknown>, delay = 700) {
    this.save = save;
    this.delay = delay;
    // Blank drafts display a separate "Ready to write" label in the UI.
    this.snapshot = { draft, status: 'Saved', error: null };
    this.savedText = draft.plainText;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  get hasChanges() { return this.revision > this.savedRevision; }
  get hasTextChanges() { return this.snapshot.draft.plainText !== this.savedText; }
  get hasEdited() { return this.revision > 0; }
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (!this.disposed) this.listeners.forEach(listener => listener());
  }
  update(draft: Draft) {
    if (this.disposed) return;
    if (draft.dateKey !== this.snapshot.draft.dateKey || draft.language !== this.snapshot.draft.language) throw new Error('A draft cannot change its day');
    this.revision++;
    this.publish({ draft, status: 'Unsaved changes' });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }
  // Used by debounce, retry, day changes, and the native close handler.
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (!this.hasChanges) return Promise.resolve();
    this.running = this.drain().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async drain() {
    try {
      while (this.hasChanges) {
        const revision = this.revision;
        const draft = this.snapshot.draft;
        this.publish({ status: 'Saving…', error: null });
        await this.save(draft);
        this.savedText = draft.plainText;
        this.savedRevision = revision;
        this.publish({ status: this.hasChanges ? 'Unsaved changes' : 'Saved' });
      }
    } catch (error) {
      clearTimeout(this.timer);
      this.publish({ status: 'Could not save', error: String(error) });
      throw error;
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
