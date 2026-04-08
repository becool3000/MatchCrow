import {
  BOSS_BATTLE_TIMER_MS,
  CHECKPOINT_OPTION_DEFINITIONS,
  ENEMY_DEFINITIONS,
  NORMAL_BATTLE_TIMER_MS,
  RUN_BOON_DEFINITIONS,
  getBattleClearBonus,
  getBattleTimerMs,
  getEncounterDefinition,
  isBossBattle,
  isBossCheckpointBattle,
  isRegularCheckpointBattle,
  type CheckpointOptionId,
  type EnemyId,
  type EnemyIntentPattern,
  type EnemyIntentType,
  type PlayerActionId,
  type RunBoonId,
  type RunBoonTier,
  type RunEndedReason,
} from '../campaignData.ts';
import { DEFAULT_STATUS } from '../assets/manifest.ts';
import { DEFAULT_RUN_TILE_POOL } from '../tileCatalog.ts';
import { createBoardStateFromKinds, initializeBoard, trySwapOnBoard } from './board.ts';
import type { BoardResolutionResult, BoardState, Cell, TileKind } from './types.ts';

export interface PlayerBonuses {
  maxHpBonus: number;
  attackBonus: number;
  guardBonus: number;
  healBonus: number;
}

export interface PlayerRuntimeState extends PlayerBonuses {
  currentHp: number;
  maxHp: number;
  shield: number;
}

export interface EnemyRuntimeState {
  id: string;
  enemyId: EnemyId;
  name: string;
  title: string;
  currentHp: number;
  maxHp: number;
  shield: number;
  intentIndex: number;
  intent: EnemyIntentPattern;
  boss: boolean;
}

export interface BattleFlags {
  firstAttackUsed: boolean;
  healPowerBonus: number;
}

export type RunBoonState = Record<RunBoonId, number>;

export interface CampaignBoonDraftState {
  tier: RunBoonTier;
  options: RunBoonId[];
}

export interface CampaignRunState {
  phase: 'battle' | 'checkpoint' | 'boon-draft' | 'ended';
  battleIndex: number;
  loopCount: number;
  battleTimerMs: number;
  battleTimerMaxMs: number;
  board: BoardState;
  player: PlayerRuntimeState;
  enemies: EnemyRuntimeState[];
  selectedAction: PlayerActionId;
  selectedTargetId: string | null;
  score: number;
  highScore: number;
  lastMessage: string;
  runEndedReason: RunEndedReason | null;
  runBoons: RunBoonState;
  checkpointOptions: CheckpointOptionId[] | null;
  boonDraft: CampaignBoonDraftState | null;
  battleFlags: BattleFlags;
}

export interface CampaignClockResult {
  state: CampaignRunState;
  changed: boolean;
  displayedSecondChanged: boolean;
  becameComplete: boolean;
}

export type CampaignEvent =
  | { type: 'player-action'; action: PlayerActionId; targetId?: string }
  | { type: 'player-shield'; amount: number }
  | { type: 'player-heal'; amount: number }
  | { type: 'enemy-damaged'; enemyId: string; amount: number; blocked: number; defeated: boolean }
  | { type: 'enemy-action'; enemyId: string; intentType: EnemyIntentType; amount: number }
  | { type: 'enemy-shield'; enemyId: string; amount: number }
  | { type: 'enemy-heal'; enemyId: string; amount: number }
  | { type: 'player-damaged'; amount: number; blocked: number; defeated: boolean }
  | { type: 'score'; amount: number }
  | { type: 'timer'; amount: number }
  | { type: 'battle-cleared'; bonus: number; battleIndex: number; nextBattleIndex: number; nextLoopCount: number }
  | { type: 'checkpoint-ready'; checkpoint: 'regular' | 'boss'; nextBattleIndex: number; nextLoopCount: number }
  | { type: 'boon-draft-ready'; tier: RunBoonTier; options: RunBoonId[] }
  | { type: 'run-ended'; reason: RunEndedReason };

export interface CampaignResolution {
  accepted: boolean;
  reason?: string;
  state: CampaignRunState;
  boardResult?: BoardResolutionResult;
  events: CampaignEvent[];
  battleAdvanced: boolean;
  timerBonusApplied: number;
  clearBonusAwarded: number;
}

