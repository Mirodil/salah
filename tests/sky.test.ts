import { describe, expect, it } from 'vitest';
import {
  DIM_ALPHA,
  composite,
  contrastRatio,
  lerpColor,
  luminance,
  panelFor,
  skyFor,
  worstContrast,
} from '../src/core/skyPalette';
import { bodyPosition } from '../src/core/skyPosition';

const chan = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const dist = (a: number, b: number) => Math.max(...chan(a).map((v, i) => Math.abs(v - chan(b)[i])));

describe('sky palette', () => {
  it('night is dark, midday is the lightest', () => {
    const night = skyFor(-40, true);
    const noon = skyFor(70, true);
    expect(luminance(night.mid)).toBeLessThan(0.02);
    expect(luminance(noon.mid)).toBeGreaterThan(0.35);
    expect(night.stars).toBe(1);
    expect(noon.stars).toBe(0);
  });

  it('stars fade in below -6 degrees', () => {
    expect(skyFor(0, true).stars).toBe(0);
    expect(skyFor(-6, true).stars).toBeLessThan(0.5);
    expect(skyFor(-12, true).stars).toBeGreaterThan(0.5);
  });

  it('dawn and dusk differ; sunset horizon is strongly orange', () => {
    expect(skyFor(-3, true).horizon).not.toBe(skyFor(-3, false).horizon);
    expect(skyFor(2, true).horizon).not.toBe(skyFor(2, false).horizon);
    const h = chan(skyFor(0, false).horizon);
    expect(h[0]).toBeGreaterThan(220); // red high
    expect(h[2]).toBeLessThan(90); // blue low
  });

  it('is continuous: no visible steps', () => {
    for (const morning of [true, false]) {
      let prev = skyFor(-40, morning);
      for (let a = -39.9; a <= 90; a += 0.1) {
        const s = skyFor(a, morning);
        expect(dist(s.top, prev.top)).toBeLessThanOrEqual(6);
        expect(dist(s.mid, prev.mid)).toBeLessThanOrEqual(6);
        expect(dist(s.horizon, prev.horizon)).toBeLessThanOrEqual(6);
        prev = s;
      }
    }
  });

  it('lerpColor endpoints', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
});

describe('readability', () => {
  it('chosen panel keeps secondary text at 4.5:1 or better at every altitude, morning and evening', () => {
    for (const morning of [true, false]) {
      for (let a = -40; a <= 90; a += 0.5) {
        const sky = skyFor(a, morning);
        const p = panelFor(sky);
        expect(worstContrast(sky, p), `alt ${a} ${morning ? 'am' : 'pm'}`).toBeGreaterThanOrEqual(4.5);
        // primary text is at least as strong as secondary text
        const bg = composite(p.fill, p.alpha, sky.mid);
        expect(contrastRatio(p.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.accent, bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('dimmed (passed) rows still keep 4.5:1 contrast at every altitude', () => {
    for (const morning of [true, false]) {
      for (let a = -40; a <= 90; a += 0.5) {
        const sky = skyFor(a, morning);
        const p = panelFor(sky);
        for (const bgSky of [sky.top, sky.mid, sky.horizon]) {
          const bg = composite(p.fill, p.alpha, bgSky);
          const dimmed = composite(p.text, DIM_ALPHA, bg);
          expect(contrastRatio(dimmed, bg), `alt ${a} ${morning ? 'am' : 'pm'}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('uses a dark panel at night and a light panel at midday', () => {
    expect(panelFor(skyFor(-40, true)).light).toBe(false);
    expect(panelFor(skyFor(70, true)).light).toBe(true);
  });
});

describe('sun and moon placement', () => {
  const rect = { x: 0, y: 0, w: 1000, h: 500 };

  it('horizon at the bottom, zenith at the top', () => {
    expect(bodyPosition(0, 180, 40, rect).y).toBeCloseTo(500);
    expect(bodyPosition(90, 180, 40, rect).y).toBeCloseTo(0);
    expect(bodyPosition(45, 180, 40, rect).y).toBeCloseTo(250);
    expect(bodyPosition(-10, 180, 40, rect).up).toBe(false);
    expect(bodyPosition(10, 180, 40, rect).up).toBe(true);
  });

  it('northern hemisphere: rises on the left, due south in the middle, sets on the right', () => {
    expect(bodyPosition(5, 90, 40, rect).x).toBeLessThan(500);
    expect(bodyPosition(5, 180, 40, rect).x).toBeCloseTo(500);
    expect(bodyPosition(5, 270, 40, rect).x).toBeGreaterThan(500);
  });

  it('southern hemisphere is mirrored', () => {
    expect(bodyPosition(5, 90, -30, rect).x).toBeGreaterThan(500);
    expect(bodyPosition(5, 0, -30, rect).x).toBeCloseTo(500);
    expect(bodyPosition(5, 270, -30, rect).x).toBeLessThan(500);
  });

  it('clamps at the edges', () => {
    expect(bodyPosition(5, 0, 40, rect).x).toBeGreaterThanOrEqual(0);
    expect(bodyPosition(5, 0, 40, rect).x).toBeLessThanOrEqual(1000);
    expect(bodyPosition(5, 45, 40, rect).x).toBeCloseTo(0);
    expect(bodyPosition(5, 315, 40, rect).x).toBeCloseTo(1000);
  });
});
