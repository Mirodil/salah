import Phaser from 'phaser';
import type { PanelStyle } from '../core/skyPalette';
import { Depth, hex, logicalSize, makeText, reducedMotion } from './theme';

// ---------------------------------------------------------------------------------------------------------
// Icons (line icons drawn with Graphics, centred on 0,0)
// ---------------------------------------------------------------------------------------------------------

export type IconKind = 'gear' | 'bell' | 'bell-off' | 'compass' | 'install' | 'close' | 'refresh' | 'chevron';

export function drawIcon(g: Phaser.GameObjects.Graphics, kind: IconKind, color: number, r = 10, alpha = 1): void {
  g.lineStyle(2, color, alpha);
  g.fillStyle(color, alpha);
  switch (kind) {
    case 'gear': {
      const pts: Phaser.Math.Vector2[] = [];
      const teeth = 8;
      const steps = teeth * 4;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const outer = Math.floor((i + 1) / 2) % 2 === 0;
        const rr = outer ? r : r * 0.74;
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      g.strokePoints(pts, true, true);
      g.strokeCircle(0, 0, r * 0.32);
      break;
    }
    case 'bell':
    case 'bell-off': {
      g.beginPath();
      g.arc(0, -r * 0.1, r * 0.62, Math.PI, 0, false);
      g.lineTo(r * 0.62, r * 0.45);
      g.lineTo(r * 0.95, r * 0.62);
      g.lineTo(-r * 0.95, r * 0.62);
      g.lineTo(-r * 0.62, r * 0.45);
      g.closePath();
      g.strokePath();
      g.fillCircle(0, r * 0.95, r * 0.2);
      g.lineBetween(0, -r * 0.9, 0, -r * 0.7);
      if (kind === 'bell-off') g.lineBetween(-r * 0.9, -r * 0.8, r * 0.9, r * 0.95);
      break;
    }
    case 'compass': {
      g.strokeCircle(0, 0, r);
      g.fillStyle(color, alpha);
      g.fillTriangle(0, -r * 0.7, r * 0.26, 0, -r * 0.26, 0);
      g.fillStyle(color, alpha * 0.4);
      g.fillTriangle(0, r * 0.7, r * 0.26, 0, -r * 0.26, 0);
      break;
    }
    case 'install': {
      g.lineBetween(0, -r * 0.9, 0, r * 0.4);
      g.lineBetween(-r * 0.5, -r * 0.1, 0, r * 0.4);
      g.lineBetween(r * 0.5, -r * 0.1, 0, r * 0.4);
      g.lineBetween(-r * 0.8, r * 0.85, r * 0.8, r * 0.85);
      break;
    }
    case 'close': {
      g.lineBetween(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7);
      g.lineBetween(-r * 0.7, r * 0.7, r * 0.7, -r * 0.7);
      break;
    }
    case 'refresh': {
      g.beginPath();
      g.arc(0, 0, r * 0.75, -Math.PI * 0.2, Math.PI * 1.3, false);
      g.strokePath();
      const a = Math.PI * 1.3;
      const x = Math.cos(a) * r * 0.75;
      const y = Math.sin(a) * r * 0.75;
      g.fillTriangle(x - r * 0.1, y - r * 0.55, x + r * 0.55, y + r * 0.1, x - r * 0.45, y + r * 0.2);
      break;
    }
    case 'chevron': {
      g.lineBetween(-r * 0.6, -r * 0.25, 0, r * 0.35);
      g.lineBetween(0, r * 0.35, r * 0.6, -r * 0.25);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------------------

function press(scene: Phaser.Scene, zone: Phaser.GameObjects.Zone, target: Phaser.GameObjects.GameObject & { setScale(x: number): unknown }, onTap: () => void) {
  zone.setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => target.setScale(0.92));
  zone.on('pointerout', () => target.setScale(1));
  zone.on('pointerup', () => {
    target.setScale(1);
    onTap();
  });
  void scene;
}

export class IconButton {
  readonly g: Phaser.GameObjects.Graphics;
  readonly zone: Phaser.GameObjects.Zone;
  private size = 44;
  private icon: IconKind;
  private style: PanelStyle | null = null;
  private state: 'normal' | 'active' | 'disabled' = 'normal';

  constructor(scene: Phaser.Scene, icon: IconKind, onTap: () => void, depth: number = Depth.bar + 1) {
    this.icon = icon;
    this.g = scene.add.graphics().setDepth(depth);
    this.zone = scene.add.zone(0, 0, 44, 44).setDepth(depth + 1);
    press(scene, this.zone, this.g, onTap);
  }

  place(cx: number, cy: number, size = 44): this {
    this.size = size;
    this.g.setPosition(cx, cy);
    this.zone.setPosition(cx, cy).setSize(size, size);
    this.zone.input?.hitArea && ((this.zone.input.hitArea as Phaser.Geom.Rectangle).setSize(size, size));
    this.redraw();
    return this;
  }

  setIcon(icon: IconKind): this {
    this.icon = icon;
    this.redraw();
    return this;
  }

  setStyle(style: PanelStyle, state: 'normal' | 'active' | 'disabled' = this.state): this {
    this.style = style;
    this.state = state;
    this.redraw();
    return this;
  }

  setVisible(v: boolean): this {
    this.g.setVisible(v);
    this.zone.setVisible(v);
    if (this.zone.input) this.zone.input.enabled = v;
    return this;
  }

  private redraw() {
    const st = this.style;
    if (!st) return;
    const g = this.g;
    g.clear();
    const r = this.size / 2 - 2;
    const active = this.state === 'active';
    g.fillStyle(active ? st.accent : st.fill, active ? 0.95 : st.alpha);
    g.fillCircle(0, 0, r);
    g.lineStyle(1.5, st.text, 0.18);
    g.strokeCircle(0, 0, r);
    const fg = active ? (st.light ? 0xffffff : 0x1a1200) : st.text;
    drawIcon(g, this.icon, fg, r * 0.5, this.state === 'disabled' ? 0.55 : 1);
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.g, this.zone];
  }

  destroy() {
    this.g.destroy();
    this.zone.destroy();
  }
}

export class TextButton {
  readonly g: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
  private w = 0;
  private h = 48;
  private style: PanelStyle;
  private variant: 'primary' | 'secondary';

  constructor(
    scene: Phaser.Scene,
    text: string,
    onTap: () => void,
    style: PanelStyle,
    variant: 'primary' | 'secondary' = 'primary',
    depth: number = Depth.sheet + 2,
  ) {
    this.style = style;
    this.variant = variant;
    this.g = scene.add.graphics().setDepth(depth);
    this.label = makeText(scene, 0, 0, text, 17, style.text, true).setOrigin(0.5).setDepth(depth + 1);
    this.zone = scene.add.zone(0, 0, 10, 10).setDepth(depth + 2);
    press(scene, this.zone, this.g, onTap);
  }

  /** Place by centre. */
  place(cx: number, cy: number, w: number, h = 48): this {
    this.w = w;
    this.h = h;
    this.g.setPosition(cx, cy);
    this.label.setPosition(cx, cy);
    this.zone.setPosition(cx, cy).setSize(w, h);
    if (this.zone.input) (this.zone.input.hitArea as Phaser.Geom.Rectangle).setSize(w, h);
    this.redraw();
    return this;
  }

  setText(t: string) {
    this.label.setText(t);
  }

  private redraw() {
    const st = this.style;
    const primary = this.variant === 'primary';
    this.g.clear();
    this.g.fillStyle(primary ? st.accent : st.text, primary ? 1 : 0.1);
    this.g.fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, this.h / 2);
    if (!primary) {
      this.g.lineStyle(1.5, st.text, 0.35);
      this.g.strokeRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, this.h / 2);
    }
    this.label.setColor(hex(primary ? (st.light ? 0xffffff : 0x1a1200) : st.text));
  }

  setVisible(v: boolean) {
    this.g.setVisible(v);
    this.label.setVisible(v);
    this.zone.setVisible(v);
    if (this.zone.input) this.zone.input.enabled = v;
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.g, this.label, this.zone];
  }

  destroy() {
    this.g.destroy();
    this.label.destroy();
    this.zone.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------------------------------------

export class Toggle {
  readonly g: Phaser.GameObjects.Graphics;
  readonly zone: Phaser.GameObjects.Zone;
  private value: boolean;
  private knob = 0; // 0..1
  private tween?: Phaser.Tweens.Tween;

  constructor(
    private scene: Phaser.Scene,
    value: boolean,
    private style: PanelStyle,
    private onChange: (v: boolean) => void,
    depth: number = Depth.sheet + 2,
  ) {
    this.value = value;
    this.knob = value ? 1 : 0;
    this.g = scene.add.graphics().setDepth(depth);
    this.zone = scene.add.zone(0, 0, 56, 44).setDepth(depth + 1);
    this.zone.setInteractive({ useHandCursor: true });
    this.zone.on('pointerup', () => this.set(!this.value, true, true));
  }

  /** Place by centre. */
  place(cx: number, cy: number): this {
    this.g.setPosition(cx, cy);
    this.zone.setPosition(cx, cy);
    this.draw();
    return this;
  }

  get on() {
    return this.value;
  }

  set(v: boolean, animate = false, notify = false) {
    this.value = v;
    this.tween?.stop();
    if (animate && !reducedMotion()) {
      const o = { k: this.knob };
      this.tween = this.scene.tweens.add({
        targets: o,
        k: v ? 1 : 0,
        duration: 160,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          this.knob = o.k;
          this.draw();
        },
      });
    } else {
      this.knob = v ? 1 : 0;
      this.draw();
    }
    if (notify) this.onChange(v);
  }

  private draw() {
    const st = this.style;
    const g = this.g;
    g.clear();
    const w = 46;
    const h = 26;
    g.fillStyle(st.accent, 0.25 + 0.75 * this.knob);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(1.5, st.text, 0.3);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.fillStyle(this.knob > 0.5 ? (st.light ? 0xffffff : 0x1a1200) : st.text, 1);
    g.fillCircle(-w / 2 + h / 2 + (w - h) * this.knob, 0, h / 2 - 4);
  }

  setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zone.setVisible(v);
    if (this.zone.input) this.zone.input.enabled = v;
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.g, this.zone];
  }

  destroy() {
    this.tween?.stop();
    this.g.destroy();
    this.zone.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Segmented control (e.g. 12 h / 24 h)
// ---------------------------------------------------------------------------------------------------------

export class Segmented {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[];
  private zones: Phaser.GameObjects.Zone[] = [];
  private box = { x: 0, y: 0, w: 0, h: 44 };

  constructor(
    scene: Phaser.Scene,
    private options: { id: string; label: string }[],
    private value: string,
    private style: PanelStyle,
    private onChange: (id: string) => void,
    depth: number = Depth.sheet + 2,
  ) {
    this.g = scene.add.graphics().setDepth(depth);
    this.labels = options.map((o) => makeText(scene, 0, 0, o.label, 16, style.text, true).setOrigin(0.5).setDepth(depth + 1));
    this.zones = options.map((o) => {
      const z = scene.add.zone(0, 0, 10, 44).setDepth(depth + 2).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        this.value = o.id;
        this.draw();
        this.onChange(o.id);
      });
      return z;
    });
  }

  place(x: number, y: number, w: number): this {
    this.box = { x, y, w, h: 44 };
    const seg = w / this.options.length;
    this.zones.forEach((z, i) => {
      z.setPosition(x + seg * (i + 0.5), y + 22).setSize(seg, 44);
      if (z.input) (z.input.hitArea as Phaser.Geom.Rectangle).setSize(seg, 44);
    });
    this.labels.forEach((l, i) => l.setPosition(x + seg * (i + 0.5), y + 22));
    this.draw();
    return this;
  }

  private draw() {
    const { x, y, w, h } = this.box;
    const st = this.style;
    const seg = w / this.options.length;
    this.g.clear();
    this.g.fillStyle(st.text, 0.1);
    this.g.fillRoundedRect(x, y, w, h, h / 2);
    this.g.lineStyle(1.5, st.text, 0.3);
    this.g.strokeRoundedRect(x, y, w, h, h / 2);
    const i = Math.max(0, this.options.findIndex((o) => o.id === this.value));
    this.g.fillStyle(st.accent, 1);
    this.g.fillRoundedRect(x + 3 + seg * i, y + 3, seg - 6, h - 6, (h - 6) / 2);
    this.labels.forEach((l, k) =>
      l.setColor(hex(k === i ? (st.light ? 0xffffff : 0x1a1200) : st.text)),
    );
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.g, ...this.labels, ...this.zones];
  }

  destroy() {
    this.g.destroy();
    this.labels.forEach((l) => l.destroy());
    this.zones.forEach((z) => z.destroy());
  }
}

