/**
 * "Now", overridable for testing with ?t=2026-06-21T12:00:00Z (start instant) and ?speed=600 (virtual seconds per real second).
 */
export interface Clock {
  now(): Date;
  readonly overridden: boolean;
}

export function createClock(search: string, realNow: () => number = Date.now): Clock {
  const p = new URLSearchParams(search);
  const t = p.get('t');
  const speed = Number(p.get('speed') ?? '1');
  const start = t ? Date.parse(t) : NaN;
  if (Number.isNaN(start) && !(speed !== 1 && Number.isFinite(speed))) {
    return { now: () => new Date(realNow()), overridden: false };
  }
  const t0 = Number.isNaN(start) ? realNow() : start;
  const r0 = realNow();
  const k = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return { now: () => new Date(t0 + (realNow() - r0) * k), overridden: true };
}

export const clock: Clock = createClock(typeof location === 'undefined' ? '' : location.search);
