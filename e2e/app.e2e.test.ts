/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import type { Browser } from 'puppeteer-core';
import { computeDay } from '../src/core/prayerTimes';
import { formatTime } from '../src/core/format';
import { luminance } from '../src/core/skyPalette';
import {
  LONDON,
  clickMainButton,
  clickText,
  hasText,
  launch,
  main,
  openApp,
  rowTimes,
  seedState,
  sleep,
  storage,
  waitScene,
  waitText,
} from './helpers';

let browser: Browser;
let dev: ViteDevServer;
let prod: PreviewServer;
let pages: PreviewServer;
let base = '';
let prodBase = '';
let pagesBase = '';

const rnd = () => 5300 + Math.floor(Math.random() * 600);
const DAY = { year: 2026, month: 11, day: 21 };
/** Every piece of the sheet's content lies inside its panel, and the panel inside the window. */
const SHEET_FITS = (which: 'settings' | 'qibla') => `(() => {
  const v = s.${which};
  const b = v.sheet.content.getBounds();
  const r = v.sheet.rect;
  return b.top >= r.y - 1 && b.bottom <= r.y + r.h + 1 && b.left >= r.x - 1 && b.right <= r.x + r.w + 1 && r.y >= 0 && r.y + r.h <= s.L.H + 1 && r.x >= 0 && r.x + r.w <= s.L.W + 1;
})()`;
const inputs = { lat: LONDON.lat, lng: LONDON.lng, elevation: 35, methodId: 'mwl', asr: 'standard' as const };
const expectedRows = (over: Partial<typeof inputs> = {}, hour12 = false) => {
  const t = computeDay(DAY, { ...inputs, ...over }, 0);
  return [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha, t.qiyam].map((d) => formatTime(d, hour12));
};

beforeAll(async () => {
  dev = await createServer({ server: { port: rnd(), strictPort: false }, logLevel: 'silent' });
  await dev.listen();
  base = dev.resolvedUrls!.local[0].replace(/\/$/, '');

  await build({ logLevel: 'silent', build: { outDir: 'dist-e2e', emptyOutDir: true } });
  prod = await preview({ build: { outDir: 'dist-e2e' }, preview: { port: rnd() + 700, strictPort: false }, logLevel: 'silent' });
  prodBase = prod.resolvedUrls!.local[0].replace(/\/$/, '');

  // The same app built for GitHub Pages: served from /salah/ instead of the root.
  await build({ logLevel: 'silent', base: '/salah/', build: { outDir: 'dist-e2e-base', emptyOutDir: true } });
  pages = await preview({ base: '/salah/', build: { outDir: 'dist-e2e-base' }, preview: { port: rnd() + 1300, strictPort: false }, logLevel: 'silent' });
  pagesBase = pages.resolvedUrls!.local[0].replace(/\/$/, ''); // ends with /salah

  browser = await launch();
});

afterAll(async () => {
  await browser?.close();
  await dev?.close();
  await new Promise<void>((r) => (prod ? prod.httpServer.close(() => r()) : r()));
  await new Promise<void>((r) => (pages ? pages.httpServer.close(() => r()) : r()));
});

