# Salah Times: Product and Technical Spec

> Created using Anthropic Claude. Keep this line on internal versions until a human has reviewed and verified the content.

## 1. Overview

A single-page, installable web app (PWA) that shows today's salah times for the user's current location and elevation. The whole interface is drawn in one Phaser canvas: an animated sky that mirrors the real position of the sun, the moon in its current phase, a readable list of salah times with a countdown to the next one, and a Qibla compass. If the user turns notifications on, the app notifies them when each salah time begins.

There is no backend. The app is static files and runs offline after the first visit.

## 2. Goals and non-goals

**Goals**

- Accurate salah times from latitude, longitude, elevation, date and a user-chosen calculation method.
- A sky whose colour follows the actual sun altitude at the user's location.
- The current moon phase, drawn correctly.
- A compass showing north, south and the Qibla direction.
- Notifications at each salah time while the app is alive.
- Installable from the browser, usable offline.
- Text that stays readable over every sky colour and on every screen size.

**Non-goals for v1**

- Server-sent push (notifications when the app is fully closed).
- Monthly timetable, multiple saved locations.
- Manual city search. The app uses device location only.
- Translations. v1 is English with transliterated salah names.

## 3. User flows

### 3.1 First launch

1. A welcome scene explains why location is needed and shows an **Allow location** button.
2. Tapping it calls the browser geolocation prompt. The request is only ever made from a tap, never on page load.
3. On success, the app resolves elevation (section 5.2) and shows a **Choose calculation method** step: the method dropdown (section 5.3) and the Asr dropdown, with Muslim World League and Standard preselected, a one-line note that both can be changed later in settings, and a **Continue** button.
4. On Continue, the choice is saved, the app computes times and fades into the main scene. This step is shown only once.
5. On denial or error, the scene explains how to re-enable location in the browser and offers **Try again**. If a previous location is cached, it also offers **Use last location**.

### 3.2 Returning launch

The app renders at once from the cached location, elevation and settings, then refreshes location in the background. Times are recomputed only if the position moved more than 2 km or the elevation changed more than 50 m.

### 3.3 Main scene

From top to bottom:

- Date line: Gregorian date, Hijri date, timezone name and coordinates rounded to two decimals.
- Hero: the current local time, the name of the next salah and a live countdown to it.
- Salah list: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha and Qiyam with times. The current period is highlighted and passed ones are dimmed. Sunrise is shown but is not a salah and never notifies. Qiyam is the last row, after Isha, and marks the start of the last third of the night (section 5.4). It is styled as an optional night prayer, slightly apart from the five.
- Moon: the moon disc in the sky, with phase name and illumination percentage beside it.
- Controls: notification bell toggle, Qibla compass button (section 8), settings gear, and an install button when installation is available.

### 3.4 Settings panel (in canvas)

- **Calculation method**: dropdown (section 5.3).
- **Asr**: dropdown, Standard (Shafi, Maliki, Hanbali) or Hanafi.
- **Notifications**: on/off, plus a toggle for each salah and for Qiyam.
- **Time format**: 12 h or 24 h, defaulting to the device locale.
- **Elevation**: read-only value and its source (GPS, lookup, or default 0 m).
- **Refresh location** button.

The method and Asr rule chosen at first launch can be changed here at any time, as often as the user likes. A change is saved, recomputes the times, re-animates the list and reschedules notifications immediately.

## 4. Platform and stack

| Concern | Choice |
|---|---|
| Language and build | TypeScript, Vite |
| Rendering | Phaser, latest stable major, pinned at scaffold time |
| PWA | `vite-plugin-pwa` (Workbox) for manifest and service worker |
| Sun altitude and moon data | `suncalc` |
| Salah time calculation | Own pure TypeScript module (section 5), because common libraries do not take elevation |
| Qibla bearing | Own pure TypeScript module (section 8) |
| Compass heading | Device orientation events, with a World Magnetic Model library for declination |
| Tests | Vitest for the calculation modules |
| Persistence | `localStorage` |
| Hosting | Any static host over HTTPS (required for geolocation, service worker and notifications) |

## 5. Salah time calculation

### 5.1 Inputs and outputs

Inputs: latitude, longitude, elevation in metres, date, calculation method, Asr rule, high-latitude rule.
Outputs: `Date` objects for Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha and Qiyam, displayed in the device timezone.

The module is pure (no Phaser, no browser APIs) so it can be unit tested.

### 5.2 Location and elevation