const PLAYER_BASE_MAX_HP = 40;
const REGULAR_CHECKPOINT_OPTIONS: CheckpointOptionId[] = ['boon-draft', 'recover', 'bank-time'];
const RECOVER_MISSING_HP_RATIO = 0.3;
const CHECKPOINT_BANK_TIME_MS = 8_000;
const FIRST_CRUSH_DAMAGE = 4;
const FEATHER_BED_SHIELD = 6;
const AFTERGLOW_SHIELD = 4;
const SOFT_GUARD_HEAL = 2;
const BIG_FEELINGS_POWER = 2;
const CASCADE_KISS_POWER = 1;
const TIME_SIPHON_MS = 3_000;
const LUCKY_SWING_MS = 2_000;
const ROYAL_TEMPO_TIME_MS = 8_000;
const ROYAL_TEMPO_HEAL_RATIO = 0.25;
const UNSHAKEN_BOSS_SHIELD = 12;
const UNSHAKEN_BOSS_HEAL_POWER = 6;

export function initializeRun(
  rng: () => number = Math.random,
  highScore = 0,
  bonuses: PlayerBonuses = createEmptyBonuses(),
): CampaignRunState {
  return createBattleState({
    battleIndex: 1,
    board: initializeBoard(rng, DEFAULT_RUN_TILE_POOL),
    highScore,
    loopCount: 0,
    player: createPlayerState(bonuses),
    score: 0,
    runBoons: createEmptyRunBoons(),
  });
}

export function createStateFromKinds(
  kinds: TileKind[][],
  options: {
    battleIndex?: number;
    highScore?: number;
    loopCount?: number;
    score?: number;
    bonuses?: PlayerBonuses;
    currentHp?: number;
    battleTimerMs?: number;
    battleTimerMaxMs?: number;
    runBoons?: Partial<RunBoonState>;
  } = {},
): CampaignRunState {
  const bonuses = options.bonuses ?? createEmptyBonuses();
  const player = createPlayerState(bonuses);
  const runBoons = mergeRunBoons(options.runBoons);

  player.currentHp = Math.min(player.maxHp, options.currentHp ?? player.maxHp);

  return createBattleState({
    battleIndex: options.battleIndex ?? 1,
    board: createBoardStateFromKinds(kinds),
    highScore: options.highScore ?? 0,
    loopCount: options.loopCount ?? 0,
    player,
    score: options.score ?? 0,
    battleTimerMs: options.battleTimerMs,
    battleTimerMaxMs: options.battleTimerMaxMs,
    runBoons,
  });
}

export function setSelectedAction(
  currentState: CampaignRunState,
  action: PlayerActionId,
): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return {
    ...currentState,
    selectedAction: action,
    lastMessage: getActionSelectionMessage(action),
  };
}

export function chooseCheckpointOption(
  currentState: CampaignRunState,
  optionId: CheckpointOptionId,
  rng: () => number = Math.random,
): CampaignRunState {
  if (
    currentState.phase !== 'checkpoint' ||
    !currentState.checkpointOptions ||
    !currentState.checkpointOptions.includes(optionId)
  ) {
    return currentState;
  }

  if (optionId === 'boon-draft') {
    return buildDraftState(currentState, 'minor', rng, 'Choose a minor boon.');
  }

  const nextState = cloneState(currentState);
  nextState.checkpointOptions = null;

  if (optionId === 'recover') {
    const recoverAmount = Math.ceil((nextState.player.maxHp - nextState.player.currentHp) * RECOVER_MISSING_HP_RATIO);
    nextState.player.currentHp = Math.min(nextState.player.maxHp, nextState.player.currentHp + recoverAmount);
    nextState.lastMessage =
      recoverAmount > 0
        ? `Checkpoint recover restored ${recoverAmount} HP.`
        : 'Checkpoint recover found no missing HP.';
  } else {
    nextState.battleTimerMs += CHECKPOINT_BANK_TIME_MS;
    nextState.battleTimerMaxMs += CHECKPOINT_BANK_TIME_MS;
    nextState.lastMessage = `Checkpoint banked +${CHECKPOINT_BANK_TIME_MS / 1_000}s.`;
  }

  return resumePendingBattle(nextState);
}

export function pickRunBoon(
  currentState: CampaignRunState,
  boonId: RunBoonId,
): CampaignRunState {
  if (
    currentState.phase !== 'boon-draft' ||
    !currentState.boonDraft ||
    !currentState.boonDraft.options.includes(boonId)
  ) {
    return currentState;
  }

  const definition = RUN_BOON_DEFINITIONS[boonId];
  const nextState = cloneState(currentState);
  const currentStacks = nextState.runBoons[boonId];

  if (currentStacks >= definition.stackCap) {
    return currentState;
  }

  nextState.runBoons[boonId] = currentStacks + 1;
  nextState.boonDraft = null;
  nextState.checkpointOptions = null;
  nextState.lastMessage = `${definition.label} joined this run.`;

  return resumePendingBattle(nextState);
}

