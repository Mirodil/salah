import * as SunCalc from 'suncalc';

export const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
];

export function phaseName(phase: number): string {
  return PHASE_NAMES[Math.round((((phase % 1) + 1) % 1) * 8) % 8];
}

export interface MoonInfo {
  phase: number;
  fraction: number;
  percent: number;
  name: string;
  waxing: boolean;
  /** Screen rotation (radians, clockwise) that turns a disc whose bright limb faces right to the real view. */
  rotation: number;
  altitude: number;
  azimuth: number;
}

export function moonInfo(date: Date, lat: number, lng: number): MoonInfo {
  const ill = SunCalc.getMoonIllumination(date);
  const pos = SunCalc.getMoonPosition(date, lat, lng);
  const z = ((ill.angle - pos.parallacticAngle) * Math.PI) / 180; // zenith angle of bright limb, anticlockwise
  return {
    phase: ill.phase,
    fraction: ill.fraction,
    percent: Math.round(ill.fraction * 100),
    name: phaseName(ill.phase),
    waxing: ill.waxing,
    rotation: Math.atan2(-Math.cos(z), -Math.sin(z)),
    altitude: pos.altitude,
    azimuth: pos.azimuth,
  };
}

/**
 * Outline of the lit part of the moon for a disc of radius r centred on the origin, bright limb on the right.
 * Outer limb is a right half-circle; the terminator is a half-ellipse of horizontal semi-axis r*|1-2f|.
 */
export function moonLitPolygon(fraction: number, r: number, steps = 48): { x: number; y: number }[] {
  const f = Math.min(1, Math.max(0, fraction));
  const a = r * Math.abs(1 - 2 * f);
  const sgn = f < 0.5 ? 1 : -1;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push({ x: r * Math.cos(phi), y: r * Math.sin(phi) });
  }
  for (let i = 0; i <= steps; i++) {
    const phi = Math.PI / 2 - (Math.PI * i) / steps;
    pts.push({ x: sgn * a * Math.cos(phi), y: r * Math.sin(phi) });
  }
  return pts;
}
