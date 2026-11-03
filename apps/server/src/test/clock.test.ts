// apps/server/src/test/clock.test.ts
// Unit tests for Clock interface (RealClock and TestClock)

import { describe, it, expect } from 'vitest';
import { RealClock, TestClock } from '../db/clock.js';

describe('RealClock', () => {
  it('returns current time within reasonable threshold', () => {
    const clock = new RealClock();
    const before = Date.now();
    const now = clock.now();
    const nowMs = clock.nowMs();
    const after = Date.now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
    expect(nowMs).toBeGreaterThanOrEqual(before);
    expect(nowMs).toBeLessThanOrEqual(after);
  });
});

describe('TestClock', () => {
  it('initializes to default date when not provided', () => {
    const clock = new TestClock();
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(clock.nowMs()).toBe(new Date('2025-01-01T00:00:00.000Z').getTime());
  });

  it('initializes to custom date when provided', () => {
    const initial = new Date('2026-06-15T12:00:00.000Z');
    const clock = new TestClock(initial);
    expect(clock.now().toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });

  it('advances time deterministically with advance(ms)', () => {
    const clock = new TestClock(new Date('2025-01-01T00:00:00.000Z'));
    clock.advance(5000); // 5 seconds
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:05.000Z');
    expect(clock.nowMs()).toBe(new Date('2025-01-01T00:00:05.000Z').getTime());

    clock.advance(60000); // 1 minute
    expect(clock.now().toISOString()).toBe('2025-01-01T00:01:05.000Z');
  });

  it('allows jumping to specific timestamp with set(date)', () => {
    const clock = new TestClock();
    const target = new Date('2030-12-31T23:59:59.999Z');
    clock.set(target);
    expect(clock.now().toISOString()).toBe('2030-12-31T23:59:59.999Z');
    expect(clock.nowMs()).toBe(target.getTime());
  });
});
