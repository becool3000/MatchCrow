export const GRID_SIZE = 8;

export const TILE_KINDS = ['key', 'coin', 'ring', 'button', 'trinket'] as const;
export const STATUS_EFFECT_IDS = ['bleed', 'focus', 'weak', 'regen'] as const;
export const SPECIAL_SLOT_IDS = ['feather-flurry', 'second-wind'] as const;
export const ENCOUNTER_ORDER = ['mole', 'magpie', 'toad', 'owl'] as const;
export const RELIC_IDS = [
  'lucky-pebble',
  'nest-armor',
  'moon-feather',
  'dew-drop',
  'thorn-charm',
] as const;

export type TileKind = (typeof TILE_KINDS)[number];
export type StatusEffectId = (typeof STATUS_EFFECT_IDS)[number];
export type SpecialSlotId = (typeof SPECIAL_SLOT_IDS)[number];
export type EnemyId = (typeof ENCOUNTER_ORDER)[number];
export type RelicId = (typeof RELIC_IDS)[number];
export type CombatSide = 'player' | 'enemy';
export type HybridPhase =
  | 'player_board_turn'
  | 'player_special_window'
  | 'enemy_turn'
  | 'reward'
  | 'victory'
  | 'defeat';
export type RewardKind = 'special' | 'relic' | 'stat';
export type StatRewardId = 'heart' | 'power' | 'grit';

export interface Cell {
  row: number;
  col: number;
}

export interface Tile {
  id: string;
  kind: TileKind;
}

export type TileCounts = Record<TileKind, number>;

export interface MatchGroup {
  kind: TileKind;
  cells: Cell[];
}

export interface TileMove {
  tileId: string;
  kind: TileKind;
  from: Cell;
  to: Cell;
}

export interface SpawnedTile {
  tile: Tile;
  fromRow: number;
  to: Cell;
}

export interface BoardCombatPayload {
  damage: number;
  guard: number;
  grit: number;
  heal: number;
  weakPotency: number;
  multiplier: number;
  totalCleared: number;
}

export interface BoardResolveStep {
  matches: MatchGroup[];
  clearedCells: Cell[];
  clearedTileIds: string[];
  clearedCounts: TileCounts;
  droppedTiles: TileMove[];
  spawnedTiles: SpawnedTile[];
  payload: BoardCombatPayload;
  scoreDelta: number;
  bigMatch: boolean;
}

export interface BoardState {
  grid: (Tile | null)[][];
  nextTileId: number;
}

export interface BoardResolutionResult {
  accepted: boolean;
  reason?: 'not-adjacent' | 'no-match';
  board: BoardState;
  swap: {
    from: Cell;
    to: Cell;
  };
  steps: BoardResolveStep[];
  totalPayload: BoardCombatPayload;
  totalScoreDelta: number;
  reshuffled: boolean;
  reshuffleMoves: TileMove[];
}

export interface StatusEffect {
  id: StatusEffectId;
  potency: number;
  duration: number;
}

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  guard: number;
  power: number;
  statuses: StatusEffect[];
}

export interface PlayerCombatant extends Combatant {
  grit: number;
  maxGrit: number;
}

export interface EnemyCombatant extends Combatant {
  id: EnemyId;
  patternIndex: number;
}

export interface EnemyIntent {
  id: string;
  label: string;
  description: string;
  type: 'attack' | 'attack-status' | 'guard' | 'heal' | 'buff';
  damage?: number;
  guard?: number;
  heal?: number;
  statusId?: StatusEffectId;
  potency?: number;
  duration?: number;
}

export interface SpecialDefinition {
  id: SpecialSlotId;
  label: string;
  cost: number;
  cooldown: number;
  maxLevel: number;
}

export interface SpecialState {
  id: SpecialSlotId;
  level: number;
  cooldownRemaining: number;
}

export interface RewardOption {
  id: string;
  kind: RewardKind;
  label: string;
  description: string;
  specialSlotId?: SpecialSlotId;
  relicId?: RelicId;
  statId?: StatRewardId;
  amount?: number;
}

export interface HybridBattleState {
  phase: HybridPhase;
  turnNumber: number;
  score: number;
  encounterIndex: number;
  encounters: EnemyId[];
  player: PlayerCombatant;
  enemy: EnemyCombatant;
  enemyIntent: EnemyIntent;
  rewardOptions: RewardOption[];
  relics: RelicId[];
  specials: Record<SpecialSlotId, SpecialState>;
  board: BoardState;
  log: string;
}

