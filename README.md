# Salah Times

> Created using Anthropic Claude. Keep this line on internal versions until a human has reviewed and verified the content.

An installable single-page app that shows salah times for your exact location and elevation, a Qibla compass, the phase of the moon, and a sky that follows the real Sun and Moon. Everything you see is drawn in one [Phaser](https://phaser.io) canvas. See [`SPEC.md`](SPEC.md) for the full product and technical spec.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/ (with the service worker and manifest)
npm run preview    # serve the production build
```

Location, the service worker and notifications need HTTPS in production (`localhost` is exempt).

## Test it

```bash
npm run typecheck  # TypeScript
npm test           # unit tests (Vitest): calculation, Qibla, moon, sky, layout, storage, notifications
npm run e2e        # end-to-end tests in headless Chrome (Puppeteer), incl. the production PWA build
npm run check      # all three
```

The e2e tests use the Chrome you already have (set `CHROME_PATH` if it is not in a standard place) and start their own servers.

Salah times are checked against the independent [`adhan`](https://github.com/batoulapps/adhan-js) library (dev dependency only) to within one minute, across 13 place/method/Asr combinations. Elevation, Qiyam, polar and high-latitude cases are tested directly.

## Debugging time

Add `?t=2026-06-21T12:00:00Z` to start the app at a given instant, and `&speed=600` to run 600 virtual seconds per real second. Watch a whole day of sky, list highlighting and notifications in a few minutes.

## Layout

```
src/core       pure logic, no browser or Phaser: prayer times, methods, schedule, Qibla, moon, sky palette, layout
src/services   location and elevation, storage, notifications, compass, install
src/scenes     Boot, Welcome (location and first method choice), Main
src/ui         Sky, widgets, Settings and Qibla sheets
tests          unit tests          e2e   end-to-end tests
```

## Known limits

- Notifications are client-side only: they arrive while the app is open or kept alive in the background, not after the browser or OS has fully closed it. On iPhone and iPad they work only once the app is added to the Home Screen.
- Compass headings on real phones (especially which north iOS reports) and Lighthouse installability still need a check on real devices.
