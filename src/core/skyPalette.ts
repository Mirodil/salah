/** Sky colours driven by the sun's altitude. Morning and evening differ (dawn vs dusk, sunrise vs sunset). */

export interface Sky {
  top: number;
  mid: number;
  horizon: number;
  /** 0..1 */
  stars: number;
}

interface Key extends Sky {
  alt: number;
}

const MORNING: Key[] = [
  { alt: -18, top: 0x050b24, mid: 0x0b1840, horizon: 0x14275a, stars: 1 },
  { alt: -12, top: 0x0a1640, mid: 0x1c2a68, horizon: 0x3a3f85, stars: 0.8 },
  { alt: -6, top: 0x2a4a8a, mid: 0x7088c4, horizon: 0xf0a9a0, stars: 0.25 },
  { alt: 0, top: 0x5b8fd4, mid: 0xa4c4ea, horizon: 0xffc994, stars: 0 },
  { alt: 6, top: 0x6aa6e6, mid: 0xa9d0f2, horizon: 0xffd9a0, stars: 0 },
  { alt: 30, top: 0x4a90e2, mid: 0x86bff0, horizon: 0xbfe0f8, stars: 0 },
  { alt: 90, top: 0x4f9cf0, mid: 0x9fd0f8, horizon: 0xd6eefc, stars: 0 },
];

const EVENING: Key[] = [
  { alt: -18, top: 0x050b24, mid: 0x0b1840, horizon: 0x14275a, stars: 1 },
  { alt: -12, top: 0x0e1646, mid: 0x2a2a6a, horizon: 0x5a3a7a, stars: 0.8 },
  { alt: -6, top: 0x2b2f6e, mid: 0x7a4a8a, horizon: 0xe0705a, stars: 0.3 },
  { alt: 0, top: 0x4b6fb5, mid: 0xf2a65a, horizon: 0xff7a2f, stars: 0 },
  { alt: 6, top: 0x5b9de0, mid: 0xa8c8e8, horizon: 0xffb86b, stars: 0 },
  { alt: 30, top: 0x4a90e2, mid: 0x86bff0, horizon: 0xbfe0f8, stars: 0 },
  { alt: 90, top: 0x4f9cf0, mid: 0x9fd0f8, horizon: 0xd6eefc, stars: 0 },
];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

/** Sky for a sun altitude (degrees). `morning` is true before solar noon. */
export function skyFor(altitude: number, morning: boolean): Sky {
  const keys = morning ? MORNING : EVENING;
  if (altitude <= keys[0].alt) return keys[0];
  const last = keys[keys.length - 1];
  if (altitude >= last.alt) return last;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (altitude >= a.alt && altitude <= b.alt) {
      const t = (altitude - a.alt) / (b.alt - a.alt);
      return {
        top: lerpColor(a.top, b.top, t),
        mid: lerpColor(a.mid, b.mid, t),
        horizon: lerpColor(a.horizon, b.horizon, t),
        stars: lerp(a.stars, b.stars, t),
      };
    }
  }
  return last;
}

// ---- Readability: translucent panels chosen from the sky ------------------------------------------------------

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminance(rgb: number): number {
  return 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255);
}
export function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function composite(fg: number, alpha: number, bg: number): number {
  return lerpColor(bg, fg, alpha);
}

/** Passed rows are dimmed to this opacity; it is high enough to keep 4.5:1 contrast on both panel styles. */
export const DIM_ALPHA = 0.66;

export interface PanelStyle {
  light: boolean;
  fill: number;
  alpha: number;
  text: number;
  subtext: number;
  accent: number;
}

const DARK: PanelStyle = { light: false, fill: 0x08112a, alpha: 0.72, text: 0xffffff, subtext: 0xd3dcf2, accent: 0xffd479 };
const LIGHT: PanelStyle = { light: true, fill: 0xffffff, alpha: 0.82, text: 0x0b1530, subtext: 0x2a3a60, accent: 0x8a4a00 };

/** Worst-case contrast of the style's secondary text over the three sky colours behind a panel. */
export function worstContrast(sky: Sky, p: PanelStyle): number {
  return Math.min(
    ...[sky.top, sky.mid, sky.horizon].map((bg) => contrastRatio(p.subtext, composite(p.fill, p.alpha, bg))),
  );
}

/** Pick the dark or light panel that reads best over this sky. */
export function panelFor(sky: Sky): PanelStyle {
  return worstContrast(sky, DARK) >= worstContrast(sky, LIGHT) ? DARK : LIGHT;
}

/** Sheets and cards sit on their own near-opaque dark panel, so their contrast never depends on the sky. */
export const SHEET_STYLE: PanelStyle = {
  light: false,
  fill: 0x0d1936,
  alpha: 1,
  text: 0xffffff,
  subtext: 0xd3dcf2,
  accent: 0xffd479,
};