// -----------------------------------------------------------------------------------------------------------------
describe('first launch', () => {
  it('asks for location only after a tap, uses GPS altitude, then asks for a method once', async () => {
    const app = await openApp(browser, {
      base,
      t: '2026-11-21T10:00:00Z',
      seed: null,
      geo: { lat: LONDON.lat, lng: LONDON.lng, altitude: 35, altitudeAccuracy: 5 },
    });
    const { page } = app;
    await waitScene(page, 'Welcome');
    expect(await hasText(page, 'Salah Times', true)).toBe(true);
    expect(await hasText(page, 'Open-Meteo')).toBe(true); // the privacy line about elevation lookups
    expect(await storage(page)).toBeNull(); // nothing requested or saved before the tap

    await clickText(page, 'Allow location');
    await waitText(page, 'Choose a calculation method');
    const s1 = await storage(page);
    expect(s1.position.lat).toBeCloseTo(LONDON.lat, 3);
    expect(s1.elevation).toEqual({ m: 35, source: 'gps' }); // device altitude wins, no network lookup

    expect(await hasText(page, 'Muslim World League', true)).toBe(true); // preselected default
    await clickText(page, 'Muslim World League'); // open the dropdown
    await clickText(page, 'ISNA (North America)');
    await clickText(page, 'Continue');
    await waitScene(page, 'Main');

    const s2 = await storage(page);
    expect(s2.settings.methodId).toBe('isna');
    expect(s2.settings.methodChosen).toBe(true);
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'isna' }, true)); // no saved preference: follows the device (en-US is 12 h)
    expect(app.errors).toEqual([]);
    await app.close();
  });

  it('explains a blocked location and offers Try again', async () => {
    const app = await openApp(browser, { base, seed: null, geo: { error: 1 } });
    await waitScene(app.page, 'Welcome');
    await clickText(app.page, 'Allow location');
    await waitText(app.page, 'Location unavailable');
    expect(await hasText(app.page, 'blocked')).toBe(true);
    expect(await hasText(app.page, 'Try again', true)).toBe(true);
    expect(await hasText(app.page, 'Use last location', true)).toBe(false); // nothing cached
    expect(await storage(app.page)).toBeNull();
    await app.close();
  });

  it('offers Use last location when a position is cached', async () => {
    const app = await openApp(browser, { base, seed: seedState({}, { methodChosen: false }), geo: { error: 1 } });
    await waitScene(app.page, 'Welcome');
    await waitText(app.page, 'Choose a calculation method'); // quit half way last time: resumes at the method step
    await app.page.evaluate(() => (window as any).__game.scene.getScene('Welcome').show('error'));
    await waitText(app.page, 'Use last location');
    await clickText(app.page, 'Use last location');
    await waitText(app.page, 'Choose a calculation method');
    expect(app.errors).toEqual([]);
    await app.close();
  });

  it('a returning user goes straight to the main scene', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState() });
    await waitScene(app.page, 'Main');
    expect(await app.page.evaluate(() => (window as any).__game.scene.isActive('Welcome'))).toBe(false);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('main scene', () => {
  it('renders in WebGL on a high-DPI canvas with all seven rows, the hero, dates and moon', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), dpr: 2 });
    const { page } = app;
    await waitScene(page, 'Main');
    await sleep(800);

    expect(await page.evaluate(() => (window as any).__game.renderer.type)).toBe(2); // Phaser.WEBGL
    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      return { w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height };
    });
    expect(dims).toEqual({ w: 780, h: 1688, cssW: 390, cssH: 844 }); // drawn at device pixel ratio, shown at CSS size

    expect(await rowTimes(page)).toEqual(expectedRows());
    expect(await main(page, `s.rows.map((r) => r.name.text)`)).toEqual(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Qiyam']);
    expect(await main(page, `s.heroNext.text`)).toMatch(/^Next: Dhuhr\s+·\s+11:47$/);
    expect(await main(page, `s.heroCount.text`)).toMatch(/^01:4\d:\d\d$/);
    expect(await main(page, `s.heroCount.style.fontSize`)).toBe('44px');
    expect(await hasText(page, '1448')).toBe(true); // Hijri date
    expect(await hasText(page, 'Waxing Gibbous', true)).toBe(true);
    expect(await hasText(page, '% illuminated')).toBe(true);
    expect(await main(page, `s.rows[6].sub.text`)).toBe('last third of the night');

    // text sizes from the spec: times >= 20 px, countdown >= 40 px, body >= 16 px
    expect(Number.parseInt(await main(page, `s.rows[2].time.style.fontSize`) as string)).toBeGreaterThanOrEqual(20);

    // screen reader mirror
    const a11y = await page.evaluate(() => document.getElementById('a11y')!.textContent);
    expect(a11y).toContain('Next salah: Dhuhr at 11:47');
    expect(a11y).toContain('Qiyam 01:03');
    expect(a11y).toContain('Moon: Waxing Gibbous');

    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(30_000); // not a blank canvas
    expect(app.errors).toEqual([]);
    await app.close();
  });

  it('highlights the current period and marks the next salah', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T12:30:00Z', seed: seedState() });
    await waitScene(app.page, 'Main');
    expect(await main(app.page, `s.state.currentKey`)).toBe('dhuhr');
    expect(await main(app.page, `s.state.next.key`)).toBe('asr');
    await app.close();
  });

  it('after Isha the Fajr row and hero both show tomorrow\'s Fajr', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T22:00:00Z', seed: seedState() });
    await waitScene(app.page, 'Main');
    expect(await main(app.page, `s.state.currentKey`)).toBe('isha');
    const tomorrow = computeDay({ year: 2026, month: 11, day: 22 }, inputs, 0);
    const label = formatTime(tomorrow.fajr, false);
    expect((await rowTimes(app.page))[0]).toBe(label);
    expect(await main(app.page, `s.heroNext.text`)).toContain(label);
    expect(await main(app.page, `s.rows[0].name.text`)).toBe('Fajr');
    expect(await main(app.page, `s.rows[0].sub.visible`)).toBe(true);
    await app.close();
  });

  it('keeps ticking: the countdown changes every second', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState() });
    await waitScene(app.page, 'Main');
    const a = await main(app.page, `s.heroCount.text`);
    await sleep(2200);
    const b = await main(app.page, `s.heroCount.text`);
    expect(a).not.toBe(b);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('sky follows the time of day', () => {
  const stamps = {
    midday: '2026-11-21T11:47:00Z',
    midnight: '2026-11-21T00:00:00Z',
    dawn: '2026-11-21T07:05:00Z',
    sunset: '2026-11-21T15:50:00Z',
  } as const;

  it('midday is light, midnight is dark blue, dawn and sunset are warm at the horizon', async () => {
    const out: Record<string, { mid: number; horizon: number; stars: number; light: boolean; shot: Buffer }> = {};
    for (const [name, t] of Object.entries(stamps)) {
      const app = await openApp(browser, { base, t, seed: seedState() });
      await waitScene(app.page, 'Main');
      await sleep(900);
      const sky = (await main(app.page, `({ ...s.sky.currentSky, light: s.style.light })`)) as any;
      out[name] = { ...sky, shot: Buffer.from(await app.page.screenshot()) };
      expect(app.errors).toEqual([]);
      await app.close();
    }
    const lum = (k: string) => luminance(out[k].mid);
    expect(lum('midday')).toBeGreaterThan(lum('dawn'));
    expect(lum('midday')).toBeGreaterThan(lum('sunset'));
    expect(lum('dawn')).toBeGreaterThan(lum('midnight'));
    expect(lum('sunset')).toBeGreaterThan(lum('midnight'));
    expect(lum('midnight')).toBeLessThan(0.02);

    // midnight is dark blue (blue channel dominates), sunset horizon is orange (red high, blue low)
    const mid = out.midnight.mid;
    expect(mid & 255).toBeGreaterThan((mid >> 16) & 255);
    const sunsetHorizon = out.sunset.horizon;
    expect((sunsetHorizon >> 16) & 255).toBeGreaterThan(220);
    expect(sunsetHorizon & 255).toBeLessThan(120);
    expect(out.dawn.horizon).not.toBe(out.sunset.horizon);

    // stars only at night
    expect(out.midnight.stars).toBe(1);
    expect(out.midday.stars).toBe(0);

    // text panels flip to stay readable
    expect(out.midday.light).toBe(true);
    expect(out.midnight.light).toBe(false);

    // the four frames really are different pictures
    const shots = Object.values(out).map((o) => o.shot);
    for (let i = 0; i < shots.length; i++) {
      expect(shots[i].length).toBeGreaterThan(30_000);
      for (let j = i + 1; j < shots.length; j++) expect(shots[i].equals(shots[j])).toBe(false);
    }
  });

  it('shows the Sun by day and the Moon by night, each at its real height', async () => {
    const day = await openApp(browser, { base, t: stamps.midday, seed: seedState() });
    await waitScene(day.page, 'Main');
    await sleep(800);
    const d = (await main(day.page, `(() => ({ sunVisible: s.sky.sun.commandBuffer.length > 0, moonVisible: s.sky.moon.visible, moonAlt: s.moon.altitude }))()`)) as any;
    expect(d.sunVisible).toBe(true);
    await day.close();

    const night = await openApp(browser, { base, t: '2026-11-21T20:00:00Z', seed: seedState() });
    await waitScene(night.page, 'Main');
    await sleep(800);
    const n = (await main(night.page, `(() => ({ sunDrawn: s.sky.sun.commandBuffer.length > 0, moonVisible: s.sky.moon.visible, moonAlt: s.moon.altitude }))()`)) as any;
    expect(n.sunDrawn).toBe(false); // the Sun is hidden below the horizon
    expect(n.moonAlt).toBeGreaterThan(0);
    expect(n.moonVisible).toBe(true);
    await night.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('settings: calculation can be changed after the first choice', () => {
  it('changing method, Asr and time format recomputes the list and saves', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState() });
    const { page } = app;
    await waitScene(page, 'Main');
    expect(await rowTimes(page)).toEqual(expectedRows());

    await clickMainButton(page, 'btnGear');
    await waitText(page, 'Settings', true);

    // method -> ISNA (Fajr and Isha both move)
    await clickText(page, 'Muslim World League');
    await clickText(page, 'ISNA (North America)');
    await sleep(500);
    expect((await storage(page)).settings.methodId).toBe('isna');
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'isna' }));
    expect((await rowTimes(page))[0]).not.toBe(expectedRows()[0]);

    // method -> Umm al-Qura (Isha is 90 min after Maghrib)
    await clickText(page, 'ISNA (North America)');
    await clickText(page, 'Umm al-Qura (Makkah)');
    await sleep(500);
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'makkah' }));

    // Asr -> Hanafi (later)
    await clickText(page, 'Standard (Shafi, Maliki, Hanbali)');
    await clickText(page, 'Hanafi', true);
    await sleep(500);
    expect((await storage(page)).settings.asr).toBe('hanafi');
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'makkah', asr: 'hanafi' }));

    // 12 h clock
    await clickText(page, '12 h');
    await sleep(500);
    expect((await storage(page)).settings.hour12).toBe(true);
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'makkah', asr: 'hanafi' }, true));

    // shows elevation and its source
    expect(await hasText(page, 'Elevation: 35 m (device GPS)')).toBe(true);

    // survives a reload
    await page.reload({ waitUntil: 'load' });
    await waitScene(page, 'Main');
    const st = await storage(page);
    expect(st.settings).toMatchObject({ methodId: 'makkah', asr: 'hanafi', hour12: true, methodChosen: true });
    expect(await rowTimes(page)).toEqual(expectedRows({ methodId: 'makkah', asr: 'hanafi' }, true));
    expect(app.errors).toEqual([]);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('notifications', () => {
  it('turns on from the bell, fires once at the salah time, never twice', async () => {
    const app = await openApp(browser, {
      base,
      t: '2026-11-21T11:46:20Z',
      speed: 10, // ten virtual seconds per real second
      seed: seedState(),
      notifications: 'default',
    });
    const { page } = app;
    await waitScene(page, 'Main');
    expect(await page.evaluate(() => (window as any).__notes.length)).toBe(0);

    await clickMainButton(page, 'btnBell'); // asks permission from the tap
    await sleep(500);
    expect((await storage(page)).settings.notify.enabled).toBe(true);

    await page.waitForFunction(() => (window as any).__notes.length >= 1, { timeout: 20000 });
    const notes = (await page.evaluate(() => (window as any).__notes)) as any[];
    expect(notes[0].title).toBe('Dhuhr');
    expect(notes[0].options.body).toBe('It is time for Dhuhr, 11:47');
    expect(notes[0].options.tag).toBe('dhuhr');
    expect(notes[0].options.icon).toBe('/icons/icon-192.png');

    await sleep(4000); // ~40 virtual seconds more
    expect(await page.evaluate(() => (window as any).__notes.length)).toBe(1);
    expect((await storage(page)).sent.some((id: string) => id.startsWith('dhuhr@'))).toBe(true);
    await app.close();
  });

  it('does not fire when notifications are off', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T11:46:40Z', speed: 10, seed: seedState(), notifications: 'granted' });
    await waitScene(app.page, 'Main');
    await sleep(4500);
    expect(await app.page.evaluate(() => (window as any).__notes.length)).toBe(0);
    await app.close();
  });

  it('catches up a salah missed by less than ten minutes when the app is reopened', async () => {
    const seed = seedState({}, { notify: { enabled: true, prayers: { fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true, qiyam: false } } });
    const app = await openApp(browser, { base, t: '2026-11-21T11:52:00Z', seed, notifications: 'granted' });
    await waitScene(app.page, 'Main');
    await sleep(800);
    const notes = (await app.page.evaluate(() => (window as any).__notes)) as any[];
    expect(notes.map((n) => n.title)).toEqual(['Dhuhr']);
    await app.close();

    const old = await openApp(browser, { base, t: '2026-11-21T12:10:00Z', seed, notifications: 'granted' });
    await waitScene(old.page, 'Main');
    await sleep(800);
    expect(await old.page.evaluate(() => (window as any).__notes.length)).toBe(0); // 23 minutes late: dropped
    await old.close();
  });

  it('explains blocked notifications and stays off', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), notifications: 'denied' });
    await waitScene(app.page, 'Main');
    await clickMainButton(app.page, 'btnBell');
    await waitText(app.page, 'Notifications are blocked');
    expect((await storage(app.page)).settings.notify.enabled).toBe(false);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('qibla compass', () => {
  it('shows the bearing and distance, and a fixed dial without a sensor', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState() });
    await waitScene(app.page, 'Main');
    await clickMainButton(app.page, 'btnQibla');
    await waitText(app.page, 'Qibla 119° SE', true);
    expect(await hasText(app.page, '4,794 km to Makkah')).toBe(true);
    // fixed dial: north is at the top
    expect(await main(app.page, `s.qibla.dial.rotation`)).toBe(0);
    // the Kaaba marker sits on the rim at the Qibla bearing
    const m = (await main(app.page, `({ x: s.qibla.marker.x, y: s.qibla.marker.y })`)) as any;
    const angle = (Math.atan2(m.x, -m.y) * 180) / Math.PI;
    expect(angle).toBeCloseTo(118.99, 0);
    expect(app.errors).toEqual([]);
    await app.close();
  });

  it('follows the phone, rotates to true north, and signals when facing the Qibla', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), motionPermission: true, mobile: true });
    const { page } = app;
    await waitScene(page, 'Main');
    await clickMainButton(page, 'btnQibla');
    await waitText(page, 'Enable compass', true); // iOS style: needs a tap
    await clickText(page, 'Enable compass');
    await sleep(300);

    const bearing = (await main(page, `s.qibla.bearing`)) as number;
    const heading = async (trueHeading: number, n = 90) => {
      await page.evaluate(`(async () => {
        const { magneticDeclination } = await import('/src/services/compass.ts');
        const decl = magneticDeclination(51.5074, -0.1278);
        const alpha = 360 - ((${trueHeading} - decl + 360) % 360);
        for (let i = 0; i < ${n}; i++) {
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha, absolute: true }));
          await new Promise((r) => setTimeout(r, 16));
        }
      })()`);
      await sleep(150);
    };

    await heading(0);
    expect(await hasText(page, 'Facing the Qibla')).toBe(false);
    const r0 = (await main(page, `s.qibla.dial.rotation`)) as number;
    expect(Math.abs(r0)).toBeLessThan(0.05); // facing north: north is at the top

    await heading(bearing);
    await waitText(page, 'Facing the Qibla');
    const r1 = (await main(page, `s.qibla.dial.rotation`)) as number;
    expect((((-r1 * 180) / Math.PI) % 360 + 360) % 360).toBeCloseTo(bearing, 0); // dial turned by the heading

    await heading(bearing + 30);
    expect(await hasText(page, 'Facing the Qibla')).toBe(false);
    expect(app.errors).toEqual([]);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('responsive layouts', () => {
  const sizes: [number, number, number][] = [
    [320, 568, 2],
    [390, 844, 3],
    [768, 1024, 2],
    [1280, 720, 1],
    [1920, 1080, 1],
  ];
  for (const [w, h, dpr] of sizes) {
    it(`${w}x${h} @${dpr}x: fits, nothing overlaps, canvas is sized for the device`, async () => {
      const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), w, h, dpr });
      const { page } = app;
      await waitScene(page, 'Main');
      await sleep(600);
      const info = (await main(
        page,
        `(() => ({
          canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height],
          mode: s.L.mode,
          rowsInside: s.rows.every((r) => r.box.y >= s.L.list.y && r.box.y + s.L.rowH <= s.L.list.y + s.L.list.h + 0.5),
          heroInside: s.heroCount.y >= s.L.hero.y && s.heroCount.y + s.heroCount.height <= s.L.hero.y + s.L.hero.h + 1,
          ringClear: s.heroNext.x + s.heroNext.width <= s.ring.x - 42 + 1,
          countClear: s.heroCount.x + s.heroCount.width <= s.ring.x - 42 + 1,
          timeFonts: s.rows.map((r) => parseInt(r.time.style.fontSize)),
          countdownFont: parseInt(s.heroCount.style.fontSize),
          nameFont: parseInt(s.rows[0].name.style.fontSize),
          button: s.L.button,
        }))()`,
      )) as any;
      expect(info.canvas).toEqual([w * dpr, h * dpr]);
      expect(info.rowsInside).toBe(true);
      expect(info.heroInside).toBe(true);
      expect(info.ringClear).toBe(true);
      expect(info.countClear).toBe(true);
      expect(Math.min(...info.timeFonts)).toBeGreaterThanOrEqual(20);
      expect(info.countdownFont).toBeGreaterThanOrEqual(40);
      expect(info.nameFont).toBeGreaterThanOrEqual(16);
      expect(info.button).toBeGreaterThanOrEqual(44);
      expect(info.mode).toBe(w >= 760 && w > h * 1.1 ? 'landscape' : 'portrait');
      expect((await page.screenshot()).length).toBeGreaterThan(20_000);
      expect(app.errors).toEqual([]);
      await app.close();
    });
  }

  it('re-lays out on resize and rotation, and keeps open sheets usable', async () => {
    const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), w: 390, h: 844, dpr: 2 });
    const { page } = app;
    await waitScene(page, 'Main');
    expect(await main(page, `s.L.mode`)).toBe('portrait');

    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
    await page.waitForFunction(() => (window as any).__game.scale.width === 1688, { timeout: 5000 });
    await sleep(500);
    expect(await main(page, `s.L.mode`)).toBe('landscape'); // list moves to the right column
    expect(await main(page, `s.L.list.x > s.L.hero.x + s.L.hero.w - 1`)).toBe(true);
    expect(await main(page, `s.rows.every((r) => r.box.y + s.L.rowH <= s.L.H)`)).toBe(true);

    await clickMainButton(page, 'btnGear'); // short window: the settings sheet must still fit
    await waitText(page, 'Settings', true);
    expect(await main(page, SHEET_FITS('settings'))).toBe(true);
    expect(app.errors).toEqual([]);
    await app.close();
  });

  const SHEET_SIZES: [number, number][] = [
    [320, 568],
    [390, 844],
    [844, 390],
    [640, 360],
    [568, 320],
    [1280, 720],
  ];
  for (const [w, h] of SHEET_SIZES) {
    it(`settings and Qibla sheets fit inside a ${w}x${h} window`, async () => {
      for (const which of ['settings', 'qibla'] as const) {
        const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), w, h, dpr: 1, mobile: true });
        await waitScene(app.page, 'Main');
        await clickMainButton(app.page, which === 'settings' ? 'btnGear' : 'btnQibla');
        await waitText(app.page, which === 'settings' ? 'Settings' : 'Qibla', which === 'settings');
        await sleep(400);
        expect(await main(app.page, SHEET_FITS(which)), `${which} at ${w}x${h}`).toBe(true);
        expect(app.errors).toEqual([]);
        await app.close();
      }
    });
  }

  it('reduced motion stops drifting clouds', async () => {
    const run = async (reduced: boolean) => {
      const app = await openApp(browser, { base, t: '2026-11-21T10:00:00Z', seed: seedState(), reducedMotion: reduced });
      await waitScene(app.page, 'Main');
      const a = (await main(app.page, `s.sky.clouds[0].x`)) as number;
      await sleep(1500);
      const b = (await main(app.page, `s.sky.clouds[0].x`)) as number;
      await app.close();
      return b - a;
    };
    expect(await run(false)).toBeGreaterThan(1);
    expect(await run(true)).toBe(0);
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('installable PWA (production build)', () => {
  it('serves a valid manifest with icons, registers a service worker and handles notification taps', async () => {
    const app = await openApp(browser, { base: prodBase, t: '2026-11-21T10:00:00Z', seed: seedState() });
    const { page } = app;
    await waitScene(page, 'Main');

    const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
    expect(manifestHref).toBeTruthy();
    const manifest = (await page.evaluate(async (h: string) => (await fetch(h)).json(), manifestHref!)) as any;
    expect(manifest).toMatchObject({ name: 'Salah Times', short_name: 'Salah', display: 'standalone', start_url: '/', theme_color: '#0b1530' });
    const sizes = manifest.icons.map((i: any) => `${i.sizes}${i.purpose === 'maskable' ? ':maskable' : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const ok = await page.evaluate(async (u: string) => (await fetch(u)).ok, `/${icon.src}`);
      expect(ok, icon.src).toBe(true);
    }

    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), { timeout: 15000 });
    const sw = await page.evaluate(async () => (await (await fetch('/sw.js')).text()));
    expect(sw).toContain('notification-sw.js'); // notification taps focus or open the app
    const noteSw = await page.evaluate(async () => (await (await fetch('/notification-sw.js')).text()));
    expect(noteSw).toContain('notificationclick');
    await app.close();
  });

  it('starts offline after the first visit', async () => {
    const app = await openApp(browser, { base: prodBase, t: '2026-11-21T10:00:00Z', seed: seedState() });
    const { page } = app;
    await waitScene(page, 'Main');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await sleep(2500); // let the precache finish
    await page.reload({ waitUntil: 'load' }); // now controlled by the service worker
    await waitScene(page, 'Main');
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load' });
    await waitScene(page, 'Main');
    expect(await rowTimes(page)).toEqual(expectedRows());
    expect((await page.screenshot()).length).toBeGreaterThan(30_000);
    await app.close();
  });

  it('the compass works in the production bundle: real magnetic declination and live heading', async () => {
    const seattle = { lat: 47.6062, lng: -122.3321 };
    const app = await openApp(browser, {
      base: prodBase,
      t: '2026-11-21T20:00:00Z',
      tz: 'America/Los_Angeles',
      seed: seedState({ position: { ...seattle, ts: 1 } }),
      geo: { lat: seattle.lat, lng: seattle.lng, altitude: 35, altitudeAccuracy: 5 }, // the background refresh must agree
      motionPermission: true,
      mobile: true,
    });
    const { page } = app;
    await waitScene(page, 'Main');
    // Seattle's declination is about +15 degrees east: proves the World Magnetic Model survived bundling
    const decl = (await page.evaluate(`window.__salah.magneticDeclination(${seattle.lat}, ${seattle.lng})`)) as number;
    expect(decl).toBeGreaterThan(12);
    expect(decl).toBeLessThan(18);

    await clickMainButton(page, 'btnQibla');
    await clickText(page, 'Enable compass');
    const bearing = (await main(page, `s.qibla.bearing`)) as number;
    const send = async (trueHeading: number) => {
      await page.evaluate(`(async () => {
        const alpha = 360 - ((${trueHeading} - ${decl} + 360) % 360);
        for (let i = 0; i < 90; i++) {
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha, absolute: true }));
          await new Promise((r) => setTimeout(r, 16));
        }
      })()`);
      await sleep(150);
    };
    await send(bearing); // a phone whose TRUE heading is the Qibla bearing
    await waitText(page, 'Facing the Qibla');
    // had the declination been ignored the dial would be off by about 15 degrees and this would not be aligned
    expect(await hasText(page, 'Qibla 3')).toBe(false);
    await send(bearing + 15);
    expect(await hasText(page, 'Facing the Qibla')).toBe(false);
    expect(app.errors).toEqual([]);
    await app.close();
  });

  it('shows an in-canvas Install button when the browser offers installation', async () => {
    const app = await openApp(browser, { base: prodBase, t: '2026-11-21T10:00:00Z', seed: seedState() });
    const { page } = app;
    await waitScene(page, 'Main');
    expect(await main(page, `s.btnInstall.zone.visible`)).toBe(false);

    await page.evaluate(() => {
      const e: any = new Event('beforeinstallprompt', { cancelable: true });
      (window as any).__prompted = 0;
      e.prompt = async () => ((window as any).__prompted += 1);
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await sleep(300);
    expect(await main(page, `s.btnInstall.zone.visible`)).toBe(true);
    await clickMainButton(page, 'btnInstall');
    await sleep(300);
    expect(await page.evaluate(() => (window as any).__prompted)).toBe(1);
    expect(await main(page, `s.btnInstall.zone.visible`)).toBe(false); // hides once installed
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('location refresh and elevation', () => {
  const MAKKAH = { lat: 21.4225, lng: 39.8262, altitude: null, altitudeAccuracy: null }; // no device altitude

  async function refreshInMakkah(initial: 'elevation' | 'offline') {
    const lookups: string[] = [];
    let answer = initial;
    const app = await openApp(browser, {
      base,
      t: '2026-11-21T10:00:00Z',
      seed: seedState(),
      geo: MAKKAH,
      // the elevation service is stubbed so the test is deterministic and works offline
      onPage: async (p) => {
        await p.setRequestInterception(true);
        p.on('request', (req) => {
          if (!req.url().startsWith('https://api.open-meteo.com/')) return void req.continue();
          lookups.push(req.url());
          if (answer === 'offline') return void req.abort('internetdisconnected');
          void req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elevation":[305]}' });
        });
      },
    });
    await waitScene(app.page, 'Main');
    await clickMainButton(app.page, 'btnGear');
    await clickText(app.page, 'Refresh location');
    await app.page.waitForFunction(() => Math.abs(JSON.parse(localStorage.getItem('salah.state.v1')!).position.lat - 21.4225) < 0.01, { timeout: 20000 });
    await sleep(300);
    return { app, lookups, setAnswer: (a: 'elevation' | 'offline') => (answer = a) };
  }

  it('moves to the new place, looks up elevation with coordinates rounded to three decimals, and caches it', async () => {
    const { app, lookups } = await refreshInMakkah('elevation');
    const st = await storage(app.page);
    expect(st.position.lat).toBeCloseTo(21.4225, 3);
    expect(st.elevation).toEqual({ m: 305, source: 'lookup' });
    expect(st.elevationCache).toEqual({ '21.423,39.826': 305 });
    expect(lookups).toEqual(['https://api.open-meteo.com/v1/elevation?latitude=21.423&longitude=39.826']); // nothing more precise leaves the device
    expect(await main(app.page, `s.sky.lat`)).toBeCloseTo(21.4225, 3); // the sky now follows the new place
    expect(app.errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([]);
    await app.close();
  });

  it('falls back to 0 m when offline, and retries the lookup once back online', async () => {
    const { app, lookups, setAnswer } = await refreshInMakkah('offline');
    const st = await storage(app.page);
    expect(st.position.lat).toBeCloseTo(21.4225, 3);
    expect(st.elevation).toEqual({ m: 0, source: 'default' });
    expect(st.elevationCache).toEqual({});
    expect(lookups.length).toBeGreaterThanOrEqual(1);

    // back online: the app tries again, keeps the position and stores the answer
    setAnswer('elevation');
    await app.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await app.page.waitForFunction(() => JSON.parse(localStorage.getItem('salah.state.v1')!).elevation.source === 'lookup', { timeout: 10000 });
    const after = await storage(app.page);
    expect(after.elevation).toEqual({ m: 305, source: 'lookup' });
    expect(after.position.lat).toBeCloseTo(21.4225, 3);
    await app.close();
  });
});

// -----------------------------------------------------------------------------------------------------------------
describe('GitHub Pages: served from the /salah/ sub-path', () => {
  it('stays inside /salah/, has the right manifest and service worker scope, and works offline', async () => {
    const seed = seedState({}, { notify: { enabled: true, prayers: { fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true, qiyam: false } } });
    const requests: { url: string; status: number }[] = [];
    const app = await openApp(browser, {
      base: pagesBase,
      t: '2026-11-21T11:47:30Z', // 30 seconds after Dhuhr: a notification is due at once
      seed,
      notifications: 'granted',
      onPage: (p) => p.on('response', (r) => requests.push({ url: r.url(), status: r.status() })),
    });
    const { page } = app;
    await waitScene(page, 'Main');
    await sleep(1500);

    const origin = new URL(pagesBase).origin;
    const own = requests.filter((r) => r.url.startsWith(origin));
    expect(own.length).toBeGreaterThan(5);
    expect(own.filter((r) => !new URL(r.url).pathname.startsWith('/salah/')), 'requests outside /salah/').toEqual([]);
    expect(own.filter((r) => r.status >= 400), 'failed requests').toEqual([]);
    expect(await rowTimes(page)).toEqual(expectedRows());

    // manifest: installable under the sub-path
    const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
    expect(manifestHref).toBe('/salah/manifest.webmanifest');
    const manifest = (await page.evaluate(async (h: string) => (await fetch(h)).json(), manifestHref!)) as any;
    expect(manifest.start_url).toBe('/salah/');
    expect(manifest.scope).toBe('/salah/');
    for (const icon of manifest.icons) {
      const ok = await page.evaluate(async (u: string) => (await fetch(u)).ok, new URL(icon.src, `${origin}/salah/manifest.webmanifest`).pathname);
      expect(ok, icon.src).toBe(true);
    }
    expect(await page.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute('href'))).toBe('/salah/icons/icon.svg');

    // service worker scope covers the app but nothing outside it
    const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
    expect(scope).toBe(`${origin}/salah/`);

    // the notification that was due carries sub-path-safe URLs
    const notes = (await page.evaluate(() => (window as any).__notes)) as any[];
    expect(notes).toHaveLength(1);
    expect(notes[0].options.icon).toBe('/salah/icons/icon-192.png');
    expect(notes[0].options.data.url).toBe('/salah/');

    // offline start
    await sleep(2000);
    await page.reload({ waitUntil: 'load' });
    await waitScene(page, 'Main');
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load' });
    await waitScene(page, 'Main');
    expect(await rowTimes(page)).toEqual(expectedRows());
    expect(app.errors).toEqual([]);
    await app.close();
  });
});
