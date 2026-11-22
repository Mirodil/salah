import { describe, expect, it } from 'vitest';
import { createClock } from '../src/core/clock';
import { formatCountdown, formatTime, hijriDate } from '../src/core/format';

describe('clock', () => {
  it('is real time without parameters', () => {
    const c = createClock('', () => 1000);
    expect(c.overridden).toBe(false);
    expect(c.now().getTime()).toBe(1000);
  });

  it('?t starts at a fixed instant and runs at real speed', () => {
    let real = 5000;
    const c = createClock('?t=2026-06-21T12:00:00Z', () => real);
    const start = Date.parse('2026-06-21T12:00:00Z');
    expect(c.overridden).toBe(true);
    expect(c.now().getTime()).toBe(start);
    real += 2000;
    expect(c.now().getTime()).toBe(start + 2000);
  });

  it('?speed fast-forwards', () => {
    let real = 0;
    const c = createClock('?t=2026-06-21T00:00:00Z&speed=600', () => real);
    real += 1000;
    expect(c.now().getTime()).toBe(Date.parse('2026-06-21T00:00:00Z') + 600000);
  });

  it('ignores a bad ?t', () => {
    expect(createClock('?t=garbage', () => 7).overridden).toBe(false);
  });
});

describe('format', () => {
  it('countdown', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(3661000)).toBe('01:01:01');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('time in 24 h and 12 h, and a dash for a missing time', () => {
    const d = new Date(2026, 0, 1, 15, 4);
    expect(formatTime(d, false)).toMatch(/^15:04$/);
    expect(formatTime(d, true)).toMatch(/^3:04\s?PM$/i);
    expect(formatTime(null, false)).toBe('--:--');
  });

  it('hijri date is a non-empty string with a year in the 1400s', () => {
    expect(hijriDate(new Date('2026-11-21T12:00:00Z'))).toMatch(/14\d\d/);
  });
});
