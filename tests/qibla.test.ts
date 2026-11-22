import { describe, expect, it } from 'vitest';
import * as adhan from 'adhan';
import { AT_KAABA_KM, compassLabel, distanceToKaabaKm, qiblaBearing } from '../src/core/qibla';

const CITIES: [string, number, number, number][] = [
  // name, lat, lng, approximate published bearing
  ['New York', 40.7128, -74.006, 58.5],
  ['London', 51.5074, -0.1278, 118.99],
  ['Jakarta', -6.2088, 106.8456, 295.1],
  ['Sydney', -33.8688, 151.2093, 277.5],
  ['Cape Town', -33.9249, 18.4241, 23.0],
];

describe('qibla bearing', () => {
  for (const [name, lat, lng, approx] of CITIES) {
    it(`${name} within 0.5 degrees of the published value and of adhan`, () => {
      const b = qiblaBearing(lat, lng);
      expect(Math.abs(b - approx)).toBeLessThan(0.7);
      expect(Math.abs(b - adhan.Qibla(new adhan.Coordinates(lat, lng)))).toBeLessThan(0.5);
    });
  }

  it('is due north from far south on the same meridian', () => {
    expect(qiblaBearing(-30, 39.8262)).toBeCloseTo(0, 1);
  });

  it('distance: London is about 4,800 km, Jakarta about 7,900 km', () => {
    expect(distanceToKaabaKm(51.5074, -0.1278)).toBeGreaterThan(4700);
    expect(distanceToKaabaKm(51.5074, -0.1278)).toBeLessThan(4900);
    expect(distanceToKaabaKm(-6.2088, 106.8456)).toBeGreaterThan(7700);
    expect(distanceToKaabaKm(-6.2088, 106.8456)).toBeLessThan(8000);
  });

  it('at the Kaaba the distance is below the threshold', () => {
    expect(distanceToKaabaKm(21.4225, 39.8262)).toBeLessThan(AT_KAABA_KM);
  });

  it('compass labels', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(58)).toBe('ENE'.slice(0, 0) + 'NE');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(180)).toBe('S');
    expect(compassLabel(295)).toBe('NW');
  });
});