// ---------------------------------------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------------------------------------

export interface Option {
  id: string;
  label: string;
}

export class Dropdown {
  private caption: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private valueText: Phaser.GameObjects.Text;
  private chevron: Phaser.GameObjects.Graphics;
  private zone: Phaser.GameObjects.Zone;
  private box = { x: 0, y: 0, w: 0, h: 44 };
  private list: DropdownList | null = null;

  constructor(
    private scene: Phaser.Scene,
    caption: string,
    private options: Option[],
    private value: string,
    private style: PanelStyle,
    private onChange: (id: string) => void,
    depth: number = Depth.sheet + 2,
  ) {
    this.caption = makeText(scene, 0, 0, caption, 14, style.subtext, true).setDepth(depth);
    this.g = scene.add.graphics().setDepth(depth);
    this.valueText = makeText(scene, 0, 0, '', 17, style.text, true).setDepth(depth + 1).setOrigin(0, 0.5);
    this.chevron = scene.add.graphics().setDepth(depth + 1);
    this.zone = scene.add.zone(0, 0, 10, 44).setDepth(depth + 2).setInteractive({ useHandCursor: true });
    this.zone.on('pointerup', () => this.open());
  }

  /** x,y is the top-left of the caption; the box sits below it. Returns the total height. */
  place(x: number, y: number, w: number): number {
    this.caption.setPosition(x, y);
    const by = y + 20;
    this.box = { x, y: by, w, h: 44 };
    this.zone.setPosition(x + w / 2, by + 22).setSize(w, 44);
    if (this.zone.input) (this.zone.input.hitArea as Phaser.Geom.Rectangle).setSize(w, 44);
    this.redraw();
    return 20 + 44;
  }

