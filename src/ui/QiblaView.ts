import Phaser from 'phaser';
import { angleDelta } from '../core/heading';
import { AT_KAABA_KM, compassLabel, distanceToKaabaKm, qiblaBearing } from '../core/qibla';
import { SHEET_STYLE } from '../core/skyPalette';
import {
  CompassSensor,
  compassNeedsPermission,
  compassSupported,
  requestCompassPermission,
  type HeadingReading,
} from '../services/compass';
import { Sheet } from './Sheet';
import { logicalSize, makeText } from './theme';
import { IconButton, TextButton } from './widgets';

const ALIGN_DEG = 3;
const GOLD = 0xffd479;

/** Draws the black Kaaba cube with a gold band, centred on 0,0. */
export function drawKaaba(g: Phaser.GameObjects.Graphics, s: number, glow: number): void {
  const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
  const k = 0.866;
  // cream badge so the black cube reads on any background
  g.fillStyle(0xf3ecd8, 1);
  g.fillCircle(0, 0, s * 1.45);
  if (glow > 0) {
    g.lineStyle(3, GOLD, glow);
    g.strokeCircle(0, 0, s * 1.6);
  }
  g.fillStyle(0x4a4a4a, 1);
  g.fillPoints([v(0, -s), v(k * s, -0.5 * s), v(0, 0), v(-k * s, -0.5 * s)], true, true);
  g.fillStyle(0x1a1a1a, 1);
  g.fillPoints([v(-k * s, -0.5 * s), v(0, 0), v(0, s), v(-k * s, 0.5 * s)], true, true);
  g.fillStyle(0x050505, 1);
  g.fillPoints([v(0, 0), v(k * s, -0.5 * s), v(k * s, 0.5 * s), v(0, s)], true, true);
  // gold band (kiswah border) on both visible sides
  g.fillStyle(0xd4af37, 1);
  g.fillPoints([v(-k * s, -0.5 * s + 0.22 * s), v(0, 0.22 * s), v(0, 0.4 * s), v(-k * s, -0.5 * s + 0.4 * s)], true, true);
  g.fillPoints([v(0, 0.22 * s), v(k * s, -0.5 * s + 0.22 * s), v(k * s, -0.5 * s + 0.4 * s), v(0, 0.4 * s)], true, true);
}

export class QiblaView {
  private sheet: Sheet;
  private dial!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Graphics;
  private line!: Phaser.GameObjects.Graphics;
  private bearingText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private enableBtn: TextButton | null = null;
  private sensor: CompassSensor | null = null;
  private bearing: number;
  private km: number;
  private heading: number | null = null;
  private aligned = false;
  private live = false;
  private R = 0;
  private btnPos = { x: 0, y: 0, w: 240 };
  private updateFn = () => this.refresh();
  private noSensorTimer?: Phaser.Time.TimerEvent;
  private closed = false;

