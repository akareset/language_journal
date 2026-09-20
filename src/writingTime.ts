// Count active editing only; a suspended event loop never adds an unbounded gap.
export class WritingTimer {
  private milliseconds: number;
  private last = 0;
  private deadline = 0;
  private active = false;
  private clock: () => number;
  constructor(seconds = 0, clock = () => performance.now()) { this.milliseconds = seconds * 1000; this.clock = clock; }
  get running() { return this.active; }
  get seconds() { return Math.floor(this.milliseconds / 1000); }
  tick() {
    const now = this.clock();
    if (this.active) {
      if (now - this.last <= 5000) this.milliseconds += Math.max(0, Math.min(now, this.deadline) - this.last);
      else this.active = false;
      if (now >= this.deadline) this.active = false;
    }
    this.last = now;
    return this.seconds;
  }
  activity() { this.tick(); this.active = true; this.deadline = this.clock() + 30000; }
  pause() { this.tick(); this.active = false; }
}
