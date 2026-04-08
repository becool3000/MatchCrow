import {
  PERMANENT_UPGRADE_OPTIONS,
  type PermanentUpgradeId,
  type PermanentUpgradeOption,
} from './campaignData.ts';
import { getProgressionState, getRunXpForScore, type MatchCrowProgressionState } from './progression.ts';
import {
  advanceClock,
  initializeRun,
  chooseCheckpointOption,
  pickRunBoon,
  retireRun,
  setSelectedAction,
  skipBattle,
  trySwap,
  type CampaignClockResult,
  type CampaignResolution,
  type CampaignRunState,
  type PlayerBonuses,
} from './simulation/engine.ts';
import type { Cell } from './simulation/types.ts';
import {
  getSubmitEligibility,
  normalizeInitials,
  type SubmitEligibility,
} from '../services/leaderboard.ts';
import type {
  CheckpointOptionId,
  PlayerActionId,
  RunBoonId,
  RunEndedReason,
} from './campaignData.ts';

type RestartListener = (state: CampaignRunState) => void;

const HIGH_SCORE_STORAGE_KEY = 'matchcrow.high-score';
const TOTAL_XP_STORAGE_KEY = 'matchcrow.total-xp';
const PLAYER_ID_STORAGE_KEY = 'matchcrow.player-id';
const LAST_SUBMITTED_SCORE_STORAGE_KEY = 'matchcrow.last-submitted-score';
const LAST_SUBMITTED_INITIALS_STORAGE_KEY = 'matchcrow.last-submitted-initials';
const MAX_HP_BONUS_STORAGE_KEY = 'matchcrow.max-hp-bonus';
const ATTACK_BONUS_STORAGE_KEY = 'matchcrow.attack-bonus';
const GUARD_BONUS_STORAGE_KEY = 'matchcrow.guard-bonus';
const HEAL_BONUS_STORAGE_KEY = 'matchcrow.heal-bonus';
const PENDING_UPGRADES_STORAGE_KEY = 'matchcrow.pending-upgrades';
const PLAYER_DATA_STORAGE_KEYS = [
  HIGH_SCORE_STORAGE_KEY,
  TOTAL_XP_STORAGE_KEY,
  PLAYER_ID_STORAGE_KEY,
  LAST_SUBMITTED_SCORE_STORAGE_KEY,
  LAST_SUBMITTED_INITIALS_STORAGE_KEY,
  MAX_HP_BONUS_STORAGE_KEY,
  ATTACK_BONUS_STORAGE_KEY,
  GUARD_BONUS_STORAGE_KEY,
  HEAL_BONUS_STORAGE_KEY,
  PENDING_UPGRADES_STORAGE_KEY,
] as const;

export interface MatchCrowLeaderboardState {
  playerId: string;
  lastSubmittedScore: number;
  lastSubmittedInitials: string;
  canSubmit: boolean;
  submitReason?: string;
  submitScore: number;
}

export interface MatchCrowPendingUpgradeState {
  remainingChoices: number;
  options: PermanentUpgradeOption[];
}

export interface MatchCrowPostRunState {
  awardedXp: number;
  levelsGained: number;
  endedReason: RunEndedReason | null;
}

export interface MatchCrowViewState extends CampaignRunState {
  progression: MatchCrowProgressionState;
  leaderboard: MatchCrowLeaderboardState;
  pendingUpgrades: MatchCrowPendingUpgradeState | null;
  postRun: MatchCrowPostRunState;
}

