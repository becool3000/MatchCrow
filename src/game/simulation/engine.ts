import {
  cloneBoardState,
  createBoardStateFromKinds,
  initializeBoard,
  trySwapOnBoard,
} from './board.ts';
import {
  ENCOUNTER_ORDER,
  ENEMY_DEFINITIONS,
  RELIC_DEFINITIONS,
  SPECIAL_DEFINITIONS,
  SPECIAL_SLOT_IDS,
  STATUS_EFFECT_IDS,
  type CombatSide,
  type HybridBattleState,
  type HybridEvent,
  type HybridResolution,
  type EnemyCombatant,
  type EnemyId,
  type EnemyIntent,
  type PlayerCombatant,
  type RelicId,
  type RewardOption,
  type SpecialSlotId,
  type SpecialState,
  type StatRewardId,
  type StatusEffect,
} from './types.ts';

const STAT_REWARD_POOL: Array<{ id: StatRewardId; label: string; description: string; amount: number }> =
  [
    {
      id: 'heart',
      label: 'Heart Seed',
      description: '+6 max HP and heal 6.',
      amount: 6,
    },
    {
      id: 'power',
      label: 'Sharp Beak',
      description: '+1 power on every strike.',
      amount: 1,
    },
    {
      id: 'grit',
      label: 'Bright Nerve',
      description: '+1 max grit and refill 1 grit.',
      amount: 1,
    },
  ];

export function initializeRun(rng: () => number = Math.random): HybridBattleState {
  const player = createPlayer();
  const enemy = createEnemy(ENCOUNTER_ORDER[0]);

  applyEncounterStartEffects(player, []);

  return {
    phase: 'player_board_turn',
    turnNumber: 1,
    score: 0,
    encounterIndex: 0,
    encounters: [...ENCOUNTER_ORDER],
    player,
    enemy,
    enemyIntent: createEnemyIntent(enemy, player),
    rewardOptions: [],
    relics: [],
    specials: createSpecialStates(),
    board: initializeBoard(rng),
    log: `${ENEMY_DEFINITIONS[enemy.id].intro} Match the cache to strike.`,
  };
}

export function trySwap(
  currentState: HybridBattleState,
  from: { row: number; col: number },
  to: { row: number; col: number },
  rng: () => number = Math.random,
): HybridResolution {
  if (currentState.phase !== 'player_board_turn') {
    return reject(currentState, 'Finish the current turn before swapping again.');
  }

  const boardResult = trySwapOnBoard(currentState.board, from, to, rng);

  if (!boardResult.accepted) {
    return {
      accepted: false,
      reason:
        boardResult.reason === 'not-adjacent'
          ? 'Only adjacent tiles can swap.'
          : 'That swap does not make a match.',
      state: currentState,
      events: [],
      swap: boardResult.swap,
    };
  }

  const state = cloneState(currentState);
  const events: HybridEvent[] = [];

  state.board = boardResult.board;

  for (const step of boardResult.steps) {
    events.push({ type: 'board_step', step });
    applyBoardStep(state, step, events);

    if (state.enemy.hp <= 0) {
      return finalizeVictoryOrReward(state, events, rng, boardResult.swap);
    }
  }

  if (boardResult.reshuffled && boardResult.reshuffleMoves.length > 0) {
    events.push({ type: 'board_reshuffle', moves: boardResult.reshuffleMoves });
  }

  state.phase = 'player_special_window';
  state.log = 'Board settled. Use a special or pass.';

  return {
    accepted: true,
    state,
    events,
    swap: boardResult.swap,
  };
}

