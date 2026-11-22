import { describe, expect, it } from 'vitest';
import { computeLayout, MIN_WIDTH, type Rect } from '../src/core/layout';

const inside = (r: Rect, W: number, H: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const SIZES: [number, number][] = [
  [320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [900, 500],
];

describe('layout', () => {
  for (const [W, H] of SIZES) {
    it(`${W}x${H}: panels fit, do not overlap, rows and buttons are tappable`, () => {
      const L = computeLayout(W, H);
      expect(inside(L.hero, W, H)).toBe(true);
      expect(inside(L.list, W, H)).toBe(true);
      expect(overlap(L.hero, L.list)).toBe(false);
      expect(L.rowH).toBeGreaterThanOrEqual(34);
      expect(L.button).toBeGreaterThanOrEqual(44);
      expect(L.sky.h).toBeGreaterThan(30);
      expect(L.sky.y + L.sky.h).toBeLessThanOrEqual(L.horizonY + 1);
      expect(L.list.w).toBeGreaterThanOrEqual(280);
      // the clear sky band is not covered by the hero or list panels
      expect(overlap(L.sky, L.hero)).toBe(false);
      expect(overlap(L.sky, L.list)).toBe(false);
    });
  }

  it('portrait is a single column, landscape puts the list on the right', () => {
    expect(computeLayout(390, 844).mode).toBe('portrait');
    const l = computeLayout(1280, 720);
    expect(l.mode).toBe('landscape');
    expect(l.list.x).toBeGreaterThan(l.hero.x + l.hero.w - 1);
  });

  it('clamps below the minimum width', () => {
    expect(computeLayout(200, 500).W).toBe(MIN_WIDTH);
  });

  it('keeps top bar buttons within the width on the smallest screen (4 buttons + date)', () => {
    const L = computeLayout(320, 568);
    expect(4 * L.button + 2 * L.pad).toBeLessThan(L.W - 100);
  });
});
