import Phaser from 'phaser';

export const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const dpr = () => Math.min(3, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Depth = { sky: 0, ground: 10, panel: 20, hud: 30, bar: 40, sheet: 100, dropdown: 200, toast: 300 } as const;

export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color: number | string,
  bold = false,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color: typeof color === 'number' ? hex(color) : color,
    resolution: dpr(),
  });
}

/** Logical (CSS pixel) size of the game: the canvas is drawn at device pixel ratio and the camera zooms to match. */
export function logicalSize(scene: Phaser.Scene) {
  const z = scene.cameras.main.zoom || 1;
  return { W: scene.scale.width / z, H: scene.scale.height / z };
}

/** Zoom the camera to device pixel ratio so the scene can be laid out in CSS pixels. */
export function setupCamera(scene: Phaser.Scene): { W: number; H: number } {
  const D = dpr();
  const cam = scene.cameras.main;
  const W = scene.scale.width / D;
  const H = scene.scale.height / D;
  cam.setZoom(D);
  cam.centerOn(W / 2, H / 2);
  return { W, H };
}