export function useSpecial(
  currentState: HybridBattleState,
  slotId: SpecialSlotId,
  rng: () => number = Math.random,
): HybridResolution {
  if (currentState.phase !== 'player_special_window') {
    return reject(currentState, 'Specials only happen after the board settles.');
  }

  const special = currentState.specials[slotId];
  const definition = SPECIAL_DEFINITIONS[slotId];

  if (special.cooldownRemaining > 0) {
    return reject(currentState, `${definition.label} is cooling down.`);
  }

  if (currentState.player.grit < definition.cost) {
    return reject(currentState, 'Not enough grit for that special.');
  }

  const state = cloneState(currentState);
  const events: HybridEvent[] = [
    { type: 'action', actor: 'player', actionId: slotId, label: definition.label },
  ];

  state.player.grit = Math.max(0, state.player.grit - definition.cost);
  state.specials[slotId].cooldownRemaining = definition.cooldown + 1;

  if (slotId === 'feather-flurry') {
    const damage = 6 + (state.specials[slotId].level - 1) * 2;
    dealDamage(state, 'player', 'enemy', damage, events);
    applyStatus(
      state,
      'enemy',
      'bleed',
      getBleedPotency(state, 2 + (state.specials[slotId].level - 1)),
      2,
      events,
    );
    state.log = 'Feather Flurry cuts through the air.';
  } else {
    const heal = 6 + (state.specials[slotId].level - 1) * 2;
    healCombatant(state, 'player', heal, events);
    applyStatus(
      state,
      'player',
      'regen',
      2 + (state.specials[slotId].level - 1),
      2,
      events,
    );
    state.log = 'Second Wind steadies the crow for the counterblow.';
  }

  if (state.enemy.hp <= 0) {
    return finalizeVictoryOrReward(state, events, rng);
  }

  return finishEnemyCycle(state, events, rng);
}

export function skipSpecial(
  currentState: HybridBattleState,
  rng: () => number = Math.random,
): HybridResolution {
  if (currentState.phase !== 'player_special_window') {
    return reject(currentState, 'There is nothing to skip right now.');
  }

  const state = cloneState(currentState);
  const events: HybridEvent[] = [{ type: 'message', text: 'MatchCrow holds the line.' }];
  state.log = 'MatchCrow waits for the enemy to commit.';

  return finishEnemyCycle(state, events, rng);
}

export function pickReward(
  currentState: HybridBattleState,
  rewardId: string,
  rng: () => number = Math.random,
): HybridResolution {
  if (currentState.phase !== 'reward') {
    return reject(currentState, 'There is no reward to claim.');
  }

  const option = currentState.rewardOptions.find((reward) => reward.id === rewardId);

  if (!option) {
    return reject(currentState, 'That reward is no longer available.');
  }

  const state = cloneState(currentState);
  const events: HybridEvent[] = [{ type: 'reward_picked', option }];

  applyReward(state, option);

  state.encounterIndex += 1;
  const nextEnemyId = state.encounters[state.encounterIndex];

  if (!nextEnemyId) {
    state.phase = 'victory';
    state.rewardOptions = [];
    state.log = 'The moon owl falls back. MatchCrow owns the canopy tonight.';
    events.push({ type: 'victory', boss: true });

    return {
      accepted: true,
      state,
      events,
    };
  }

  prepareNextEncounter(state, nextEnemyId, rng, events);

  return {
    accepted: true,
    state,
    events,
  };
}

function applyBoardStep(
  state: HybridBattleState,
  step: ReturnType<typeof trySwapOnBoard>['steps'][number],
  events: HybridEvent[],
): void {
  state.score += step.scoreDelta;

  if (step.payload.damage > 0) {
    dealDamage(state, 'player', 'enemy', step.payload.damage, events);
  }

  if (step.payload.guard > 0) {
    gainGuard(state, 'player', step.payload.guard, events);
  }

  if (step.payload.grit > 0) {
    gainGrit(state.player, step.payload.grit);
    events.push({
      type: 'grit',
      amount: step.payload.grit,
      currentGrit: state.player.grit,
    });
  }

  if (step.payload.heal > 0) {
    healCombatant(state, 'player', step.payload.heal, events);
  }

  if (step.payload.weakPotency > 0) {
    applyStatus(state, 'enemy', 'weak', step.payload.weakPotency, 1, events);
  }

  state.log = step.bigMatch
    ? 'A heavy shimmer lands. MatchCrow smells an opening.'
    : 'The stash flashes and the foe reels.';
}