export function retireRun(currentState: CampaignRunState): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return endRun(currentState, 'retire', 'You retired and banked the run.');
}

export function skipBattle(currentState: CampaignRunState): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return {
    ...advanceToNextBattle(currentState),
    lastMessage: 'Dev skip advanced to the next battle.',
  };
}

export function advanceClock(
  currentState: CampaignRunState,
  elapsedMs: number,
): CampaignClockResult {
  if (currentState.phase !== 'battle' || elapsedMs <= 0) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged: false,
      becameComplete: false,
    };
  }

  const nextBattleTimerMs = Math.max(0, currentState.battleTimerMs - elapsedMs);
  const displayedSecondChanged =
    toDisplayedSeconds(currentState.battleTimerMs) !== toDisplayedSeconds(nextBattleTimerMs);

  if (nextBattleTimerMs === currentState.battleTimerMs) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged,
      becameComplete: false,
    };
  }

  if (nextBattleTimerMs === 0) {
    return {
      state: endRun(currentState, 'timeout', 'The battle timer ran out.'),
      changed: true,
      displayedSecondChanged,
      becameComplete: true,
    };
  }

  return {
    state: {
      ...currentState,
      battleTimerMs: nextBattleTimerMs,
    },
    changed: true,
    displayedSecondChanged,
    becameComplete: false,
  };
}

