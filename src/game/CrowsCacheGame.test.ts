import { describe, expect, it } from 'vitest';
import { CrowsCacheGame } from './CrowsCacheGame.ts';
import { createStateFromKinds, type CampaignRunState } from './simulation/engine.ts';
import { getRunXpForScore } from './progression.ts';
import type { TileKind } from './simulation/types.ts';

describe('CrowsCacheGame progression awards', () => {
  it('awards run XP when a run is retired', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      score: 420,
      highScore: 420,
    };

    controller.retire();

    expect(controller.getViewState().progression.totalXp).toBe(getRunXpForScore(420));
    expect(controller.getViewState().postRun.awardedXp).toBe(getRunXpForScore(420));
  });

  it('awards completion XP only once for the same run', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      score: 310,
      highScore: 310,
      battleTimerMs: 1,
    };

    controller.advanceClock(1);
    const awardedXp = controller.getViewState().progression.totalXp;

    expect(awardedXp).toBe(getRunXpForScore(310));

    controller.advanceClock(1_000);

    expect(controller.getViewState().progression.totalXp).toBe(awardedXp);
  });

  it('levels up during battle and pauses the timer until the upgrade is chosen', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as {
      state: CampaignRunState;
      totalXp: number;
    };

    mutableController.totalXp = 95;
    mutableController.state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
      battleTimerMs: 12_000,
      battleTimerMaxMs: 12_000,
    });

    const result = controller.trySwap({ row: 2, col: 0 }, { row: 2, col: 1 });
    const paused = controller.advanceClock(1_000);

    expect(result.accepted).toBe(true);
    expect(controller.getViewState().progression.level).toBe(2);
    expect(controller.getViewState().pendingUpgrades?.remainingChoices).toBe(1);
    expect(paused.changed).toBe(false);
    expect(paused.state.battleTimerMs).toBe(controller.getState().battleTimerMs);

    controller.applyPermanentUpgrade('heart');
    const resumed = controller.advanceClock(1_000);

    expect(controller.getViewState().pendingUpgrades).toBeNull();
    expect(resumed.changed).toBe(true);
    expect(resumed.state.battleTimerMs).toBe(controller.getState().battleTimerMs);
    expect(controller.getState().lastMessage).toBe('Permanent upgrade stored. Battle timer resumed.');
  });

  it('stores permanent upgrades and applies them on the next run only', () => {
    const controller = new CrowsCacheGame(() => 0.999);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      score: 1_000,
      highScore: 1_000,
      battleTimerMs: 1,
    };

    controller.advanceClock(1);
    const completedView = controller.getViewState();

    expect(completedView.progression.level).toBe(2);
    expect(completedView.pendingUpgrades?.remainingChoices).toBe(1);
    expect(controller.getState().player.maxHp).toBe(40);

    controller.applyPermanentUpgrade('heart');

    expect(controller.getState().player.maxHp).toBe(40);
    expect((controller as unknown as { bonuses: { maxHpBonus: number } }).bonuses.maxHpBonus).toBe(8);

    controller.restart();

    expect(controller.getState().player.maxHp).toBe(48);
    expect(controller.getViewState().pendingUpgrades).toBeNull();
  });

  it('stores claw, bark, and herb upgrades at the stronger values', () => {
    const controller = new CrowsCacheGame(() => 0.999);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      score: 4_500,
      highScore: 4_500,
      battleTimerMs: 1,
    };

    controller.advanceClock(1);
    expect(controller.getViewState().pendingUpgrades?.remainingChoices).toBe(3);

    controller.applyPermanentUpgrade('claw');
    controller.applyPermanentUpgrade('bark');
    controller.applyPermanentUpgrade('herb');

    expect(
      (controller as unknown as {
        bonuses: { attackBonus: number; guardBonus: number; healBonus: number };
      }).bonuses,
    ).toEqual({
      maxHpBonus: 0,
      attackBonus: 3,
      guardBonus: 3,
      healBonus: 3,
    });

    controller.restart();

    expect(controller.getState().player.attackBonus).toBe(3);
    expect(controller.getState().player.guardBonus).toBe(3);
    expect(controller.getState().player.healBonus).toBe(3);
  });

  it('skips battles without awarding score', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      battleIndex: 9,
      score: 222,
      highScore: 222,
      battleTimerMs: 8_000,
    };

    controller.skipBattle();

    expect(controller.getState().battleIndex).toBe(10);
    expect(controller.getState().score).toBe(222);
  });

  it('resolves checkpoints and clears run boons on a new run', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: CampaignRunState };

    mutableController.state = {
      ...mutableController.state,
      phase: 'checkpoint',
      battleIndex: 4,
      enemies: [],
      checkpointOptions: ['boon-draft', 'recover', 'bank-time'],
      selectedTargetId: null,
    };

    controller.chooseCheckpointOption('boon-draft');
    expect(controller.getState().phase).toBe('boon-draft');

    const draftState = controller.getState();
    mutableController.state = {
      ...draftState,
      boonDraft: {
        tier: 'minor',
        options: ['first-crush', 'feather-bed', 'afterglow'],
      },
    };

    controller.pickRunBoon('first-crush');
    expect(controller.getState().phase).toBe('battle');
    expect(controller.getState().runBoons['first-crush']).toBe(1);

    controller.restart();
    expect(controller.getState().runBoons['first-crush']).toBe(0);
    expect(controller.getState().phase).toBe('battle');
  });

  it('resets player data and starts a fresh profile', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as {
      state: CampaignRunState;
      highScore: number;
      totalXp: number;
      lastSubmittedScore: number;
      lastSubmittedInitials: string;
      bonuses: {
        maxHpBonus: number;
        attackBonus: number;
        guardBonus: number;
        healBonus: number;
      };
      pendingUpgradeChoices: number;
    };
    const originalPlayerId = controller.getViewState().leaderboard.playerId;

    mutableController.highScore = 700;
    mutableController.totalXp = 220;
    mutableController.lastSubmittedScore = 600;
    mutableController.lastSubmittedInitials = 'ABC';
    mutableController.pendingUpgradeChoices = 2;
    mutableController.bonuses = {
      maxHpBonus: 8,
      attackBonus: 3,
      guardBonus: 3,
      healBonus: 3,
    };
    mutableController.state = {
      ...mutableController.state,
      highScore: 700,
      score: 700,
    };

    const resetView = controller.resetPlayerData();

    expect(resetView.highScore).toBe(0);
    expect(resetView.progression.totalXp).toBe(0);
    expect(resetView.pendingUpgrades).toBeNull();
    expect(resetView.leaderboard.lastSubmittedScore).toBe(0);
    expect(resetView.leaderboard.lastSubmittedInitials).toBe('');
    expect(resetView.leaderboard.playerId).not.toBe(originalPlayerId);
    expect(controller.getState().player.maxHp).toBe(40);
    expect(controller.getState().player.attackBonus).toBe(0);
    expect(controller.getState().player.guardBonus).toBe(0);
    expect(controller.getState().player.healBonus).toBe(0);
    expect(controller.getState().phase).toBe('battle');
  });
});

function buildSingleMatchBoard(kind: TileKind, blocker: TileKind): TileKind[][] {
  const rows: TileKind[][] = [
    ['key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring'],
    ['coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button'],
    ['ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket'],
    ['button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket', 'key'],
    ['trinket', 'key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin'],
    ['key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring'],
    ['coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button'],
    ['ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket'],
  ];

  rows[0][0] = kind;
  rows[1][0] = kind;
  rows[2][0] = blocker;
  rows[2][1] = kind;
  if (rows[3][0] === kind) {
    rows[3][0] = blocker;
  }

  return rows;
}