function finishEnemyCycle(
  state: HybridBattleState,
  events: HybridEvent[],
  rng: () => number,
): HybridResolution {
  state.phase = 'enemy_turn';

  const encounterFinished = resolveEnemyTurn(state, events, rng);

  if (encounterFinished) {
    return {
      accepted: true,
      state,
      events,
    };
  }

  advanceSpecialCooldowns(state.specials);
  state.turnNumber += 1;
  applyTurnStart(state, 'player', events);

  if (state.player.hp <= 0) {
    return finalizeDefeat(state, events, `${state.enemy.name} scatters the cache.`);
  }

  state.enemyIntent = createEnemyIntent(state.enemy, state.player);
  state.phase = 'player_board_turn';
  state.log = `Your move. ${state.enemy.name} telegraphs ${state.enemyIntent.label.toLowerCase()}.`;
  events.push({ type: 'intent', intent: state.enemyIntent });

  return {
    accepted: true,
    state,
    events,
  };
}

function resolveEnemyTurn(
  state: HybridBattleState,
  events: HybridEvent[],
  rng: () => number,
): boolean {
  applyTurnStart(state, 'enemy', events);

  if (state.enemy.hp <= 0) {
    finalizeVictoryOrReward(state, events, rng);
    return true;
  }

  const intent = state.enemyIntent;
  events.push({
    type: 'action',
    actor: 'enemy',
    actionId: intent.id,
    label: intent.label,
  });

  switch (intent.type) {
    case 'attack': {
      dealDamage(state, 'enemy', 'player', intent.damage ?? 0, events);
      state.log = `${state.enemy.name} uses ${intent.label}.`;
      break;
    }
    case 'attack-status': {
      dealDamage(state, 'enemy', 'player', intent.damage ?? 0, events);

      if (state.player.hp > 0 && intent.statusId && intent.potency && intent.duration) {
        applyStatus(state, 'player', intent.statusId, intent.potency, intent.duration, events);
      }

      state.log = `${state.enemy.name} lashes out with ${intent.label}.`;
      break;
    }
    case 'guard': {
      gainGuard(state, 'enemy', intent.guard ?? 0, events);
      state.log = `${state.enemy.name} digs in for the next strike.`;
      break;
    }
    case 'heal': {
      healCombatant(state, 'enemy', intent.heal ?? 0, events);
      state.log = `${state.enemy.name} regains its footing.`;
      break;
    }
    case 'buff': {
      if (intent.guard) {
        gainGuard(state, 'enemy', intent.guard, events);
      }

      if (intent.statusId && intent.potency && intent.duration) {
        applyStatus(state, 'enemy', intent.statusId, intent.potency, intent.duration, events);
      }

      state.log = `${state.enemy.name} prepares something nastier.`;
      break;
    }
  }

  consumeActionStatuses(state, 'enemy');

  if (state.player.hp <= 0) {
    return false;
  }

  return false;
}

function finalizeVictoryOrReward(
  state: HybridBattleState,
  events: HybridEvent[],
  rng: () => number,
  swap?: { row: number; col: number } | { from: { row: number; col: number }; to: { row: number; col: number } },
): HybridResolution {
  const isBoss = state.encounterIndex >= state.encounters.length - 1;
  const encounterBonus = [120, 180, 240, 480][state.encounterIndex] ?? 120;

  state.score += encounterBonus;
  state.rewardOptions = [];
  events.push({ type: 'victory', boss: isBoss });

  if (isBoss) {
    state.phase = 'victory';
    state.log = 'The moon owl yields. MatchCrow rules the canopy tonight.';

    return {
      accepted: true,
      state,
      events,
      swap: isSwapPair(swap) ? swap : undefined,
    };
  }

  state.phase = 'reward';
  state.rewardOptions = generateRewardOptions(state, rng);
  state.log = 'The foe flees. Pick one reward before the next branch.';
  events.push({ type: 'reward_ready', options: state.rewardOptions });

  return {
    accepted: true,
    state,
    events,
    swap: isSwapPair(swap) ? swap : undefined,
  };
}

