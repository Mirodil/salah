export const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Signed shortest rotation from a to b, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = norm360(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Low-pass filter for angles that handles the 359 -> 0 wrap. alpha in (0,1]. */
export function smoothAngle(prev: number | null, next: number, alpha: number): number {
  if (prev === null) return norm360(next);
  return norm360(prev + angleDelta(prev, next) * alpha);
}

/** Heading for a device-orientation reading on browsers that give an absolute alpha. */
export function headingFromAlpha(alpha: number, screenAngle = 0): number {
  return norm360(360 - alpha + screenAngle);
}