- Position: `navigator.geolocation.getCurrentPosition` with high accuracy enabled and a 15 s timeout.
- Elevation, in order of preference:
  1. `coords.altitude` from the device, used only when `altitudeAccuracy` is present and 50 m or better.
  2. The Open-Meteo elevation API: `GET https://api.open-meteo.com/v1/elevation?latitude=..&longitude=..`. Coordinates are rounded to three decimals before sending. The result is cached against the rounded coordinates.
  3. 0 m when both are unavailable (for example offline on first run).
- Negative elevations are treated as 0.
- The lookup sends approximate coordinates to a third party. The welcome scene says so in one line.

### 5.3 Methods

The dropdown lists these methods. The user picks one at first launch (Muslim World League is preselected) and can change it later in settings.

| Method | Fajr angle | Isha |
|---|---|---|
| Muslim World League | 18° | 17° |
| ISNA (North America) | 15° | 15° |
| Egyptian General Authority | 19.5° | 17.5° |
| Umm al-Qura (Makkah) | 18.5° | 90 min after Maghrib |
| University of Karachi | 18° | 18° |
| Dubai | 18.2° | 18.2° |
| Kuwait | 18° | 17.5° |
| Qatar | 18° | 90 min after Maghrib |
| Singapore (MUIS) | 20° | 18° |
| Diyanet (Turkey) | 18° | 17° |
| Tehran | 17.7° | 14°, Maghrib at 4.5° |
| Jafari | 16° | 14°, Maghrib at 4° |

Methods are data, one entry each, so adding one is a one-line change. These parameters must be checked against each authority's published values during implementation.

### 5.4 Rules

- **Dhuhr**: solar noon plus one minute.
- **Sunrise and Maghrib**: the sun's centre at `-(0.833° + 0.0347° × √elevation_m)` below the horizon. The first term covers refraction and the solar radius. The second is the dip of the horizon for an observer above the surrounding terrain, and is how elevation enters the calculation.
- **Fajr and Isha**: the method's twilight angle, or a fixed interval after Maghrib where the method says so. Elevation does not change these.
- **Asr**: when an object's shadow equals its length (Standard) or twice its length (Hanafi), plus its noon shadow.
- **High latitudes**: when the sun never reaches the Fajr or Isha angle, use the angle-based rule (a portion of the night equal to angle/60). The portion is measured from sunset to sunrise.
- **Qiyam**: the start of the last third of the night, where the night runs from Maghrib to the next day's Fajr: `Qiyam = Maghrib + 2/3 × (next Fajr − Maghrib)`. It changes with the method, since Fajr does. It usually falls after midnight, so the row shows the Qiyam of the current night: from midnight until Fajr it is computed from yesterday's Maghrib and today's Fajr, and after Fajr from today's Maghrib and tomorrow's Fajr.
- **Rounding**: times are rounded to the nearest minute for display and for notifications.

### 5.5 Recalculation

Times are recomputed at local midnight, on app resume, on a settings change and on a significant location change. After Isha, the hero counts down to tomorrow's Fajr. Qiyam does not take over the hero. When Qiyam begins, its row becomes the highlighted one until Fajr.

## 6. Sky and time of day

The sky is driven by the sun's altitude at the user's location, not by the clock, so it stays correct in every season and latitude.

### 6.1 Sky colour

| Sun altitude | Look |
|---|---|
| Below -18° | Night: deep navy to near-black blue, full stars |
| -18° to -6° | Deep twilight: dark blue lifting to indigo, stars fading |
| -6° to 0°, morning | Dawn: pale blue with a soft pink and peach band on the eastern horizon |
| -6° to 0°, evening | Dusk: orange and rose at the horizon rising into purple |
| 0° to 6°, morning | Sunrise: light blue with warm gold low down |
| 0° to 6°, evening | Sunset: strong orange and amber horizon, the colour of the setting sun |
| 6° to 30° | Day: clear light blue |
| Above 30° | Midday: the lightest, brightest blue |

- Morning and evening are told apart by whether the time is before or after solar noon.
- Colours are interpolated continuously between these keyframes. There are no visible steps.
- The sky is a vertical gradient with at least three stops (zenith, middle, horizon).
- Stars fade in below -6° and twinkle. A few slow clouds drift by day.
- A simple silhouetted horizon at the bottom anchors the scene.

### 6.2 Sun and Moon positions

The background shows where the Sun and the Moon really are for the user's location and the current time. By day the Sun is the main body in the sky. By night the Moon is.

- **Source**: altitude and azimuth of both bodies from `suncalc`, refreshed every minute and tweened between updates so the movement is smooth.
- **Mapping to the canvas**:
  - Height: altitude 0° is the horizon line and 90° is the top of the sky area. Height on screen is proportional to altitude.
  - Left to right: the view faces the horizon the Sun crosses at noon, which is south in the northern hemisphere and north in the southern. Azimuth within 135° either side of that direction maps across the full width, and anything beyond is held at the edge. In the northern hemisphere both bodies therefore rise on the left and set on the right, and in the southern hemisphere the reverse.
