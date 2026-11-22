import Phaser from 'phaser';
import { clock } from '../core/clock';
import { formatCountdown, formatTime, gregorianDate, hijriDate, timeZoneName } from '../core/format';
import { computeLayout, type Layout } from '../core/layout';
import { moonLitPolygon, type MoonInfo } from '../core/moon';
import {
  buildSchedule,
  periodProgress,
  PRAYER_LABEL,
  ROW_ORDER,
  type PrayerKey,
  type ScheduleState,
} from '../core/schedule';
import { DIM_ALPHA, panelFor, type PanelStyle } from '../core/skyPalette';
import {
  GeoError,
  getFix,
  lookupElevation,
  resolveElevation,
  significantChange,
} from '../services/location';
import { canInstall, isIosSafari, onInstallChange, promptInstall } from '../services/install';
import {
  NotificationScheduler,
  notificationPermission,
  requestNotificationPermission,
} from '../services/notifications';
import { app } from '../state';
import { QiblaView } from '../ui/QiblaView';
import { SettingsView } from '../ui/SettingsView';
import { Sky } from '../ui/Sky';
import { Depth, hex, makeText, reducedMotion, setupCamera } from '../ui/theme';
import { IconButton, Toast } from '../ui/widgets';

interface RowUI {
  box: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  time: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text | null;
}

const RING_R = 42;

export class MainScene extends Phaser.Scene {
  private sky!: Sky;
  private L!: Layout;
  private style!: PanelStyle;
  private toast!: Toast;
  private scheduler!: NotificationScheduler;

  // top bar
  private bar!: Phaser.GameObjects.Graphics;
  private dateL1!: Phaser.GameObjects.Text;
  private dateL2!: Phaser.GameObjects.Text;
  private btnInstall!: IconButton;
  private btnQibla!: IconButton;
  private btnBell!: IconButton;
  private btnGear!: IconButton;

  // hero
  private heroBg!: Phaser.GameObjects.Graphics;
  private heroNext!: Phaser.GameObjects.Text;
  private heroCount!: Phaser.GameObjects.Text;
  private heroClock!: Phaser.GameObjects.Text;
  private ring!: Phaser.GameObjects.Graphics;

  // list
  private listBg!: Phaser.GameObjects.Graphics;
  private hl!: Phaser.GameObjects.Graphics;
  private rows: RowUI[] = [];
  private footer!: Phaser.GameObjects.Text;

  // moon chip
  private chipBg!: Phaser.GameObjects.Graphics;
  private chipMoon!: Phaser.GameObjects.Graphics;
  private chipName!: Phaser.GameObjects.Text;
  private chipSub!: Phaser.GameObjects.Text;
  private chipKey = '';

