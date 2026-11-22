import Phaser from 'phaser';
import type { Rect } from '../core/layout';
import type { PanelStyle } from '../core/skyPalette';
import { Depth, logicalSize, reducedMotion } from './theme';

/** A modal panel that fades and slides in (200 to 300 ms), with a dimmed, tappable backdrop. */
export class Sheet {
  readonly container: Phaser.GameObjects.Container;
  /** Everything inside the sheet goes here, so it can be scaled to fit short screens. */
  readonly content: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Graphics;
  private catcher: Phaser.GameObjects.Zone;
  private closing = false;

  constructor(
    private scene: Phaser.Scene,
    readonly style: PanelStyle,
    readonly rect: Rect,
    private onClosed: () => void,
    opts: { radius?: number; dim?: boolean; dismissable?: boolean } = {},
  ) {
    const radius = opts.radius ?? 22;
    const dimmed = opts.dim ?? true;
    const dismissable = opts.dismissable ?? true;
    const { W, H } = logicalSize(scene);
    this.dim = scene.add.graphics().setDepth(Depth.sheet - 1).setAlpha(0);
    if (dimmed) {
      this.dim.fillStyle(0x000000, 0.5);
      this.dim.fillRect(0, 0, W, H);
    }
    this.catcher = scene.add.zone(W / 2, H / 2, W, H).setDepth(Depth.sheet - 1).setInteractive();
    if (dismissable) this.catcher.on('pointerup', () => this.close());

    this.container = scene.add.container(0, 0).setDepth(Depth.sheet).setAlpha(0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.35);
    bg.fillRoundedRect(rect.x + 2, rect.y + 6, rect.w, rect.h, radius);
    bg.fillStyle(style.fill, style.alpha);
    bg.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, radius);
    bg.lineStyle(1.5, style.text, 0.25);
    bg.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, radius);
    // swallow taps on the panel so they do not reach the backdrop
    const panelZone = scene.add.zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h).setInteractive();
    this.content = scene.add.container(0, 0);
    this.container.add([bg, panelZone, this.content]);

    const animate = !reducedMotion();
    this.container.y = animate ? 24 : 0;
    scene.tweens.add({ targets: this.container, alpha: 1, y: 0, duration: animate ? 260 : 1, ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: this.dim, alpha: 1, duration: animate ? 220 : 1 });
  }

  add(...objs: Phaser.GameObjects.GameObject[]) {
    this.content.add(objs);
  }

  addWidget(w: { objects(): Phaser.GameObjects.GameObject[] }) {
    this.content.add(w.objects());
  }

  /** Scale the content down (about the top centre of the panel) when it is taller than the panel. */
  fitContent(contentH: number, pad = 16): void {
    const s = Math.min(1, (this.rect.h - pad) / contentH);
    if (s >= 1) return;
    const px = this.rect.x + this.rect.w / 2;
    const py = this.rect.y + pad / 2;
    this.content.setScale(s).setPosition(px * (1 - s), py * (1 - s));
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    const animate = !reducedMotion();
    const done = () => {
      this.container.destroy();
      this.dim.destroy();
      this.catcher.destroy();
      this.onClosed();
    };
    this.catcher.disableInteractive();
    // a fading sheet must not keep catching taps meant for whatever replaces it
    const mute = (list: Phaser.GameObjects.GameObject[]) => {
      for (const o of list) {
        if (o.input) o.disableInteractive();
        const kids = (o as Phaser.GameObjects.Container).list;
        if (kids) mute(kids);
      }
    };
    mute(this.container.list);
    // the entry tween may still be running (a fast double tap): stop it so the two do not fight
    this.scene.tweens.killTweensOf([this.container, this.dim]);
    this.scene.tweens.add({ targets: this.container, alpha: 0, y: animate ? 20 : 0, duration: animate ? 200 : 1, ease: 'Cubic.easeIn', onComplete: done });
    this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: animate ? 200 : 1 });
  }
}
