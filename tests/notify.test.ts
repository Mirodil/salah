import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, findDue, nextNotifyTime, notificationId } from '../src/core/notify';
import type { Row } from '../src/core/schedule';
import { NotificationScheduler, type SchedulerContext } from '../src/services/notifications';

const at = (hhmm: string) => new Date(`2026-03-20T${hhmm}:00Z`);
const rows: Row[] = [
  { key: 'fajr', time: at('05:00') },
  { key: 'sunrise', time: at('06:20') },
  { key: 'dhuhr', time: at('12:10') },
  { key: 'asr', time: at('15:30') },
  { key: 'maghrib', time: at('18:05') },
  { key: 'isha', time: at('19:30') },
  { key: 'qiyam', time: at('23:50') },
];

describe('findDue', () => {
  it('fires at the salah time', () => {
    expect(findDue(at('12:10'), rows, DEFAULT_PREFS, [])?.key).toBe('dhuhr');
  });

  it('not before the time', () => {
    expect(findDue(new Date(at('12:10').getTime() - 1000), rows, DEFAULT_PREFS, [])).toBeNull();
  });

  it('catches up a miss of less than 10 minutes, drops older ones', () => {
    expect(findDue(at('12:19'), rows, DEFAULT_PREFS, [])?.key).toBe('dhuhr');
    expect(findDue(at('12:21'), rows, DEFAULT_PREFS, [])).toBeNull();
  });

  it('never notifies twice for the same salah', () => {
    const id = notificationId('dhuhr', at('12:10'));
    expect(findDue(at('12:12'), rows, DEFAULT_PREFS, [id])).toBeNull();
  });

  it('never notifies for sunrise, even if enabled', () => {
    expect(findDue(at('06:20'), rows, { ...DEFAULT_PREFS, sunrise: true }, [])).toBeNull();
  });

  it('respects per-salah toggles; Qiyam is off by default', () => {
    expect(findDue(at('15:30'), rows, { ...DEFAULT_PREFS, asr: false }, [])).toBeNull();
    expect(findDue(at('23:50'), rows, DEFAULT_PREFS, [])).toBeNull();
    expect(findDue(at('23:50'), rows, { ...DEFAULT_PREFS, qiyam: true }, [])?.key).toBe('qiyam');
  });

  it('skips missing times (polar days)', () => {
    expect(findDue(at('12:10'), [{ key: 'dhuhr', time: null }], DEFAULT_PREFS, [])).toBeNull();
  });

  it('a salah time stored as a new id on the next day is not blocked by yesterday\'s', () => {
    const yesterday = notificationId('dhuhr', new Date(at('12:10').getTime() - 86400000));
    expect(findDue(at('12:10'), rows, DEFAULT_PREFS, [yesterday])?.key).toBe('dhuhr');
  });
});

describe('nextNotifyTime', () => {
  it('is the next enabled time', () => {
    expect(nextNotifyTime(at('12:11'), rows, DEFAULT_PREFS)).toEqual(at('15:30'));
  });
  it('skips sunrise and disabled salah', () => {
    expect(nextNotifyTime(at('05:30'), rows, { ...DEFAULT_PREFS, dhuhr: false })).toEqual(at('15:30'));
  });
  it('uses tomorrow\'s Fajr after the last one today', () => {
    const tomorrowFajr = new Date(at('05:00').getTime() + 86400000);
    expect(nextNotifyTime(at('23:55'), rows, DEFAULT_PREFS, tomorrowFajr)).toEqual(tomorrowFajr);
  });
});

describe('NotificationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(overrides: Partial<SchedulerContext> = {}) {
    const sent: string[] = [];
    const shown: string[] = [];
    let now = at('12:09');
    const ctx = () => ({
      now,
      rows,
      nextFajr: null,
      prefs: DEFAULT_PREFS,
      enabled: true,
      hour12: false,
      sent,
      ...overrides,
    });
    const s = new NotificationScheduler(ctx, (id) => sent.push(id), async (key) => void shown.push(key));
    return { s, shown, sent, setNow: (d: Date) => (now = d) };
  }

  it('notifies once when its time arrives, via the armed timer', () => {
    const { s, shown, setNow } = setup();
    s.start();
    expect(shown).toEqual([]);
    setNow(at('12:10'));
    vi.advanceTimersByTime(61_000);
    expect(shown).toEqual(['dhuhr']);
    vi.advanceTimersByTime(5 * 60_000);
    expect(shown).toEqual(['dhuhr']);
    s.stop();
  });

  it('does nothing when notifications are off or permission is denied', () => {
    const off = setup({ enabled: false, now: at('12:10') });
    off.s.start();
    expect(off.shown).toEqual([]);
    off.s.stop();
    vi.stubGlobal('Notification', { permission: 'denied' });
    const denied = setup({ now: at('12:10') });
    denied.s.start();
    expect(denied.shown).toEqual([]);
    denied.s.stop();
  });
});