function finalizeDefeat(
  state: HybridBattleState,
  events: HybridEvent[],
  message: string,
): HybridResolution {
  state.phase = 'defeat';
  state.rewardOptions = [];
  state.log = message;
  events.push({ type: 'defeat' });

  return {
    accepted: true,
    state,
    events,
  };
}

function prepareNextEncounter(
  state: HybridBattleState,
  enemyId: EnemyId,
  rng: () => number,
  events: HybridEvent[],
): void {
  state.player.statuses = [];
  state.player.guard = 0;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 6);
  state.player.grit = Math.min(state.player.maxGrit, state.player.grit + 1);
  state.specials = createSpecialStates(state.specials);
  applyEncounterStartEffects(state.player, state.relics);

  state.enemy = createEnemy(enemyId);
  state.enemyIntent = createEnemyIntent(state.enemy, state.player);
  state.board = initializeBoard(rng);
  state.phase = 'player_board_turn';
  state.turnNumber = 1;
  state.rewardOptions = [];
  state.log = `${ENEMY_DEFINITIONS[enemyId].intro} Match the cache to strike.`;
  events.push({
    type: 'encounter',
    enemyId,
    name: state.enemy.name,
    index: state.encounterIndex + 1,
    total: state.encounters.length,
  });
  events.push({ type: 'intent', intent: state.enemyIntent });
}

function applyReward(state: HybridBattleState, option: RewardOption): void {
  if (option.kind === 'special' && option.specialSlotId) {
    const special = state.specials[option.specialSlotId];
    special.level = Math.min(SPECIAL_DEFINITIONS[option.specialSlotId].maxLevel, special.level + 1);
    special.cooldownRemaining = 0;
  }

  if (option.kind === 'relic' && option.relicId && !state.relics.includes(option.relicId)) {
    state.relics.push(option.relicId);
  }

  if (option.kind === 'stat' && option.statId) {
    if (option.statId === 'heart') {
      state.player.maxHp += option.amount ?? 0;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + (option.amount ?? 0));
    }

    if (option.statId === 'power') {
      state.player.power += option.amount ?? 0;
    }

    if (option.statId === 'grit') {
      state.player.maxGrit += option.amount ?? 0;
      state.player.grit = Math.min(state.player.maxGrit, state.player.grit + (option.amount ?? 0));
    }
  }
}

function generateRewardOptions(
  state: HybridBattleState,
  rng: () => number,
): RewardOption[] {
  const options: RewardOption[] = [];
  const upgradableSpecials = SPECIAL_SLOT_IDS.filter(
    (slotId) => state.specials[slotId].level < SPECIAL_DEFINITIONS[slotId].maxLevel,
  );
  const remainingRelics = Object.keys(RELIC_DEFINITIONS).filter(
    (relicId) => !state.relics.includes(relicId as RelicId),
  ) as RelicId[];

  if (upgradableSpecials.length > 0) {
    const slotId = pickRandom(upgradableSpecials, rng);
    const nextLevel = state.specials[slotId].level + 1;
    options.push({
      id: `special:${slotId}`,
      kind: 'special',
      label: `Upgrade ${SPECIAL_DEFINITIONS[slotId].label}`,
      description: describeSpecial(slotId, nextLevel),
      specialSlotId: slotId,
    });
  }

  if (remainingRelics.length > 0) {
    const relicId = pickRandom(remainingRelics, rng);
    const relic = RELIC_DEFINITIONS[relicId];
    options.push({
      id: `relic:${relicId}`,
      kind: 'relic',
      label: relic.label,
      description: relic.description,
      relicId,
    });
  }

  const statReward = pickRandom(STAT_REWARD_POOL, rng);
  options.push({
    id: `stat:${statReward.id}`,
    kind: 'stat',
    label: statReward.label,
    description: statReward.description,
    statId: statReward.id,
    amount: statReward.amount,
  });

  while (options.length < 3) {
    const filler = STAT_REWARD_POOL[(options.length - 1 + 3) % STAT_REWARD_POOL.length];
    options.push({
      id: `stat:${filler.id}:${options.length}`,
      kind: 'stat',
      label: filler.label,
      description: filler.description,
      statId: filler.id,
      amount: filler.amount,
    });
  }

  return options;
}