  constructor(private scene: Phaser.Scene, private lat: number, private lng: number, private onClosed: () => void) {
    const { W, H } = logicalSize(scene);
    this.bearing = qiblaBearing(lat, lng);
    this.km = distanceToKaabaKm(lat, lng);
    const st = SHEET_STYLE;

    const m = W < 420 ? 8 : 16;
    const rect = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    this.sheet = new Sheet(scene, st, rect, () => this.destroy());

    const title = makeText(scene, rect.x + 18, rect.y + 16, 'Qibla', 24, st.text, true);
    const close = new IconButton(scene, 'close', () => this.sheet.close()).place(rect.x + rect.w - 32, rect.y + 32).setStyle(st);
    this.sheet.add(title);
    this.sheet.addWidget(close);

    const landscape = W > H * 1.15;
    let cx: number;
    let cy: number;
    let textX: number;
    let ty: number;
    let wrapW: number;
    if (landscape) {
      // dial on the left, readings on the right
      this.R = Math.max(60, Math.min(rect.w * 0.26, (rect.h - 86) / 2, 190));
      cx = rect.x + rect.w * 0.3;
      cy = rect.y + rect.h / 2 + 16;
      textX = rect.x + rect.w * 0.74;
      wrapW = rect.w * 0.4;
      ty = Math.max(rect.y + 70, cy - 80);
      this.btnPos = { x: textX, y: Math.min(ty + 190, rect.y + rect.h - 36), w: Math.min(240, wrapW) };
    } else {
      const textBlock = 150;
      const top = rect.y + 70;
      const availH = rect.h - 70 - textBlock - 16;
      this.R = Math.max(70, Math.min((rect.w - 70) / 2, availH / 2 - 14, 190));
      cx = W / 2;
      cy = top + availH / 2 + 8;
      textX = cx;
      ty = cy + this.R + 30;
      wrapW = rect.w - 40;
      this.btnPos = { x: W / 2, y: rect.y + rect.h - 44, w: Math.min(260, rect.w - 40) };
    }
    this.buildDial(cx, cy, this.R);

    // fixed pointer at the top: the direction the phone is facing
    const ptr = scene.add.graphics();
    ptr.fillStyle(0xff5a4d, 1);
    ptr.fillTriangle(cx - 11, cy - this.R - 26, cx + 11, cy - this.R - 26, cx, cy - this.R - 6);
    this.sheet.add(ptr);

    this.bearingText = makeText(scene, textX, ty, '', 22, st.text, true).setOrigin(0.5, 0);
    this.distText = makeText(scene, textX, ty + 30, '', 16, st.subtext).setOrigin(0.5, 0);
    this.statusText = makeText(scene, textX, ty + 56, '', 18, st.accent, true).setOrigin(0.5, 0);
    this.hintText = makeText(scene, textX, ty + 82, '', 14, st.subtext).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(wrapW);
    this.sheet.add(this.bearingText, this.distText, this.statusText, this.hintText);

    const atKaaba = this.km < AT_KAABA_KM;
    this.bearingText.setText(atKaaba ? 'You are at the Kaaba' : `Qibla ${Math.round(this.bearing)}° ${compassLabel(this.bearing)}`);
    this.distText.setText(atKaaba ? '' : `${Math.round(this.km).toLocaleString()} km to Makkah`);

    this.setupSensor();
    scene.events.on('update', this.updateFn);
    this.refresh();
  }

  private buildDial(cx: number, cy: number, R: number) {
    const { scene } = this;
    const st = SHEET_STYLE;
    this.dial = scene.add.container(cx, cy);
    const face = scene.add.graphics();
    face.fillStyle(0x1c2b57, 1);
    face.fillCircle(0, 0, R);
    face.lineStyle(3, 0xffffff, 0.55);
    face.strokeCircle(0, 0, R);
    face.lineStyle(1, 0xffffff, 0.12);
    face.strokeCircle(0, 0, R * 0.62);
    for (let d = 0; d < 360; d += 10) {
      const major = d % 90 === 0;
      const mid = d % 30 === 0;
      const len = major ? 0 : mid ? 12 : 7;
      if (major) continue;
      const a = (d * Math.PI) / 180;
      face.lineStyle(mid ? 2 : 1, 0xffffff, mid ? 0.7 : 0.4);
      face.lineBetween(Math.sin(a) * (R - len), -Math.cos(a) * (R - len), Math.sin(a) * (R - 2), -Math.cos(a) * (R - 2));
    }
    this.dial.add(face);

    // N (red, with a pointer), S, and smaller E and W
    const letters: [string, number, number, number, number][] = [
      ['N', 0, 26, 0xff5a4d, 1],
      ['E', 90, 18, st.subtext, 0],
      ['S', 180, 26, 0xffffff, 1],
      ['W', 270, 18, st.subtext, 0],
    ];
    for (const [ch, deg, size, color, bold] of letters) {
      const a = (deg * Math.PI) / 180;
      const rr = R - 28;
      const t = makeText(scene, Math.sin(a) * rr, -Math.cos(a) * rr, ch, size, color, !!bold).setOrigin(0.5);
      this.dial.add(t);
    }
    const north = scene.add.graphics();
    north.fillStyle(0xff5a4d, 1);
    north.fillTriangle(-8, -R + 50, 8, -R + 50, 0, -R + 66);
    this.dial.add(north);

    // line from centre to the Qibla marker, and the marker itself
    this.line = scene.add.graphics();
    this.dial.add(this.line);
    const a = (this.bearing * Math.PI) / 180;
    this.marker = scene.add.graphics();
    this.marker.setPosition(Math.sin(a) * (R - 6), -Math.cos(a) * (R - 6));
    this.dial.add(this.marker);

    const hub = scene.add.graphics();
    hub.fillStyle(0xffffff, 0.9);
    hub.fillCircle(0, 0, 5);
    this.dial.add(hub);

    this.sheet.add(this.dial);
    this.drawMarker(false);
  }

