import { describe, expect, it } from 'vitest';
import { buildSchedule, periodProgress } from '../src/core/schedule';
import { addDays, calendarDayOf, computeDay } from '../src/core/prayerTimes';

// TZ is UTC for tests; London in March is close to solar time.
const inp = { lat: 51.5074, lng: -0.1278, elevation: 0, methodId: 'mwl', asr: 'standard' as const };
const date = (s: string) => new Date(s);
const today = computeDay({ year: 2026, month: 3, day: 20 }, inp, 0);
const yesterday = computeDay({ year: 2026, month: 3, day: 19 }, inp, 0);
const ms = (d: Date | null) => d!.getTime();

describe('schedule', () => {
  it('lists the seven rows in order with Qiyam last', () => {
    const s = buildSchedule(date('2026-03-20T12:00:00Z'), inp);
    expect(s.rows.map((r) => r.key)).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'qiyam']);
  });

  it('midday: current is Dhuhr, next is Asr', () => {
    const s = buildSchedule(new Date(ms(today.dhuhr) + 60e3), inp);
    expect(s.currentKey).toBe('dhuhr');
    expect(s.next?.key).toBe('asr');
    expect(s.next?.time.getTime()).toBe(ms(today.asr));
  });

  it('after Isha the next salah is tomorrow\'s Fajr', () => {
    const s = buildSchedule(new Date(ms(today.isha) + 60e3), inp);
    const tomorrow = computeDay(addDays(calendarDayOf(date('2026-03-20T12:00:00Z')), 1), inp, 0);
    expect(s.currentKey).toBe('isha');
    expect(s.next?.key).toBe('fajr');
    expect(s.next?.time.getTime()).toBe(ms(tomorrow.fajr));
  });

  it('after Fajr the Qiyam row is tonight\'s; before Fajr it is last night\'s', () => {
    const afterFajr = buildSchedule(new Date(ms(today.fajr) + 60e3), inp);
    const beforeFajr = buildSchedule(new Date(ms(today.fajr) - 60e3), inp);
    expect(afterFajr.rows.at(-1)!.time!.getTime()).toBe(ms(today.qiyam));
    expect(beforeFajr.rows.at(-1)!.time!.getTime()).toBe(ms(yesterday.qiyam));
  });

  it('Qiyam becomes the highlighted period once it starts, until Fajr', () => {
    const q = buildSchedule(new Date(ms(yesterday.qiyam) + 60e3), inp);
    expect(q.currentKey).toBe('qiyam');
    expect(q.next?.key).toBe('fajr');
    const beforeQiyam = buildSchedule(new Date(ms(yesterday.qiyam) - 60e3), inp);
    expect(beforeQiyam.currentKey).toBe('isha');
  });

  it('sunrise is never the next salah', () => {
    const s = buildSchedule(new Date(ms(today.fajr) + 60e3), inp);
    expect(s.currentKey).toBe('fajr');
    expect(s.next?.key).toBe('dhuhr');
  });

  it('progress is between 0 and 1 and grows', () => {
    const t1 = new Date(ms(today.dhuhr) + 10 * 60e3);
    const t2 = new Date(ms(today.dhuhr) + 100 * 60e3);
    const p1 = periodProgress(buildSchedule(t1, inp), t1);
    const p2 = periodProgress(buildSchedule(t2, inp), t2);
    expect(p1).toBeGreaterThan(0);
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeLessThan(1);
  });
});
