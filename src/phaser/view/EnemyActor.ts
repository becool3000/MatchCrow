import Phaser from 'phaser';
import type { EnemyId } from '../../game/campaignData.ts';
import { getEnemyTextureSpec } from '../../game/assets/manifest.ts';

export class EnemyActor {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly flash: Phaser.GameObjects.Ellipse;
  private perch = new Phaser.Math.Vector2();
  private baseScale = 1;
  private idleTween?: Phaser.Tweens.Tween;
  private hoverTween?: Phaser.Tweens.Tween;
  private enemyId: EnemyId;
  private textureKey: string;
  private attackTextureKey: string | null;
  private animationKey: string | null = null;
  private darkCrowAttackMode: 'laser' | 'swoop' = 'laser';

  constructor(
    scene: Phaser.Scene,
    perch: Phaser.Math.Vector2,
    enemyId: EnemyId,
    textureKey: string = enemyId,
    attackTextureKey: string | null = null,
  ) {
    this.scene = scene;
    this.perch = perch.clone();
    this.enemyId = enemyId;
    this.textureKey = textureKey;
    this.attackTextureKey = attackTextureKey;
    this.root = scene.add.container(perch.x, perch.y).setDepth(46);
    this.sprite = scene.add.sprite(0, -2, textureKey).setOrigin(0.5);
    this.flash = scene.add
      .ellipse(0, -4, 52, 42, 0xffffff, 0.86)
      .setOrigin(0.5)
      .setAlpha(0);
    this.root.add([this.sprite, this.flash]);
    this.startIdle();
  }

  setEnemy(enemyId: EnemyId, textureKey: string = enemyId, attackTextureKey: string | null = null): void {
    if (this.enemyId === enemyId && this.textureKey === textureKey && this.attackTextureKey === attackTextureKey) {
      this.restore();
      return;
    }

    this.enemyId = enemyId;
    this.textureKey = textureKey;
    this.attackTextureKey = attackTextureKey;
    this.darkCrowAttackMode = 'laser';
    this.sprite.setTexture(textureKey);
    this.animationKey = null;
    this.restore();
  }

  setPerch(perch: Phaser.Math.Vector2): void {
    this.perch = perch.clone();
    this.root.setPosition(perch.x, perch.y);

    if (this.idleTween) {
      this.startIdle();
    }
  }

  setScale(scale: number): void {
    this.baseScale = scale;
    this.root.setScale(scale);
  }

  getFocusPoint(): Phaser.Math.Vector2 {
    const textureSpec = getEnemyTextureSpec(this.enemyId);

    if (textureSpec.boardHover) {
      return new Phaser.Math.Vector2(this.root.x, this.root.y + this.sprite.displayHeight * 0.02);
    }

    return new Phaser.Math.Vector2(this.root.x, this.root.y - 22 * this.baseScale);
  }

  async strikeAt(target: Phaser.Math.Vector2): Promise<void> {
    this.stopIdle();

    if (this.enemyId === 'ai-ant') {
      await this.playAIAntLaserStrike(target);
      this.startIdle();
      return;
    }

    if (this.enemyId === 'dark-crow') {
      if (this.darkCrowAttackMode === 'laser') {
        await this.playDarkCrowLaserStrike(target);
        this.darkCrowAttackMode = 'swoop';
      } else {
        await this.playDarkCrowStrike(target);
        this.darkCrowAttackMode = 'laser';
      }
      this.startIdle();
      return;
    }

    if (this.enemyId === 'frog') {
      await this.playFrogFaceStrike(target);
      this.startIdle();
      return;
    }

    if (this.enemyId === 'grasshopper') {
      await this.playGrasshopperFaceStrike(target);
      this.startIdle();
      return;
    }

    this.setAttackPose();
    const direction = target.x < this.root.x ? -1 : 1;

    await tweenPromise(this.scene, {
      targets: this.root,
      x: this.perch.x + direction * 28 * this.baseScale,
      y: this.perch.y - 6 * this.baseScale,
      angle: 8 * direction,
      duration: 180,
      yoyo: true,
      ease: 'Quad.InOut',
    });

    this.startIdle();
  }

  async brace(): Promise<void> {
    this.stopIdle();

    await tweenPromise(this.scene, {
      targets: this.root,
      scaleX: this.baseScale * 1.06,
      scaleY: this.baseScale * 0.92,
      duration: 160,
      yoyo: true,
      ease: 'Sine.InOut',
    });

    this.root.setScale(this.baseScale);
    this.startIdle();
  }