export interface RelicDefinition {
  id: RelicId;
  label: string;
  description: string;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  title: string;
  intro: string;
  maxHp: number;
  power: number;
  colors: {
    body: string;
    accent: string;
    eye: string;
    shadow: string;
  };
}

export type HybridEvent =
  | { type: 'message'; text: string }
  | { type: 'encounter'; enemyId: EnemyId; name: string; index: number; total: number }
  | { type: 'board_step'; step: BoardResolveStep }
  | { type: 'board_reshuffle'; moves: TileMove[] }
  | { type: 'intent'; intent: EnemyIntent }
  | { type: 'action'; actor: CombatSide; actionId: string; label: string }
  | { type: 'damage'; target: CombatSide; amount: number; blocked: number; currentHp: number }
  | { type: 'heal'; target: CombatSide; amount: number; currentHp: number }
  | { type: 'guard'; target: CombatSide; amount: number; currentGuard: number }
  | { type: 'grit'; amount: number; currentGrit: number }
  | {
      type: 'status';
      target: CombatSide;
      statusId: StatusEffectId;
      potency: number;
      duration: number;
    }
  | {
      type: 'status_tick';
      target: CombatSide;
      statusId: Extract<StatusEffectId, 'bleed' | 'regen'>;
      amount: number;
      currentHp: number;
    }
  | { type: 'reward_ready'; options: RewardOption[] }
  | { type: 'reward_picked'; option: RewardOption }
  | { type: 'victory'; boss: boolean }
  | { type: 'defeat' };

export interface HybridResolution {
  accepted: boolean;
  reason?: string;
  state: HybridBattleState;
  events: HybridEvent[];
  swap?: {
    from: Cell;
    to: Cell;
  };
}

export const SPECIAL_DEFINITIONS: Record<SpecialSlotId, SpecialDefinition> = {
  'feather-flurry': {
    id: 'feather-flurry',
    label: 'Flurry',
    cost: 2,
    cooldown: 1,
    maxLevel: 3,
  },
  'second-wind': {
    id: 'second-wind',
    label: 'Second Wind',
    cost: 2,
    cooldown: 2,
    maxLevel: 3,
  },
};

export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  'lucky-pebble': {
    id: 'lucky-pebble',
    label: 'Lucky Pebble',
    description: 'Your damaging bursts deal +1.',
  },
  'nest-armor': {
    id: 'nest-armor',
    label: 'Nest Armor',
    description: 'Start each fight with 4 guard.',
  },
  'moon-feather': {
    id: 'moon-feather',
    label: 'Moon Feather',
    description: 'Every guard gain gets +1 extra guard.',
  },
  'dew-drop': {
    id: 'dew-drop',
    label: 'Dew Drop',
    description: 'Every heal restores +2 more HP.',
  },
  'thorn-charm': {
    id: 'thorn-charm',
    label: 'Thorn Charm',
    description: 'Bleed you apply gets +1 potency.',
  },
};

export const STATUS_LABELS: Record<StatusEffectId, string> = {
  bleed: 'Bleed',
  focus: 'Focus',
  weak: 'Weak',
  regen: 'Regen',
};

export const ENEMY_DEFINITIONS: Record<EnemyId, EnemyDefinition> = {
  mole: {
    id: 'mole',
    name: 'Burrow Mole',
    title: 'Tunnel Bruiser',
    intro: 'A mole barges in, muddy paws aimed at your stash.',
    maxHp: 28,
    power: 4,
    colors: {
      body: '#7d6759',
      accent: '#d3a56e',
      eye: '#ffd67c',
      shadow: '#26181d',
    },
  },
  magpie: {
    id: 'magpie',
    name: 'Rival Magpie',
    title: 'Greedy Mimic',
    intro: 'A magpie dives in with sharp eyes and worse manners.',
    maxHp: 32,
    power: 5,
    colors: {
      body: '#41516d',
      accent: '#f4efe2',
      eye: '#7ff6ff',
      shadow: '#151325',
    },
  },
  toad: {
    id: 'toad',
    name: 'Bog Toad',
    title: 'Swamp Hexer',
    intro: 'A toad heaves itself onto the branch, croaking poison.',
    maxHp: 38,
    power: 5,
    colors: {
      body: '#53703d',
      accent: '#b7dc7b',
      eye: '#ffd169',
      shadow: '#172010',
    },
  },
  owl: {
    id: 'owl',
    name: 'Moon Owl',
    title: 'Boss of the Canopy',
    intro: 'The moon owl descends, guarding the finest shine in the woods.',
    maxHp: 54,
    power: 7,
    colors: {
      body: '#7b5a78',
      accent: '#f6c670',
      eye: '#fff3a4',
      shadow: '#180f1d',
    },
  },
};
