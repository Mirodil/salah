import { describe, expect, it } from 'vitest';
import * as adhan from 'adhan';
import * as SunCalc from 'suncalc';
import { computeDay, type AsrRule } from '../src/core/prayerTimes';
import { METHODS, getMethod } from '../src/core/methods';
import { horizonAngle } from '../src/core/solar';

interface Case {
  city: string;
  lat: number;
  lng: number;
  date: [number, number, number];
  tz: number; // minutes east of UTC
  method: string;
  asr?: AsrRule;
}

const CASES: Case[] = [
  { city: 'Makkah', lat: 21.4225, lng: 39.8262, date: [2026, 3, 20], tz: 180, method: 'makkah' },
  { city: 'New York', lat: 40.7128, lng: -74.006, date: [2026, 6, 21], tz: -240, method: 'isna' },
  { city: 'Jakarta', lat: -6.2088, lng: 106.8456, date: [2026, 12, 21], tz: 420, method: 'singapore' },
  { city: 'Sydney', lat: -33.8688, lng: 151.2093, date: [2026, 1, 15], tz: 660, method: 'mwl' },
  { city: 'Cairo', lat: 30.0444, lng: 31.2357, date: [2026, 9, 10], tz: 120, method: 'egypt' },
  { city: 'Karachi', lat: 24.8607, lng: 67.0011, date: [2026, 11, 21], tz: 300, method: 'karachi', asr: 'hanafi' },
  { city: 'Istanbul', lat: 41.0082, lng: 28.9784, date: [2026, 9, 22], tz: 180, method: 'diyanet' },
  { city: 'Tehran', lat: 35.6892, lng: 51.389, date: [2026, 4, 10], tz: 210, method: 'tehran' },
  { city: 'Dubai', lat: 25.2048, lng: 55.2708, date: [2026, 7, 4], tz: 240, method: 'dubai' },
  { city: 'Doha', lat: 25.2854, lng: 51.531, date: [2026, 2, 1], tz: 180, method: 'qatar' },
  { city: 'Kuwait City', lat: 29.3759, lng: 47.9774, date: [2026, 5, 5], tz: 180, method: 'kuwait' },
  { city: 'London', lat: 51.5074, lng: -0.1278, date: [2026, 3, 20], tz: 0, method: 'mwl', asr: 'hanafi' },
  { city: 'Cape Town', lat: -33.9249, lng: 18.4241, date: [2026, 8, 1], tz: 120, method: 'mwl' },
];

function adhanParams(method: string, asr: AsrRule) {
  const map: Record<string, () => adhan.CalculationParameters> = {
    mwl: adhan.CalculationMethod.MuslimWorldLeague,
    isna: adhan.CalculationMethod.NorthAmerica,
    egypt: adhan.CalculationMethod.Egyptian,
    makkah: adhan.CalculationMethod.UmmAlQura,
    karachi: adhan.CalculationMethod.Karachi,
    dubai: adhan.CalculationMethod.Dubai,
    kuwait: adhan.CalculationMethod.Kuwait,
    qatar: adhan.CalculationMethod.Qatar,
    singapore: adhan.CalculationMethod.Singapore,
    diyanet: adhan.CalculationMethod.Turkey,
    tehran: adhan.CalculationMethod.Tehran,
  };
  const p = map[method]();
  p.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  p.adjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  p.madhab = asr === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  p.rounding = adhan.Rounding.Nearest;
  return p;
}

const place = (c: Case, elevation = 0, asr: AsrRule = c.asr ?? 'standard') => ({
  lat: c.lat,
  lng: c.lng,
  elevation,
  methodId: c.method,
  asr,
});
const day = (c: Case) => ({ year: c.date[0], month: c.date[1], day: c.date[2] });
const min = (ms: number) => ms / 60000;

describe('salah times vs an independent implementation (adhan), elevation 0', () => {
  for (const c of CASES) {
    it(`${c.city} / ${c.method} / ${c.asr ?? 'standard'}`, () => {
      const mine = computeDay(day(c), place(c), c.tz);
      const ref = new adhan.PrayerTimes(
        new adhan.Coordinates(c.lat, c.lng),
        new Date(Date.UTC(c.date[0], c.date[1] - 1, c.date[2])),
        adhanParams(c.method, c.asr ?? 'standard'),
      );
      const pairs: [string, Date | null, Date, number][] = [
        ['fajr', mine.fajr, ref.fajr, 0],
        ['sunrise', mine.sunrise, ref.sunrise, 0],
        ['dhuhr', mine.dhuhr, ref.dhuhr, 1], // we add one minute to Dhuhr
        ['asr', mine.asr, ref.asr, 0],
        ['maghrib', mine.maghrib, ref.maghrib, 0],
        ['isha', mine.isha, ref.isha, 0],
      ];
      for (const [name, a, b, offset] of pairs) {
        expect(a, name).not.toBeNull();
        const diff = Math.abs(min(a!.getTime() - b.getTime()) - offset);
        expect(diff, `${name}: mine ${a!.toISOString()} ref ${b.toISOString()}`).toBeLessThanOrEqual(1.01);
      }
    });
  }
});

