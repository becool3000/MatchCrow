import Phaser from 'phaser';

export const HEART_ACCENT_COLORS = [
  '#fff8f4',
  '#ffc8dc',
  '#f7c6a5',
  '#f2e1a4',
  '#d9c9ff',
  '#bcebd6',
] as const;

export const HEART_TEXT_VARIANTS = ['♥', '♡', '❥'] as const;

interface HeartGraphicOptions {
  size: number;
  fillColor: string;
  strokeColor?: string;
  fillAlpha?: number;
  strokeAlpha?: number;
  strokeWidth?: number;
}

export function pickHeartAccentColor(rng: () => number = Math.random): string {
  return HEART_ACCENT_COLORS[Math.floor(rng() * HEART_ACCENT_COLORS.length)] ?? HEART_ACCENT_COLORS[0];
}

export function pickHeartTextVariant(rng: () => number = Math.random): string {
  return HEART_TEXT_VARIANTS[Math.floor(rng() * HEART_TEXT_VARIANTS.length)] ?? HEART_TEXT_VARIANTS[0];
}

export function createHeartGraphic(
  scene: Phaser.Scene,
  options: HeartGraphicOptions,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  drawHeartGraphic(graphics, options);
  return graphics;
}

export function drawHeartGraphic(
  graphics: Phaser.GameObjects.Graphics,
  options: HeartGraphicOptions,
): void {
  const fillColor = Phaser.Display.Color.HexStringToColor(options.fillColor).color;
  const strokeColor = options.strokeColor
    ? Phaser.Display.Color.HexStringToColor(options.strokeColor).color
    : undefined;
  const points = buildHeartPoints(options.size);

  graphics.clear();

  if (strokeColor !== undefined) {
    graphics.lineStyle(
      options.strokeWidth ?? Math.max(2, options.size * 0.08),
      strokeColor,
      options.strokeAlpha ?? 0.9,
    );
    graphics.strokePoints(points, true, true);
  }

  graphics.fillStyle(fillColor, options.fillAlpha ?? 1);
  graphics.fillPoints(points, true);
}

function buildHeartPoints(size: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  const scale = size / 34;

  for (let index = 0; index <= 36; index += 1) {
    const t = (Math.PI * 2 * index) / 36;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push(new Phaser.Math.Vector2(x * scale, -y * scale + size * 0.06));
  }

  return points;
}
