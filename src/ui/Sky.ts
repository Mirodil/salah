import Phaser from 'phaser';
import * as SunCalc from 'suncalc';
import type { Layout } from '../core/layout';
import { moonInfo, moonLitPolygon, type MoonInfo } from '../core/moon';
import { lerp, lerpColor, skyFor, type Sky as SkyColors } from '../core/skyPalette';
import { bodyPosition } from '../core/skyPosition';
import { Depth, reducedMotion } from './theme';

const SUN_R = 26;
const MOON_R = 22;

interface Star {
  shape: Phaser.GameObjects.Arc;
  base: number;
  phase: number;
  speed: number;
}
interface Cloud {
  parts: Phaser.GameObjects.Ellipse[];
  offsets: { x: number; y: number }[];
  x: number;
  y: number;
  speed: number;
  scale: number;
}

export interface SkyFrame {
  sky: SkyColors;
  sunAlt: number;
  sunAz: number;
  morning: boolean;
  moon: MoonInfo;
}

/** Sky, sun, moon, stars, clouds and the horizon, drawn from real astronomical positions. */
export class Sky {
  private grad: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private sun: Phaser.GameObjects.Graphics;
  private moon: Phaser.GameObjects.Graphics;
  private ground: Phaser.GameObjects.Graphics;
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private L!: Layout;
  private lastKey = '';
  private lastGroundKey = '';
  private moonFraction = -1;
  private noonCache: { day: number; noon: number } | null = null;
  private lastSky: SkyColors = skyFor(-40, true);
  private motion = !reducedMotion();

  constructor(private scene: Phaser.Scene, private lat: number, private lng: number) {
    this.grad = scene.add.graphics().setDepth(Depth.sky);
    this.glow = scene.add.graphics().setDepth(Depth.sky + 3);
    this.sun = scene.add.graphics().setDepth(Depth.sky + 4);
    this.moon = scene.add.graphics().setDepth(Depth.sky + 4);
    this.ground = scene.add.graphics().setDepth(Depth.ground);
  }

  setPlace(lat: number, lng: number) {
    this.lat = lat;
    this.lng = lng;
    this.noonCache = null;
  }

  layout(L: Layout) {
    this.L = L;
    this.lastKey = '';
    this.lastGroundKey = '';
    this.buildStars();
    this.buildClouds();
  }

  private rng(seed: number) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  private buildStars() {
    this.stars.forEach((s) => s.shape.destroy());
    this.stars = [];
    const r = this.rng(42);
    const n = Math.round(Math.min(140, (this.L.W * this.L.horizonY) / 2600));
    for (let i = 0; i < n; i++) {
      const size = 0.6 + r() * 1.5;
      const shape = this.scene.add
        .circle(r() * this.L.W, r() * this.L.horizonY, size, 0xffffff, 0)
        .setDepth(Depth.sky + 1);
      this.stars.push({ shape, base: 0.5 + r() * 0.5, phase: r() * 6.28, speed: 0.6 + r() * 1.8 });
    }
  }

