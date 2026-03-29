import Phaser from 'phaser';
import { CROW_TEXTURE_KEYS } from '../../game/assets/manifest.ts';

export class CrowActor {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private perch = new Phaser.Math.Vector2();
  private baseScale = 1;
  private idleTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, perch: Phaser.Math.Vector2) {
    this.scene = scene;
    this.sprite = scene.add
      .sprite(perch.x, perch.y, CROW_TEXTURE_KEYS.idleA)
      .setOrigin(0.5, 0.8)
      .setDepth(50);
    this.sprite.postFX.addGlow(0xffe1a4, 0.45, 0.08, false, 0.12, 8);
    this.ensureIdleAnimation();
    this.setPerch(perch);
    this.startIdle();
  }

  setPerch(perch: Phaser.Math.Vector2): void {
    this.perch = perch.clone();
    this.sprite.setPosition(perch.x, perch.y);

    if (this.idleTween) {
      this.startIdle();
    }
  }

  setScale(scale: number): void {
    this.baseScale = scale;
    this.sprite.setScale(scale);
  }

  getFocusPoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.32);
  }

  async flyTo(target: Phaser.Math.Vector2): Promise<void> {
    this.stopIdle();
    this.sprite.stop();
    this.sprite.setTexture(CROW_TEXTURE_KEYS.fly);
    this.sprite.setFlipX(target.x > this.sprite.x);

    await tweenPromise(this.scene, {
      targets: this.sprite,
      x: target.x,
      y: target.y - this.sprite.displayHeight * 0.15,
      duration: 360,
      ease: 'Sine.InOut',
    });
  }

  async returnHome(): Promise<void> {
    this.sprite.stop();
    this.sprite.setTexture(CROW_TEXTURE_KEYS.fly);
    this.sprite.setFlipX(this.perch.x > this.sprite.x);

    await tweenPromise(this.scene, {
      targets: this.sprite,
      x: this.perch.x,
      y: this.perch.y,
      duration: 320,
      ease: 'Sine.InOut',
    });

    this.startIdle();
  }

  async hop(height = 10, duration = 240): Promise<void> {
    this.stopIdle();
    this.sprite.setTexture(CROW_TEXTURE_KEYS.idleB);

    await tweenPromise(this.scene, {
      targets: this.sprite,
      y: this.perch.y - height,
      angle: 5,
      duration,
      yoyo: true,
      ease: 'Quad.Out',
    });

    this.startIdle();
  }

  async takeHit(): Promise<void> {
    this.stopIdle();
    const startX = this.perch.x;
    const startY = this.perch.y;

    await tweenPromise(this.scene, {
      targets: this.sprite,
      x: startX - 10,
      y: startY + 4,
      angle: -10,
      alpha: 0.85,
      duration: 110,
      yoyo: true,
      ease: 'Sine.InOut',
    });

    this.sprite.setAlpha(1);
    this.startIdle();
  }

  async celebrate(): Promise<void> {
    this.stopIdle();
    this.sprite.setTexture(CROW_TEXTURE_KEYS.idleB);

    await tweenPromise(this.scene, {
      targets: this.sprite,
      y: this.perch.y - 14,
      angle: 8,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.Out',
    });

    this.startIdle();
  }

  destroy(): void {
    this.stopIdle();
    this.sprite.destroy();
  }

  private startIdle(): void {
    this.stopIdle();
    this.sprite.setTexture(CROW_TEXTURE_KEYS.idleA);
    this.sprite.setAngle(0);
    this.sprite.setAlpha(1);
    this.sprite.setScale(this.baseScale);
    this.sprite.setY(this.perch.y);
    this.sprite.play('crow-idle');
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      y: this.perch.y - 4,
      angle: 4,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private stopIdle(): void {
    this.sprite.stop();
    this.idleTween?.remove();
    this.idleTween = undefined;
    this.sprite.setAngle(0);
    this.sprite.setY(this.perch.y);
  }

  private ensureIdleAnimation(): void {
    if (this.scene.anims.exists('crow-idle')) {
      return;
    }

    this.scene.anims.create({
      key: 'crow-idle',
      frames: [{ key: CROW_TEXTURE_KEYS.idleA }, { key: CROW_TEXTURE_KEYS.idleB }],
      frameRate: 0.25,
      repeat: -1,
    });
  }
}

function tweenPromise(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig,
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      ...config,
      onComplete: () => resolve(),
    });
  });
}
