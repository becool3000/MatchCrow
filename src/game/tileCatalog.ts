import { TILE_TEXTURE_KEYS } from './assets/manifest.ts';
import { TILE_ROLES, type RunTilePool, type TileKind, type TileRole } from './simulation/types.ts';

export interface TileDefinition {
  kind: TileKind;
  role: TileRole;
  label: string;
  unlockLevel: number;
  textureKey: string;
  order: number;
}

export const TILE_ROLE_LABELS: Record<TileRole, string> = {
  weak: 'Control',
  damage: 'Damage',
  grit: 'Grit',
  guard: 'Guard',
  heal: 'Heal',
};

export const DEFAULT_RUN_TILE_POOL: RunTilePool = {
  weak: 'key',
  damage: 'coin',
  grit: 'ring',
  guard: 'button',
  heal: 'trinket',
};

const TILE_DEFINITIONS: TileDefinition[] = [
  { kind: 'key', role: 'weak', label: 'Key', unlockLevel: 1, textureKey: TILE_TEXTURE_KEYS.key, order: 1 },
  {
    kind: 'coin',
    role: 'damage',
    label: 'Coin',
    unlockLevel: 1,
    textureKey: TILE_TEXTURE_KEYS.coin,
    order: 2,
  },
  { kind: 'ring', role: 'grit', label: 'Ring', unlockLevel: 1, textureKey: TILE_TEXTURE_KEYS.ring, order: 3 },
  {
    kind: 'button',
    role: 'guard',
    label: 'Button',
    unlockLevel: 1,
    textureKey: TILE_TEXTURE_KEYS.button,
    order: 4,
  },
  {
    kind: 'trinket',
    role: 'heal',
    label: 'Trinket',
    unlockLevel: 1,
    textureKey: TILE_TEXTURE_KEYS.trinket,
    order: 5,
  },
  { kind: 'gem', role: 'damage', label: 'Gem', unlockLevel: 2, textureKey: TILE_TEXTURE_KEYS.gem, order: 6 },
  {
    kind: 'thimble',
    role: 'guard',
    label: 'Thimble',
    unlockLevel: 3,
    textureKey: TILE_TEXTURE_KEYS.thimble,
    order: 7,
  },
  {
    kind: 'medal',
    role: 'grit',
    label: 'Medal',
    unlockLevel: 4,
    textureKey: TILE_TEXTURE_KEYS.medal,
    order: 8,
  },
  {
    kind: 'berry',
    role: 'heal',
    label: 'Berry',
    unlockLevel: 5,
    textureKey: TILE_TEXTURE_KEYS.berry,
    order: 9,
  },
  { kind: 'pin', role: 'weak', label: 'Pin', unlockLevel: 6, textureKey: TILE_TEXTURE_KEYS.pin, order: 10 },
  {
    kind: 'star',
    role: 'damage',
    label: 'Star',
    unlockLevel: 7,
    textureKey: TILE_TEXTURE_KEYS.star,
    order: 11,
  },
  {
    kind: 'shell',
    role: 'guard',
    label: 'Shell',
    unlockLevel: 8,
    textureKey: TILE_TEXTURE_KEYS.shell,
    order: 12,
  },
  {
    kind: 'compass',
    role: 'grit',
    label: 'Compass',
    unlockLevel: 9,
    textureKey: TILE_TEXTURE_KEYS.compass,
    order: 13,
  },
  {
    kind: 'acorn',
    role: 'heal',
    label: 'Acorn',
    unlockLevel: 10,
    textureKey: TILE_TEXTURE_KEYS.acorn,
    order: 14,
  },
  {
    kind: 'hourglass',
    role: 'weak',
    label: 'Hourglass',
    unlockLevel: 11,
    textureKey: TILE_TEXTURE_KEYS.hourglass,
    order: 15,
  },
];

const TILE_DEFINITION_BY_KIND = Object.fromEntries(
  TILE_DEFINITIONS.map((definition) => [definition.kind, definition]),
) as Record<TileKind, TileDefinition>;

export const TILE_KIND_TO_ROLE = Object.fromEntries(
  TILE_DEFINITIONS.map((definition) => [definition.kind, definition.role]),
) as Record<TileKind, TileRole>;

export function getTileDefinitions(): TileDefinition[] {
  return [...TILE_DEFINITIONS];
}

export function getTileDefinition(kind: TileKind): TileDefinition {
  return TILE_DEFINITION_BY_KIND[kind];
}

export function isBaseTileKind(kind: TileKind): boolean {
  return getTileDefinition(kind).unlockLevel === 1;
}

export function getUnlockedTileDefinitions(level: number): TileDefinition[] {
  return TILE_DEFINITIONS.filter((definition) => definition.unlockLevel <= level);
}

export function getUnlocksForLevel(level: number): TileDefinition[] {
  return TILE_DEFINITIONS.filter((definition) => definition.unlockLevel === level);
}

export function getUnlocksBetweenLevels(previousLevel: number, nextLevel: number): TileDefinition[] {
  return TILE_DEFINITIONS.filter(
    (definition) =>
      definition.unlockLevel > previousLevel && definition.unlockLevel <= nextLevel && definition.unlockLevel > 1,
  );
}

export function getRoadmapUnlocks(): TileDefinition[] {
  return TILE_DEFINITIONS.filter((definition) => definition.unlockLevel > 1);
}

export function getRunPoolKinds(runTilePool: RunTilePool): TileKind[] {
  return TILE_ROLES.map((role) => runTilePool[role]);
}

export function getRunPoolDefinitions(runTilePool: RunTilePool): TileDefinition[] {
  return TILE_ROLES.map((role) => getTileDefinition(runTilePool[role]));
}

export function buildRunTilePool(overrides: Partial<RunTilePool> = {}): RunTilePool {
  return {
    ...DEFAULT_RUN_TILE_POOL,
    ...overrides,
  };
}

export function pickRunTilePool(level: number, rng: () => number = Math.random): RunTilePool {
  const unlockedByRole = groupDefinitionsByRole(getUnlockedTileDefinitions(level));

  return {
    weak: pickFromDefinitions(unlockedByRole.weak, rng),
    damage: pickFromDefinitions(unlockedByRole.damage, rng),
    grit: pickFromDefinitions(unlockedByRole.grit, rng),
    guard: pickFromDefinitions(unlockedByRole.guard, rng),
    heal: pickFromDefinitions(unlockedByRole.heal, rng),
  };
}

function groupDefinitionsByRole(definitions: TileDefinition[]): Record<TileRole, TileDefinition[]> {
  const grouped: Record<TileRole, TileDefinition[]> = {
    weak: [],
    damage: [],
    grit: [],
    guard: [],
    heal: [],
  };

  definitions.forEach((definition) => {
    grouped[definition.role].push(definition);
  });

  TILE_ROLES.forEach((role) => {
    grouped[role].sort((left, right) => left.order - right.order);
  });

  return grouped;
}

function pickFromDefinitions(definitions: TileDefinition[], rng: () => number): TileKind {
  const selected = definitions[Math.floor(rng() * definitions.length)] ?? definitions[0];
  return selected.kind;
}
