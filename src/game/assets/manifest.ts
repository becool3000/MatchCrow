import { TILE_KINDS, type TileKind } from '../simulation/types.ts';
import { ENEMY_DEFINITIONS, type EnemyId } from '../campaignData.ts';

const SPRITE_CACHE_BUST = `${Date.now()}`;
const BASE_URL = import.meta.env.BASE_URL;

function spritePath(filename: string): string {
  return `${BASE_URL}sprites/${filename}?v=${SPRITE_CACHE_BUST}`;
}

function audioPath(filename: string): string {
  return `${BASE_URL}audio/${filename}?v=${SPRITE_CACHE_BUST}`;
}

export function getEnemyTexturePath(enemyId: EnemyId, cacheBust = SPRITE_CACHE_BUST): string {
  return `${BASE_URL}sprites/enemies/${enemyId}.png?v=${cacheBust}`;
}

export interface EnemyTextureSpec {
  loadAs: 'image' | 'spritesheet';
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameRate?: number;
  scaleMultiplier?: number;
  animateIdle?: boolean;
  idleFrame?: number;
  attackFrame?: number;
  boardHover?: boolean;
  suppressPerch?: boolean;
  boardHoverScaleRatio?: number;
  boardHoverYRatio?: number;
  boardHoverDriftRatio?: number;
  boardHoverBobRatio?: number;
  attackTexture?: {
    fileName: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    frameRate: number;
  };
}

const DEFAULT_ENEMY_TEXTURE_SPEC: EnemyTextureSpec = {
  loadAs: 'image',
};

const ENEMY_TEXTURE_SPECS: Record<EnemyId, EnemyTextureSpec> = {
  mite: DEFAULT_ENEMY_TEXTURE_SPEC,
  midge: {
    loadAs: 'spritesheet',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 4,
    frameRate: 15,
  },
  hornet: {
    loadAs: 'spritesheet',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 2,
    frameRate: 12,
  },
  wasp: {
    loadAs: 'spritesheet',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 2,
    frameRate: 12,
  },
  grasshopper: {
    loadAs: 'spritesheet',
    frameWidth: 256,
    frameHeight: 512,
    frameCount: 2,
    scaleMultiplier: 2,
    animateIdle: false,
    idleFrame: 0,
    attackFrame: 1,
  },
  frog: {
    loadAs: 'spritesheet',
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 2,
    scaleMultiplier: 2,
    animateIdle: false,
    idleFrame: 1,
    attackFrame: 0,
  },
  'bumble-bee-queen': {
    loadAs: 'spritesheet',
    frameWidth: 450,
    frameHeight: 450,
    frameCount: 2,
    frameRate: 6,
    boardHover: true,
    suppressPerch: true,
    boardHoverScaleRatio: 0.58,
    boardHoverYRatio: 0.22,
    boardHoverDriftRatio: 0.12,
    boardHoverBobRatio: 0.03,
  },
  'ai-ant': {
    loadAs: 'spritesheet',
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 2,
    frameRate: 6,
    attackFrame: 1,
    boardHover: true,
    suppressPerch: true,
    boardHoverScaleRatio: 0.58,
    boardHoverYRatio: 0.22,
    boardHoverDriftRatio: 0.12,
    boardHoverBobRatio: 0.03,
  },
  'dark-crow': {
    loadAs: 'spritesheet',
    frameWidth: 384,
    frameHeight: 256,
    frameCount: 4,
    frameRate: 8,
    boardHover: true,
    suppressPerch: true,
    boardHoverScaleRatio: 0.42,
    boardHoverYRatio: 0.08,
    boardHoverDriftRatio: 0.2,
    boardHoverBobRatio: 0.035,
    attackTexture: {
      fileName: 'dark-crow-attack.png',
      frameWidth: 384,
      frameHeight: 256,
      frameCount: 2,
      frameRate: 12,
    },
  },
};

export function getEnemyTextureSpec(enemyId: EnemyId): EnemyTextureSpec {
  return ENEMY_TEXTURE_SPECS[enemyId];
}

export function getEnemyAttackTextureKey(enemyId: EnemyId): string {
  return `${enemyId}-attack`;
}

export function getEnemyAttackTexturePath(
  enemyId: EnemyId,
  cacheBust = SPRITE_CACHE_BUST,
): string | null {
  const attackTexture = ENEMY_TEXTURE_SPECS[enemyId].attackTexture;

  if (!attackTexture) {
    return null;
  }

  return `${BASE_URL}sprites/enemies/${attackTexture.fileName}?v=${cacheBust}`;
}

export const TILE_TEXTURE_KEYS: Record<TileKind, string> = {
  key: 'tile-key',
  coin: 'tile-coin',
  ring: 'tile-ring',
  button: 'tile-button',
  trinket: 'tile-trinket',
  gem: 'tile-gem',
  thimble: 'tile-thimble',
  medal: 'tile-medal',
  berry: 'tile-berry',
  pin: 'tile-pin',
  star: 'tile-star',
  shell: 'tile-shell',
  compass: 'tile-compass',
  acorn: 'tile-acorn',
  hourglass: 'tile-hourglass',
};