  private state: ScheduleState | null = null;
  private sig = '';
  private lastSec = -1;
  private lastDay = '';
  private lastNextKey: PrayerKey | null = null;
  private lastCurrent: PrayerKey | null = null;
  private moon: MoonInfo | null = null;
  private qibla: QiblaView | null = null;
  private settings: SettingsView | null = null;
  private lastLocationRefresh = 0;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('Main');
  }

  create() {
    const place = app.place;
    if (!place) {
      this.scene.start('Welcome');
      return;
    }
    const { W, H } = setupCamera(this);
    this.style = panelFor({ top: 0x050b24, mid: 0x0b1840, horizon: 0x14275a, stars: 1 });
    this.sky = new Sky(this, place.lat, place.lng);
    this.toast = new Toast(this);
    this.buildHud();
    this.relayout(W, H);

    this.scheduler = new NotificationScheduler(
      () => ({
        now: clock.now(),
        rows: this.state?.rows ?? [],
        nextFajr: this.state?.next?.key === 'fajr' ? this.state.next.time : null,
        prefs: app.settings.notify.prayers,
        enabled: app.settings.notify.enabled,
        hour12: app.hour12,
        sent: app.stored.sent,
      }),
      (id) => app.markSent(id),
    );
    this.scheduler.start();

    this.unsubs.push(
      app.on('place', () => {
        const p = app.place;
        if (p) this.sky.setPlace(p.lat, p.lng);
        this.sig = '';
        this.tick(true);
      }),
      app.on('settings', () => {
        this.sig = '';
        this.tick(true);
        this.updateBell();
      }),
      onInstallChange(() => this.updateInstall()),
    );

    const onResize = () => {
      const s = setupCamera(this);
      this.relayout(s.W, s.H);
      const reopenSettings = !!this.settings;
      const reopenQibla = !!this.qibla;
      this.settings?.close();
      this.qibla?.close();
      if (reopenSettings) this.time.delayedCall(300, () => this.openSettings());
      if (reopenQibla) this.time.delayedCall(300, () => this.openQibla());
    };
    this.game.events.on('app-resize', onResize);
    const onUpdated = () => this.toast.show('Updated. The new version applies the next time you open the app.', 5000);
    const onOffline = () => this.toast.show('Ready to work offline.', 3000);
    this.game.events.on('app-updated', onUpdated);
    this.game.events.on('app-offline-ready', onOffline);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      this.sig = '';
      this.tick(true);
      this.scheduler.check();
      void this.quietLocationRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const onOnline = () => void this.retryElevation();
    window.addEventListener('online', onOnline);

    this.events.once('shutdown', () => {
      this.unsubs.forEach((u) => u());
      this.scheduler.stop();
      this.game.events.off('app-resize', onResize);
      this.game.events.off('app-updated', onUpdated);
      this.game.events.off('app-offline-ready', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    });

    this.tick(false);
    this.animateRowsIn();
    this.updateBell();
    this.updateInstall();
    void this.quietLocationRefresh();
    void this.retryElevation();

    if (isIosSafari() && !app.stored.iosHintDismissed) {
      this.time.delayedCall(4000, () => {
        this.toast.show('To install: tap the Share button, then Add to Home Screen.', 7000);
        app.dismissIosHint();
      });
    }
  }

  // ------------------------------------------------------------------------------------------------
  // building
  // ------------------------------------------------------------------------------------------------

  private buildHud() {
    const st = this.style;
    this.bar = this.add.graphics().setDepth(Depth.bar);
    this.dateL1 = makeText(this, 0, 0, '', 16, st.text, true).setDepth(Depth.bar + 1);
    this.dateL2 = makeText(this, 0, 0, '', 14, st.subtext).setDepth(Depth.bar + 1);
    this.btnInstall = new IconButton(this, 'install', () => void this.doInstall());
    this.btnQibla = new IconButton(this, 'compass', () => this.openQibla());
    this.btnBell = new IconButton(this, 'bell', () => void this.toggleNotifications());
    this.btnGear = new IconButton(this, 'gear', () => this.openSettings());

    this.heroBg = this.add.graphics().setDepth(Depth.panel);
    this.heroNext = makeText(this, 0, 0, '', 20, st.text, true).setDepth(Depth.hud);
    this.heroCount = makeText(this, 0, 0, '', 44, st.text, true).setDepth(Depth.hud);
    this.heroClock = makeText(this, 0, 0, '', 16, st.text, true).setOrigin(0.5).setDepth(Depth.hud);
    this.ring = this.add.graphics().setDepth(Depth.hud);

    this.listBg = this.add.graphics().setDepth(Depth.panel);
    this.hl = this.add.graphics().setDepth(Depth.panel + 1);
    this.rows = ROW_ORDER.map((key) => {
      const box = this.add.container(0, 0).setDepth(Depth.hud);
      const name = makeText(this, 0, 0, PRAYER_LABEL[key], 19, st.text, true).setOrigin(0, 0.5);
      const time = makeText(this, 0, 0, '', 21, st.text, true).setOrigin(1, 0.5);
      const sub =
        key === 'qiyam' || key === 'fajr'
          ? makeText(this, 0, 0, key === 'qiyam' ? 'last third of the night' : 'tomorrow', 13, st.subtext).setOrigin(0, 0.5)
          : null;
      box.add(sub ? [name, time, sub] : [name, time]);
      return { box, name, time, sub };
    });
    this.footer = makeText(this, 0, 0, '', 13, st.subtext).setDepth(Depth.hud).setOrigin(0.5, 0.5);

    this.chipBg = this.add.graphics().setDepth(Depth.panel);
    this.chipMoon = this.add.graphics().setDepth(Depth.hud);
    this.chipName = makeText(this, 0, 0, '', 14, st.text, true).setDepth(Depth.hud);
    this.chipSub = makeText(this, 0, 0, '', 14, st.subtext).setDepth(Depth.hud);
  }

  private relayout(W: number, H: number) {
    const L = (this.L = computeLayout(W, H));
    this.sky.layout(L);

    this.relayoutButtons();

    // hero
    const h = L.hero;
    const top = h.y + (h.h - 90) / 2;
    this.heroNext.setPosition(h.x + 18, top);
    this.heroCount.setPosition(h.x + 18, top + 28);
    const ringX = h.x + h.w - RING_R - 16;
    const ringY = h.y + h.h / 2;
    this.ring.setPosition(ringX, ringY);
    this.heroClock.setPosition(ringX, ringY);

    // list rows
    const l = L.list;
    this.rows.forEach((r, i) => {
      r.box.setPosition(l.x, l.y + 8 + i * L.rowH);
      r.time.setPosition(l.w - 18, L.rowH / 2);
      this.placeRow(i);
    });
    this.footer.setPosition(l.x + l.w / 2, l.y + l.h - L.footerH / 2 - 2);

    // moon chip
    const c = L.moonChip;
    this.chipMoon.setPosition(c.x + 26, c.y + c.h / 2);
    this.chipName.setPosition(c.x + 50, c.y + 5);
    this.chipSub.setPosition(c.x + 50, c.y + 24);
    this.chipKey = '';

    this.drawPanels();
    this.sig = '';
    this.lastSec = -1;
    this.tick(false);
    this.drawHighlight();
  }

  private layoutBarText(rightEdge: number) {
    const L = this.L;
    const maxW = Math.max(60, rightEdge - L.pad - 6);
    const now = clock.now();
    const full = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const short = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    this.dateL1.setFontSize(16).setText(full);
    if (this.dateL1.width > maxW) this.dateL1.setText(short);
    if (this.dateL1.width > maxW) this.dateL1.setFontSize(14);
    this.dateL2.setText(hijriDate(now));
    this.fit(this.dateL2, maxW);
    this.dateL1.setPosition(L.pad + 4, 6);
    this.dateL2.setPosition(L.pad + 4, 28);
  }

  private fit(t: Phaser.GameObjects.Text, maxW: number) {
    let s = t.text;
    while (t.width > maxW && s.length > 4) {
      s = s.slice(0, -2);
      t.setText(`${s}…`);
    }
  }

  private drawPanels() {
    const { L, style: st } = this;
    const panel = (g: Phaser.GameObjects.Graphics, r: { x: number; y: number; w: number; h: number }, radius: number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius) => {
      g.clear();
      g.fillStyle(st.fill, st.alpha);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, radius);
      g.lineStyle(1, st.text, 0.14);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
    };
    panel(this.bar, L.topBar, { tl: 0, tr: 0, bl: 18, br: 18 });
    panel(this.heroBg, L.hero, 20);
    panel(this.listBg, L.list, 20);
    panel(this.chipBg, L.moonChip, 16);

    // divider above Qiyam
    this.listBg.lineStyle(1, st.text, 0.18);
    const y = L.list.y + 8 + 6 * L.rowH;
    this.listBg.lineBetween(L.list.x + 18, y, L.list.x + L.list.w - 18, y);

    const subs = [this.dateL1, this.heroNext, this.heroCount, this.heroClock, this.chipName, ...this.rows.map((r) => r.name)];
    subs.forEach((t) => t.setColor(hex(st.text)));
    [this.dateL2, this.footer, this.chipSub, ...this.rows.map((r) => r.sub)].forEach((t) => t?.setColor(hex(st.subtext)));
    for (const b of [this.btnInstall, this.btnQibla, this.btnGear]) b.setStyle(st);
    this.updateBell();
    this.drawChipMoon();
    this.updateRowStyles(clock.now());
    this.drawRing();
  }

  // ------------------------------------------------------------------------------------------------
  // per-frame and per-second updates
  // ------------------------------------------------------------------------------------------------

  update(_t: number, dt: number) {
    if (!this.sky) return;
    const now = clock.now();
    const f = this.sky.update(now, dt);
    this.moon = f.moon;
    const sec = Math.floor(now.getTime() / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      const panel = panelFor(f.sky);
      if (panel.light !== this.style.light) {
        this.style = panel;
        this.drawPanels();
      }
      this.tick(false);
    }
  }

  private tick(force: boolean) {
    const inputs = app.inputs();
    if (!inputs || !this.L) return;
    const now = clock.now();
    const s = buildSchedule(now, inputs);
    const sig = [s.currentKey, s.next?.key, s.next?.time.getTime(), ...s.rows.map((r) => r.time?.getTime() ?? 0), app.hour12].join('|');
    const first = this.sig === '';
    if (sig !== this.sig || force) {
      const prevCurrent = this.lastCurrent;
      this.sig = sig;
      this.state = s;
      this.applyRows(now, !first && !force);
      if (!first && prevCurrent && prevCurrent !== s.currentKey) this.pulse(s.currentKey);
      this.lastCurrent = s.currentKey;
      this.scheduler?.check();
      this.updateA11y(now);
    } else {
      this.state = s;
    }

    // hero
    const next = s.next;
    if (next) {
      this.heroCount.setText(formatCountdown(next.time.getTime() - now.getTime()));
      if (this.lastNextKey !== next.key) this.setHeroLabel(next.key, next.time, this.lastNextKey !== null && !force);
    } else {
      this.heroCount.setText('--:--:--');
    }
    this.fitCountdown();
    this.heroClock.setText(formatTime(now, app.hour12));
    this.drawRing(periodProgress(s, now));

    // day change: refresh date texts
    const day = now.toDateString();
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.refreshBarTextFit();
    }
    this.updateRowStyles(now);
    this.updateFooter();
    this.updateChip();
  }

  private refreshBarTextFit() {
    const L = this.L;
    const left = [this.btnGear, this.btnBell, this.btnQibla, this.btnInstall].filter((b) => b.zone.visible).pop();
    this.layoutBarText((left?.zone.x ?? L.W) - L.button / 2);
  }

  private fitCountdown() {
    const h = this.L.hero;
    const maxW = h.w - RING_R * 2 - 16 - 18 - 24;
    this.heroCount.setFontSize(44);
    if (this.heroCount.width > maxW) this.heroCount.setFontSize(40);
    // the label shrinks (to 16 px) rather than running into the ring
    let size = 20;
    this.heroNext.setFontSize(size);
    while (this.heroNext.width > maxW && size > 16) this.heroNext.setFontSize(--size);
  }

  private setHeroLabel(key: PrayerKey, time: Date, animate: boolean) {
    const apply = () => {
      this.lastNextKey = key;
      this.heroNext.setText(`Next: ${PRAYER_LABEL[key]}  ·  ${formatTime(time, app.hour12)}`);
    };
    if (!animate || reducedMotion()) {
      apply();
      if (animate) this.fade([this.heroNext], 0.2, 1);
      return;
    }
    this.tweens.add({
      targets: [this.heroNext],
      alpha: 0,
      duration: 180,
      onComplete: () => {
        apply();
        this.tweens.add({ targets: [this.heroNext], alpha: 1, duration: 260 });
      },
    });
  }

  private fade(targets: Phaser.GameObjects.GameObject[], from: number, to: number) {
    targets.forEach((t) => (t as Phaser.GameObjects.Text).setAlpha(from));
    this.tweens.add({ targets, alpha: to, duration: 260 });
  }

  private drawRing(progress = 0) {
    const g = this.ring;
    const st = this.style;
    g.clear();
    g.lineStyle(6, st.text, 0.18);
    g.strokeCircle(0, 0, RING_R);
    if (progress > 0.002) {
      g.lineStyle(6, st.accent, 1);
      g.beginPath();
      g.arc(0, 0, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
      g.strokePath();
    }
  }

  // ------------------------------------------------------------------------------------------------
  // rows
  // ------------------------------------------------------------------------------------------------

  /** After Isha the Fajr row shows tomorrow's time, matching the hero countdown. */
  private fajrIsTomorrow(): boolean {
    const s = this.state;
    const fajr = s?.rows[0].time;
    return !!s?.next && s.next.key === 'fajr' && !!fajr && s.next.time.getTime() > fajr.getTime();
  }

  private placeRow(i: number) {
    const r = this.rows[i];
    const key = ROW_ORDER[i];
    const roomy = this.L.rowH >= 44;
    const showSub = !!r.sub && roomy && (key === 'qiyam' || this.fajrIsTomorrow());
    r.sub?.setVisible(showSub);
    r.name.setPosition(22, this.L.rowH / 2 - (showSub ? 7 : 0));
    r.sub?.setPosition(22, this.L.rowH / 2 + 12);
    if (key === 'fajr') r.name.setText(!roomy && this.fajrIsTomorrow() ? 'Fajr · tomorrow' : 'Fajr');
  }

  private applyRows(now: Date, animate: boolean) {
    const s = this.state;
    if (!s) return;
    const tomorrow = this.fajrIsTomorrow();
    s.rows.forEach((row, i) => {
      const t = i === 0 && tomorrow ? s.next!.time : row.time;
      this.rows[i].time.setText(formatTime(t, app.hour12));
      this.placeRow(i);
    });
    this.updateRowStyles(now);
    this.drawHighlight();
    if (animate) this.animateRowsIn();
  }

  private rowAlpha(i: number, now: Date): number {
    const s = this.state;
    if (!s) return 1;
    const row = s.rows[i];
    if (row.key === s.currentKey) return 1;
    if (row.key === 'fajr' && this.fajrIsTomorrow()) return 1;
    if (row.key === 'sunrise') return row.time && row.time <= now ? DIM_ALPHA : 0.9;
    return row.time && row.time <= now ? DIM_ALPHA : 1;
  }

  private updateRowStyles(now: Date) {
    const s = this.state;
    if (!s) return;
    const st = this.style;
    this.rows.forEach((r, i) => {
      const cur = s.rows[i].key === s.currentKey;
      const isNext = s.next?.key === s.rows[i].key;
      r.time.setColor(hex(cur ? st.accent : st.text));
      r.name.setColor(hex(cur ? st.accent : st.text));
      r.name.setFontStyle(cur || isNext ? 'bold' : 'normal');
      if (!this.tweens.isTweening(r.box)) r.box.setAlpha(this.rowAlpha(i, now));
    });
    // next marker moves; redraw highlight cheaply when the key changed
    const key = `${s.currentKey}|${s.next?.key}|${this.style.light}`;
    if (key !== this.hlKey) this.drawHighlight();
  }

  private hlKey = '';
  private drawHighlight() {
    const s = this.state;
    const { L, style: st } = this;
    if (!s || !L) return;
    this.hlKey = `${s.currentKey}|${s.next?.key}|${st.light}`;
    const g = this.hl;
    g.clear();
    const idx = s.rows.findIndex((r) => r.key === s.currentKey);
    if (idx >= 0) {
      const y = L.list.y + 8 + idx * L.rowH;
      g.fillStyle(st.accent, st.light ? 0.2 : 0.18);
      g.fillRoundedRect(L.list.x + 8, y + 2, L.list.w - 16, L.rowH - 4, 12);
      g.fillStyle(st.accent, 1);
      g.fillRoundedRect(L.list.x + 10, y + 8, 4, L.rowH - 16, 2);
    }
    const nidx = s.rows.findIndex((r) => r.key === s.next?.key);
    if (nidx >= 0 && nidx !== idx) {
      const y = L.list.y + 8 + nidx * L.rowH + L.rowH / 2;
      g.fillStyle(st.accent, 1);
      g.fillCircle(L.list.x + 13, y, 3.5);
    }
  }

  private animateRowsIn() {
    if (reducedMotion()) return;
    this.rows.forEach((r, i) => {
      const targetAlpha = this.rowAlpha(i, clock.now());
      const x = r.box.x;
      r.box.setAlpha(0).setX(x + 22);
      this.tweens.add({ targets: r.box, alpha: targetAlpha, x, duration: 380, delay: 40 + i * 55, ease: 'Cubic.easeOut' });
    });
  }

  /** The row for a salah that has just begun pulses. */
  private pulse(key: PrayerKey) {
    const i = ROW_ORDER.indexOf(key);
    if (i < 0 || reducedMotion()) return;
    const r = this.rows[i];
    this.tweens.add({ targets: r.box, scale: { from: 1.04, to: 1 }, alpha: { from: 0.3, to: 1 }, duration: 700, ease: 'Sine.easeOut', yoyo: false });
  }

  private updateFooter() {
    const p = app.place;
    if (!p) return;
    const ns = p.lat >= 0 ? 'N' : 'S';
    const ew = p.lng >= 0 ? 'E' : 'W';
    this.footer.setText(`${timeZoneName()}  ·  ${Math.abs(p.lat).toFixed(2)}°${ns} ${Math.abs(p.lng).toFixed(2)}°${ew}  ·  ${Math.round(p.elevation)} m`);
    let s = this.footer.text;
    while (this.footer.width > this.L.list.w - 16 && s.length > 10) {
      s = s.slice(0, -2);
      this.footer.setText(`${s}…`);
    }
  }

  // ------------------------------------------------------------------------------------------------
  // moon chip
  // ------------------------------------------------------------------------------------------------

  private updateChip() {
    const m = this.moon;
    if (!m) return;
    this.chipName.setText(m.name);
    this.chipSub.setText(`${m.percent}% illuminated`);
    const key = `${m.percent}|${Math.round(m.rotation * 20)}|${this.style.light}`;
    if (key !== this.chipKey) {
      this.chipKey = key;
      this.drawChipMoon();
    }
  }

  private drawChipMoon() {
    const m = this.moon;
    const g = this.chipMoon;
    g.clear();
    if (!m) return;
    const r = 15;
    g.fillStyle(this.style.light ? 0x7e8aa8 : 0x56627f, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(0xf6f1da, 1);
    g.fillPoints(moonLitPolygon(m.fraction, r).map((p) => new Phaser.Math.Vector2(p.x, p.y)), true, true);
    g.setRotation(m.rotation);
  }

  private updateA11y(now: Date) {
    const el = document.getElementById('a11y');
    const s = this.state;
    if (!el || !s) return;
    const parts: string[] = [];
    if (s.next) parts.push(`Next salah: ${PRAYER_LABEL[s.next.key]} at ${formatTime(s.next.time, app.hour12)}.`);
    parts.push(s.rows.map((r) => `${PRAYER_LABEL[r.key]} ${formatTime(r.time, app.hour12)}`).join(', ') + '.');
    parts.push(`${gregorianDate(now)}, ${hijriDate(now)}.`);
    const moon = this.moon ?? this.sky.frame(now).moon;
    parts.push(`Moon: ${moon.name}, ${moon.percent} percent illuminated.`);
    el.textContent = parts.join(' ');
  }

  // ------------------------------------------------------------------------------------------------
  // controls
  // ------------------------------------------------------------------------------------------------

  private updateInstall() {
    const can = canInstall();
    this.btnInstall.setVisible(can);
    if (this.L) {
      this.relayoutButtons();
    }
  }

  private relayoutButtons() {
    const L = this.L;
    const gap = 4;
    let x = L.W - L.pad - L.button / 2;
    const cy = L.topBar.h / 2;
    for (const b of [this.btnGear, this.btnBell, this.btnQibla]) {
      b.place(x, cy, L.button);
      x -= L.button + gap;
    }
    if (this.btnInstall.zone.visible) {
      this.btnInstall.place(x, cy, L.button);
      x -= L.button + gap;
    }
    this.layoutBarText(x + L.button / 2 + gap);
    this.drawPanels();
  }

  private updateBell() {
    if (!this.btnBell) return;
    const perm = notificationPermission();
    const on = app.settings.notify.enabled && perm === 'granted';
    if (perm === 'denied') this.btnBell.setIcon('bell-off').setStyle(this.style, 'disabled');
    else this.btnBell.setIcon('bell').setStyle(this.style, on ? 'active' : 'normal');
  }

  private async doInstall() {
    const ok = await promptInstall();
    if (ok) this.toast.show('Installed. You can open it from your home screen or app list.');
  }

  private openQibla() {
    if (this.qibla) return;
    const p = app.place;
    if (!p) return;
    this.qibla = new QiblaView(this, p.lat, p.lng, () => (this.qibla = null));
  }

  private openSettings() {
    if (this.settings) return;
    this.settings = new SettingsView(this, {
      onRefreshLocation: () => void this.refreshLocation(true),
      onEnableNotifications: () => this.enableNotifications(),
      onClosed: () => {
        this.settings = null;
        this.updateBell();
      },
    });
  }

  private async enableNotifications(): Promise<boolean> {
    let perm = notificationPermission();
    if (perm === 'unsupported') {
      this.toast.show(
        isIosSafari()
          ? 'On iPhone and iPad, add this app to your Home Screen first, then turn notifications on.'
          : 'This browser does not support notifications.',
        5000,
      );
      return false;
    }
    if (perm === 'default') perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      this.toast.show('Notifications are blocked. Allow them in your browser\'s site settings, then try again.', 5000);
      this.updateBell();
      return false;
    }
    return true;
  }

  private async toggleNotifications() {
    const perm = notificationPermission();
    if (app.settings.notify.enabled && perm === 'granted') {
      app.setNotifyEnabled(false);
      this.toast.show('Notifications off.');
      return;
    }
    if (await this.enableNotifications()) {
      app.setNotifyEnabled(true);
      this.toast.show('Notifications on. They arrive while the app is open or running in the background.', 4500);
    }
  }

  // ------------------------------------------------------------------------------------------------
  // location
  // ------------------------------------------------------------------------------------------------

  private async quietLocationRefresh() {
    if (Date.now() - this.lastLocationRefresh < 5 * 60_000) return;
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (perm?.state !== 'granted') return;
    } catch {
      return;
    }
    await this.refreshLocation(false);
  }

  private async refreshLocation(userInitiated: boolean) {
    this.lastLocationRefresh = Date.now();
    try {
      const fix = await getFix();
      const res = await resolveElevation(fix, app.stored.elevationCache);
      const old = app.place;
      const next = { lat: fix.lat, lng: fix.lng, elevation: res.m };
      if (userInitiated || !old || significantChange(old, next)) {
        app.setPlace(fix.lat, fix.lng, res.m, res.source, res.cacheKey);
        if (userInitiated) this.toast.show('Location updated.');
      }
    } catch (e) {
      if (!userInitiated) return;
      const code = e instanceof GeoError ? e.code : 'unavailable';
      this.toast.show(
        code === 'denied'
          ? 'Location is blocked. Allow it in your browser\'s site settings.'
          : code === 'timeout'
            ? 'Could not get your location in time. Try again.'
            : 'Location is not available on this device.',
        4500,
      );
    }
  }

  /** Offline first run falls back to 0 m; try the lookup again once we are online. */
  private async retryElevation() {
    const { position, elevation } = app.stored;
    if (!position || elevation?.source !== 'default' || !navigator.onLine) return;
    const m = await lookupElevation(position.lat, position.lng);
    if (m !== null) app.setPlace(position.lat, position.lng, m, 'lookup');
  }
}
