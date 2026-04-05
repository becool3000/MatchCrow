import { describe, expect, it } from 'vitest';
import { CrowsCacheGame } from './CrowsCacheGame.ts';
import type { CampaignRunState } from './simulation/engine.ts';
import { getRunXpForScore } from './progression.ts';

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
});
