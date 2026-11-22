import { describe, expect, it } from 'vitest';
import { moonInfo, moonLitPolygon, phaseName } from '../src/core/moon';

const area = (pts: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

describe('moon', () => {
  it('names phases on known dates', () => {
    expect(moonInfo(new Date('2024-04-08T18:21:00Z'), 0, 0).name).toBe('New Moon');
    expect(moonInfo(new Date('2024-04-23T23:49:00Z'), 0, 0).name).toBe('Full Moon');
    expect(moonInfo(new Date('2024-04-15T19:13:00Z'), 0, 0).name).toBe('First Quarter');
    expect(moonInfo(new Date('2024-05-01T11:27:00Z'), 0, 0).name).toBe('Last Quarter');
  });

  it('reports illumination near 0% and 100% at new and full moon', () => {
    expect(moonInfo(new Date('2024-04-08T18:21:00Z'), 0, 0).percent).toBeLessThanOrEqual(1);
    expect(moonInfo(new Date('2024-04-23T23:49:00Z'), 0, 0).percent).toBeGreaterThanOrEqual(99);
  });

  it('waxing vs waning', () => {
    expect(moonInfo(new Date('2024-04-12T00:00:00Z'), 0, 0).waxing).toBe(true);
    expect(moonInfo(new Date('2024-04-28T00:00:00Z'), 0, 0).waxing).toBe(false);
  });

  it('phase names cover all eight', () => {
    const names = new Set([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(phaseName));
    expect(names.size).toBe(8);
    expect(phaseName(0.99)).toBe('New Moon');
  });

  it('lit polygon area is the illuminated fraction of the disc', () => {
    const r = 100;
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(area(moonLitPolygon(f, r, 200)) / (Math.PI * r * r)).toBeCloseTo(f, 2);
    }
  });

  it('lit polygon always sits on the right for a crescent and spills left for gibbous', () => {
    const crescent = moonLitPolygon(0.2, 100);
    expect(Math.min(...crescent.map((p) => p.x))).toBeGreaterThanOrEqual(-1e-9);
    const gibbous = moonLitPolygon(0.8, 100);
    expect(Math.min(...gibbous.map((p) => p.x))).toBeLessThan(-50);
  });
});
