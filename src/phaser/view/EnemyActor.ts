import Phaser from 'phaser';
import { ENEMY_DEFINITIONS, type EnemyId } from '../../game/simulation/types.ts';

export class EnemyActor {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private perch = new Phaser.Math.Vector2();
  private baseScale = 1;
  private idleTween?: Phaser.Tweens.Tween;
  private flash?: Phaser.GameObjects.Ellipse;
  private enemyId: EnemyId;

  constructor(scene: Phaser.Scene, perch: Phaser.Math.Vector2, enemyId: EnemyId) {
    this.scene = scene;
    this.perch = perch.clone();
    this.enemyId = enemyId;
    this.root = scene.add.container(perch.x, perch.y).setDepth(46);
    this.rebuild(enemyId);
    this.startIdle();
  }

  setEnemy(enemyId: EnemyId): void {
    if (this.enemyId === enemyId) {
      this.restore();
      return;
    }

    this.enemyId = enemyId;
    this.rebuild(enemyId);
    this.startIdle();
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
    return new Phaser.Math.Vector2(this.root.x, this.root.y - 24 * this.baseScale);
  }

  async strikeAt(target: Phaser.Math.Vector2): Promise<void> {
    this.stopIdle();
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
    this.flash?.setAlpha(0.85);

    await tweenPromise(this.scene, {
      targets: this.root,
      x: this.perch.x + 14 * this.baseScale,
      angle: 10,
      duration: 120,
      yoyo: true,
      ease: 'Sine.InOut',
    });

    this.flash?.setAlpha(0);
    this.startIdle();
  }

  async faint(): Promise<void> {
    this.stopIdle();

    await tweenPromise(this.scene, {
      targets: this.root,
      y: this.perch.y + 16 * this.baseScale,
      angle: 20,
      alpha: 0.5,
      duration: 260,
      ease: 'Quad.Out',
    });
  }

  restore(): void {
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
    this.root.setAlpha(1);
    this.root.setScale(this.baseScale);
    this.flash?.setAlpha(0);
    this.startIdle();
  }

  destroy(): void {
    this.stopIdle();
    this.root.destroy(true);
  }

  private rebuild(enemyId: EnemyId): void {
    this.root.removeAll(true);

    const { colors } = ENEMY_DEFINITIONS[enemyId];
    const shadow = this.scene.add
      .ellipse(0, 14, 54, 18, Phaser.Display.Color.HexStringToColor(colors.shadow).color, 0.85)
      .setOrigin(0.5);
    const body = this.scene.add
      .ellipse(0, -4, 48, 38, Phaser.Display.Color.HexStringToColor(colors.body).color, 1)
      .setOrigin(0.5);
    const belly = this.scene.add
      .ellipse(0, 2, 24, 18, Phaser.Display.Color.HexStringToColor(colors.accent).color, 0.95)
      .setOrigin(0.5);
    const eyeLeft = this.scene.add
      .rectangle(-8, -10, 6, 6, Phaser.Display.Color.HexStringToColor(colors.eye).color)
      .setOrigin(0.5);
    const eyeRight = this.scene.add
      .rectangle(8, -10, 6, 6, Phaser.Display.Color.HexStringToColor(colors.eye).color)
      .setOrigin(0.5);
    const brow = this.scene.add
      .rectangle(0, -16, 30, 4, Phaser.Display.Color.HexStringToColor(colors.shadow).color)
      .setOrigin(0.5);
    const accentShapes = createAccentShapes(this.scene, enemyId, colors.accent);

    this.flash = this.scene.add
      .ellipse(0, -4, 52, 42, 0xffffff, 0.86)
      .setOrigin(0.5)
      .setAlpha(0);

    this.root.add([shadow, body, belly, ...accentShapes, brow, eyeLeft, eyeRight, this.flash]);
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setScale(this.baseScale);
  }

  private startIdle(): void {
    this.stopIdle();
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
    this.root.setAlpha(1);
    this.root.setScale(this.baseScale);
    this.flash?.setAlpha(0);
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
    this.root.setPosition(this.perch.x, this.perch.y);
    this.root.setAngle(0);
  }
}

function createAccentShapes(
  scene: Phaser.Scene,
  enemyId: EnemyId,
  accentColor: string,
): Phaser.GameObjects.Shape[] {
  const color = Phaser.Display.Color.HexStringToColor(accentColor).color;

  switch (enemyId) {
    case 'mole':
      return [
        scene.add.rectangle(0, -2, 18, 8, color).setOrigin(0.5),
        scene.add.rectangle(-18, 6, 8, 6, color).setOrigin(0.5),
        scene.add.rectangle(18, 6, 8, 6, color).setOrigin(0.5),
      ];
    case 'magpie':
      return [
        scene.add.triangle(-14, -2, 0, 0, 12, 8, 12, -8, color).setOrigin(0.5),
        scene.add.triangle(14, 2, 0, 0, -10, 6, -10, -6, color).setOrigin(0.5),
        scene.add.rectangle(0, 14, 12, 6, color).setOrigin(0.5),
      ];
    case 'toad':
      return [
        scene.add.ellipse(-14, -4, 10, 8, color).setOrigin(0.5),
        scene.add.ellipse(14, -4, 10, 8, color).setOrigin(0.5),
        scene.add.ellipse(0, 10, 20, 8, color).setOrigin(0.5),
      ];
    case 'owl':
      return [
        scene.add.triangle(-14, -20, 0, 0, 8, 10, 10, -8, color).setOrigin(0.5),
        scene.add.triangle(14, -20, 0, 0, -8, 10, -10, -8, color).setOrigin(0.5),
        scene.add.rectangle(0, 10, 18, 10, color).setOrigin(0.5),
      ];
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