export function trySwap(
  currentState: CampaignRunState,
  from: Cell,
  to: Cell,
  rng: () => number = Math.random,
): CampaignResolution {
  if (currentState.phase !== 'battle') {
    return rejectedResolution(currentState, currentState.lastMessage || 'The run is over.');
  }

  const boardResult = trySwapOnBoard(currentState.board, from, to, rng, DEFAULT_RUN_TILE_POOL);

  if (!boardResult.accepted) {
    const reason =
      boardResult.reason === 'not-adjacent'
        ? 'Only adjacent tiles can swap.'
        : 'That swap does not make a match.';

    return rejectedResolution(
      {
        ...currentState,
        lastMessage: reason,
      },
      reason,
    );
  }

  const events: CampaignEvent[] = [];
  const nextState = cloneState(currentState);
  nextState.board = boardResult.board;
  nextState.selectedTargetId = getWeakestLivingEnemyId(nextState.enemies);

  const turnSummary = summarizeBoardTurn(boardResult, nextState.runBoons);
  const selectedAction = nextState.selectedAction;
  const selectedTargetId = nextState.selectedTargetId;
  let timerBonusApplied = turnSummary.luckySwingBonusMs;
  let clearBonusAwarded = 0;
  let battleAdvanced = false;

  if (selectedAction === 'attack') {
    const target = selectedTargetId ? nextState.enemies.find((enemy) => enemy.id === selectedTargetId) : undefined;

    if (!target) {
      return rejectedResolution(
        {
          ...currentState,
          lastMessage: 'No living target found.',
        },
        'No living target found.',
      );
    }

    let attackAmount = turnSummary.turnPower + nextState.player.attackBonus;
    const firstCrushStacks = getRunBoonStacks(nextState.runBoons, 'first-crush');

    if (!nextState.battleFlags.firstAttackUsed && firstCrushStacks > 0) {
      attackAmount += firstCrushStacks * FIRST_CRUSH_DAMAGE;
    }

    if (
      getRunBoonStacks(nextState.runBoons, 'overwhelming-heart') > 0 &&
      turnSummary.hasBigMatch
    ) {
      attackAmount = Math.ceil(attackAmount * 1.5);
    }

    nextState.battleFlags.firstAttackUsed = true;
    const damageOutcome = applyDamage(target, attackAmount);

    events.push({
      type: 'player-action',
      action: selectedAction,
      targetId: target.id,
    });
    events.push({
      type: 'enemy-damaged',
      enemyId: target.id,
      amount: damageOutcome.appliedToHp,
      blocked: damageOutcome.absorbedByShield,
      defeated: target.currentHp <= 0,
    });

    nextState.score += boardResult.totalScoreDelta;
    nextState.highScore = Math.max(nextState.highScore, nextState.score);
    events.push({ type: 'score', amount: boardResult.totalScoreDelta });

    timerBonusApplied += boardResult.totalBonusTimeMs;

    if (target.currentHp <= 0) {
      timerBonusApplied += getRunBoonStacks(nextState.runBoons, 'time-siphon') * TIME_SIPHON_MS;

      if (target.boss && getRunBoonStacks(nextState.runBoons, 'royal-tempo') > 0) {
        const healAmount = Math.ceil(
          (nextState.player.maxHp - nextState.player.currentHp) * ROYAL_TEMPO_HEAL_RATIO,
        );
        const appliedHeal = Math.min(healAmount, nextState.player.maxHp - nextState.player.currentHp);

        nextState.player.currentHp += appliedHeal;
        timerBonusApplied += ROYAL_TEMPO_TIME_MS;

        if (appliedHeal > 0) {
          events.push({ type: 'player-heal', amount: appliedHeal });
        }
      }
    }

    if (timerBonusApplied > 0) {
      nextState.battleTimerMs += timerBonusApplied;
      events.push({ type: 'timer', amount: timerBonusApplied });
    }

    if (nextState.enemies.every((enemy) => enemy.currentHp <= 0)) {
      clearBonusAwarded = getBattleClearBonus(nextState.battleIndex);
      nextState.score += clearBonusAwarded;
      nextState.highScore = Math.max(nextState.highScore, nextState.score);
      events.push({ type: 'score', amount: clearBonusAwarded });
      battleAdvanced = true;
    }

    nextState.lastMessage = `Attack hit ${target.name} for ${attackAmount}.`;
  } else if (selectedAction === 'defend') {
    const shieldGain = turnSummary.turnPower + nextState.player.guardBonus;
    nextState.player.shield += shieldGain;
    events.push({ type: 'player-action', action: 'defend' });
    events.push({ type: 'player-shield', amount: shieldGain });

    const softGuardHeal = getRunBoonStacks(nextState.runBoons, 'soft-guard') * SOFT_GUARD_HEAL;
    const appliedHeal = Math.min(softGuardHeal, nextState.player.maxHp - nextState.player.currentHp);

    if (appliedHeal > 0) {
      nextState.player.currentHp += appliedHeal;
      events.push({ type: 'player-heal', amount: appliedHeal });
    }

    if (timerBonusApplied > 0) {
      nextState.battleTimerMs += timerBonusApplied;
      events.push({ type: 'timer', amount: timerBonusApplied });
    }

    nextState.lastMessage = `Defend gained ${shieldGain} shield.`;
  } else {
    const requestedHeal =
      Math.ceil(turnSummary.turnPower * 0.75) +
      nextState.player.healBonus +
      nextState.battleFlags.healPowerBonus;
    const healAmount = Math.max(0, Math.min(requestedHeal, nextState.player.maxHp - nextState.player.currentHp));
    nextState.player.currentHp += healAmount;
    events.push({ type: 'player-action', action: 'heal' });
    events.push({ type: 'player-heal', amount: healAmount });

    const afterglowShield = getRunBoonStacks(nextState.runBoons, 'afterglow') * AFTERGLOW_SHIELD;

    if (afterglowShield > 0) {
      nextState.player.shield += afterglowShield;
      events.push({ type: 'player-shield', amount: afterglowShield });
    }

    if (timerBonusApplied > 0) {
      nextState.battleTimerMs += timerBonusApplied;
      events.push({ type: 'timer', amount: timerBonusApplied });
    }

    nextState.lastMessage = healAmount > 0 ? `Heal restored ${healAmount} HP.` : 'Heal found no missing HP.';
  }

  if (battleAdvanced) {
    const clearedBattleIndex = nextState.battleIndex;
    const nextProgress = getNextBattleProgress(clearedBattleIndex, nextState.loopCount);
    events.push({
      type: 'battle-cleared',
      bonus: clearBonusAwarded,
      battleIndex: clearedBattleIndex,
      nextBattleIndex: nextProgress.battleIndex,
      nextLoopCount: nextProgress.loopCount,
    });

    const transitionedState = transitionAfterBattleClear(nextState, clearedBattleIndex, rng, events);

    return {
      accepted: true,
      state: transitionedState,
      boardResult,
      events,
      battleAdvanced: true,
      timerBonusApplied,
      clearBonusAwarded,
    };
  }

  applyEnemyTurn(nextState, events);
  nextState.selectedTargetId = getWeakestLivingEnemyId(nextState.enemies);

  if (nextState.player.currentHp <= 0) {
    const endedState = endRun(nextState, 'defeat', 'The flock has fallen.');
    events.push({ type: 'run-ended', reason: 'defeat' });

    return {
      accepted: true,
      state: endedState,
      boardResult,
      events,
      battleAdvanced: false,
      timerBonusApplied,
      clearBonusAwarded,
    };
  }

  return {
    accepted: true,
    state: nextState,
    boardResult,
    events,
    battleAdvanced: false,
    timerBonusApplied,
    clearBonusAwarded,
  };
}

