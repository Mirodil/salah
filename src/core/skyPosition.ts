export interface SkyRect {
  x: number;
  y: number; // zenith line
  w: number;
  h: number; // zenith -> horizon
}

export interface BodyPoint {
  x: number;
  y: number;
  /** Above the horizon (altitude > 0). */
  up: boolean;
}

export const AZIMUTH_SPAN = 135;

/**
 * Map a body's horizontal position to the canvas. The view faces the direction the Sun crosses at noon
 * (south in the northern hemisphere, north in the southern), so bodies rise on the left and set on the right
 * in the north, and the reverse in the south.
 */
export function bodyPosition(altitudeDeg: number, azimuthDeg: number, lat: number, rect: SkyRect): BodyPoint {
  const facing = lat >= 0 ? 180 : 0;
  let rel = ((azimuthDeg - facing + 540) % 360) - 180;
  rel = Math.max(-AZIMUTH_SPAN, Math.min(AZIMUTH_SPAN, rel));
  const fx = (rel / AZIMUTH_SPAN) * 0.5 + 0.5;
  const fy = 1 - altitudeDeg / 90;
  return { x: rect.x + fx * rect.w, y: rect.y + fy * rect.h, up: altitudeDeg > 0 };
}