- **Day (Sun above the horizon)**: the Sun disc is shown at its position with a glow, white-yellow when high and warming to orange near the horizon. If the Moon is also up, it is drawn pale and without a glow, as it looks in a daytime sky.
- **Night (Sun below the horizon)**: the Sun is hidden. The Moon is drawn bright at its position, in its current phase (section 7), with a soft glow and the stars around it.
- **Rising and setting**: each body slides up from behind the horizon silhouette and sinks behind it. During twilight a warm glow stays on the horizon at the point where the Sun rose or will rise, or set.
- **Layering**: the Sun and Moon are drawn behind the text panels. Each layout keeps a clear band of sky so that the body is normally visible, and the panels are translucent so it still shows through when it passes behind one.

## 7. Moon

- Phase fraction, illuminated fraction and the angle of the bright limb come from `suncalc`.
- The disc is drawn with Phaser graphics: a lit circle with the terminator drawn as a half-ellipse, rotated to the correct limb angle. No image per phase.
- Label: phase name (New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, Waning Gibbous, Last Quarter, Waning Crescent) and illumination percentage.
- When the moon is above the horizon it sits in the sky at its real position (section 6.2), bright at night and pale by day. When it is below, it is shown in a small fixed badge so the phase is always visible.

## 8. Qibla compass

A compass, drawn in the canvas, that shows north and south and marks the direction of the Qibla with a Kaaba icon.

### 8.1 Where it lives

- A compass button in the main scene controls opens the Qibla view as a full-height sheet over the sky. A close button or a swipe down returns to the main scene.
- The main scene itself does not show a live compass, so motion sensors run only while the Qibla view is open.

### 8.2 Qibla bearing

- The Kaaba is at 21.4225° N, 39.8262° E.
- The bearing is the initial great-circle bearing from the user's position, measured clockwise from true north:
  `bearing = atan2(sin Δλ, cos φ₁ · tan φ₂ − sin φ₁ · cos Δλ)`, where φ₁ is the user's latitude, φ₂ the Kaaba's latitude and Δλ the Kaaba's longitude minus the user's.
- The great-circle distance to Makkah is computed alongside it (haversine).
- Both live in a pure module with unit tests, and are recomputed whenever the location changes. No network is needed.

### 8.3 The dial

- A round dial with tick marks every 10° and the four cardinal letters. **N** is emphasised (red, with a pointer) and **S** sits opposite it. E and W are shown smaller.
- The **Kaaba marker**: a small black cube with a gold band, drawn with Phaser graphics, sitting on the rim of the dial at the Qibla bearing. A thin line runs from the centre of the dial to it.
- A fixed pointer at the top of the screen marks the direction the phone is facing.
- Below the dial: the bearing as text ("Qibla 58° NE") and the distance to Makkah in km.
- The dial uses the same contrast rules as the rest of the app (section 11.2).

### 8.4 Live mode (devices with a compass sensor)

- The dial rotates so that N on the dial points to real north. The Kaaba marker moves with it, so the user turns until the cube is under the top pointer.
- When the phone faces the Qibla within 3°, the cube glows, the pointer line turns gold and the text reads "Facing the Qibla". Where the browser supports it, the phone gives one short vibration.
- Heading sources:
  - iOS Safari: `DeviceOrientationEvent.requestPermission()`, called from a tap on an **Enable compass** button, then `webkitCompassHeading`.
  - Android Chrome and other browsers: the `deviceorientationabsolute` event, with the heading derived from `alpha` and corrected for the current screen rotation.
- The device heading is magnetic. It is converted to true north with the local magnetic declination from a bundled World Magnetic Model library (for example `geomagnetism`), so the dial and the Qibla bearing use the same north. Which north each platform reports must be confirmed on real devices during implementation.
- Readings are smoothed with a low-pass filter that handles the 359° to 0° wrap, so the dial turns steadily without lagging.
- Hints shown in the view: "Hold your phone flat", and "Move your phone in a figure of eight to calibrate" when the sensor reports low accuracy. A standing note says that metal and magnets nearby can throw the compass off.

### 8.5 Static mode (no sensor, or permission denied)

- Used on desktops, on devices without a magnetometer and when motion permission is refused.
- The dial is fixed with N at the top and the Kaaba marker at the Qibla bearing. The text gives the bearing and explains that the dial is not following the device.
- If permission was refused, an **Enable compass** button stays available to ask again.