function createBattleState(options: {
  battleIndex: number;
  loopCount: number;
  board: BoardState;
  player: PlayerRuntimeState;
  score: number;
  highScore: number;
  runBoons: RunBoonState;
  battleTimerMs?: number;
  battleTimerMaxMs?: number;
}): CampaignRunState {
  const enemies = createEncounterEnemies(options.battleIndex, options.loopCount);
  const battleTimerMaxMs = options.battleTimerMaxMs ?? getBattleTimerMs(options.battleIndex);
  const selectedTargetId = getWeakestLivingEnemyId(enemies);
  const battleFlags = createBattleFlags(options.battleIndex, options.runBoons);
  const player = {
    ...options.player,
    currentHp: Math.min(options.player.maxHp, options.player.currentHp),
    shield: getBattleStartShield(options.battleIndex, options.runBoons),
  };

  return {
    phase: 'battle',
    battleIndex: options.battleIndex,
    loopCount: options.loopCount,
    battleTimerMs: options.battleTimerMs ?? battleTimerMaxMs,
    battleTimerMaxMs,
    board: options.board,
    player,
    enemies,
    selectedAction: 'attack',
    selectedTargetId,
    score: options.score,
    highScore: Math.max(options.highScore, options.score),
    lastMessage: buildBattleIntroMessage(options.battleIndex, options.loopCount, enemies),
    runEndedReason: null,
    runBoons: { ...options.runBoons },
    checkpointOptions: null,
    boonDraft: null,
    battleFlags,
  };
}

function createPlayerState(bonuses: PlayerBonuses): PlayerRuntimeState {
  const maxHp = PLAYER_BASE_MAX_HP + bonuses.maxHpBonus;

  return {
    ...bonuses,
    currentHp: maxHp,
    maxHp,
    shield: 0,
  };
}

function createEncounterEnemies(battleIndex: number, loopCount: number): EnemyRuntimeState[] {
  const encounter = getEncounterDefinition(battleIndex);

  return encounter.enemyIds.map((enemyId, index) => {
    const definition = ENEMY_DEFINITIONS[enemyId];
    const scaledMaxHp = Math.round(definition.maxHp * (1 + 0.18 * loopCount));

    return {
      id: `battle-${battleIndex}-enemy-${index}`,
      enemyId,
      name: definition.name,
      title: definition.title,
      currentHp: scaledMaxHp,
      maxHp: scaledMaxHp,
      shield: 0,
      intentIndex: 0,
      intent: scaleIntent(definition, 0, loopCount, scaledMaxHp, scaledMaxHp),
      boss: Boolean(definition.boss),
    };
  });
}

function summarizeBoardTurn(
  boardResult: BoardResolutionResult,
  runBoons: RunBoonState,
): {
  totalTilesCleared: number;
  comboSteps: number;
  bigMatchSteps: number;
  hasBigMatch: boolean;
  turnPower: number;
  luckySwingBonusMs: number;
} {
  const totalTilesCleared = boardResult.steps.reduce((sum, step) => sum + step.clearedCells.length, 0);
  const comboSteps = boardResult.steps.length;
  const bigMatchSteps = boardResult.steps.filter((step) => step.bigMatch).length;
  const extraCascadeSteps = Math.max(0, comboSteps - 1);
  const bigFeelingsBonus = bigMatchSteps * getRunBoonStacks(runBoons, 'big-feelings') * BIG_FEELINGS_POWER;
  const cascadeKissBonus = extraCascadeSteps * getRunBoonStacks(runBoons, 'cascade-kiss') * CASCADE_KISS_POWER;
  const luckySwingBonusMs =
    totalTilesCleared >= 8 ? getRunBoonStacks(runBoons, 'lucky-swing') * LUCKY_SWING_MS : 0;

  return {
    totalTilesCleared,
    comboSteps,
    bigMatchSteps,
    hasBigMatch: bigMatchSteps > 0,
    turnPower:
      totalTilesCleared + extraCascadeSteps + 2 * bigMatchSteps + bigFeelingsBonus + cascadeKissBonus,
    luckySwingBonusMs,
  };
}