function createPlayer(): PlayerCombatant {
  return {
    id: 'crow',
    name: 'MatchCrow',
    hp: 34,
    maxHp: 34,
    guard: 0,
    power: 1,
    statuses: [],
    grit: 1,
    maxGrit: 5,
  };
}

function createEnemy(enemyId: EnemyId): EnemyCombatant {
  const definition = ENEMY_DEFINITIONS[enemyId];

  return {
    id: enemyId,
    name: definition.name,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    guard: 0,
    power: definition.power,
    statuses: [],
    patternIndex: 0,
  };
}

function createSpecialStates(
  source?: Record<SpecialSlotId, SpecialState>,
): Record<SpecialSlotId, SpecialState> {
  return {
    'feather-flurry': {
      id: 'feather-flurry',
      level: source?.['feather-flurry'].level ?? 1,
      cooldownRemaining: 0,
    },
    'second-wind': {
      id: 'second-wind',
      level: source?.['second-wind'].level ?? 1,
      cooldownRemaining: 0,
    },
  };
}

function createEnemyIntent(enemy: EnemyCombatant, player: PlayerCombatant): EnemyIntent {
  const step = enemy.patternIndex;
  enemy.patternIndex += 1;

  switch (enemy.id) {
    case 'mole': {
      const intents: EnemyIntent[] = [
        {
          id: 'scratch',
          label: 'Scratch',
          description: 'Deal 6 damage.',
          type: 'attack',
          damage: 6,
        },
        {
          id: 'burrow',
          label: 'Burrow Up',
          description: 'Gain 7 guard.',
          type: 'guard',
          guard: 7,
        },
        {
          id: 'tunnel-pop',
          label: 'Tunnel Pop',
          description: 'Deal 8 damage.',
          type: 'attack',
          damage: 8,
        },
      ];

      return intents[step % intents.length]!;
    }
    case 'magpie': {
      const intents: EnemyIntent[] = [
        {
          id: 'snatch',
          label: 'Snatch',
          description: 'Deal 6 damage and apply weak.',
          type: 'attack-status',
          damage: 6,
          statusId: 'weak',
          potency: 2,
          duration: 1,
        },
        {
          id: 'mirror-guard',
          label: 'Mirror Guard',
          description: 'Gain 5 guard and focus.',
          type: 'buff',
          guard: 5,
          statusId: 'focus',
          potency: 2,
          duration: 1,
        },
        {
          id: 'gleam-peck',
          label: 'Gleam Peck',
          description: 'Deal 8 damage.',
          type: 'attack',
          damage: 8,
        },
      ];

      return intents[step % intents.length]!;
    }
    case 'toad':
      if (player.hp <= 12 && step % 3 === 1) {
        return {
          id: 'bog-bash',
          label: 'Bog Bash',
          description: 'Deal 9 damage.',
          type: 'attack',
          damage: 9,
        };
      }

      return (
        [
          {
            id: 'bog-spit',
            label: 'Bog Spit',
            description: 'Deal 5 damage and apply bleed.',
            type: 'attack-status',
            damage: 5,
            statusId: 'bleed',
            potency: 2,
            duration: 2,
          },
          {
            id: 'sip-dew',
            label: 'Sip Dew',
            description: 'Heal 6 HP.',
            type: 'heal',
            heal: 6,
          },
          {
            id: 'belly-bash',
            label: 'Belly Bash',
            description: 'Deal 8 damage.',
            type: 'attack',
            damage: 8,
          },
        ] as EnemyIntent[]
      )[step % 3]!;
    case 'owl':
      if (enemy.hp <= 18 && step % 4 === 3) {
        return {
          id: 'moon-ward',
          label: 'Moon Ward',
          description: 'Gain 8 guard and focus.',
          type: 'buff',
          guard: 8,
          statusId: 'focus',
          potency: 2,
          duration: 1,
        };
      }

      return (
        [
          {
            id: 'talon-rake',
            label: 'Talon Rake',
            description: 'Deal 8 damage.',
            type: 'attack',
            damage: 8,
          },
          {
            id: 'moon-glare',
            label: 'Moon Glare',
            description: 'Deal 6 damage and apply weak.',
            type: 'attack-status',
            damage: 6,
            statusId: 'weak',
            potency: 2,
            duration: 2,
          },
          {
            id: 'night-dive',
            label: 'Night Dive',
            description: 'Deal 11 damage.',
            type: 'attack',
            damage: 11,
          },
          {
            id: 'preen',
            label: 'Preen',
            description: 'Heal 6 HP.',
            type: 'heal',
            heal: 6,
          },
        ] as EnemyIntent[]
      )[step % 4]!;
  }
}

