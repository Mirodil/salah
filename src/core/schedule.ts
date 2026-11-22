import {
  addDays,
  calendarDayOf,
  computeDay,
  type CalendarDay,
  type DayTimes,
  type PrayerInputs,
} from './prayerTimes';

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'qiyam';

/** The five obligatory salah; sunrise and qiyam are listed but are not among them. */
export const FIVE: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const ROW_ORDER: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'qiyam'];

export const PRAYER_LABEL: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
  qiyam: 'Qiyam',
};

export interface Row {
  key: PrayerKey;
  time: Date | null;
}

export interface ScheduleState {
  /** Rows for display. Qiyam is that of the current night (see rules in the spec). */
  rows: Row[];
  /** The row whose period we are in now. */
  currentKey: PrayerKey;
  /** Next of the five salah, with its time (tomorrow's Fajr after Isha). */
  next: { key: PrayerKey; time: Date } | null;
  /** Start of the current period and the start of the next salah, for the progress ring. */
  periodStart: Date | null;
}


/** Day times for the calendar day containing `now`, memoised by the caller if needed. */
export function buildSchedule(now: Date, inp: PrayerInputs): ScheduleState {
  const today = calendarDayOf(now);
  const days: Record<string, DayTimes> = {};
  const get = (day: CalendarDay) => {
    const k = `${day.year}-${day.month}-${day.day}`;
    return (days[k] ??= computeDay(day, inp));
  };
  const t = get(today);
  const y = get(addDays(today, -1));
  const tm = get(addDays(today, 1));

  const beforeFajr = !!t.fajr && now < t.fajr;
  // Qiyam of the current night: from midnight until Fajr it belongs to last night.
  const qiyam = beforeFajr ? y.qiyam : t.qiyam;

  const rows: Row[] = ROW_ORDER.map((key) => ({ key, time: key === 'qiyam' ? qiyam : t[key] }));

  // Timeline of events around now, to find the current period and the next salah.
  type Ev = { key: PrayerKey; time: Date };
  const ev: Ev[] = [];
  const push = (key: PrayerKey, time: Date | null) => time && ev.push({ key, time });
  push('isha', y.isha);
  push('qiyam', y.qiyam);
  for (const k of ROW_ORDER.slice(0, 6)) push(k, t[k]);
  push('qiyam', t.qiyam);
  push('fajr', tm.fajr);
  ev.sort((a, b) => a.time.getTime() - b.time.getTime());

  let cur: Ev | undefined;
  for (const e of ev) if (e.time <= now) cur = e;
  const nextEv = ev.find((e) => FIVE.includes(e.key) && e.time > now) ?? null;

  return {
    rows,
    currentKey: cur?.key ?? 'isha',
    next: nextEv,
    periodStart: cur?.time ?? null,
  };
}

/** 0..1 progress between the start of the current period and the next salah. */
export function periodProgress(state: ScheduleState, now: Date): number {
  if (!state.next || !state.periodStart) return 0;
  const a = state.periodStart.getTime();
  const b = state.next.time.getTime();
  return b > a ? Math.min(1, Math.max(0, (now.getTime() - a) / (b - a))) : 0;
}