  private buildClouds() {
    this.clouds.forEach((c) => c.parts.forEach((p) => p.destroy()));
    this.clouds = [];
    const r = this.rng(7);
    const count = this.L.W > 700 ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const scale = 0.7 + r() * 0.9;
      const offsets = [
        { x: 0, y: 0 },
        { x: 26, y: -8 },
        { x: 54, y: 0 },
        { x: 28, y: 6 },
      ];
      const parts = offsets.map((_, k) =>
        this.scene.add.ellipse(0, 0, (k === 1 ? 46 : 38) * scale, (k === 1 ? 26 : 20) * scale, 0xffffff, 0).setDepth(Depth.sky + 2),
      );
      this.clouds.push({
        parts,
        offsets: offsets.map((o) => ({ x: o.x * scale, y: o.y * scale })),
        x: r() * this.L.W,
        y: this.L.sky.y + 10 + r() * Math.max(20, this.L.sky.h * 0.7),
        speed: 4 + r() * 8,
        scale,
      });
    }
  }

  private solarNoon(now: Date): number {
    const day = Math.floor((now.getTime() + (this.lng / 15) * 3600e3) / 86400000);
    if (!this.noonCache || this.noonCache.day !== day) {
      this.noonCache = { day, noon: SunCalc.getTimes(now, this.lat, this.lng).solarNoon.getTime() };
    }
    return this.noonCache.noon;
  }

  /** Current astronomical frame for a given instant. */
  frame(now: Date): SkyFrame {
    const pos = SunCalc.getPosition(now, this.lat, this.lng);
    const morning = now.getTime() < this.solarNoon(now);
    return {
      sky: skyFor(pos.altitude, morning),
      sunAlt: pos.altitude,
      sunAz: pos.azimuth,
      morning,
      moon: moonInfo(now, this.lat, this.lng),
    };
  }

  update(now: Date, dtMs: number): SkyFrame {
    const f = this.frame(now);
    this.lastSky = f.sky;
    this.drawGradient(f.sky);
    this.drawGround(f.sky);
    this.drawBodies(f);
    this.animateStars(f.sky.stars, now.getTime() / 1000);
    this.animateClouds(f, dtMs);
    return f;
  }

  get currentSky() {
    return this.lastSky;
  }

  private drawGradient(s: SkyColors) {
    const key = `${s.top}|${s.mid}|${s.horizon}|${this.L.W}|${this.L.H}|${this.L.horizonY}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { W, H, horizonY } = this.L;
    const midY = horizonY * 0.55;
    const g = this.grad;
    g.clear();
    g.fillGradientStyle(s.top, s.top, s.mid, s.mid, 1);
    g.fillRect(0, 0, W, midY + 1);
    g.fillGradientStyle(s.mid, s.mid, s.horizon, s.horizon, 1);
    g.fillRect(0, midY, W, horizonY - midY + 1);
    g.fillStyle(s.horizon, 1);
    g.fillRect(0, horizonY, W, H - horizonY);
  }

  private drawGround(s: SkyColors) {
    const col = lerpColor(s.horizon, 0x0a1220, 0.82);
    const far = lerpColor(s.horizon, 0x0a1220, 0.62);
    const key = `${col}|${this.L.W}|${this.L.H}|${this.L.horizonY}|${this.L.mode}`;
    if (key === this.lastGroundKey) return;
    this.lastGroundKey = key;
    const { W, H, horizonY } = this.L;
    const g = this.ground;
    g.clear();

    // far hills
    g.fillStyle(far, 1);
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, horizonY - 6);
    for (let i = 0; i <= Math.ceil(W / 12); i++) {
      const x = Math.min(W, i * 12);
      g.lineTo(x, horizonY - 6 - 10 * Math.sin(x / 90 + 1) - 6 * Math.sin(x / 37));
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();

    // near hills
    g.fillStyle(col, 1);
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, horizonY + 4);
    for (let i = 0; i <= Math.ceil(W / 12); i++) {
      const x = Math.min(W, i * 12);
      g.lineTo(x, horizonY + 4 - 6 * Math.sin(x / 130 + 3) - 3 * Math.sin(x / 29));
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();

    this.drawMosque(g, col);
  }

  private drawMosque(g: Phaser.GameObjects.Graphics, col: number) {
    const { W, horizonY, mode } = this.L;
    const cx = mode === 'landscape' ? W * 0.56 * 0.82 : W * 0.8;
    const base = horizonY + 2;
    const u = Math.min(1.2, Math.max(0.7, W / 520));
    g.fillStyle(col, 1);
    // hall
    g.fillRect(cx - 34 * u, base - 22 * u, 68 * u, 24 * u);
    // main dome
    g.fillCircle(cx, base - 22 * u, 20 * u);
    // finial
    g.fillRect(cx - 1 * u, base - 52 * u, 2 * u, 12 * u);
    g.fillCircle(cx, base - 53 * u, 2.2 * u);
    // small domes
    g.fillCircle(cx - 26 * u, base - 22 * u, 9 * u);
    g.fillCircle(cx + 26 * u, base - 22 * u, 9 * u);
    // minarets
    for (const dx of [-48, 48]) {
      const x = cx + dx * u;
      g.fillRect(x - 3.5 * u, base - 62 * u, 7 * u, 64 * u);
      g.fillRect(x - 5.5 * u, base - 50 * u, 11 * u, 3 * u);
      g.fillTriangle(x - 4.5 * u, base - 62 * u, x + 4.5 * u, base - 62 * u, x, base - 78 * u);
    }
  }

  private drawBodies(f: SkyFrame) {
    const { L } = this;
    const sunP = bodyPosition(f.sunAlt, f.sunAz, this.lat, L.sky);
    const moonP = bodyPosition(f.moon.altitude, f.moon.azimuth, this.lat, L.sky);

    // --- horizon glow where the sun rose or will set
    this.glow.clear();
    if (f.sunAlt > -14 && f.sunAlt < 8) {
      const strength = Math.max(0, 1 - Math.abs(f.sunAlt + 3) / 11);
      const warm = f.morning ? 0xffb38a : 0xff8a3d;
      for (let i = 0; i < 4; i++) {
        this.glow.fillStyle(warm, 0.07 * strength);
        this.glow.fillEllipse(sunP.x, L.horizonY, (260 + i * 150) * (L.W / 500 + 0.5), 50 + i * 50);
      }
    }

    // --- sun
    const sun = this.sun;
    sun.clear();
    if (f.sunAlt > -2) {
      const low = Math.min(1, Math.max(0, 1 - f.sunAlt / 25));
      const core = lerpColor(0xfff7d1, 0xffa23a, low);
      const halo = lerpColor(0xfff0b0, 0xff7a1c, low);
      const r = SUN_R * (1 + 0.18 * low);
      for (let i = 12; i >= 1; i--) {
        sun.fillStyle(halo, 0.018 + 0.006 * (13 - i) + 0.012 * low);
        sun.fillCircle(sunP.x, sunP.y, r * (1 + i * 0.32));
      }
      sun.fillStyle(core, 1);
      sun.fillCircle(sunP.x, sunP.y, r);
    }

    // --- moon: pale by day, bright with a glow at night
    const moon = this.moon;
    const night = Math.min(1, Math.max(0, (-f.sunAlt + 2) / 8));
    if (f.moon.altitude > -2) {
      if (Math.abs(f.moon.fraction - this.moonFraction) > 0.004 || this.moonFraction < 0) {
        this.moonFraction = f.moon.fraction;
        moon.clear();
        moon.fillStyle(0x6b7691, 0.4);
        moon.fillCircle(0, 0, MOON_R);
        moon.fillStyle(0xf6f1da, 1);
        moon.fillPoints(moonLitPolygon(f.moon.fraction, MOON_R).map((p) => new Phaser.Math.Vector2(p.x, p.y)), true, true);
      }
      moon.setPosition(moonP.x, moonP.y).setRotation(f.moon.rotation).setVisible(true);
      moon.setAlpha(lerp(0.55, 1, night));
      if (night > 0.05) {
        for (let i = 3; i >= 1; i--) {
          this.glow.fillStyle(0xdfe8ff, 0.05 * night);
          this.glow.fillCircle(moonP.x, moonP.y, MOON_R * (1 + i * 0.8));
        }
      }
    } else {
      moon.setVisible(false);
    }
  }

  private animateStars(strength: number, t: number) {
    for (const s of this.stars) {
      const tw = this.motion ? 0.65 + 0.35 * Math.sin(t * s.speed + s.phase) : 1;
      s.shape.setFillStyle(0xffffff, strength * s.base * tw);
    }
  }

  private animateClouds(f: SkyFrame, dtMs: number) {
    const day = Math.min(1, Math.max(0, (f.sunAlt + 4) / 14));
    const tint = lerpColor(0xd8dcf0, 0xffffff, Math.min(1, Math.max(0, f.sunAlt / 20)));
    const warm = f.sunAlt > -4 && f.sunAlt < 8 ? lerpColor(tint, f.morning ? 0xffd1c0 : 0xffb585, 0.6) : tint;
    for (const c of this.clouds) {
      if (this.motion) {
        c.x += (c.speed * dtMs) / 1000;
        if (c.x > this.L.W + 80) c.x = -100 * c.scale;
      }
      c.parts.forEach((p, i) => {
        p.setPosition(c.x + c.offsets[i].x, c.y + c.offsets[i].y);
        p.setFillStyle(warm, 0.55 * day);
      });
    }
  }
}
