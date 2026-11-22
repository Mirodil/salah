import { haversineKm } from './geo';

export const KAABA = { lat: 21.4225, lng: 39.8262 };

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Initial great-circle bearing to the Kaaba, degrees clockwise from true north (0..360). */
export function qiblaBearing(lat: number, lng: number): number {
  const p1 = lat * D2R;
  const p2 = KAABA.lat * D2R;
  const dl = (KAABA.lng - lng) * D2R;
  const y = Math.sin(dl);
  const x = Math.cos(p1) * Math.tan(p2) - Math.sin(p1) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Great-circle distance to the Kaaba, km. */
export function distanceToKaabaKm(lat: number, lng: number): number {
  return haversineKm(lat, lng, KAABA.lat, KAABA.lng);
}

/** Closer than this, a direction is not meaningful. */
export const AT_KAABA_KM = 0.5;

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassLabel(deg: number, points: 8 | 16 = 8): string {
  const n = points;
  const step = 360 / n;
  const idx = Math.round((((deg % 360) + 360) % 360) / step) % n;
  return POINTS[(idx * 16) / n];
}
