/** Low-precision solar position (Meeus-style), good to well under a minute for salah times. */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const sinD = (d: number) => Math.sin(d * D2R);
export const cosD = (d: number) => Math.cos(d * D2R);
export const tanD = (d: number) => Math.tan(d * D2R);
export const asinD = (x: number) => Math.asin(x) * R2D;
export const acosD = (x: number) => Math.acos(x) * R2D;
export const atan2D = (y: number, x: number) => Math.atan2(y, x) * R2D;
export const arccotD = (x: number) => Math.atan(1 / x) * R2D;

export const fixAngle = (a: number) => ((a % 360) + 360) % 360;
export const fixHour = (h: number) => ((h % 24) + 24) % 24;

/** Julian date at 0h UTC of the given calendar day. */
export function julianDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86400000 + 2440587.5;
}

export interface SunPosition {
  /** Declination, degrees. */
  declination: number;
  /** Equation of time, hours. */
  equation: number;
}

export function sunPosition(jd: number): SunPosition {
  const D = jd - 2451544.5;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * sinD(g) + 0.02 * sinD(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = fixHour(atan2D(cosD(e) * sinD(L), cosD(L)) / 15);
  return {
    declination: asinD(sinD(e) * sinD(L)),
    equation: q / 15 - RA,
  };
}

/** Apparent horizon depression (degrees) for sunrise/sunset: refraction + solar radius + horizon dip. */
export function horizonAngle(elevationM: number): number {
  const h = Math.max(0, elevationM);
  return 0.833 + 0.0347 * Math.sqrt(h);
}