describe('structure', () => {
  const c = CASES[3];
  it('orders the day correctly', () => {
    const t = computeDay(day(c), place(c), c.tz);
    const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d!.getTime());
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('puts Dhuhr one minute after solar noon', () => {
    const t = computeDay(day(c), place(c), c.tz);
    const noon = SunCalc.getTimes(new Date(Date.UTC(2026, 0, 15, 12)), c.lat, c.lng).solarNoon;
    expect(Math.abs(min(t.dhuhr!.getTime() - noon.getTime()) - 1)).toBeLessThanOrEqual(1.5);
  });

  it('Hanafi Asr is later than Standard Asr', () => {
    const s = computeDay(day(c), place(c, 0, 'standard'), c.tz);
    const h = computeDay(day(c), place(c, 0, 'hanafi'), c.tz);
    expect(h.asr!.getTime()).toBeGreaterThan(s.asr!.getTime());
  });

  it('every method yields sensible times', () => {
    const nyc = CASES[1];
    for (const m of METHODS) {
      const t = computeDay(day(nyc), { ...place(nyc), methodId: m.id }, nyc.tz);
      expect(t.fajr! < t.sunrise! && t.maghrib! < t.isha!, m.id).toBe(true);
    }
  });

  it('falls back to the first method for an unknown id', () => {
    expect(getMethod('nope').id).toBe(METHODS[0].id);
  });
});

describe('elevation', () => {
  const c = CASES[0]; // Makkah
  const sea = computeDay(day(c), place(c, 0), c.tz);
  const high = computeDay(day(c), place(c, 1000), c.tz);

  it('dip formula', () => {
    expect(horizonAngle(0)).toBeCloseTo(0.833, 5);
    expect(horizonAngle(1000)).toBeCloseTo(0.833 + 0.0347 * Math.sqrt(1000), 5);
    expect(horizonAngle(-50)).toBeCloseTo(0.833, 5); // negative treated as 0
  });

  it('at 1,000 m sunrise is earlier and Maghrib later by a few minutes', () => {
    const dr = min(sea.sunrise!.getTime() - high.sunrise!.getTime());
    const dm = min(high.maghrib!.getTime() - sea.maghrib!.getTime());
    expect(dr).toBeGreaterThanOrEqual(3);
    expect(dr).toBeLessThanOrEqual(6);
    expect(dm).toBeGreaterThanOrEqual(3);
    expect(dm).toBeLessThanOrEqual(6);
  });

  it('leaves Fajr, Dhuhr, Asr and Isha unchanged', () => {
    for (const k of ['fajr', 'dhuhr', 'asr'] as const) {
      expect(high[k]!.getTime(), k).toBe(sea[k]!.getTime());
    }
    // Makkah uses Maghrib + 90 min for Isha, so it follows Maghrib; check an angle-based method instead.
    const k = CASES[3];
    const a = computeDay(day(k), place(k, 0), k.tz);
    const b = computeDay(day(k), place(k, 1000), k.tz);
    expect(b.isha!.getTime()).toBe(a.isha!.getTime());
    expect(b.fajr!.getTime()).toBe(a.fajr!.getTime());
  });
});

describe('high latitudes', () => {
  it('60 N in midsummer: angle-based night portion keeps Fajr/Isha defined and ordered', () => {
    const t = computeDay(
      { year: 2026, month: 6, day: 21 },
      { lat: 60, lng: 10.75, elevation: 0, methodId: 'mwl', asr: 'standard' },
      120,
    );
    expect(t.fajr).not.toBeNull();
    expect(t.isha).not.toBeNull();
    expect(t.fajr!.getTime()).toBeLessThan(t.sunrise!.getTime());
    expect(t.isha!.getTime()).toBeGreaterThan(t.maghrib!.getTime());
  });

  it('polar day shows dashes (null) instead of throwing', () => {
    const t = computeDay(
      { year: 2026, month: 6, day: 21 },
      { lat: 69.65, lng: 18.96, elevation: 0, methodId: 'mwl', asr: 'standard' },
      120,
    );
    expect(t.sunrise).toBeNull();
    expect(t.maghrib).toBeNull();
    expect(t.qiyam).toBeNull();
    expect(t.dhuhr).not.toBeNull();
  });
});

describe('qiyam', () => {
  const c = CASES[3];
  it('is two thirds of the way from Maghrib to the next Fajr', () => {
    const t = computeDay(day(c), place(c), c.tz);
    const next = computeDay({ year: 2026, month: 1, day: 16 }, place(c), c.tz);
    const expected = t.maghrib!.getTime() + (2 / 3) * (next.fajr!.getTime() - t.maghrib!.getTime());
    expect(Math.abs(min(t.qiyam!.getTime() - expected))).toBeLessThanOrEqual(1);
    expect(t.qiyam!.getTime()).toBeGreaterThan(t.isha!.getTime());
  });
});

describe('local calendar day', () => {
  it('keeps Dhuhr on the requested day far from solar time (Kiritimati, UTC+14)', () => {
    const t = computeDay(
      { year: 2026, month: 6, day: 10 },
      { lat: 1.87, lng: -157.4, elevation: 0, methodId: 'mwl', asr: 'standard' },
      14 * 60,
    );
    const local = new Date(t.dhuhr!.getTime() + 14 * 3600e3);
    expect([local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()]).toEqual([2026, 6, 10]);
  });
});
