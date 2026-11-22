import Phaser from 'phaser';
import { clock } from '../core/clock';
import { computeLayout } from '../core/layout';
import { METHODS } from '../core/methods';
import type { AsrRule } from '../core/prayerTimes';
import { SHEET_STYLE } from '../core/skyPalette';
import { GeoError, getFix, resolveElevation } from '../services/location';
import { app } from '../state';
import { Sheet } from '../ui/Sheet';
import { Sky } from '../ui/Sky';
import { logicalSize, makeText, reducedMotion, setupCamera } from '../ui/theme';
import { Dropdown, TextButton } from '../ui/widgets';
import { ASR_OPTIONS } from '../ui/SettingsView';

type Stage = 'intro' | 'loading' | 'error' | 'method';

/** First launch: explain, ask for location from a tap, then choose a calculation method once. */
export class WelcomeScene extends Phaser.Scene {
  private sky!: Sky;
  private sheet: Sheet | null = null;
  private stage: Stage = 'intro';
  private errorMessage = '';
  private methodId = app.settings.methodId;
  private asr: AsrRule = app.settings.asr;
  private busy = false;

  constructor() {
    super('Welcome');
  }

  create() {
    const { W, H } = setupCamera(this);
    // Makkah is only a placeholder so the sky behind the card is alive before we know where the user is.
    this.sky = new Sky(this, 21.4225, 39.8262);
    this.layoutSky(W, H);

    const onResize = () => {
      const s = setupCamera(this);
      this.layoutSky(s.W, s.H);
      this.show(this.stage, true);
    };
    this.game.events.on('app-resize', onResize);
    this.events.once('shutdown', () => this.game.events.off('app-resize', onResize));

    // A cached position without a method choice means the user quit half way through.
    this.show(app.place && !app.settings.methodChosen ? 'method' : 'intro');
    this.cameras.main.fadeIn(reducedMotion() ? 1 : 400);
  }

  private layoutSky(W: number, H: number) {
    const L = computeLayout(W, H);
    const horizonY = Math.round(H * 0.8);
    this.sky.layout({ ...L, horizonY, sky: { x: 40, y: 20, w: W - 80, h: horizonY - 20 }, mode: 'portrait' });
  }

  update(_t: number, dt: number) {
    this.sky.update(clock.now(), dt);
  }

  private show(stage: Stage, instant = false) {
    this.stage = stage;
    const old = this.sheet;
    this.sheet = null;
    if (old) old.close();
    this.time.delayedCall(instant ? 0 : 60, () => this.build(stage));
  }