function dealDamage(
  state: HybridBattleState,
  source: CombatSide,
  target: CombatSide,
  baseDamage: number,
  events: HybridEvent[],
): number {
  const attacker = getCombatant(state, source);
  const defender = getCombatant(state, target);
  const focus = getStatus(attacker, 'focus')?.potency ?? 0;
  const weak = getStatus(attacker, 'weak')?.potency ?? 0;
  const relicBonus = source === 'player' && state.relics.includes('lucky-pebble') ? 1 : 0;
  const finalDamage = Math.max(0, baseDamage + attacker.power + focus + relicBonus - weak);
  const blocked = Math.min(defender.guard, finalDamage);

  defender.guard -= blocked;
  const hpDamage = Math.min(defender.hp, finalDamage - blocked);
  defender.hp -= hpDamage;

  if (source === 'player') {
    state.score += hpDamage;
  }

  events.push({
    type: 'damage',
    target,
    amount: hpDamage,
    blocked,
    currentHp: defender.hp,
  });

  return hpDamage;
}

function healCombatant(
  state: HybridBattleState,
  target: CombatSide,
  amount: number,
  events: HybridEvent[],
): number {
  const combatant = getCombatant(state, target);
  const heal = getHealAmount(state, target, amount);
  const restored = applyHealValue(combatant, heal);

  if (restored > 0) {
    events.push({
      type: 'heal',
      target,
      amount: restored,
      currentHp: combatant.hp,
    });
  }

  return restored;
}

function gainGuard(
  state: HybridBattleState,
  target: CombatSide,
  amount: number,
  events: HybridEvent[],
): number {
  const combatant = getCombatant(state, target);
  let total = amount;

  if (target === 'player' && state.relics.includes('moon-feather')) {
    total += 1;
  }

  combatant.guard += total;
  events.push({
    type: 'guard',
    target,
    amount: total,
    currentGuard: combatant.guard,
  });

  return total;
}

function applyStatus(
  state: HybridBattleState,
  target: CombatSide,
  statusId: StatusEffect['id'],
  potency: number,
  duration: number,
  events: HybridEvent[],
): void {
  if (!STATUS_EFFECT_IDS.includes(statusId)) {
    return;
  }

  const combatant = getCombatant(state, target);
  const existing = combatant.statuses.find((status) => status.id === statusId);

  if (existing) {
    existing.potency = Math.max(existing.potency, potency);
    existing.duration = Math.max(existing.duration, duration);
  } else {
    combatant.statuses.push({ id: statusId, potency, duration });
  }

  events.push({
    type: 'status',
    target,
    statusId,
    potency,
    duration,
  });
}

function applyTurnStart(
  state: HybridBattleState,
  side: CombatSide,
  events: HybridEvent[],
): void {
  const combatant = getCombatant(state, side);
  const remaining: StatusEffect[] = [];

  combatant.statuses.forEach((status) => {
    if (status.id === 'bleed') {
      const damage = Math.min(status.potency, combatant.hp);

      if (damage > 0) {
        combatant.hp -= damage;
        events.push({
          type: 'status_tick',
          target: side,
          statusId: 'bleed',
          amount: damage,
          currentHp: combatant.hp,
        });
      }
    }

    if (status.id === 'regen') {
      const heal = getHealAmount(state, side, status.potency);
      const restored = applyHealValue(combatant, heal);

      if (restored > 0) {
        events.push({
          type: 'status_tick',
          target: side,
          statusId: 'regen',
          amount: restored,
          currentHp: combatant.hp,
        });
      }
    }

    if (status.id === 'bleed' || status.id === 'regen') {
      status.duration -= 1;
    }

    if (status.duration > 0) {
      remaining.push(status);
    }
  });

  combatant.statuses = remaining;
}