  async takeHit(): Promise<void> {
    this.stopIdle();
    this.flash.setAlpha(0.85);

    await tweenPromise(this.scene, {
      targets: this.root,
      x: this.perch.x + 14 * this.baseScale,
      angle: 10,
      duration: 120,
      yoyo: true,
      ease: 'Sine.InOut',
    });

    this.flash.setAlpha(0);
    this.startIdle();
  }

  async faint(): Promise<void> {
    this.stopIdle();

    await tweenPromise(this.scene, {
      targets: this.root,
      y: this.perch.y + 16 * this.baseScale,
      angle: 20,
      alpha: 0,
      duration: 260,
      ease: 'Quad.Out',
    });
  }

  restore(): void {
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
    this.root.setAlpha(1);
    this.root.setScale(this.baseScale);
    this.flash.setAlpha(0);
    this.startIdle();
  }

  destroy(): void {
    this.stopIdle();
    this.root.destroy(true);
  }

  private startIdle(): void {
    this.stopIdle();
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
    this.root.setAlpha(1);
    this.root.setScale(this.baseScale);
    this.flash.setAlpha(0);
    this.startSpriteAnimation();
    const textureSpec = getEnemyTextureSpec(this.enemyId);

    if (textureSpec.boardHover) {
      const hoverDistance = Math.max(26, this.sprite.displayWidth * (textureSpec.boardHoverDriftRatio ?? 0.12));
      const bobDistance = Math.max(8, this.sprite.displayHeight * (textureSpec.boardHoverBobRatio ?? 0.03));

      this.idleTween = this.scene.tweens.add({
        targets: this.root,
        x: this.perch.x + hoverDistance,
        angle: 2.6,
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });

      this.hoverTween = this.scene.tweens.add({
        targets: this.root,
        y: this.perch.y - bobDistance,
        duration: 1320,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      return;
    }

    this.idleTween = this.scene.tweens.add({
      targets: this.root,
      y: this.perch.y - 4 * this.baseScale,
      angle: -3,
      duration: 960,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private stopIdle(): void {
    this.idleTween?.remove();
    this.idleTween = undefined;
    this.hoverTween?.remove();
    this.hoverTween = undefined;
    this.stopSpriteAnimation();
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
  }

  private startSpriteAnimation(): void {
    const textureSpec = getEnemyTextureSpec(this.enemyId);

    if (textureSpec.loadAs !== 'spritesheet') {
      return;
    }

    if (textureSpec.animateIdle === false) {
      this.sprite.setFrame(textureSpec.idleFrame ?? 0);
      return;
    }

    const animationKey = this.ensureSpriteAnimation(textureSpec);
    this.sprite.play(animationKey, true);
  }

  private stopSpriteAnimation(): void {
    const textureSpec = getEnemyTextureSpec(this.enemyId);

    if (!this.animationKey) {
      if (textureSpec.loadAs === 'spritesheet') {
        this.sprite.setFrame(textureSpec.idleFrame ?? 0);
      }
      return;
    }

    this.sprite.stop();
    this.sprite.setFrame(textureSpec.idleFrame ?? 0);
  }

  private ensureSpriteAnimation(textureSpec: ReturnType<typeof getEnemyTextureSpec>): string {
    const animationKey = `enemy-idle-${this.textureKey}`;

    if (!this.scene.anims.exists(animationKey)) {
      this.scene.anims.create({
        key: animationKey,
        frames: this.scene.anims.generateFrameNumbers(this.textureKey, {
          start: 0,
          end: Math.max(0, (textureSpec.frameCount ?? 1) - 1),
        }),
        frameRate: textureSpec.frameRate ?? 15,
        repeat: -1,
      });
    }

    this.animationKey = animationKey;
    return animationKey;
  }

  private setAttackPose(): void {
    const textureSpec = getEnemyTextureSpec(this.enemyId);

    if (textureSpec.loadAs !== 'spritesheet' || textureSpec.attackFrame === undefined) {
      return;
    }

    this.sprite.setFrame(textureSpec.attackFrame);
  }

  private async playAIAntLaserStrike(target: Phaser.Math.Vector2): Promise<void> {
    this.setAttackPose();
    this.sprite.setTint(0xb6f4ff);
    const beamGraphics = this.scene.add.graphics().setDepth(62);
    const impactGraphics = this.scene.add.graphics().setDepth(63);
    const beamState = { alpha: 0, radius: 0.2 };
    const eyePoints = this.getAIAntEyePoints();

    const drawBeam = (): void => {
      beamGraphics.clear();
      impactGraphics.clear();

      if (beamState.alpha <= 0.01) {
        return;
      }

      eyePoints.forEach((eyePoint, index) => {
        const jitterX = (index === 0 ? -1 : 1) * 3 * beamState.radius;
        const jitterY = (index === 0 ? 1 : -1) * 2 * beamState.radius;
        const endPoint = new Phaser.Math.Vector2(target.x + jitterX, target.y + jitterY);

        beamGraphics.lineStyle(10 * this.baseScale, 0x27c8ff, 0.24 * beamState.alpha);
        beamGraphics.strokeLineShape(new Phaser.Geom.Line(eyePoint.x, eyePoint.y, endPoint.x, endPoint.y));
        beamGraphics.lineStyle(4 * this.baseScale, 0xc9fbff, 0.92 * beamState.alpha);
        beamGraphics.strokeLineShape(new Phaser.Geom.Line(eyePoint.x, eyePoint.y, endPoint.x, endPoint.y));

        impactGraphics.fillStyle(0x53d7ff, 0.18 * beamState.alpha);
        impactGraphics.fillCircle(endPoint.x, endPoint.y, 18 * this.baseScale * (0.75 + beamState.radius));
        impactGraphics.fillStyle(0xe7ffff, 0.78 * beamState.alpha);
        impactGraphics.fillCircle(endPoint.x, endPoint.y, 6 * this.baseScale * (0.8 + beamState.radius * 0.3));

        impactGraphics.fillStyle(0x6ce7ff, 0.78 * beamState.alpha);
        impactGraphics.fillCircle(eyePoint.x, eyePoint.y, 7 * this.baseScale * (0.65 + beamState.radius * 0.2));
      });
    };

    drawBeam();
    this.scene.cameras.main.shake(100, 0.0028, false);

    await tweenPromise(this.scene, {
      targets: beamState,
      alpha: 1,
      radius: 1,
      duration: 110,
      yoyo: true,
      ease: 'Sine.Out',
      onUpdate: () => {
        drawBeam();
      },
    });

    beamGraphics.destroy();
    impactGraphics.destroy();
    this.sprite.clearTint();
  }

  private async playDarkCrowStrike(target: Phaser.Math.Vector2): Promise<void> {
    const attackTextureSpec = getEnemyTextureSpec(this.enemyId).attackTexture;
    const attackTextureKey = this.attackTextureKey;
    const startPosition = new Phaser.Math.Vector2(this.perch.x, this.perch.y);
    const swoopTarget = new Phaser.Math.Vector2(target.x, target.y - 22 * this.baseScale);

    if (attackTextureSpec && attackTextureKey) {
      this.sprite.setTexture(attackTextureKey);
      this.sprite.play(this.ensureAttackAnimation(attackTextureKey, attackTextureSpec), true);
    }

    this.scene.cameras.main.shake(140, 0.003, false);

    await tweenPromise(this.scene, {
      targets: this.root,
      x: swoopTarget.x,
      y: swoopTarget.y,
      angle: 8,
      duration: 210,
      ease: 'Cubic.In',
    });

    await tweenPromise(this.scene, {
      targets: this.root,
      x: startPosition.x,
      y: startPosition.y,
      angle: 0,
      duration: 280,
      ease: 'Cubic.Out',
    });

    if (attackTextureKey) {
      this.sprite.stop();
      this.sprite.setTexture(this.textureKey);
      this.sprite.setFrame(0);
    }
  }

  private async playDarkCrowLaserStrike(target: Phaser.Math.Vector2): Promise<void> {
    this.sprite.setTint(0xffb3c0);
    const beamGraphics = this.scene.add.graphics().setDepth(62);
    const impactGraphics = this.scene.add.graphics().setDepth(63);
    const beamState = { alpha: 0, radius: 0.2 };
    const eyePoints = this.getDarkCrowEyePoints();

    const drawBeam = (): void => {
      beamGraphics.clear();
      impactGraphics.clear();

      if (beamState.alpha <= 0.01) {
        return;
      }

      eyePoints.forEach((eyePoint, index) => {
        const jitterX = (index === 0 ? -1 : 1) * 4 * beamState.radius;
        const jitterY = (index === 0 ? 1 : -1) * 2 * beamState.radius;
        const endPoint = new Phaser.Math.Vector2(target.x + jitterX, target.y + jitterY);

        beamGraphics.lineStyle(11 * this.baseScale, 0x7a0018, 0.28 * beamState.alpha);
        beamGraphics.strokeLineShape(new Phaser.Geom.Line(eyePoint.x, eyePoint.y, endPoint.x, endPoint.y));
        beamGraphics.lineStyle(4.5 * this.baseScale, 0xff2448, 0.95 * beamState.alpha);
        beamGraphics.strokeLineShape(new Phaser.Geom.Line(eyePoint.x, eyePoint.y, endPoint.x, endPoint.y));

        impactGraphics.fillStyle(0xb30024, 0.18 * beamState.alpha);
        impactGraphics.fillCircle(endPoint.x, endPoint.y, 19 * this.baseScale * (0.76 + beamState.radius));
        impactGraphics.fillStyle(0xff9cab, 0.8 * beamState.alpha);
        impactGraphics.fillCircle(endPoint.x, endPoint.y, 6.2 * this.baseScale * (0.8 + beamState.radius * 0.3));

        impactGraphics.fillStyle(0xff314f, 0.82 * beamState.alpha);
        impactGraphics.fillCircle(eyePoint.x, eyePoint.y, 7.6 * this.baseScale * (0.68 + beamState.radius * 0.22));
      });
    };

    drawBeam();
    this.scene.cameras.main.shake(105, 0.0028, false);

    await tweenPromise(this.scene, {
      targets: beamState,
      alpha: 1,
      radius: 1,
      duration: 130,
      yoyo: true,
      ease: 'Sine.Out',
      onUpdate: () => {
        drawBeam();
      },
    });

    beamGraphics.destroy();
    impactGraphics.destroy();
    this.sprite.clearTint();
  }

  private async playFrogFaceStrike(target: Phaser.Math.Vector2): Promise<void> {
    this.setAttackPose();
    const startPosition = new Phaser.Math.Vector2(this.perch.x, this.perch.y);
    const faceTarget = new Phaser.Math.Vector2(
      target.x,
      target.y + this.sprite.displayHeight * 0.16,
    );

    this.scene.cameras.main.shake(110, 0.0024, false);

    await tweenPromise(this.scene, {
      targets: this.root,
      x: faceTarget.x,
      y: faceTarget.y,
      angle: 6,
      duration: 190,
      ease: 'Cubic.In',
    });

    await tweenPromise(this.scene, {
      targets: this.root,
      scaleX: this.baseScale * 1.06,
      scaleY: this.baseScale * 0.92,
      duration: 80,
      yoyo: true,
      ease: 'Sine.Out',
    });

    await tweenPromise(this.scene, {
      targets: this.root,
      x: startPosition.x,
      y: startPosition.y,
      angle: 0,
      duration: 240,
      ease: 'Cubic.Out',
    });
  }

  private async playGrasshopperFaceStrike(target: Phaser.Math.Vector2): Promise<void> {
    this.setAttackPose();
    const startPosition = new Phaser.Math.Vector2(this.perch.x, this.perch.y);
    const faceTarget = new Phaser.Math.Vector2(
      target.x,
      target.y + this.sprite.displayHeight * 0.04,
    );

    this.scene.cameras.main.shake(120, 0.0028, false);

    await tweenPromise(this.scene, {
      targets: this.root,
      x: faceTarget.x,
      y: faceTarget.y,
      angle: 7,
      duration: 210,
      ease: 'Cubic.In',
    });

    await tweenPromise(this.scene, {
      targets: this.root,
      scaleX: this.baseScale * 1.05,
      scaleY: this.baseScale * 0.95,
      duration: 70,
      yoyo: true,
      ease: 'Sine.Out',
    });

    await tweenPromise(this.scene, {
      targets: this.root,
      x: startPosition.x,
      y: startPosition.y,
      angle: 0,
      duration: 260,
      ease: 'Cubic.Out',
    });
  }

  private getAIAntEyePoints(): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(this.root.x - 30 * this.baseScale, this.root.y - 40 * this.baseScale),
      new Phaser.Math.Vector2(this.root.x + 30 * this.baseScale, this.root.y - 40 * this.baseScale),
    ];
  }

  private getDarkCrowEyePoints(): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(this.root.x - 34 * this.baseScale, this.root.y - 28 * this.baseScale),
      new Phaser.Math.Vector2(this.root.x + 34 * this.baseScale, this.root.y - 28 * this.baseScale),
    ];
  }

  private ensureAttackAnimation(
    textureKey: string,
    attackTextureSpec: NonNullable<ReturnType<typeof getEnemyTextureSpec>['attackTexture']>,
  ): string {
    const animationKey = `enemy-attack-${textureKey}`;

    if (!this.scene.anims.exists(animationKey)) {
      this.scene.anims.create({
        key: animationKey,
        frames: this.scene.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: Math.max(0, attackTextureSpec.frameCount - 1),
        }),
        frameRate: attackTextureSpec.frameRate,
        repeat: -1,
      });
    }

    return animationKey;
  }
}

function tweenPromise(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      ...config,
      onComplete: () => resolve(),
    });
  });
}
