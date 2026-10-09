export interface RecordingClockSnapshot { elapsed: number; paused: boolean; }

export class RecordingClock {
  private readonly startedAt: number;
  private pauseStartedAt: number | null = null;
  private pausedTime = 0;

  constructor(private readonly now: () => number, private readonly millisecondsPerSecond: number) { this.startedAt = now(); }
  get paused(): boolean { return this.pauseStartedAt !== null; }
  get elapsed(): number { return this.at(this.now()); }
  at(timestamp: number): number {
    const activeTime = (this.pauseStartedAt ?? timestamp) - this.startedAt - this.pausedTime;
    return Math.max(0, activeTime / this.millisecondsPerSecond);
  }
  pause(): void { if (this.pauseStartedAt === null) this.pauseStartedAt = this.now(); }
  resume(): void {
    if (this.pauseStartedAt === null) return;
    this.pausedTime += this.now() - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }
  snapshot(): RecordingClockSnapshot { return { elapsed: this.elapsed, paused: this.paused }; }
}