function consumeActionStatuses(state: HybridBattleState, side: CombatSide): void {
  const combatant = getCombatant(state, side);
  combatant.statuses = combatant.statuses
    .map((status) => {
      if (status.id === 'focus' || status.id === 'weak') {
        return { ...status, duration: status.duration - 1 };
      }

      return status;
    })
    .filter((status) => status.duration > 0);
}

function advanceSpecialCooldowns(specials: Record<SpecialSlotId, SpecialState>): void {
  SPECIAL_SLOT_IDS.forEach((slotId) => {
    specials[slotId].cooldownRemaining = Math.max(0, specials[slotId].cooldownRemaining - 1);
  });
}

function applyEncounterStartEffects(player: PlayerCombatant, relics: readonly RelicId[]): void {
  if (relics.includes('nest-armor')) {
    player.guard += 4;
  }
}

function getCombatant(
  state: HybridBattleState,
  side: CombatSide,
): PlayerCombatant | EnemyCombatant {
  return side === 'player' ? state.player : state.enemy;
}

function getStatus(
  combatant: PlayerCombatant | EnemyCombatant,
  statusId: StatusEffect['id'],
): StatusEffect | undefined {
  return combatant.statuses.find((status) => status.id === statusId);
}

function getBleedPotency(state: HybridBattleState, basePotency: number): number {
  return state.relics.includes('thorn-charm') ? basePotency + 1 : basePotency;
}

function getHealAmount(
  state: HybridBattleState,
  side: CombatSide,
  amount: number,
): number {
  return side === 'player' && state.relics.includes('dew-drop') ? amount + 2 : amount;
}

function applyHealValue(
  combatant: PlayerCombatant | EnemyCombatant,
  amount: number,
): number {
  const restored = Math.min(combatant.maxHp - combatant.hp, amount);
  combatant.hp += restored;
  return restored;
}

function gainGrit(player: PlayerCombatant, amount: number): void {
  player.grit = Math.min(player.maxGrit, player.grit + amount);
}

function describeSpecial(slotId: SpecialSlotId, level: number): string {
  if (slotId === 'feather-flurry') {
    return `Deal ${6 + (level - 1) * 2} damage and apply bleed ${2 + (level - 1)}/2.`;
  }

  return `Heal ${6 + (level - 1) * 2} and apply regen ${2 + (level - 1)}/2.`;
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function cloneState(state: HybridBattleState): HybridBattleState {
  return {
    ...state,
    encounters: [...state.encounters],
    player: {
      ...state.player,
      statuses: state.player.statuses.map(cloneStatus),
    },
    enemy: {
      ...state.enemy,
      statuses: state.enemy.statuses.map(cloneStatus),
    },
    enemyIntent: { ...state.enemyIntent },
    rewardOptions: state.rewardOptions.map((option) => ({ ...option })),
    relics: [...state.relics],
    specials: {
      'feather-flurry': { ...state.specials['feather-flurry'] },
      'second-wind': { ...state.specials['second-wind'] },
    },
    board: cloneBoardState(state.board),
  };
}

function cloneStatus(status: StatusEffect): StatusEffect {
  return { ...status };
}

function reject(state: HybridBattleState, reason: string): HybridResolution {
  return {
    accepted: false,
    reason,
    state,
    events: [],
  };
}

function isSwapPair(
  value:
    | { row: number; col: number }
    | { from: { row: number; col: number }; to: { row: number; col: number } }
    | undefined,
): value is { from: { row: number; col: number }; to: { row: number; col: number } } {
  return Boolean(value && 'from' in value && 'to' in value);
}

export function createStateFromKinds(
  kinds: Parameters<typeof createBoardStateFromKinds>[0],
  rng: () => number = Math.random,
): HybridBattleState {
  const state = initializeRun(rng);
  state.board = createBoardStateFromKinds(kinds);
  return state;
}
