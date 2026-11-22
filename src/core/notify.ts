import type { PrayerKey, Row } from './schedule';

/** Sunrise is shown but is not a salah, so it never notifies. */
export const NOTIFIABLE: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'qiyam'];
export const MAX_LATE_MS = 10 * 60e3;

export type NotifyPrefs = Record<PrayerKey, boolean>;

export const DEFAULT_PREFS: NotifyPrefs = {
  fajr: true,
  sunrise: false,
  dhuhr: true,
  asr: true,
  maghrib: true,
  isha: true,
  qiyam: false, // off by default: it falls in the middle of the night
};

export const notificationId = (key: PrayerKey, time: Date) => `${key}@${time.getTime()}`;

export interface Due {
  key: PrayerKey;
  time: Date;
  id: string;
}

/**
 * The most recent enabled salah whose time has arrived, was missed by at most 10 minutes, and has not been shown.
 * Older ones are dropped.
 */
export function findDue(now: Date, rows: Row[], prefs: NotifyPrefs, sent: string[], maxLateMs = MAX_LATE_MS): Due | null {
  let best: Due | null = null;
  for (const r of rows) {
    if (!r.time || !NOTIFIABLE.includes(r.key) || !prefs[r.key]) continue;
    const late = now.getTime() - r.time.getTime();
    if (late < 0 || late > maxLateMs) continue;
    const id = notificationId(r.key, r.time);
    if (sent.includes(id)) continue;
    if (!best || r.time > best.time) best = { key: r.key, time: r.time, id };
  }
  return best;
}

/** Time of the next enabled notification after `now`, considering the given candidate rows. */
export function nextNotifyTime(now: Date, rows: Row[], prefs: NotifyPrefs, extra: Date | null = null): Date | null {
  let best: Date | null = null;
  for (const r of rows) {
    if (!r.time || !NOTIFIABLE.includes(r.key) || !prefs[r.key] || r.time <= now) continue;
    if (!best || r.time < best) best = r.time;
  }
  if (extra && extra > now && prefs.fajr && (!best || extra < best)) best = extra;
  return best;
}
