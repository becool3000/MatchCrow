import { describe, expect, it } from 'vitest';
import { CrowsCacheGame } from './CrowsCacheGame.ts';
import { initializeRun, type MatchCrowState } from './simulation/engine.ts';
import { getRunXpForScore } from './progression.ts';

describe('CrowsCacheGame progression awards', () => {
  it('awards run XP when a run is restarted', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: MatchCrowState };

    mutableController.state = {
      ...initializeRun(() => 0.5),
      score: 420,
      highScore: 420,
    };

    controller.restart();

    expect(controller.getViewState().progression.totalXp).toBe(getRunXpForScore(420));
  });

  it('awards completion XP only once for the same run', () => {
    const controller = new CrowsCacheGame(() => 0.5);
    const mutableController = controller as unknown as { state: MatchCrowState };

    mutableController.state = {
      ...initializeRun(() => 0.5),
      score: 310,
      highScore: 310,
      timeRemainingMs: 1,
    };

    controller.advanceClock(1);
    const awardedXp = controller.getViewState().progression.totalXp;

    expect(awardedXp).toBe(getRunXpForScore(310));

    controller.advanceClock(1_000);

    expect(controller.getViewState().progression.totalXp).toBe(awardedXp);
  });

  it('unlocks tiles on level-up and applies them on the next run only', () => {
    const controller = new CrowsCacheGame(() => 0.999);
    const mutableController = controller as unknown as { state: MatchCrowState };

    mutableController.state = {
      ...initializeRun(() => 0.999),
      score: 1_000,
      highScore: 1_000,
      timeRemainingMs: 1,
    };

    const previousRunTilePool = mutableController.state.runTilePool;
    controller.advanceClock(1);
    const completedView = controller.getViewState();

    expect(completedView.progression.level).toBe(2);
    expect(completedView.unlocks.newlyUnlockedTileKinds).toEqual(['gem']);
    expect(completedView.lastMessage).toContain('Gem');
    expect(controller.getState().runTilePool).toEqual(previousRunTilePool);

    controller.restart();

    expect(controller.getState().runTilePool.damage).toBe('gem');
    expect(controller.getViewState().unlocks.newlyUnlockedTileKinds).toEqual([]);
  });
});
