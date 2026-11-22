import { haversineKm } from '../core/geo';
import type { ElevationSource } from './storage';

export interface GeoFix {
  lat: number;
  lng: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
}

export type GeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';
export class GeoError extends Error {
  constructor(public code: GeoErrorCode) {
    super(code);
  }
}

export function getFix(timeoutMs = 15000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new GeoError('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          altitude: p.coords.altitude,
          altitudeAccuracy: p.coords.altitudeAccuracy,
        }),
      (e) => reject(new GeoError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Device altitude is only trusted when the device also reports an accuracy of 50 m or better. */
export function usableAltitude(altitude: number | null, accuracy: number | null): number | null {
  if (altitude === null || accuracy === null || !Number.isFinite(altitude) || !Number.isFinite(accuracy)) return null;
  return accuracy <= 50 ? Math.max(0, altitude) : null;
}

export const roundCoord = (v: number) => Math.round(v * 1000) / 1000;
export const coordKey = (lat: number, lng: number) => `${roundCoord(lat).toFixed(3)},${roundCoord(lng).toFixed(3)}`;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Open-Meteo elevation lookup. Only coordinates rounded to three decimals are sent. */
export async function lookupElevation(lat: number, lng: number, fetchFn: FetchLike = fetch as FetchLike, timeoutMs = 6000): Promise<number | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${roundCoord(lat)}&longitude=${roundCoord(lng)}`;
    const res = await fetchFn(url, { signal: ctl?.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { elevation?: unknown };
    const v = Array.isArray(body.elevation) ? body.elevation[0] : body.elevation;
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ResolvedElevation {
  m: number;
  source: ElevationSource;
  /** Set when a lookup produced a value to remember. */
  cacheKey?: string;
}

/** Device altitude, then cached or looked-up elevation, then 0 m. */
export async function resolveElevation(
  fix: GeoFix,
  cache: Record<string, number>,
  fetchFn: FetchLike = fetch as FetchLike,
): Promise<ResolvedElevation> {
  const device = usableAltitude(fix.altitude, fix.altitudeAccuracy);
  if (device !== null) return { m: device, source: 'gps' };
  const key = coordKey(fix.lat, fix.lng);
  if (key in cache) return { m: cache[key], source: 'lookup' };
  const looked = await lookupElevation(fix.lat, fix.lng, fetchFn);
  if (looked !== null) return { m: looked, source: 'lookup', cacheKey: key };
  return { m: 0, source: 'default' };
}

/** Position moved more than 2 km or elevation changed more than 50 m. */
export function significantChange(
  a: { lat: number; lng: number; elevation: number },
  b: { lat: number; lng: number; elevation: number },
): boolean {
  return haversineKm(a.lat, a.lng, b.lat, b.lng) > 2 || Math.abs(a.elevation - b.elevation) > 50;
}