  setValue(id: string) {
    this.value = id;
    this.redraw();
  }

  private redraw() {
    const { x, y, w, h } = this.box;
    const st = this.style;
    this.g.clear();
    this.g.fillStyle(st.text, 0.1);
    this.g.fillRoundedRect(x, y, w, h, 12);
    this.g.lineStyle(1.5, st.text, 0.35);
    this.g.strokeRoundedRect(x, y, w, h, 12);
    const label = this.options.find((o) => o.id === this.value)?.label ?? '';
    this.valueText.setText(label).setPosition(x + 14, y + h / 2);
    // ellipsize to fit
    let t = label;
    while (this.valueText.width > w - 56 && t.length > 4) {
      t = t.slice(0, -2);
      this.valueText.setText(`${t}…`);
    }
    this.chevron.clear();
    this.chevron.setPosition(x + w - 24, y + h / 2);
    drawIcon(this.chevron, 'chevron', st.text, 9);
  }

  private open() {
    if (this.list) return;
    const b = this.zone.getBounds();
    this.list = new DropdownList(this.scene, this.options, this.value, this.style, { x: b.x, y: b.y, w: b.width, h: b.height }, (id) => {
      this.value = id;
      this.redraw();
      this.onChange(id);
    }, () => {
      this.list = null;
    });
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.caption, this.g, this.valueText, this.chevron, this.zone];
  }

  destroy() {
    this.list?.close();
    this.caption.destroy();
    this.g.destroy();
    this.valueText.destroy();
    this.chevron.destroy();
    this.zone.destroy();
  }
}