function applyEnemyTurn(state: CampaignRunState, events: CampaignEvent[]): void {
  state.enemies.forEach((enemy) => {
    if (enemy.currentHp <= 0 || state.player.currentHp <= 0) {
      return;
    }

    const definition = ENEMY_DEFINITIONS[enemy.enemyId];

    if (definition.passive === 'queen-shield') {
      const shieldAmount = definition.passiveShieldAmount ?? 0;
      enemy.shield += shieldAmount;
      events.push({ type: 'enemy-shield', enemyId: enemy.id, amount: shieldAmount });
    }

    const intent = enemy.intent;
    events.push({ type: 'enemy-action', enemyId: enemy.id, intentType: intent.type, amount: intent.value });

    if (intent.type === 'attack') {
      const damageOutcome = applyDamageToPlayer(state.player, intent.value);
      events.push({
        type: 'player-damaged',
        amount: damageOutcome.appliedToHp,
        blocked: damageOutcome.absorbedByShield,
        defeated: state.player.currentHp <= 0,
      });
    } else if (intent.type === 'guard') {
      const guardGain = definition.passive === 'ant-double-guard' ? intent.value * 2 : intent.value;
      enemy.shield += guardGain;
      events.push({ type: 'enemy-shield', enemyId: enemy.id, amount: guardGain });
    } else {
      const healAmount = Math.max(0, Math.min(intent.value, enemy.maxHp - enemy.currentHp));
      enemy.currentHp += healAmount;
      events.push({ type: 'enemy-heal', enemyId: enemy.id, amount: healAmount });
    }

    enemy.intentIndex = (enemy.intentIndex + 1) % definition.intentPattern.length;
    enemy.intent = scaleIntent(definition, enemy.intentIndex, state.loopCount, enemy.currentHp, enemy.maxHp);
  });

  if (state.player.currentHp > 0) {
    state.lastMessage = `Battle ${state.battleIndex} continues.`;
  }
}

function scaleIntent(
  definition: (typeof ENEMY_DEFINITIONS)[EnemyId],
  intentIndex: number,
  loopCount: number,
  currentHp: number,
  maxHp: number,
): EnemyIntentPattern {
  const baseIntent = definition.intentPattern[intentIndex] ?? definition.intentPattern[0];
  let value = baseIntent.value + loopCount;

  if (
    definition.passive === 'crow-enrage' &&
    currentHp <= maxHp / 2 &&
    (baseIntent.type === 'attack' || baseIntent.type === 'heal')
  ) {
    value += definition.enrageBonus ?? 0;
  }

  return {
    ...baseIntent,
    value,
    label: formatIntentLabel(baseIntent.type, value),
  };
}

function formatIntentLabel(type: EnemyIntentType, value: number): string {
  if (type === 'attack') {
    return `Attack ${value}`;
  }

  if (type === 'guard') {
    return `Guard ${value}`;
  }

  return `Heal ${value}`;
}

function applyDamage(
  enemy: EnemyRuntimeState,
  amount: number,
): { absorbedByShield: number; appliedToHp: number } {
  const absorbedByShield = Math.min(enemy.shield, amount);
  enemy.shield -= absorbedByShield;
  const appliedToHp = Math.max(0, amount - absorbedByShield);
  enemy.currentHp = Math.max(0, enemy.currentHp - appliedToHp);

  return {
    absorbedByShield,
    appliedToHp,
  };
}

function applyDamageToPlayer(
  player: PlayerRuntimeState,
  amount: number,
): { absorbedByShield: number; appliedToHp: number } {
  const absorbedByShield = Math.min(player.shield, amount);
  player.shield -= absorbedByShield;
  const appliedToHp = Math.max(0, amount - absorbedByShield);
  player.currentHp = Math.max(0, player.currentHp - appliedToHp);

  return {
    absorbedByShield,
    appliedToHp,
  };
}

function transitionAfterBattleClear(
  currentState: CampaignRunState,
  clearedBattleIndex: number,
  rng: () => number,
  events: CampaignEvent[],
): CampaignRunState {
  if (isBossCheckpointBattle(clearedBattleIndex)) {
    const bossCheckpointState = createCheckpointState(currentState, clearedBattleIndex, 'boss');
    events.push({
      type: 'checkpoint-ready',
      checkpoint: 'boss',
      nextBattleIndex: bossCheckpointState.battleIndex,
      nextLoopCount: bossCheckpointState.loopCount,
    });

    const draftedState = buildDraftState(
      bossCheckpointState,
      'major',
      rng,
      `Major boon draft before Battle ${bossCheckpointState.battleIndex}.`,
    );

    if (draftedState.boonDraft) {
      events.push({
        type: 'boon-draft-ready',
        tier: draftedState.boonDraft.tier,
        options: [...draftedState.boonDraft.options],
      });
    }

    return draftedState;
  }

  if (isRegularCheckpointBattle(clearedBattleIndex)) {
    const regularCheckpointState = createCheckpointState(currentState, clearedBattleIndex, 'regular');
    events.push({
      type: 'checkpoint-ready',
      checkpoint: 'regular',
      nextBattleIndex: regularCheckpointState.battleIndex,
      nextLoopCount: regularCheckpointState.loopCount,
    });
    return regularCheckpointState;
  }

  return advanceToNextBattle(currentState);
}

