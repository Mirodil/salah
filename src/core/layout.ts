export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: 'portrait' | 'landscape';
  W: number;
  H: number;
  pad: number;
  topBar: Rect;
  /** Where the sun and moon move (zenith at its top, horizon at its bottom). */
  sky: Rect;
  horizonY: number;
  hero: Rect;
  list: Rect;
  rowH: number;
  footerH: number;
  moonChip: Rect;
  /** Size of tap targets in the top bar. */
  button: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const MIN_WIDTH = 320;

export function computeLayout(W: number, H: number): Layout {
  W = Math.max(MIN_WIDTH, W);
  const pad = W < 420 ? 10 : 14;
  const barH = 52;
  const button = 44;
  const footerH = 26;
  const listPad = 8;
  const topBar = { x: 0, y: 0, w: W, h: barH };
  const landscape = W >= 760 && W > H * 1.1;

  if (landscape) {
    const leftW = Math.round(W * 0.56);
    const listW = W - leftW - pad;
    const heroH = 116;
    const rowH = clamp((H - barH - pad * 2 - listPad * 2 - footerH) / 7, 34, 54);
    const listH = rowH * 7 + listPad * 2 + footerH;
    const list = { x: leftW, y: barH + pad, w: listW, h: listH };
    const hero = { x: pad, y: H - pad - heroH, w: leftW - pad * 2, h: heroH };
    const horizonY = hero.y - 14;
    const skyTop = barH + 8;
    return {
      mode: 'landscape', W, H, pad, topBar, button, rowH, footerH, list, hero, horizonY,
      sky: { x: 40, y: skyTop, w: leftW - 80, h: Math.max(60, horizonY - skyTop) },
      moonChip: { x: pad, y: skyTop, w: 176, h: 48 },
    };
  }

  const heroH = 104;
  const gap = 10;
  const skyMin = 110;
  const avail = H - barH - skyMin - pad * 2 - heroH - gap - listPad * 2 - footerH;
  const rowH = clamp(avail / 7, 34, 46);
  const listH = rowH * 7 + listPad * 2 + footerH;
  const list = { x: pad, y: H - pad - listH, w: W - pad * 2, h: listH };
  const hero = { x: pad, y: list.y - gap - heroH, w: W - pad * 2, h: heroH };
  const horizonY = hero.y - 14;
  const skyTop = barH + 8;
  return {
    mode: 'portrait', W, H, pad, topBar, button, rowH, footerH, list, hero, horizonY,
    sky: { x: 28, y: skyTop, w: W - 56, h: Math.max(40, horizonY - skyTop) },
    moonChip: { x: pad, y: skyTop, w: 176, h: 48 },
  };
}