class DropdownList {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private dim: Phaser.GameObjects.Zone;
  private bg: Phaser.GameObjects.Graphics;
  private rows: { t: Phaser.GameObjects.Text; z: Phaser.GameObjects.Zone; opt: Option }[] = [];
  private up: Phaser.GameObjects.Graphics;
  private down: Phaser.GameObjects.Graphics;
  private first = 0;
  private maxRows: number;
  private rowH = 44;
  private x: number;
  private y: number;
  private w: number;
  private dragY: number | null = null;
  private wheel: (p: unknown, o: unknown, dx: number, dy: number) => void;
  private key: (e: KeyboardEvent) => void;

  constructor(
    private scene: Phaser.Scene,
    private options: Option[],
    private value: string,
    private style: PanelStyle,
    anchor: { x: number; y: number; w: number; h: number },
    private pick: (id: string) => void,
    private closed: () => void,
  ) {
    const { W, H } = logicalSize(scene);
    const D = Depth.dropdown;
    const pad = 8;
    const below = H - (anchor.y + anchor.h) - pad;
    const above = anchor.y - pad;
    const placeBelow = below >= Math.min(options.length, 4) * this.rowH + 16 || below >= above;
    const space = placeBelow ? below : above;
    this.maxRows = Math.max(3, Math.min(options.length, Math.floor((space - 16) / this.rowH)));
    const h = this.maxRows * this.rowH + 16;
    this.x = anchor.x;
    this.w = anchor.w;
    this.y = placeBelow ? anchor.y + anchor.h + 4 : anchor.y - h - 4;
    this.x = Math.min(Math.max(pad, this.x), W - this.w - pad);

    this.dim = scene.add.zone(W / 2, H / 2, W, H).setDepth(D).setInteractive();
    this.dim.on('pointerup', () => this.close());
    this.bg = scene.add.graphics().setDepth(D + 1);
    this.bg.fillStyle(0x000000, 0.35);
    this.bg.fillRoundedRect(this.x + 2, this.y + 5, this.w, h, 14);
    this.bg.fillStyle(style.light ? 0xffffff : 0x0d1936, 1);
    this.bg.fillRoundedRect(this.x, this.y, this.w, h, 14);
    this.bg.lineStyle(1.5, style.text, 0.3);
    this.bg.strokeRoundedRect(this.x, this.y, this.w, h, 14);
    this.up = scene.add.graphics().setDepth(D + 3);
    this.down = scene.add.graphics().setDepth(D + 3);

    for (const opt of options) {
      const t = makeText(scene, 0, 0, opt.label, 16, style.text, false).setDepth(D + 2).setOrigin(0, 0.5);
      const z = scene.add.zone(0, 0, this.w - 16, this.rowH).setDepth(D + 3).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (p: Phaser.Input.Pointer) => (this.dragY = p.y));
      z.on('pointerup', (p: Phaser.Input.Pointer) => {
        const moved = this.dragY === null ? 0 : Math.abs(p.y - this.dragY);
        this.dragY = null;
        if (moved < 8) {
          this.pick(opt.id);
          this.close();
        }
      });
      z.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!p.isDown || this.dragY === null) return;
        const dy = p.y - this.dragY;
        if (Math.abs(dy) >= this.rowH) {
          this.scroll(dy < 0 ? 1 : -1);
          this.dragY = p.y;
        }
      });
      this.rows.push({ t, z, opt });
    }
    this.objs.push(this.dim, this.bg, this.up, this.down, ...this.rows.flatMap((r) => [r.t, r.z]));

    const sel = Math.max(0, options.findIndex((o) => o.id === value));
    this.first = Math.min(Math.max(0, sel - Math.floor(this.maxRows / 2)), Math.max(0, options.length - this.maxRows));
    this.render();

    this.wheel = (_p, _o, _dx, dy) => this.scroll(dy > 0 ? 1 : -1);
    scene.input.on('wheel', this.wheel);
    this.key = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowDown') this.scroll(1);
      if (e.key === 'ArrowUp') this.scroll(-1);
    };
    window.addEventListener('keydown', this.key);
  }

  private scroll(dir: number) {
    const max = Math.max(0, this.options.length - this.maxRows);
    const n = Math.min(max, Math.max(0, this.first + dir));
    if (n !== this.first) {
      this.first = n;
      this.render();
    }
  }

  private render() {
    const st = this.style;
    this.bg.setAlpha(1);
    this.rows.forEach((r, i) => {
      const vis = i >= this.first && i < this.first + this.maxRows;
      r.t.setVisible(vis);
      r.z.setVisible(vis);
      if (r.z.input) r.z.input.enabled = vis;
      if (vis) {
        const cy = this.y + 8 + (i - this.first + 0.5) * this.rowH;
        r.t.setPosition(this.x + 16, cy);
        r.z.setPosition(this.x + this.w / 2, cy);
        const sel = r.opt.id === this.value;
        r.t.setColor(hex(sel ? st.accent : st.text));
        r.t.setFontStyle(sel ? 'bold' : 'normal');
      }
    });
    const canUp = this.first > 0;
    const canDown = this.first + this.maxRows < this.options.length;
    this.up.clear().setPosition(this.x + this.w - 20, this.y + 14);
    this.down.clear().setPosition(this.x + this.w - 20, this.y + this.maxRows * this.rowH + 2);
    if (canUp) {
      this.up.setScale(1, -1);
      drawIcon(this.up, 'chevron', st.subtext, 7);
    }
    if (canDown) drawIcon(this.down, 'chevron', st.subtext, 7);
  }

  close() {
    if (!this.objs.length) return;
    this.scene.input.off('wheel', this.wheel);
    window.removeEventListener('keydown', this.key);
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.closed();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------------------------------------

export class Toast {
  private g: Phaser.GameObjects.Graphics;
  private t: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private tween?: Phaser.Tweens.Tween;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(Depth.toast).setAlpha(0);
    this.t = makeText(scene, 0, 0, '', 16, 0xffffff, true).setDepth(Depth.toast + 1).setOrigin(0.5).setAlpha(0).setAlign('center');
  }

  show(message: string, ms = 3200) {
    const { W, H } = logicalSize(this.scene);
    const maxW = Math.min(W - 32, 420);
    this.t.setWordWrapWidth(maxW - 32).setText(message);
    const w = Math.min(maxW, Math.max(160, this.t.width + 32));
    const h = this.t.height + 22;
    const cx = W / 2;
    const cy = H - 28 - h / 2;
    this.g.clear();
    this.g.fillStyle(0x0b1530, 0.96);
    this.g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    this.g.lineStyle(1.5, 0xffffff, 0.28);
    this.g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    this.g.setPosition(cx, cy);
    this.t.setPosition(cx, cy);
    this.timer?.remove();
    this.tween?.stop();
    const animate = !reducedMotion();
    this.tween = this.scene.tweens.add({
      targets: [this.g, this.t],
      alpha: 1,
      y: { from: animate ? cy + 14 : cy, to: cy },
      duration: animate ? 220 : 1,
      ease: 'Cubic.easeOut',
    });
    this.timer = this.scene.time.delayedCall(ms, () => {
      this.tween = this.scene.tweens.add({ targets: [this.g, this.t], alpha: 0, duration: animate ? 260 : 1 });
    });
  }
}