function createCheckpointState(
  currentState: CampaignRunState,
  clearedBattleIndex: number,
  checkpointType: 'regular' | 'boss',
): CampaignRunState {
  const nextProgress = getNextBattleProgress(clearedBattleIndex, currentState.loopCount);
  const nextBattleTimerMs = getBattleTimerMs(nextProgress.battleIndex) + currentState.battleTimerMs;

  return {
    ...currentState,
    phase: checkpointType === 'regular' ? 'checkpoint' : 'boon-draft',
    battleIndex: nextProgress.battleIndex,
    loopCount: nextProgress.loopCount,
    battleTimerMs: nextBattleTimerMs,
    battleTimerMaxMs: nextBattleTimerMs,
    player: {
      ...currentState.player,
      shield: 0,
    },
    enemies: [],
    selectedAction: 'attack',
    selectedTargetId: null,
    checkpointOptions: checkpointType === 'regular' ? [...REGULAR_CHECKPOINT_OPTIONS] : null,
    boonDraft: null,
    battleFlags: createEmptyBattleFlags(),
    lastMessage:
      checkpointType === 'regular'
        ? `Checkpoint before Battle ${nextProgress.battleIndex}.`
        : `Major boon draft before Battle ${nextProgress.battleIndex}.`,
  };
}

function buildDraftState(
  currentState: CampaignRunState,
  requestedTier: RunBoonTier,
  rng: () => number,
  message: string,
): CampaignRunState {
  const requestedEligible = getEligibleBoonIds(currentState.runBoons, requestedTier);
  const effectiveTier =
    requestedEligible.length > 0 ? requestedTier : requestedTier === 'major' ? 'minor' : requestedTier;
  const eligible = getEligibleBoonIds(currentState.runBoons, effectiveTier);

  if (eligible.length === 0) {
    return resumePendingBattle({
      ...currentState,
      phase: requestedTier === 'major' ? 'boon-draft' : 'checkpoint',
      checkpointOptions: null,
      boonDraft: null,
      lastMessage: 'All run boons are maxed for this run.',
    });
  }

  return {
    ...currentState,
    phase: 'boon-draft',
    checkpointOptions: null,
    boonDraft: {
      tier: effectiveTier,
      options: draftBoonOptions(eligible, rng),
    },
    lastMessage: message,
  };
}

function resumePendingBattle(currentState: CampaignRunState): CampaignRunState {
  return createBattleState({
    battleIndex: currentState.battleIndex,
    loopCount: currentState.loopCount,
    board: currentState.board,
    player: {
      ...currentState.player,
      shield: 0,
    },
    score: currentState.score,
    highScore: currentState.highScore,
    runBoons: currentState.runBoons,
    battleTimerMs: currentState.battleTimerMs,
    battleTimerMaxMs: currentState.battleTimerMaxMs,
  });
}

function advanceToNextBattle(currentState: CampaignRunState): CampaignRunState {
  const nextProgress = getNextBattleProgress(currentState.battleIndex, currentState.loopCount);
  const nextBattleTimerMs = getBattleTimerMs(nextProgress.battleIndex) + currentState.battleTimerMs;

  return createBattleState({
    battleIndex: nextProgress.battleIndex,
    board: currentState.board,
    highScore: currentState.highScore,
    loopCount: nextProgress.loopCount,
    player: {
      ...currentState.player,
      shield: 0,
    },
    score: currentState.score,
    runBoons: currentState.runBoons,
    battleTimerMs: nextBattleTimerMs,
    battleTimerMaxMs: nextBattleTimerMs,
  });
}

function endRun(
  currentState: CampaignRunState,
  reason: RunEndedReason,
  message: string,
): CampaignRunState {
  return {
    ...currentState,
    phase: 'ended',
    battleTimerMs: 0,
    runEndedReason: reason,
    checkpointOptions: null,
    boonDraft: null,
    lastMessage: message,
  };
}

function rejectedResolution(state: CampaignRunState, reason: string): CampaignResolution {
  return {
    accepted: false,
    reason,
    state,
    events: [],
    battleAdvanced: false,
    timerBonusApplied: 0,
    clearBonusAwarded: 0,
  };
}

function cloneState(currentState: CampaignRunState): CampaignRunState {
  return {
    ...currentState,
    board: currentState.board,
    player: { ...currentState.player },
    enemies: currentState.enemies.map((enemy) => ({ ...enemy, intent: { ...enemy.intent } })),
    runBoons: { ...currentState.runBoons },
    checkpointOptions: currentState.checkpointOptions ? [...currentState.checkpointOptions] : null,
    boonDraft: currentState.boonDraft
      ? {
          tier: currentState.boonDraft.tier,
          options: [...currentState.boonDraft.options],
        }
      : null,
    battleFlags: { ...currentState.battleFlags },
  };
}

