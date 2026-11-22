import { describe, expect, it, vi } from 'vitest';
import {
  coordKey,
  lookupElevation,
  resolveElevation,
  roundCoord,
  significantChange,
  usableAltitude,
  type FetchLike,
} from '../src/services/location';

const ok = (body: unknown): FetchLike => async () => ({ ok: true, json: async () => body });

describe('device altitude', () => {
  it('is used only with an accuracy of 50 m or better', () => {
    expect(usableAltitude(120, 10)).toBe(120);
    expect(usableAltitude(120, 50)).toBe(120);
    expect(usableAltitude(120, 51)).toBeNull();
    expect(usableAltitude(120, null)).toBeNull();
    expect(usableAltitude(null, 5)).toBeNull();
    expect(usableAltitude(Number.NaN, 5)).toBeNull();
  });

  it('negative altitude becomes 0', () => {
    expect(usableAltitude(-12, 5)).toBe(0);
  });
});

describe('elevation lookup', () => {
  it('sends coordinates rounded to three decimals only', async () => {
    const f = vi.fn(ok({ elevation: [37.0] }));
    await lookupElevation(51.507412345, -0.127798765, f);
    expect(f.mock.calls[0][0]).toBe('https://api.open-meteo.com/v1/elevation?latitude=51.507&longitude=-0.128');
  });

  it('parses the response and clamps negatives to 0', async () => {
    expect(await lookupElevation(1, 1, ok({ elevation: [1234.5] }))).toBe(1234.5);
    expect(await lookupElevation(1, 1, ok({ elevation: [-4] }))).toBe(0);
  });

  it('returns null on errors, bad bodies and non-ok responses', async () => {
    expect(await lookupElevation(1, 1, async () => { throw new Error('offline'); })).toBeNull();
    expect(await lookupElevation(1, 1, ok({ nope: 1 }))).toBeNull();
    expect(await lookupElevation(1, 1, async () => ({ ok: false, json: async () => ({}) }))).toBeNull();
  });
});

describe('resolveElevation order', () => {
  const fix = { lat: 40.0, lng: -105.0, altitude: null, altitudeAccuracy: null };

  it('1. device altitude, without calling the network', async () => {
    const f = vi.fn(ok({ elevation: [1] }));
    const r = await resolveElevation({ ...fix, altitude: 1650, altitudeAccuracy: 8 }, {}, f);
    expect(r).toEqual({ m: 1650, source: 'gps' });
    expect(f).not.toHaveBeenCalled();
  });

  it('2. cache, then lookup', async () => {
    const key = coordKey(fix.lat, fix.lng);
    const f = vi.fn(ok({ elevation: [1655] }));
    expect(await resolveElevation(fix, { [key]: 1600 }, f)).toEqual({ m: 1600, source: 'lookup' });
    expect(f).not.toHaveBeenCalled();
    expect(await resolveElevation(fix, {}, f)).toEqual({ m: 1655, source: 'lookup', cacheKey: key });
  });

  it('3. falls back to 0 m when offline', async () => {
    const r = await resolveElevation(fix, {}, async () => { throw new Error('offline'); });
    expect(r).toEqual({ m: 0, source: 'default' });
  });
});

describe('helpers', () => {
  it('rounds coordinates', () => {
    expect(roundCoord(1.23456)).toBe(1.235);
    expect(coordKey(1.23456, -2.34567)).toBe('1.235,-2.346');
  });

  it('significant change: > 2 km or > 50 m', () => {
    const a = { lat: 40, lng: -74, elevation: 10 };
    expect(significantChange(a, { ...a, lat: 40.01 })).toBe(false); // ~1.1 km
    expect(significantChange(a, { ...a, lat: 40.03 })).toBe(true); // ~3.3 km
    expect(significantChange(a, { ...a, elevation: 55 })).toBe(false);
    expect(significantChange(a, { ...a, elevation: 70 })).toBe(true);
  });
});
