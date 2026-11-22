/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer-core';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

export const chromePath = () => {
  const p = CHROME_CANDIDATES.find((c) => existsSync(c));
  if (!p) throw new Error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
  return p;
};

export async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--lang=en-US', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
}

export const LONDON = { lat: 51.5074, lng: -0.1278 };

export function seedState(over: Record<string, any> = {}, settings: Record<string, any> = {}) {
  return {
    v: 1,
    position: { lat: LONDON.lat, lng: LONDON.lng, ts: 1 },
    elevation: { m: 35, source: 'gps' },
    elevationCache: {},
    settings: {
      methodId: 'mwl',
      asr: 'standard',
      hour12: false,
      methodChosen: true,
      notify: { enabled: false, prayers: { fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true, qiyam: false } },
      ...settings,
    },
    sent: [],
    iosHintDismissed: true,
    ...over,
  };
}

export interface OpenOpts {
  base: string;
  /** ?t= instant (ISO) and optional ?speed= */
  t?: string;
  speed?: number;
  w?: number;
  h?: number;
  dpr?: number;
  tz?: string;
  seed?: Record<string, any> | null;
  /** Stub for navigator.geolocation. `error` makes it fail with that PositionError code. */
  geo?: { lat: number; lng: number; altitude?: number | null; altitudeAccuracy?: number | null } | { error: 1 | 2 | 3 };
  notifications?: 'default' | 'granted' | 'denied';
  reducedMotion?: boolean;
  /** pretend to be an iOS-style device that needs a tap to allow motion sensors */
  motionPermission?: boolean;
  mobile?: boolean;
  /** Called with the page before it navigates, e.g. to attach listeners. */
  onPage?: (page: Page) => void | Promise<void>;
}

export interface App {
  page: Page;
  ctx: BrowserContext;
  errors: string[];
  close(): Promise<void>;
}

export async function openApp(browser: Browser, o: OpenOpts): Promise<App> {
  const ctx = await browser.createBrowserContext();
  const origin = new URL(o.base).origin;
  await ctx.overridePermissions(origin, ['geolocation']);
  const page = await ctx.newPage();
  await page.setViewport({ width: o.w ?? 390, height: o.h ?? 844, deviceScaleFactor: o.dpr ?? 2, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  await page.emulateTimezone(o.tz ?? 'Europe/London');
  if (o.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  await page.evaluateOnNewDocument(
    (opts: any) => {
      if (opts.seed && !localStorage.getItem('salah.state.v1')) localStorage.setItem('salah.state.v1', JSON.stringify(opts.seed));
      const w = window as any;
      w.__notes = [];
      if (opts.geo) {
        navigator.geolocation.getCurrentPosition = (ok: any, err: any) => {
          if (opts.geo.error) return setTimeout(() => err({ code: opts.geo.error }), 50);
          setTimeout(
            () =>
              ok({
                coords: {
                  latitude: opts.geo.lat,
                  longitude: opts.geo.lng,
                  accuracy: 5,
                  altitude: opts.geo.altitude ?? null,
                  altitudeAccuracy: opts.geo.altitudeAccuracy ?? null,
                },
              }),
            50,
          );
        };
      }
      if (opts.notifications) {
        class FakeNotification {
          static permission = opts.notifications;
          static async requestPermission() {
            FakeNotification.permission = 'granted';
            return 'granted';
          }
          constructor(title: string, options: any) {
            w.__notes.push({ title, options });
          }
        }
        w.Notification = FakeNotification;
        // dev server has no service worker; the app falls back to `new Notification`
      }
      if (opts.motionPermission) {
        (window as any).DeviceOrientationEvent.requestPermission = async () => 'granted';
      }
    },
    { seed: o.seed === undefined ? null : o.seed, geo: o.geo ?? { lat: 51.5074, lng: -0.1278, altitude: 35, altitudeAccuracy: 5 }, notifications: o.notifications ?? null, motionPermission: !!o.motionPermission },
  );

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String((e as Error).message ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await o.onPage?.(page);
  const qs = new URLSearchParams();
  if (o.t) qs.set('t', o.t);
  if (o.speed) qs.set('speed', String(o.speed));
  await page.goto(`${o.base}/${qs.size ? `?${qs}` : ''}`, { waitUntil: 'load' });
  return { page, ctx, errors, close: () => ctx.close() };
}

export async function waitScene(page: Page, key: string, timeout = 15000) {
  await page.waitForFunction((k) => (window as any).__game?.scene?.isActive(k), { timeout }, key);
  await sleep(500);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** All Text objects (recursing into containers) across active scenes. */
const FIND = `
  (needle, exact, minAlpha = 0.05) => {
    const out = [];
    const eff = (o) => { let a = 1; for (let n = o; n; n = n.parentContainer) a *= n.alpha; return a; };
    const walk = (list, scene) => { for (const o of list) {
      if (o.type === 'Text' && o.visible !== false && eff(o) > minAlpha && (exact ? o.text === needle : o.text.includes(needle))) out.push(o);
      if (o.list) walk(o.list, scene);
    } };
    for (const s of window.__game.scene.getScenes(true)) walk(s.children.list, s);
    return out;
  }`;

export async function textPositions(page: Page, needle: string, exact = false, minAlpha = 0.05): Promise<{ x: number; y: number; text: string }[]> {
  return page.evaluate(`(${FIND})(${JSON.stringify(needle)}, ${exact}, ${minAlpha}).map((t) => { const b = t.getBounds(); return { x: b.centerX, y: b.centerY, text: t.text }; })`) as any;
}

export async function hasText(page: Page, needle: string, exact = false) {
  return (await textPositions(page, needle, exact)).length > 0;
}

export async function clickText(page: Page, needle: string, exact = true, index = 0) {
  // wait until it is fully faded in: a fading sheet is not tappable yet (and a person would wait too)
  await page.waitForFunction(`(${FIND})(${JSON.stringify(needle)}, ${exact}, 0.97).length > ${index}`, { timeout: 8000 });
  const hits = await textPositions(page, needle, exact, 0.97);
  const h = hits[index];
  await page.mouse.click(h.x, h.y);
  await sleep(350);
}

/** Click the centre of a field holding a Zone/Graphics, e.g. 'btnGear' on the Main scene. */
export async function clickMainButton(page: Page, field: 'btnGear' | 'btnBell' | 'btnQibla' | 'btnInstall') {
  const p = (await page.evaluate(
    `(() => { const s = window.__game.scene.getScene('Main'); const z = s.${field}.zone; return { x: z.x, y: z.y, visible: z.visible }; })()`,
  )) as { x: number; y: number; visible: boolean };
  await page.mouse.click(p.x, p.y);
  await sleep(450);
}

export const main = (page: Page, expr: string) => page.evaluate(`(() => { const s = window.__game.scene.getScene('Main'); return (${expr}); })()`);

export const storage = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('salah.state.v1') || 'null')) as Promise<any>;

export const rowTimes = (page: Page) =>
  main(page, `s.rows.map((r, i) => r.time.text)`) as Promise<string[]>;

export async function waitText(page: Page, needle: string, exact = false, timeout = 10000) {
  await page.waitForFunction(`(${FIND})(${JSON.stringify(needle)}, ${exact}).length > 0`, { timeout });
}
