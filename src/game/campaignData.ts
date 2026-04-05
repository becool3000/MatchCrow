export type EnemyId =
  | 'mite'
  | 'midge'
  | 'hornet'
  | 'wasp'
  | 'grasshopper'
  | 'frog'
  | 'bumble-bee-queen'
  | 'ai-ant'
  | 'dark-crow';

export type PlayerActionId = 'attack' | 'defend' | 'heal';
export type RunEndedReason = 'defeat' | 'retire' | 'timeout';
export type PermanentUpgradeId = 'heart' | 'claw' | 'bark' | 'herb';
export type EnemyIntentType = 'attack' | 'guard' | 'heal';

export interface EnemyIntentPattern {
  type: EnemyIntentType;
  value: number;
  label: string;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  title: string;
  maxHp: number;
  colors: {
    body: string;
    accent: string;
    eye: string;
    shadow: string;
  };
  intentPattern: EnemyIntentPattern[];
  passive?: 'queen-shield' | 'ant-double-guard' | 'crow-enrage';
  passiveShieldAmount?: number;
  enrageBonus?: number;
  boss?: boolean;
}

export interface EncounterDefinition {
  battleIndex: number;
  enemyIds: EnemyId[];
}

export interface PermanentUpgradeOption {
  id: PermanentUpgradeId;
  label: string;
  description: string;
}

export const NORMAL_BATTLE_TIMER_MS = 35_000;
export const BOSS_BATTLE_TIMER_MS = 55_000;

export const PERMANENT_UPGRADE_OPTIONS: PermanentUpgradeOption[] = [
  {
    id: 'heart',
    label: 'Heart',
    description: '+8 max HP for future runs.',
  },
  {
    id: 'claw',
    label: 'Claw',
    description: '+3 attack power for future runs.',
  },
  {
    id: 'bark',
    label: 'Bark',
    description: '+3 defend power for future runs.',
  },
  {
    id: 'herb',
    label: 'Herb',
    description: '+3 heal power for future runs.',
  },
];

export const ENEMY_DEFINITIONS: Record<EnemyId, EnemyDefinition> = {
  mite: {
    id: 'mite',
    name: 'Mite',
    title: 'Itchy Gnawer',
    maxHp: 14,
    intentPattern: [
      { type: 'attack', value: 4, label: 'Bite 4' },
      { type: 'attack', value: 4, label: 'Bite 4' },
      { type: 'guard', value: 2, label: 'Hide 2' },
    ],
    colors: {
      body: '#6e4f5d',
      accent: '#d9a27c',
      eye: '#ffe08e',
      shadow: '#21121a',
    },
  },
  midge: {
    id: 'midge',
    name: 'Midge',
    title: 'Needle Wing',
    maxHp: 12,
    intentPattern: [
      { type: 'attack', value: 3, label: 'Sting 3' },
      { type: 'guard', value: 3, label: 'Flutter 3' },
      { type: 'attack', value: 5, label: 'Dive 5' },
    ],
    colors: {
      body: '#55718a',
      accent: '#ffd89f',
      eye: '#a7f3ff',
      shadow: '#172030',
    },
  },
  hornet: {
    id: 'hornet',
    name: 'Hornet',
    title: 'Glass Cannon',
    maxHp: 16,
    intentPattern: [
      { type: 'attack', value: 5, label: 'Pierce 5' },
      { type: 'attack', value: 6, label: 'Pierce 6' },
      { type: 'guard', value: 2, label: 'Brace 2' },
    ],
    colors: {
      body: '#8b4c3c',
      accent: '#ffd46b',
      eye: '#fff0a1',
      shadow: '#23140f',
    },
  },
  wasp: {
    id: 'wasp',
    name: 'Wasp',
    title: 'Spite Spiker',
    maxHp: 18,
    intentPattern: [
      { type: 'guard', value: 3, label: 'Guard 3' },
      { type: 'attack', value: 5, label: 'Sting 5' },
      { type: 'attack', value: 6, label: 'Drive 6' },
    ],
    colors: {
      body: '#825935',
      accent: '#ffc55e',
      eye: '#ffeaa4',
      shadow: '#29180f',
    },
  },
  grasshopper: {
    id: 'grasshopper',
    name: 'Grasshopper',
    title: 'Spring Bruiser',
    maxHp: 22,
    intentPattern: [
      { type: 'guard', value: 3, label: 'Crouch 3' },
      { type: 'attack', value: 7, label: 'Kick 7' },
    ],
    colors: {
      body: '#4d7a3b',
      accent: '#bde47f',
      eye: '#ffe78a',
      shadow: '#152310',
    },
  },
  frog: {
    id: 'frog',
    name: 'Frog',
    title: 'Bog Bulwark',
    maxHp: 26,
    intentPattern: [
      { type: 'attack', value: 4, label: 'Tongue 4' },
      { type: 'heal', value: 3, label: 'Croak 3' },
      { type: 'guard', value: 4, label: 'Squat 4' },
    ],
    colors: {
      body: '#3f6f48',
      accent: '#b8d980',
      eye: '#ffd46e',
      shadow: '#122018',
    },
  },
  'bumble-bee-queen': {
    id: 'bumble-bee-queen',
    name: 'Bumble Bee Queen',
    title: 'Hive Matriarch',
    maxHp: 72,
    intentPattern: [
      { type: 'attack', value: 6, label: 'Buzz 6' },
      { type: 'guard', value: 5, label: 'Royal Guard 5' },
      { type: 'attack', value: 9, label: 'Sting 9' },
    ],
    passive: 'queen-shield',
    passiveShieldAmount: 2,
    boss: true,
    colors: {
      body: '#8a6032',
      accent: '#ffcf63',
      eye: '#fff1a1',
      shadow: '#25180d',
    },
  },
  'ai-ant': {
    id: 'ai-ant',
    name: 'AI Ant',
    title: 'Machine Swarmmind',
    maxHp: 92,
    intentPattern: [
      { type: 'guard', value: 4, label: 'Firewall 4' },
      { type: 'attack', value: 7, label: 'Laser 7' },
      { type: 'attack', value: 11, label: 'Overclock 11' },
    ],
    passive: 'ant-double-guard',
    boss: true,
    colors: {
      body: '#5b6178',
      accent: '#7de7ff',
      eye: '#fef2a6',
      shadow: '#151824',
    },
  },
  'dark-crow': {
    id: 'dark-crow',
    name: 'Dark Crow',
    title: 'Canopy Tyrant',
    maxHp: 116,
    intentPattern: [
      { type: 'attack', value: 7, label: 'Peck 7' },
      { type: 'guard', value: 7, label: 'Shadow Guard 7' },
      { type: 'heal', value: 6, label: 'Feast 6' },
      { type: 'attack', value: 12, label: 'Rend 12' },
    ],
    passive: 'crow-enrage',
    enrageBonus: 2,
    boss: true,
    colors: {
      body: '#4b405f',
      accent: '#a086d1',
      eye: '#ffef9d',
      shadow: '#140f1c',
    },
  },
};

