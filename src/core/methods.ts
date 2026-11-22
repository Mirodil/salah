/** Calculation methods. One entry each; add a method by adding a row. */
export interface Method {
  id: string;
  name: string;
  /** Fajr twilight angle, degrees below the horizon. */
  fajr: number;
  /** Isha twilight angle (degrees) or a fixed number of minutes after Maghrib. */
  isha: { angle: number } | { minutes: number };
  /** Some methods define Maghrib by a sun angle instead of sunset. */
  maghribAngle?: number;
  /** Short note shown under the dropdown. */
  note?: string;
}

export const METHODS: Method[] = [
  { id: 'mwl', name: 'Muslim World League', fajr: 18, isha: { angle: 17 } },
  { id: 'isna', name: 'ISNA (North America)', fajr: 15, isha: { angle: 15 } },
  { id: 'egypt', name: 'Egyptian General Authority', fajr: 19.5, isha: { angle: 17.5 } },
  { id: 'makkah', name: 'Umm al-Qura (Makkah)', fajr: 18.5, isha: { minutes: 90 } },
  { id: 'karachi', name: 'University of Karachi', fajr: 18, isha: { angle: 18 } },
  { id: 'dubai', name: 'Dubai', fajr: 18.2, isha: { angle: 18.2 } },
  { id: 'kuwait', name: 'Kuwait', fajr: 18, isha: { angle: 17.5 } },
  { id: 'qatar', name: 'Qatar', fajr: 18, isha: { minutes: 90 } },
  { id: 'singapore', name: 'Singapore (MUIS)', fajr: 20, isha: { angle: 18 } },
  { id: 'diyanet', name: 'Diyanet (Turkey)', fajr: 18, isha: { angle: 17 } },
  { id: 'tehran', name: 'Tehran', fajr: 17.7, isha: { angle: 14 }, maghribAngle: 4.5 },
  { id: 'jafari', name: 'Jafari', fajr: 16, isha: { angle: 14 }, maghribAngle: 4 },
];

export const DEFAULT_METHOD_ID = 'mwl';

export function getMethod(id: string): Method {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}
