import Phaser from 'phaser';
import './style.css';
import { CrowsCacheGame } from './game/CrowsCacheGame.ts';
import { BootScene } from './phaser/scenes/BootScene.ts';
import { GameScene } from './phaser/scenes/GameScene.ts';
import { createHud } from './ui/createHud.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

const controller = new CrowsCacheGame();
const hud = createHud(app, controller.getState());
const gameScene = new GameScene(controller, hud);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: hud.canvasHost,
  width: hud.canvasHost.clientWidth || 720,
  height: hud.canvasHost.clientHeight || 720,
  backgroundColor: '#120f1e',
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: hud.canvasHost,
  },
  scene: [new BootScene(), gameScene],
});

hud.onRestart(() => {
  controller.restart();
});

hud.onStart(() => {
  controller.restart();
});

hud.onSpecial((slotId) => {
  void gameScene.useSpecial(slotId);
});

hud.onReward((rewardId) => {
  void gameScene.pickReward(rewardId);
});

hud.onSkip(() => {
  void gameScene.skipSpecial();
});

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
