import Phaser from 'phaser';
import { app } from '../state';

/** Loads the bundled font before the first scene so text never flashes, then routes. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const go = () => {
      const returning = app.place && app.settings.methodChosen;
      this.scene.start(returning ? 'Main' : 'Welcome');
    };
    if (document.fonts?.load) {
      Promise.all([document.fonts.load('400 16px Nunito'), document.fonts.load('700 16px Nunito')])
        .catch(() => undefined)
        .finally(go);
    } else {
      go();
    }
  }
}
