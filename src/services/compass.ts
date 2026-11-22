import * as geomagnetism from 'geomagnetism';
import { headingFromAlpha, norm360, smoothAngle } from '../core/heading';

type DOEWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function compassSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

export function compassNeedsPermission(): boolean {
  return compassSupported() && typeof (DeviceOrientationEvent as DOEWithPermission).requestPermission === 'function';
}

/** Must be called from a tap on iOS. */
export async function requestCompassPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!compassSupported()) return 'unsupported';
  const req = (DeviceOrientationEvent as DOEWithPermission).requestPermission;
  if (!req) return 'granted';
  try {
    return await req.call(DeviceOrientationEvent);
  } catch {
    return 'denied';
  }
}

let modelCache: { day: number; model: ReturnType<typeof geomagnetism.model> } | null = null;

/** Local magnetic declination in degrees (east positive) from the World Magnetic Model. */
export function magneticDeclination(lat: number, lng: number, date = new Date()): number {
  try {
    const day = Math.floor(date.getTime() / 86400000);
    if (!modelCache || modelCache.day !== day) modelCache = { day, model: geomagnetism.model(date, { allowOutOfBoundsModel: true }) };
    return modelCache.model.point([lat, lng]).decl;
  } catch {
    return 0;
  }
}

export interface HeadingReading {
  /** True-north heading in degrees, smoothed. */
  heading: number;
  /** Degrees of reported error, or null when the sensor does not say. */
  accuracy: number | null;
}

/**
 * Streams smoothed true-north headings. Browsers report magnetic north, so the local declination is added.
 * iOS: webkitCompassHeading. Elsewhere: the absolute `alpha` of `deviceorientationabsolute`.
 */
export class CompassSensor {
  private smoothed: number | null = null;
  private got = false;
  private handlers: [string, (e: Event) => void][] = [];

  constructor(
    private lat: number,
    private lng: number,
    private onReading: (r: HeadingReading) => void,
    private alpha = 0.18,
  ) {}

  get hasReading() {
    return this.got;
  }

  start(): void {
    const declination = magneticDeclination(this.lat, this.lng);
    const emit = (magnetic: number, accuracy: number | null) => {
      this.got = true;
      this.smoothed = smoothAngle(this.smoothed, norm360(magnetic + declination), this.alpha);
      this.onReading({ heading: this.smoothed, accuracy });
    };
    const screenAngle = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0);

    const onAbs = (e: Event) => {
      const o = e as DeviceOrientationEvent;
      if (o.alpha === null || o.alpha === undefined) return;
      emit(headingFromAlpha(o.alpha, screenAngle()), null);
    };
    const onIos = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
      if (typeof o.webkitCompassHeading === 'number') {
        const acc = typeof o.webkitCompassAccuracy === 'number' && o.webkitCompassAccuracy >= 0 ? o.webkitCompassAccuracy : null;
        emit(o.webkitCompassHeading + screenAngle(), acc);
      } else if (o.absolute && o.alpha !== null) {
        emit(headingFromAlpha(o.alpha, screenAngle()), null);
      }
    };

    this.handlers = [
      ['deviceorientationabsolute', onAbs],
      ['deviceorientation', onIos],
    ];
    for (const [n, h] of this.handlers) window.addEventListener(n, h, true);
  }

  stop(): void {
    for (const [n, h] of this.handlers) window.removeEventListener(n, h, true);
    this.handlers = [];
    this.smoothed = null;
    this.got = false;
  }
}