  private drawMarker(aligned: boolean) {
    const a = (this.bearing * Math.PI) / 180;
    this.line.clear();
    this.line.lineStyle(aligned ? 4 : 2, aligned ? GOLD : 0xffffff, aligned ? 1 : 0.6);
    this.line.lineBetween(0, 0, Math.sin(a) * (this.R - 6 - 22), -Math.cos(a) * (this.R - 6 - 22));
    this.marker.clear();
    drawKaaba(this.marker, Math.max(11, this.R * 0.085), aligned ? 1 : 0);
  }

  private setupSensor() {
    if (!compassSupported()) {
      this.showStatic('This device has no compass sensor. The dial is fixed with north at the top.');
      return;
    }
    if (compassNeedsPermission()) {
      this.showStatic('Turn on the compass to follow your phone.', true);
      return;
    }
    this.startSensor();
  }

  private addEnableButton() {
    if (this.enableBtn) return;
    this.enableBtn = new TextButton(
      this.scene,
      'Enable compass',
      async () => {
        const res = await requestCompassPermission();
        if (this.closed) return;
        if (res === 'granted') {
          this.enableBtn?.setVisible(false);
          this.startSensor();
        } else {
          this.showStatic(
            res === 'denied'
              ? 'Compass access was refused. Tap Enable compass to try again, or allow motion sensors in your browser settings.'
              : 'This device has no compass sensor. The dial is fixed with north at the top.',
            res === 'denied',
          );
        }
      },
      SHEET_STYLE,
      'primary',
    );
    this.enableBtn.place(this.btnPos.x, this.btnPos.y, this.btnPos.w, 48);
    this.sheet.addWidget(this.enableBtn);
  }

  private showStatic(message: string, withButton = false) {
    this.live = false;
    this.heading = null;
    this.hintText.setText(message);
    this.statusText.setText('');
    if (withButton) this.addEnableButton();
  }

  private startSensor() {
    this.sensor?.stop();
    this.sensor = new CompassSensor(this.lat, this.lng, (r) => this.onReading(r));
    this.sensor.start();
    this.hintText.setText('Hold your phone flat and turn until the cube is under the red pointer.');
    this.noSensorTimer?.remove();
    this.noSensorTimer = this.scene.time.delayedCall(2000, () => {
      if (this.sensor && !this.sensor.hasReading) {
        this.sensor.stop();
        this.sensor = null;
        this.showStatic('No compass readings from this device. The dial is fixed with north at the top.');
      }
    });
  }

  private onReading(r: HeadingReading) {
    this.live = true;
    this.heading = r.heading;
    if (r.accuracy !== null && r.accuracy > 25) {
      this.hintText.setText('Move your phone in a figure of eight to calibrate the compass.');
    } else {
      this.hintText.setText('Hold your phone flat. Metal and magnets nearby can throw the compass off.');
    }
  }

  private refresh() {
    const h = this.live && this.heading !== null ? this.heading : 0;
    this.dial.setRotation((-h * Math.PI) / 180);
    this.marker.setRotation((h * Math.PI) / 180); // keep the cube upright
    const atKaaba = this.km < AT_KAABA_KM;
    const aligned = this.live && !atKaaba && Math.abs(angleDelta(h, this.bearing)) <= ALIGN_DEG;
    if (aligned !== this.aligned) {
      this.aligned = aligned;
      this.drawMarker(aligned);
      this.statusText.setText(aligned ? 'Facing the Qibla' : '');
      if (aligned) navigator.vibrate?.(60);
    }
  }

  private destroy() {
    this.closed = true;
    this.noSensorTimer?.remove();
    this.sensor?.stop();
    this.scene.events.off('update', this.updateFn);
    this.onClosed();
  }

  close() {
    this.sheet.close();
  }
}

