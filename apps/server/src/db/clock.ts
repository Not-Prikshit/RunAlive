// apps/server/src/db/clock.ts
// Clock interface for injectable time — allows tests to advance time.

export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}

export class TestClock implements Clock {
  private _now: Date;

  constructor(initial?: Date) {
    this._now = initial ?? new Date('2025-01-01T00:00:00.000Z');
  }

  now(): Date {
    return new Date(this._now);
  }

  nowMs(): number {
    return this._now.getTime();
  }

  advance(ms: number): void {
    this._now = new Date(this._now.getTime() + ms);
  }

  set(date: Date): void {
    this._now = new Date(date);
  }
}

// Default export for production use
export const realClock: Clock = new RealClock();
