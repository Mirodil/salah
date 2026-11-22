import Phaser from 'phaser';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import { BootScene } from './scenes/BootScene';
import { WelcomeScene } from './scenes/WelcomeScene';
import { MainScene } from './scenes/MainScene';
import { magneticDeclination } from './services/compass';
import { initInstall } from './services/install';
import { dpr } from './ui/theme';

initInstall();

const parent = document.getElementById('game')!;
const size = () => ({ W: Math.max(320, parent.clientWidth || window.innerWidth), H: Math.max(300, parent.clientHeight || window.innerHeight) });

const { W, H } = size();
const D = dpr();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: Math.round(W * D),
  height: Math.round(H * D),
  backgroundColor: '#0b1530',
  antialias: true,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / D },
  scene: [BootScene, WelcomeScene, MainScene],
  input: { activePointers: 2 },
  disableContextMenu: true,
});

/** Keep the canvas at device resolution and re-lay out the active scene on resize and rotation. */
function onResize() {
  const s = size();
  game.scale.resize(Math.round(s.W * D), Math.round(s.H * D));
  game.events.emit('app-resize', s.W, s.H);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

if ('serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        game.events.emit('app-updated');
      },
      onOfflineReady() {
        game.events.emit('app-offline-ready');
      },
    });
  });
}

// handy for debugging and browser tests
(window as unknown as { __game: Phaser.Game; __salah: unknown }).__game = game;
(window as unknown as { __salah: unknown }).__salah = { magneticDeclination };