  private build(stage: Stage) {
    const { W, H } = logicalSize(this);
    const st = SHEET_STYLE;
    const w = Math.min(W - 24, 440);
    const innerW = w - 44;
    const x = (W - w) / 2 + 22;

    /** Each item knows its height up front so the card can be sized and centred before anything is drawn. */
    const items: { h: number; build: (y: number) => void }[] = [];
    const text = (s: string, size: number, color: number, bold = false, gap = 12) => {
      const probe = makeText(this, -9999, -9999, s, size, color, bold).setWordWrapWidth(innerW);
      const h = probe.height;
      probe.destroy();
      items.push({
        h: h + gap,
        build: (y) => {
          const t = makeText(this, x, y, s, size, color, bold).setWordWrapWidth(innerW);
          this.sheet!.add(t);
        },
      });
    };
    const button = (label: string, onTap: () => void, variant: 'primary' | 'secondary' = 'primary') =>
      items.push({
        h: 52 + 12,
        build: (y) => {
          const b = new TextButton(this, label, onTap, st, variant);
          b.place(x + innerW / 2, y + 26, innerW, 52);
          this.sheet!.addWidget(b);
        },
      });
    const dropdown = (caption: string, options: { id: string; label: string }[], value: string, onChange: (id: string) => void, gap: number) =>
      items.push({
        h: 64 + gap,
        build: (y) => {
          const d = new Dropdown(this, caption, options, value, st, onChange);
          d.place(x, y, innerW);
          this.sheet!.addWidget(d);
        },
      });

    if (stage === 'intro') {
      text('Salah Times', 34, st.text, true, 6);
      text('Prayer times for your exact location and elevation, a Qibla compass, and the sky as it is right now.', 17, st.subtext, false, 16);
      text('To calculate times and the Qibla direction, the app needs your location. It stays on this device.', 16, st.text, false, 8);
      text(
        'If your device does not report altitude, your approximate position (rounded to about 100 m) is sent to the free Open-Meteo service to look up your elevation.',
        13,
        st.subtext,
        false,
        18,
      );
      button('Allow location', () => void this.requestLocation());
    } else if (stage === 'loading') {
      text('Finding your location', 24, st.text, true, 10);
      items.push({
        h: 84,
        build: (y) => {
          const g = this.add.graphics();
          g.setPosition(x + innerW / 2, y + 36);
          g.lineStyle(6, st.text, 0.2);
          g.strokeCircle(0, 0, 22);
          g.lineStyle(6, st.accent, 1);
          g.beginPath();
          g.arc(0, 0, 22, 0, Math.PI * 0.6, false);
          g.strokePath();
          this.tweens.add({ targets: g, rotation: Math.PI * 2, duration: 1000, repeat: -1 });
          this.sheet!.add(g);
        },
      });
      text('Working out your elevation too.', 15, st.subtext, false, 6);
    } else if (stage === 'error') {
      text('Location unavailable', 24, st.text, true, 10);
      text(this.errorMessage, 16, st.subtext, false, 18);
      button('Try again', () => void this.requestLocation());
      if (app.place) button('Use last location', () => this.show('method'), 'secondary');
    } else {
      text('Choose a calculation method', 24, st.text, true, 8);
      text('Authorities use different twilight angles for Fajr and Isha. You can change this later in Settings.', 15, st.subtext, false, 16);
      dropdown('Calculation method', METHODS.map((m) => ({ id: m.id, label: m.name })), this.methodId, (id) => (this.methodId = id), 14);
      dropdown('Asr', ASR_OPTIONS, this.asr, (id) => (this.asr = id as AsrRule), 18);
      button('Continue', () => this.finish());
    }

    const total = items.reduce((a, i) => a + i.h, 0);
    const h = Math.min(H - 16, total + 44);
    const rect = { x: (W - w) / 2, y: Math.max(8, (H - h) / 2 - 24), w, h };
    this.sheet = new Sheet(this, st, rect, () => undefined, { dim: false, dismissable: false, radius: 24 });
    let y = rect.y + 22;
    for (const item of items) {
      item.build(y);
      y += item.h;
    }
  }

  private async requestLocation() {
    if (this.busy) return;
    this.busy = true;
    this.show('loading');
    try {
      const fix = await getFix();
      const res = await resolveElevation(fix, app.stored.elevationCache);
      app.setPlace(fix.lat, fix.lng, res.m, res.source, res.cacheKey);
      this.busy = false;
      this.show('method');
    } catch (e) {
      this.busy = false;
      const code = e instanceof GeoError ? e.code : 'unavailable';
      this.errorMessage =
        code === 'denied'
          ? 'Location access was blocked. To use the app, allow location for this site in your browser settings (usually the lock or tune icon next to the address), then tap Try again.'
          : code === 'timeout'
            ? 'Finding your location took too long. Check that location services are on, then tap Try again.'
            : code === 'unsupported'
              ? 'This browser cannot share a location.'
              : 'Your device could not work out its location. Check that location services are on, then tap Try again.';
      this.show('error');
    }
  }

  private finish() {
    app.updateSettings({ methodId: this.methodId, asr: this.asr, methodChosen: true });
    this.cameras.main.fadeOut(reducedMotion() ? 1 : 300);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Main'));
  }
}
