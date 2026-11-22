import { getMethod } from './methods';
import {
  acosD,
  arccotD,
  cosD,
  fixHour,
  horizonAngle,
  julianDay,
  sinD,
  sunPosition,
  tanD,
} from './solar';

export type AsrRule = 'standard' | 'hanafi';

export interface PrayerInputs {
  lat: number;
  lng: number;
  /** Observer elevation in metres. */
  elevation: number;
  methodId: string;
  asr: AsrRule;
}

export interface DayTimes {
  fajr: Date | null;
  sunrise: Date | null;
  dhuhr: Date | null;
  asr: Date | null;
  maghrib: Date | null;
  isha: Date | null;
  /** Start of the last third of the night that begins with this day's Maghrib. */
  qiyam: Date | null;
}

export interface CalendarDay {
  year: number;
  month: number; // 1-12
  day: number;
}

const HOUR = 3600e3;
const MINUTE = 60e3;
const DHUHR_OFFSET_MIN = 1;

interface RawTimes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

/** Raw solar times as local-mean-time hours (NaN where the sun never reaches the angle). */
function rawTimes(day: CalendarDay, inp: PrayerInputs): RawTimes {
  const method = getMethod(inp.methodId);
  const jd0 = julianDay(day.year, day.month, day.day) - inp.lng / 360;
  const asrFactor = inp.asr === 'hanafi' ? 2 : 1;

  const decl = (t: number) => sunPosition(jd0 + t / 24).declination;
  const midDay = (t: number) => fixHour(12 - sunPosition(jd0 + t / 24).equation);

  /** Time the sun is `angle` degrees below the horizon; negative angle = above. */
  const angleTime = (angle: number, t: number, ccw: boolean) => {
    const d = decl(t);
    const cosH = (-sinD(angle) - sinD(d) * sinD(inp.lat)) / (cosD(d) * cosD(inp.lat));
    if (cosH < -1 || cosH > 1) return NaN;
    const h = acosD(cosH) / 15;
    return midDay(t) + (ccw ? -h : h);
  };
  const asrTime = (t: number) => {
    const d = decl(t);
    const angle = -arccotD(asrFactor + tanD(Math.abs(inp.lat - d)));
    return angleTime(angle, t, false);
  };

  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  const horizon = horizonAngle(inp.elevation);
  const seed = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  const ok = (k: keyof typeof seed) => (Number.isFinite(t[k]) ? t[k] : seed[k]);
  for (let i = 0; i < 2; i++) {
    t = {
      dhuhr: midDay(ok('dhuhr')) + DHUHR_OFFSET_MIN / 60,
      fajr: angleTime(method.fajr, ok('fajr'), true),
      sunrise: angleTime(horizon, ok('sunrise'), true),
      asr: asrTime(ok('asr')),
      sunset: angleTime(horizon, ok('sunset'), false),
      maghrib: method.maghribAngle !== undefined
        ? angleTime(method.maghribAngle, ok('maghrib'), false)
        : angleTime(horizon, ok('maghrib'), false),
      isha: 'angle' in method.isha ? angleTime(method.isha.angle, ok('isha'), false) : t.isha,
    };
  }

  const maghrib = t.maghrib;
  let isha = 'angle' in method.isha ? t.isha : maghrib + method.isha.minutes / 60;
  let fajr = t.fajr;

  // High latitudes: angle-based night portion (angle / 60 of the night, sunset -> sunrise).
  const night = fixHour(t.sunrise - t.sunset);
  if (Number.isFinite(night)) {
    const diff = (a: number, b: number) => fixHour(b - a);
    const fajrPortion = (method.fajr / 60) * night;
    if (Number.isNaN(fajr) || diff(fajr, t.sunrise) > fajrPortion) fajr = t.sunrise - fajrPortion;
    if ('angle' in method.isha) {
      const ishaPortion = (method.isha.angle / 60) * night;
      if (Number.isNaN(isha) || diff(t.sunset, isha) > ishaPortion) isha = t.sunset + ishaPortion;
    }
  }

  return { fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib, isha };
}

function toInstant(day: CalendarDay, hours: number, lng: number): number {
  return Date.UTC(day.year, day.month - 1, day.day) + (hours - lng / 15) * HOUR;
}

function addDays(day: CalendarDay, n: number): CalendarDay {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function localOffsetMinutes(day: CalendarDay): number {
  return -new Date(day.year, day.month - 1, day.day, 12).getTimezoneOffset();
}

/** Shift so that Dhuhr lands on the requested local calendar day (matters far from solar time). */
function dayShiftMs(day: CalendarDay, dhuhrMs: number, tzMin: number): number {
  const local = new Date(dhuhrMs + tzMin * MINUTE);
  const got = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const want = Date.UTC(day.year, day.month - 1, day.day);
  return want - got;
}

const roundMin = (ms: number) => Math.round(ms / MINUTE) * MINUTE;

function instants(day: CalendarDay, inp: PrayerInputs, tzMin: number) {
  const raw = rawTimes(day, inp);
  const conv = (h: number) => (Number.isFinite(h) ? toInstant(day, h, inp.lng) : NaN);
  const out = {
    fajr: conv(raw.fajr),
    sunrise: conv(raw.sunrise),
    dhuhr: conv(raw.dhuhr),
    asr: conv(raw.asr),
    maghrib: conv(raw.maghrib),
    isha: conv(raw.isha),
  };
  const shift = Number.isFinite(out.dhuhr) ? dayShiftMs(day, out.dhuhr, tzMin) : 0;
  if (shift !== 0) {
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] += shift;
  }
  return out;
}

/**
 * Salah times for one calendar day at a place.
 * `tzMin` (minutes east of UTC) defaults to the device timezone on that day.
 */
export function computeDay(day: CalendarDay, inp: PrayerInputs, tzMin = localOffsetMinutes(day)): DayTimes {
  const today = instants(day, inp, tzMin);
  const tomorrow = instants(addDays(day, 1), inp, tzMin);

  const qiyamMs = today.maghrib + (2 / 3) * (tomorrow.fajr - today.maghrib);
  const d = (ms: number) => (Number.isFinite(ms) ? new Date(roundMin(ms)) : null);
  return {
    fajr: d(today.fajr),
    sunrise: d(today.sunrise),
    dhuhr: d(today.dhuhr),
    asr: d(today.asr),
    maghrib: d(today.maghrib),
    isha: d(today.isha),
    qiyam: d(qiyamMs),
  };
}

export function calendarDayOf(date: Date): CalendarDay {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export { addDays };