export const CAMPAIGN_ENCOUNTERS: EncounterDefinition[] = [
  { battleIndex: 1, enemyIds: ['mite'] },
  { battleIndex: 2, enemyIds: ['midge'] },
  { battleIndex: 3, enemyIds: ['mite', 'mite'] },
  { battleIndex: 4, enemyIds: ['mite', 'midge'] },
  { battleIndex: 5, enemyIds: ['hornet'] },
  { battleIndex: 6, enemyIds: ['wasp'] },
  { battleIndex: 7, enemyIds: ['hornet', 'midge'] },
  { battleIndex: 8, enemyIds: ['grasshopper'] },
  { battleIndex: 9, enemyIds: ['frog'] },
  { battleIndex: 10, enemyIds: ['bumble-bee-queen'] },
  { battleIndex: 11, enemyIds: ['mite', 'hornet'] },
  { battleIndex: 12, enemyIds: ['wasp', 'midge'] },
  { battleIndex: 13, enemyIds: ['grasshopper'] },
  { battleIndex: 14, enemyIds: ['hornet', 'hornet'] },
  { battleIndex: 15, enemyIds: ['frog'] },
  { battleIndex: 16, enemyIds: ['wasp', 'grasshopper'] },
  { battleIndex: 17, enemyIds: ['hornet', 'frog'] },
  { battleIndex: 18, enemyIds: ['grasshopper', 'midge'] },
  { battleIndex: 19, enemyIds: ['wasp', 'frog'] },
  { battleIndex: 20, enemyIds: ['ai-ant'] },
  { battleIndex: 21, enemyIds: ['hornet', 'wasp'] },
  { battleIndex: 22, enemyIds: ['grasshopper', 'frog'] },
  { battleIndex: 23, enemyIds: ['midge', 'hornet'] },
  { battleIndex: 24, enemyIds: ['wasp', 'wasp'] },
  { battleIndex: 25, enemyIds: ['frog', 'hornet'] },
  { battleIndex: 26, enemyIds: ['grasshopper', 'wasp'] },
  { battleIndex: 27, enemyIds: ['frog', 'grasshopper'] },
  { battleIndex: 28, enemyIds: ['hornet', 'frog'] },
  { battleIndex: 29, enemyIds: ['wasp', 'grasshopper'] },
  { battleIndex: 30, enemyIds: ['dark-crow'] },
];

export function getEncounterDefinition(battleIndex: number): EncounterDefinition {
  const encounter = CAMPAIGN_ENCOUNTERS.find((entry) => entry.battleIndex === battleIndex);

  if (!encounter) {
    throw new Error(`Missing campaign encounter for battle ${battleIndex}.`);
  }

  return encounter;
}

export function isBossBattle(battleIndex: number): boolean {
  return battleIndex % 10 === 0;
}

export function getBattleTimerMs(battleIndex: number): number {
  return isBossBattle(battleIndex) ? BOSS_BATTLE_TIMER_MS : NORMAL_BATTLE_TIMER_MS;
}

export function getBattleClearBonus(battleIndex: number): number {
  return isBossBattle(battleIndex) ? 300 * battleIndex : 100 * battleIndex;
}