## 9. Notifications

- Off by default. Permission is requested only when the user taps the bell.
- When turned on, the five salah notify by default. Qiyam has its own toggle, which is off by default because it falls in the middle of the night.
- If permission is denied, the bell shows a disabled state with a short explanation.
- Scheduling is client-side:
  - On every recalculation the app arms one timer for the next enabled salah.
  - A one-minute heartbeat and the `visibilitychange` event re-check, since browsers throttle timers in background tabs.
  - If a time was missed by less than 10 minutes, the notification is still shown. Older ones are dropped.
  - The last notified salah and date are stored so a salah never notifies twice.
- Notifications are shown through the service worker registration (`showNotification`), which is what mobile browsers require.
- Content: title "Dhuhr", body "It is time for Dhuhr, 12:14", app icon, a tag per salah so repeats replace each other. Tapping focuses or opens the app.
- **Known limit, stated in the UI:** notifications arrive while the app is open or kept alive in the background. If the browser or OS has fully closed the app, they do not arrive. On iPhone and iPad, notifications work only after the app is added to the Home Screen.

## 10. Installable PWA

- Web app manifest: name, short name, `display: standalone`, theme and background colours, 192 px and 512 px icons plus a maskable icon.
- Service worker precaches the app shell and assets so the app starts offline. Updates apply on the next launch, with an in-canvas "Updated" toast.
- Chromium browsers: the `beforeinstallprompt` event is captured and an in-canvas **Install** button triggers it. The button hides once installed.
- Safari on iOS: a one-time in-canvas hint explains Share, then Add to Home Screen.
- Offline behaviour: times are computed locally from the cached location and elevation, so everything except the elevation lookup works offline.

## 11. Rendering, readability and animation

### 11.1 Canvas

- One full-window Phaser canvas using resize scaling, re-laid out on resize and orientation change.
- Rendered at device pixel ratio (capped at 3) so text is sharp.
- Layouts: portrait phone (single column), and landscape or desktop (sky and hero left, list right). Minimum supported width 320 px.

### 11.2 Readability

- All text sits on translucent dark or light panels, chosen from the sky's current luminance, so contrast is at least 4.5:1 at every time of day.
- Minimum sizes: 16 px body, 14 px secondary, salah times at least 20 px, hero countdown at least 40 px.
- One web font, bundled and precached, loaded before the first scene so text never flashes.
- Tap targets are at least 44 px.
- A visually hidden DOM element mirrors the next salah and the list for screen readers, since canvas text is invisible to them. It adds nothing visible.

### 11.3 Animation

- Sky colour, sun, moon and stars move continuously.
- List rows slide and fade in, staggered, on entry and on recalculation.
- The countdown has a progress ring showing how much of the current period has passed.
- At a salah time, its row pulses and the hero cross-fades to the next salah.
- Panels, the settings sheet and the Qibla view open with short eased tweens (200 to 300 ms).
- `prefers-reduced-motion` turns off twinkle, drift and slides, leaving cross-fades.
- The loop pauses when the page is hidden, and the sky gradient is redrawn only when its colours change, to protect battery.

## 12. State and storage

Stored in `localStorage` under one versioned key:

- Last position (latitude, longitude, timestamp), elevation and its source.
- Method, Asr rule, time format.
- Notification master toggle, per-salah toggles and the Qiyam toggle.
- Last notified salah and date.
- Whether the iOS install hint was dismissed.

Nothing is sent anywhere except the elevation lookup in section 5.2.

## 13. Proposed structure

```
index.html
vite.config.ts            PWA plugin and manifest
public/icons/
src/
  main.ts                 Phaser game config, service worker registration
  core/
    solar.ts              sun declination, equation of time, hour angles
    prayerTimes.ts        times from inputs (section 5)
    methods.ts            method table
    moon.ts               phase name and drawing parameters
    skyPalette.ts         altitude to gradient colours
    skyPosition.ts        altitude and azimuth to canvas position
    qibla.ts              Qibla bearing and distance to Makkah
    clock.ts              "now", overridable for testing
  services/
    location.ts           geolocation and elevation lookup
    notifications.ts      permission, scheduling, catch-up
    compass.ts            motion permission, heading, declination, smoothing
    storage.ts
    install.ts
  scenes/
    BootScene.ts          font and asset loading
    WelcomeScene.ts       location request, first method choice
    MainScene.ts
  ui/
    Sky.ts  SunMoon.ts  PrayerList.ts  Hero.ts
    QiblaCompass.ts       dial, Kaaba marker, live and static modes
    Dropdown.ts  Toggle.ts  SettingsPanel.ts  Toast.ts
tests/
  prayerTimes.test.ts  skyPalette.test.ts  moon.test.ts  qibla.test.ts
```

