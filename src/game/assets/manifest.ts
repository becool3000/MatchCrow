import { TILE_KINDS, type TileKind } from '../simulation/types.ts';

const SPRITE_CACHE_BUST = `${Date.now()}`;
const BASE_URL = import.meta.env.BASE_URL;

function spritePath(filename: string): string {
  return `${BASE_URL}sprites/${filename}?v=${SPRITE_CACHE_BUST}`;
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
