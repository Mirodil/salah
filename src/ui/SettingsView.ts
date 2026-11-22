import type Phaser from 'phaser';
import { METHODS } from '../core/methods';
import { NOTIFIABLE } from '../core/notify';
import type { AsrRule } from '../core/prayerTimes';
import { PRAYER_LABEL, type PrayerKey } from '../core/schedule';
import { SHEET_STYLE } from '../core/skyPalette';
import { notificationPermission } from '../services/notifications';
import { app } from '../state';
import { Sheet } from './Sheet';
import { logicalSize, makeText } from './theme';
import { Dropdown, IconButton, Segmented, TextButton, Toggle } from './widgets';

export const ASR_OPTIONS = [
  { id: 'standard', label: 'Standard (Shafi, Maliki, Hanbali)' },
  { id: 'hanafi', label: 'Hanafi' },
];

export interface SettingsHooks {
  onRefreshLocation: () => void;
  /** Called when the master notification switch is flipped on; resolves true when notifications are allowed. */
  onEnableNotifications: () => Promise<boolean>;
  onClosed: () => void;
}

const ELEVATION_SOURCE = { gps: 'device GPS', lookup: 'elevation lookup', default: 'default, no data' } as const;

export class SettingsView {
  private sheet: Sheet;

  constructor(scene: Phaser.Scene, hooks: SettingsHooks) {
    const { W, H } = logicalSize(scene);
    const st = SHEET_STYLE;
    const toggles = NOTIFIABLE;
    const toggleRows = Math.ceil(toggles.length / 2);

    // Short, wide windows (a phone on its side) get two columns; anything shorter than that is scaled to fit.
    const wide = W >= 600 && H < 700;
    const compact = H < 620;
    const w = wide ? Math.min(W - 16, 720) : Math.min(W - 16, 440);
    const padX = 20;
    const colGap = 24;
    const innerW = w - padX * 2;
    const colW = wide ? (innerW - colGap) / 2 : innerW;
    const rowGap = compact || wide ? 8 : 14;
    const tRow = wide ? 40 : 44;
    const showNote = !compact && !wide;
    const noteH = showNote ? 36 + rowGap : 0;

    const col1H = (64 + rowGap) * 2 + (20 + 44 + rowGap);
    const notifH = 44 + rowGap / 2 + toggleRows * tRow + 6 + noteH;
    const elevH = 22 + rowGap;
    const refreshH = 48;
    const bodyH = wide ? Math.max(col1H, notifH + elevH + refreshH) : col1H + notifH + elevH + refreshH + 20;
    const contentH = 52 + bodyH;
    const h = Math.min(H - 16, contentH + 24);
    const rect = { x: (W - w) / 2, y: Math.max(8, (H - h) / 2), w, h };
    this.sheet = new Sheet(scene, st, rect, hooks.onClosed);

    const x1 = rect.x + padX;
    const x2 = wide ? x1 + colW + colGap : x1;
    const top = rect.y + 16;

    this.sheet.add(makeText(scene, x1, top, 'Settings', 24, st.text, true));
    this.sheet.addWidget(new IconButton(scene, 'close', () => this.sheet.close()).place(rect.x + w - 32, top + 16).setStyle(st));

    // --- column 1: how times are calculated and shown
    let y = top + 52;
    const method = new Dropdown(scene, 'Calculation method', METHODS.map((m) => ({ id: m.id, label: m.name })), app.settings.methodId, st, (id) => app.updateSettings({ methodId: id }));
    y += method.place(x1, y, colW) + rowGap;
    this.sheet.addWidget(method);

    const asr = new Dropdown(scene, 'Asr', ASR_OPTIONS, app.settings.asr, st, (id) => app.updateSettings({ asr: id as AsrRule }));
    y += asr.place(x1, y, colW) + rowGap;
    this.sheet.addWidget(asr);

    this.sheet.add(makeText(scene, x1, y, 'Time format', 14, st.subtext, true));
    const fmt = new Segmented(
      scene,
      [{ id: '12', label: '12 h' }, { id: '24', label: '24 h' }],
      app.hour12 ? '12' : '24',
      st,
      (id) => app.updateSettings({ hour12: id === '12' }),
    );
    fmt.place(x1, y + 20, colW);
    this.sheet.addWidget(fmt);
    y += 20 + 44 + rowGap;

    // --- column 2 (or continuing below on narrow screens): notifications
    if (wide) y = top + 52;

    this.sheet.add(makeText(scene, x2, y + 10, 'Notifications', 18, st.text, true));
    const master = new Toggle(scene, app.settings.notify.enabled && notificationPermission() === 'granted', st, async (on) => {
      if (on) {
        const ok = await hooks.onEnableNotifications();
        master.set(ok);
        app.setNotifyEnabled(ok);
      } else {
        app.setNotifyEnabled(false);
      }
    });
    master.place(x2 + colW - 23, y + 22);
    this.sheet.addWidget(master);
    y += 44 + rowGap / 2;

    const half = colW / 2;
    toggles.forEach((key: PrayerKey, i) => {
      const cx = x2 + (i % 2) * half;
      const cy = y + Math.floor(i / 2) * tRow;
      this.sheet.add(makeText(scene, cx, cy + tRow / 2, PRAYER_LABEL[key], 16, st.text).setOrigin(0, 0.5));
      const t = new Toggle(scene, app.settings.notify.prayers[key], st, (on) => app.setNotifyPref(key, on));
      t.place(cx + half - 46, cy + tRow / 2);
      this.sheet.addWidget(t);
    });
    y += toggleRows * tRow + 6;

    if (showNote) {
      this.sheet.add(
        makeText(
          scene,
          x2,
          y,
          'Notifications arrive while the app is open or kept alive in the background. On iPhone and iPad, add the app to the Home Screen first. Qiyam is off by default.',
          13,
          st.subtext,
        ).setWordWrapWidth(colW),
      );
      y += noteH;
    }

    const p = app.place;
    const elev = p ? `${Math.round(p.elevation)} m (${ELEVATION_SOURCE[p.elevationSource]})` : 'unknown';
    this.sheet.add(makeText(scene, x2, y, `Elevation: ${elev}`, 15, st.subtext));
    y += elevH;

    const refresh = new TextButton(scene, 'Refresh location', () => hooks.onRefreshLocation(), st, 'secondary');
    refresh.place(x2 + colW / 2, y + 24, colW, 48);
    this.sheet.addWidget(refresh);

    // last resort for very short windows: scale everything to fit the panel
    this.sheet.fitContent(contentH + 8);
  }

  close() {
    this.sheet.close();
  }
}