function createEmptyBonuses(): PlayerBonuses {
  return {
    maxHpBonus: 0,
    attackBonus: 0,
    guardBonus: 0,
    healBonus: 0,
  };
}

function createEmptyRunBoons(): RunBoonState {
  return Object.fromEntries(
    Object.keys(RUN_BOON_DEFINITIONS).map((boonId) => [boonId, 0]),
  ) as RunBoonState;
}

function mergeRunBoons(runBoons: Partial<RunBoonState> | undefined): RunBoonState {
  return {
    ...createEmptyRunBoons(),
    ...(runBoons ?? {}),
  };
}

function createEmptyBattleFlags(): BattleFlags {
  return {
    firstAttackUsed: false,
    healPowerBonus: 0,
  };
}

function createBattleFlags(battleIndex: number, runBoons: RunBoonState): BattleFlags {
  return {
    firstAttackUsed: false,
    healPowerBonus:
      isBossBattle(battleIndex) && getRunBoonStacks(runBoons, 'unshaken') > 0
        ? UNSHAKEN_BOSS_HEAL_POWER
        : 0,
  };
}

function getBattleStartShield(battleIndex: number, runBoons: RunBoonState): number {
  let shield = getRunBoonStacks(runBoons, 'feather-bed') * FEATHER_BED_SHIELD;

  if (isBossBattle(battleIndex) && getRunBoonStacks(runBoons, 'unshaken') > 0) {
    shield += UNSHAKEN_BOSS_SHIELD;
  }

  return shield;
}

function buildBattleIntroMessage(
  battleIndex: number,
  loopCount: number,
  enemies: EnemyRuntimeState[],
): string {
  const enemyText = enemies.map((enemy) => enemy.name).join(' and ');
  const loopLabel = loopCount > 0 ? ` Loop ${loopCount + 1}.` : '';

  return `Battle ${battleIndex}: ${enemyText}.${loopLabel} ${DEFAULT_STATUS}`;
}

function getActionSelectionMessage(action: PlayerActionId): string {
  if (action === 'attack') {
    return 'Attack selected. Make a match to deal damage.';
  }

  if (action === 'defend') {
    return 'Defend selected. Make a match to build shield.';
  }

  if (action === 'heal') {
    return 'Heal selected. Make a match to restore HP.';
  }

  return DEFAULT_STATUS;
}

function toDisplayedSeconds(timeRemainingMs: number): number {
  return Math.ceil(Math.max(0, timeRemainingMs) / 1_000);
}

function getWeakestLivingEnemyId(enemies: EnemyRuntimeState[]): string | null {
  let weakest: EnemyRuntimeState | null = null;

  for (const enemy of enemies) {
    if (enemy.currentHp <= 0) {
      continue;
    }

    if (!weakest || enemy.currentHp < weakest.currentHp) {
      weakest = enemy;
    }
  }

  return weakest?.id ?? null;
}

function getRunBoonStacks(runBoons: RunBoonState, boonId: RunBoonId): number {
  return runBoons[boonId] ?? 0;
}

function getEligibleBoonIds(runBoons: RunBoonState, tier: RunBoonTier): RunBoonId[] {
  return (Object.values(RUN_BOON_DEFINITIONS) as (typeof RUN_BOON_DEFINITIONS)[RunBoonId][])
    .filter((definition) => definition.tier === tier)
    .filter((definition) => getRunBoonStacks(runBoons, definition.id) < definition.stackCap)
    .map((definition) => definition.id);
}

function draftBoonOptions(eligibleBoons: RunBoonId[], rng: () => number): RunBoonId[] {
  const pool = [...eligibleBoons];
  const options: RunBoonId[] = [];
  const targetCount = Math.min(3, pool.length);

  while (pool.length > 0 && options.length < targetCount) {
    const index = Math.floor(rng() * pool.length);
    const nextOption = pool.splice(index, 1)[0];

    if (nextOption) {
      options.push(nextOption);
    }
  }

  return options;
}

function getNextBattleProgress(
  battleIndex: number,
  loopCount: number,
): { battleIndex: number; loopCount: number } {
  return {
    battleIndex: battleIndex === 30 ? 1 : battleIndex + 1,
    loopCount: battleIndex === 30 ? loopCount + 1 : loopCount,
  };
}

export {
  BOSS_BATTLE_TIMER_MS,
  NORMAL_BATTLE_TIMER_MS,
  CHECKPOINT_BANK_TIME_MS,
  CHECKPOINT_OPTION_DEFINITIONS,
};
