import Phaser from 'phaser';
import { ALL_TEXTURE_KEYS, TEXTURE_FILE_PATHS } from '../../game/assets/manifest.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    Object.entries(TEXTURE_FILE_PATHS).forEach(([key, path]) => {
      this.load.image(key, path);
    });
  }

  create(): void {
    ALL_TEXTURE_KEYS.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
    this.scene.start('game');
  }
}