export const CROW_TEXTURE_KEYS = {
  idleA: 'crow-idle-a',
  idleB: 'crow-idle-b',
  fly: 'crow-fly',
};

export const FX_TEXTURE_KEYS = {
  feather: 'fx-feather',
  sparkle: 'fx-sparkle',
};

export const BACKGROUND_TEXTURE_KEYS = {
  duskForest: 'bg-dusk-forest',
};

export const AUDIO_KEYS = {
  crowaxidBgm: 'bgm-crowaxid',
  playlistBgm20260405: 'bgm-playlist-20260405',
} as const;

export const BACKGROUND_MUSIC_PLAYLIST = [
  AUDIO_KEYS.playlistBgm20260405,
  AUDIO_KEYS.crowaxidBgm,
] as const;

export const ENEMY_TEXTURE_KEYS = Object.keys(ENEMY_DEFINITIONS) as EnemyId[];

export const TEXTURE_FILE_PATHS: Record<string, string> = {
  [TILE_TEXTURE_KEYS.key]: spritePath('tile-key.png'),
  [TILE_TEXTURE_KEYS.coin]: spritePath('tile-coin.png'),
  [TILE_TEXTURE_KEYS.ring]: spritePath('tile-ring.png'),
  [TILE_TEXTURE_KEYS.button]: spritePath('tile-button.png'),
  [TILE_TEXTURE_KEYS.trinket]: spritePath('tile-trinket.png'),
  [TILE_TEXTURE_KEYS.gem]: spritePath('tile-gem.png'),
  [TILE_TEXTURE_KEYS.thimble]: spritePath('tile-thimble.png'),
  [TILE_TEXTURE_KEYS.medal]: spritePath('tile-medal.png'),
  [TILE_TEXTURE_KEYS.berry]: spritePath('tile-berry.png'),
  [TILE_TEXTURE_KEYS.pin]: spritePath('tile-pin.png'),
  [TILE_TEXTURE_KEYS.star]: spritePath('tile-star.png'),
  [TILE_TEXTURE_KEYS.shell]: spritePath('tile-shell.png'),
  [TILE_TEXTURE_KEYS.compass]: spritePath('tile-compass.png'),
  [TILE_TEXTURE_KEYS.acorn]: spritePath('tile-acorn.png'),
  [TILE_TEXTURE_KEYS.hourglass]: spritePath('tile-hourglass.png'),
  [CROW_TEXTURE_KEYS.idleA]: spritePath('crow-idle-a.png'),
  [CROW_TEXTURE_KEYS.idleB]: spritePath('crow-idle-b.png'),
  [CROW_TEXTURE_KEYS.fly]: spritePath('crow-fly.png'),
  [FX_TEXTURE_KEYS.feather]: spritePath('fx-feather.png'),
  [FX_TEXTURE_KEYS.sparkle]: spritePath('fx-sparkle.png'),
  [BACKGROUND_TEXTURE_KEYS.duskForest]: `${BASE_URL}backgrounds/pixel-forest.png?v=${SPRITE_CACHE_BUST}`,
  ...Object.fromEntries(
    ENEMY_TEXTURE_KEYS.map((enemyId) => [enemyId, getEnemyTexturePath(enemyId)]),
  ),
};

export const AUDIO_FILE_PATHS: Record<string, string> = {
  [AUDIO_KEYS.crowaxidBgm]: audioPath('Crowaxid.wav'),
  [AUDIO_KEYS.playlistBgm20260405]: audioPath('audio-20260405-0329-08.4670849.m4a'),
};

export const ALL_TEXTURE_KEYS = Object.keys(TEXTURE_FILE_PATHS);

export const DEFAULT_STATUS =
  'Swap adjacent shiny tiles, beat the 1:00 clock, and chase a high score.';

export const BOARD_COLORS = {
  border: '#f5d5a4',
  fill: '#2b2037',
  inner: '#342748',
  cell: '#46315d',
  cellShadow: '#261834',
  sparkle: '#fff2b3',
  playerPerch: '#6a4427',
  playerPerchShadow: '#3d2413',
  enemyPerch: '#4a315d',
  enemyPerchShadow: '#22122c',
};

export const TILE_LABELS: Record<TileKind, string> = {
  key: 'Key',
  coin: 'Coin',
  ring: 'Ring',
  button: 'Button',
  trinket: 'Trinket',
  gem: 'Gem',
  thimble: 'Thimble',
  medal: 'Medal',
  berry: 'Berry',
  pin: 'Pin',
  star: 'Star',
  shell: 'Shell',
  compass: 'Compass',
  acorn: 'Acorn',
  hourglass: 'Hourglass',
};

export const TILE_ORDER = [...TILE_KINDS];
