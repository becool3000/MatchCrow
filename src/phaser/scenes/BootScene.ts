import Phaser from 'phaser';
import {
  ALL_TEXTURE_KEYS,
  AUDIO_FILE_PATHS,
  ENEMY_TEXTURE_KEYS,
  TEXTURE_FILE_PATHS,
  getEnemyAttackTextureKey,
  getEnemyAttackTexturePath,
  getEnemyTexturePath,
  getEnemyTextureSpec,
} from '../../game/assets/manifest.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const enemyTextureKeySet = new Set<string>(ENEMY_TEXTURE_KEYS);

    Object.entries(TEXTURE_FILE_PATHS)
      .filter(([key]) => !enemyTextureKeySet.has(key))
      .forEach(([key, path]) => {
      this.load.image(key, path);
      });
    ENEMY_TEXTURE_KEYS.forEach((enemyId) => {
      const textureSpec = getEnemyTextureSpec(enemyId);

      if (textureSpec.loadAs === 'spritesheet') {
        this.load.spritesheet(enemyId, getEnemyTexturePath(enemyId), {
          frameWidth: textureSpec.frameWidth ?? 32,
          frameHeight: textureSpec.frameHeight ?? 32,
          endFrame:
            textureSpec.frameCount && textureSpec.frameCount > 0
              ? textureSpec.frameCount - 1
              : undefined,
        });
      } else {
        this.load.image(enemyId, getEnemyTexturePath(enemyId));
      }

      const attackTexturePath = getEnemyAttackTexturePath(enemyId);

      if (textureSpec.attackTexture && attackTexturePath) {
        this.load.spritesheet(getEnemyAttackTextureKey(enemyId), attackTexturePath, {
          frameWidth: textureSpec.attackTexture.frameWidth,
          frameHeight: textureSpec.attackTexture.frameHeight,
          endFrame: Math.max(0, textureSpec.attackTexture.frameCount - 1),
        });
      }
    });
    Object.entries(AUDIO_FILE_PATHS).forEach(([key, path]) => {
      this.load.audio(key, path);
    });
  }

  create(): void {
    ALL_TEXTURE_KEYS.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
    ENEMY_TEXTURE_KEYS.forEach((enemyId) => {
      const textureSpec = getEnemyTextureSpec(enemyId);

      if (textureSpec.attackTexture) {
        this.textures.get(getEnemyAttackTextureKey(enemyId)).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
    this.scene.start('game');
  }
}
