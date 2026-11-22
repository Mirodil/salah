import { describe, expect, it } from 'vitest';
import { angleDelta, headingFromAlpha, norm360, smoothAngle } from '../src/core/heading';

describe('heading', () => {
  it('normalises', () => {
    expect(norm360(-10)).toBe(350);
    expect(norm360(370)).toBe(10);
  });

  it('shortest delta wraps around north', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
  });

  it('smoothing crosses the 359 -> 0 wrap without swinging the long way', () => {
    let h: number | null = 359;
    h = smoothAngle(h, 1, 0.5);
    expect(h).toBeCloseTo(0, 5);
    h = smoothAngle(358, 2, 0.25);
    expect(h).toBeCloseTo(359, 5);
  });

  it('first sample passes through, converging afterwards', () => {
    expect(smoothAngle(null, 123, 0.2)).toBe(123);
    let h = 0;
    for (let i = 0; i < 60; i++) h = smoothAngle(h, 90, 0.2);
    expect(h).toBeCloseTo(90, 1);
  });

  it('alpha to compass heading, with screen rotation', () => {
    expect(headingFromAlpha(0)).toBe(0);
    expect(headingFromAlpha(90)).toBe(270);
    expect(headingFromAlpha(90, 90)).toBe(0);
  });
});