## 14. Edge cases

- Location denied, timed out or unavailable: section 3.1 step 5.
- Offline first run: location works, elevation falls back to 0 m and is retried when online.
- Polar day or night: the high-latitude rule applies. If sunrise or sunset does not occur, the row shows a dash and no notification is scheduled for it. Qiyam also shows a dash then, since it depends on Maghrib.
- Device clock or timezone changes, including daylight saving: detected on the heartbeat, followed by a recalculation.
- The app left open across midnight: recalculated at midnight.
- Travel: a background location refresh on resume moves the times and the Qibla bearing to the new place.
- No compass sensor, or motion permission refused: the Qibla view falls back to static mode (section 8.5).
- Very close to the Kaaba, where a bearing is not meaningful: the view shows "You are at the Kaaba" instead of a direction.

## 15. Testing and acceptance

**Unit tests**

- Times for at least five cities across latitudes and hemispheres, for several methods, within one minute of published reference timetables at 0 m.
- Elevation: at 1,000 m, sunrise is earlier and Maghrib later than at 0 m by the amount the dip formula predicts, while Fajr, Dhuhr, Asr and Isha are unchanged.
- High-latitude rule at 60° N in midsummer.
- Qiyam falls two thirds of the way from Maghrib to the next Fajr, and the row shows the current night's value both before and after midnight.
- Sky palette returns the expected colours at each keyframe altitude and distinct colours for dawn and dusk.
- Sun and Moon screen mapping: horizon and zenith heights, left-to-right direction in each hemisphere, and clamping at the edges.
- Moon phase names on known new and full moon dates.
- Qibla bearing for several cities against a published reference (for example about 58° from New York, 119° from London and 295° from Jakarta), within 0.5°.
- Heading smoothing across the 359° to 0° wrap.

**Manual checks**

- A debug URL parameter overrides "now" and can run time fast, to watch a full day of sky, list highlighting and notifications in a minute. Over that day the Sun crosses the sky and sets, then the Moon takes over at night, each at the position a planetarium app shows for the same place and time.
- Allow and deny paths for location, notifications and the compass.
- Qibla view on an iPhone and an Android phone: the dial tracks north when the phone turns, agrees with a physical or built-in compass, and signals alignment when facing the Qibla. Static mode on a desktop.
- Install on Chrome desktop, Android Chrome and iOS Safari. Launch offline.
- Lighthouse reports the app as installable.
- Contrast check of text at night, dawn, midday and sunset.
- Layout at 320 px, a typical phone, a tablet and a desktop window.

## 16. Milestones

1. Scaffold, calculation core and its tests.
2. Location, elevation and storage, with the welcome scene.
3. Main scene: list, hero and countdown.
4. Sky, sun, stars and moon.
5. Settings panel and dropdowns.
6. Notifications.
7. Qibla compass: bearing, dial, live and static modes.
8. PWA manifest, service worker, install flow and offline.
9. Polish: animation, reduced motion, responsive layouts, accessibility mirror.

## 17. Open questions

- Hosting target and final app name.
- Whether a later phase should add server push for notifications when the app is closed.

## 18. As built: differences from this spec

The app was built from this spec. Where it differs or where something is not yet verified:

- **Accuracy checks**: salah times are verified against the `adhan` library (within one minute, 13 cases), not against published municipal timetables. The method angle table in section 5.3 is the same set `adhan` uses; confirm it against each authority before relying on it.
- **Fajr after Isha**: once Isha has passed, the Fajr row shows tomorrow's time (marked "tomorrow"), so the list agrees with the hero countdown.
- **Date line**: timezone, coordinates and elevation sit in the footer of the salah list rather than the top bar, to keep the top bar usable at 320 px.
- **Moon chip**: the phase name and illumination chip is always shown, in addition to the Moon in the sky (section 7).
- **Short landscape windows**: Settings uses two columns, and any sheet that is still too tall is scaled to fit. The Qibla view puts the dial and the readings side by side.
- **Service worker updates** use prompt mode: the new version waits and applies on the next launch, with an "Updated" toast.
- **Notifications in development**: the dev server has no service worker, so notifications fall back to `new Notification`. The production build uses `showNotification`.
- **Not verifiable without real devices**: which north iOS `webkitCompassHeading` reports (the app assumes magnetic and adds the local declination), physical compass accuracy, Lighthouse installability, real OS notification delivery, and Safari and Firefox behaviour. Only Chrome was tested.