export class CrowsCacheGame {
  private readonly rng: () => number;
  private state: CampaignRunState;
  private readonly restartListeners = new Set<RestartListener>();
  private highScore = 0;
  private totalXp = 0;
  private playerId: string;
  private lastSubmittedScore: number;
  private lastSubmittedInitials: string;
  private bonuses: PlayerBonuses;
  private pendingUpgradeChoices = 0;
  private runProgressCommitted = false;
  private lastRunAwardedXp = 0;
  private lastRunLevelsGained = 0;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.highScore = readNumber(HIGH_SCORE_STORAGE_KEY);
    this.totalXp = readNumber(TOTAL_XP_STORAGE_KEY);
    this.playerId = readOrCreatePlayerId();
    this.lastSubmittedScore = readNumber(LAST_SUBMITTED_SCORE_STORAGE_KEY);
    this.lastSubmittedInitials = readString(LAST_SUBMITTED_INITIALS_STORAGE_KEY);
    this.pendingUpgradeChoices = readNumber(PENDING_UPGRADES_STORAGE_KEY);
    this.bonuses = {
      maxHpBonus: readNumber(MAX_HP_BONUS_STORAGE_KEY),
      attackBonus: readNumber(ATTACK_BONUS_STORAGE_KEY),
      guardBonus: readNumber(GUARD_BONUS_STORAGE_KEY),
      healBonus: readNumber(HEAL_BONUS_STORAGE_KEY),
    };
    this.state = initializeRun(this.rng, this.highScore, this.bonuses);
  }

  getState(): CampaignRunState {
    return this.state;
  }

  getViewState(): MatchCrowViewState {
    const progression = getProgressionState(this.totalXp);
    const submitEligibility = this.getSubmitEligibility();

    return {
      ...this.state,
      progression,
      leaderboard: {
        playerId: this.playerId,
        lastSubmittedScore: this.lastSubmittedScore,
        lastSubmittedInitials: this.lastSubmittedInitials,
        canSubmit: submitEligibility.canSubmit,
        submitReason: submitEligibility.reason,
        submitScore: this.state.score,
      },
      pendingUpgrades:
        this.pendingUpgradeChoices > 0
          ? {
              remainingChoices: this.pendingUpgradeChoices,
              options: [...PERMANENT_UPGRADE_OPTIONS],
            }
          : null,
      postRun: {
        awardedXp: this.lastRunAwardedXp,
        levelsGained: this.lastRunLevelsGained,
        endedReason: this.state.runEndedReason,
      },
    };
  }

  advanceClock(elapsedMs: number): CampaignClockResult {
    if (this.pendingUpgradeChoices > 0) {
      return {
        state: this.state,
        changed: false,
        displayedSecondChanged: false,
        becameComplete: false,
      };
    }

    const previousPhase = this.state.phase;
    const result = advanceClock(this.state, elapsedMs);

    if (result.changed) {
      this.state = result.state;
      this.syncHighScore();

      if (previousPhase === 'battle' && result.state.phase === 'ended') {
        this.commitRunProgress();
      }
    }

    return {
      ...result,
      state: this.state,
    };
  }

  trySwap(from: Cell, to: Cell): CampaignResolution {
    const previousPhase = this.state.phase;
    const result = trySwap(this.state, from, to, this.rng);

    if (result.accepted) {
      this.state = result.state;
      this.syncHighScore();
      this.syncRunProgressToScore();

      if (previousPhase === 'battle' && this.state.phase === 'ended') {
        this.commitRunProgress();
      }
    }

    return {
      ...result,
      state: this.state,
    };
  }

  selectAction(action: PlayerActionId): CampaignRunState {
    this.state = setSelectedAction(this.state, action);
    return this.state;
  }

  retire(): CampaignRunState {
    const previousPhase = this.state.phase;
    this.state = retireRun(this.state);
    this.syncHighScore();

    if (previousPhase === 'battle' && this.state.phase === 'ended') {
      this.commitRunProgress();
    }

    return this.state;
  }

  skipBattle(): CampaignRunState {
    this.state = skipBattle(this.state);
    return this.state;
  }

  chooseCheckpointOption(optionId: CheckpointOptionId): CampaignRunState {
    this.state = chooseCheckpointOption(this.state, optionId, this.rng);
    return this.state;
  }

  pickRunBoon(boonId: RunBoonId): CampaignRunState {
    this.state = pickRunBoon(this.state, boonId);
    return this.state;
  }

  restart(): CampaignRunState {
    this.state = initializeRun(this.rng, this.highScore, this.bonuses);
    this.runProgressCommitted = false;
    this.lastRunAwardedXp = 0;
    this.lastRunLevelsGained = 0;
    this.restartListeners.forEach((listener) => listener(this.state));
    return this.state;
  }

  resetPlayerData(): MatchCrowViewState {
    PLAYER_DATA_STORAGE_KEYS.forEach((storageKey) => {
      removeStorageValue(storageKey);
    });

    this.highScore = 0;
    this.totalXp = 0;
    this.lastSubmittedScore = 0;
    this.lastSubmittedInitials = '';
    this.pendingUpgradeChoices = 0;
    this.runProgressCommitted = false;
    this.lastRunAwardedXp = 0;
    this.lastRunLevelsGained = 0;
    this.bonuses = {
      maxHpBonus: 0,
      attackBonus: 0,
      guardBonus: 0,
      healBonus: 0,
    };
    this.playerId = createPlayerId();
    writeString(PLAYER_ID_STORAGE_KEY, this.playerId);
    this.state = initializeRun(this.rng, this.highScore, this.bonuses);
    this.restartListeners.forEach((listener) => listener(this.state));

    return this.getViewState();
  }

  onRestart(listener: RestartListener): () => void {
    this.restartListeners.add(listener);

    return () => {
      this.restartListeners.delete(listener);
    };
  }

  applyPermanentUpgrade(upgradeId: PermanentUpgradeId): MatchCrowViewState {
    if (this.pendingUpgradeChoices <= 0) {
      return this.getViewState();
    }

    if (upgradeId === 'heart') {
      this.bonuses.maxHpBonus += 8;
      writeNumber(MAX_HP_BONUS_STORAGE_KEY, this.bonuses.maxHpBonus);
    } else if (upgradeId === 'claw') {
      this.bonuses.attackBonus += 3;
      writeNumber(ATTACK_BONUS_STORAGE_KEY, this.bonuses.attackBonus);
    } else if (upgradeId === 'bark') {
      this.bonuses.guardBonus += 3;
      writeNumber(GUARD_BONUS_STORAGE_KEY, this.bonuses.guardBonus);
    } else {
      this.bonuses.healBonus += 3;
      writeNumber(HEAL_BONUS_STORAGE_KEY, this.bonuses.healBonus);
    }

    this.pendingUpgradeChoices = Math.max(0, this.pendingUpgradeChoices - 1);
    writeNumber(PENDING_UPGRADES_STORAGE_KEY, this.pendingUpgradeChoices);

    if (this.pendingUpgradeChoices > 0) {
      this.state = {
        ...this.state,
        lastMessage: `Permanent upgrade stored. ${this.pendingUpgradeChoices} more to choose.`,
      };
    } else if (this.state.phase === 'battle') {
      this.state = {
        ...this.state,
        lastMessage: 'Permanent upgrade stored. Battle timer resumed.',
      };
    } else if (this.state.phase === 'ended') {
      this.state = {
        ...this.state,
        lastMessage: 'Permanent upgrades stored. Start a new run when ready.',
      };
    }

    return this.getViewState();
  }

  recordSubmittedScore(initials: string, score: number): void {
    const nextInitials = normalizeInitials(initials);

    if (score > this.lastSubmittedScore) {
      this.lastSubmittedScore = score;
      writeNumber(LAST_SUBMITTED_SCORE_STORAGE_KEY, this.lastSubmittedScore);
    }

    if (nextInitials.length === 3) {
      this.lastSubmittedInitials = nextInitials;
      writeString(LAST_SUBMITTED_INITIALS_STORAGE_KEY, this.lastSubmittedInitials);
    }
  }

  private getSubmitEligibility(): SubmitEligibility {
    if (this.state.phase !== 'ended') {
      return {
        canSubmit: false,
        reason: this.state.score > this.lastSubmittedScore ? 'Retire or finish the run to submit.' : 'Finish the run to submit.',
      };
    }

    return getSubmitEligibility(this.state.score, this.lastSubmittedScore);
  }

  private syncHighScore(): void {
    if (this.state.highScore <= this.highScore) {
      return;
    }

    this.highScore = this.state.highScore;
    writeNumber(HIGH_SCORE_STORAGE_KEY, this.highScore);
  }

  private commitRunProgress(): void {
    if (this.runProgressCommitted) {
      return;
    }

    this.runProgressCommitted = true;
    this.syncRunProgressToScore();

    if (this.pendingUpgradeChoices > 0) {
      this.state = {
        ...this.state,
        lastMessage:
          this.lastRunAwardedXp > 0
            ? `Run over. +${this.lastRunAwardedXp} XP earned. Choose your permanent upgrade${this.pendingUpgradeChoices === 1 ? '' : 's'}.`
            : `Run over. Choose your permanent upgrade${this.pendingUpgradeChoices === 1 ? '' : 's'}.`,
      };
      return;
    }

    if (this.lastRunAwardedXp <= 0) {
      return;
    }

    this.state = {
      ...this.state,
      lastMessage: `Run over. +${this.lastRunAwardedXp} XP earned.`,
    };
  }

  private syncRunProgressToScore(): void {
    const awardedXp = getRunXpForScore(this.state.score);
    const xpDelta = awardedXp - this.lastRunAwardedXp;

    if (xpDelta <= 0) {
      return;
    }

    const previousLevel = getProgressionState(this.totalXp).level;

    this.lastRunAwardedXp = awardedXp;
    this.totalXp += xpDelta;
    writeNumber(TOTAL_XP_STORAGE_KEY, this.totalXp);

    const nextLevel = getProgressionState(this.totalXp).level;
    const levelsGained = Math.max(0, nextLevel - previousLevel);

    if (levelsGained <= 0) {
      return;
    }

    this.lastRunLevelsGained += levelsGained;
    this.pendingUpgradeChoices += levelsGained;
    writeNumber(PENDING_UPGRADES_STORAGE_KEY, this.pendingUpgradeChoices);

    if (this.state.phase === 'battle') {
      this.state = {
        ...this.state,
        lastMessage: `Level up. Choose ${this.pendingUpgradeChoices} permanent upgrade${this.pendingUpgradeChoices === 1 ? '' : 's'}.`,
      };
    }
  }
}

function readNumber(storageKey: string): number {
  try {
    if (typeof window === 'undefined') {
      return 0;
    }

    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;

    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    return 0;
  }
}

function writeNumber(storageKey: string, value: number): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, `${Math.max(0, value)}`);
  } catch {
    // Ignore storage failures in private browsing or test environments.
  }
}

function readString(storageKey: string): string {
  try {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function writeString(storageKey: string, value: string): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage failures in private browsing or test environments.
  }
}

function removeStorageValue(storageKey: string): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures in private browsing or test environments.
  }
}

function readOrCreatePlayerId(): string {
  const existing = readString(PLAYER_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const nextId = createPlayerId();
  writeString(PLAYER_ID_STORAGE_KEY, nextId);
  return nextId;
}

function createPlayerId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
