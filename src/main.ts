import Phaser from 'phaser';
import './style.css';
import { CrowsCacheGame } from './game/CrowsCacheGame.ts';
import { BootScene } from './phaser/scenes/BootScene.ts';
import { GameScene } from './phaser/scenes/GameScene.ts';
import {
  areSoundEffectsEnabled,
  setSoundEffectsEnabled,
} from './phaser/view/MatchCrowSfx.ts';
import {
  canSkipCrowaxidMusic,
  isCrowaxidMusicEnabled,
  skipCrowaxidMusic,
  setCrowaxidMusicEnabled,
} from './phaser/view/MatchCrowMusic.ts';
import {
  canReadRemoteLeaderboard,
  canSubmitRemoteScore,
  fetchTopScores,
  normalizeInitials,
  submitScore,
} from './services/leaderboard.ts';
import { createHud } from './ui/createHud.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

const controller = new CrowsCacheGame();
const leaderboardReadEnabled = canReadRemoteLeaderboard();
const leaderboardSubmitEnabled = canSubmitRemoteScore();
const devToolsEnabled = import.meta.env.DEV;
const hud = createHud(app, controller.getViewState(), {
  leaderboardReadEnabled,
  leaderboardSubmitEnabled,
  devToolsEnabled,
  soundEnabled: areSoundEffectsEnabled(),
  musicEnabled: isCrowaxidMusicEnabled(),
  musicSkippable: canSkipCrowaxidMusic(),
});
const gameScene = new GameScene(controller, hud);
const ensureBackgroundMusic = (): void => {
  gameScene.ensureBackgroundMusic();
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: hud.canvasHost,
  width: hud.canvasHost.clientWidth || 720,
  height: hud.canvasHost.clientHeight || 720,
  backgroundColor: '#120f1e',
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: hud.canvasHost,
  },
  scene: [new BootScene(), gameScene],
});

hud.onRestart(() => {
  ensureBackgroundMusic();
  controller.restart();
});

hud.onSkipBattle(() => {
  ensureBackgroundMusic();
  controller.skipBattle();
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onToggleSound(() => {
  const enabled = setSoundEffectsEnabled(!areSoundEffectsEnabled());
  hud.setSoundEnabled(enabled);
});

hud.onToggleMusic(() => {
  const enabled = setCrowaxidMusicEnabled(gameScene, !isCrowaxidMusicEnabled());
  hud.setMusicEnabled(enabled);

  if (enabled) {
    ensureBackgroundMusic();
  }
});

hud.onSkipMusic(() => {
  skipCrowaxidMusic(gameScene);
});

hud.onResetPlayerData(() => {
  ensureBackgroundMusic();
  controller.resetPlayerData();
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onRetire(() => {
  ensureBackgroundMusic();
  controller.retire();
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onSelectAction((action) => {
  ensureBackgroundMusic();
  controller.selectAction(action);
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onChooseUpgrade((upgradeId) => {
  ensureBackgroundMusic();
  controller.applyPermanentUpgrade(upgradeId);
  hud.render(controller.getViewState());
});

hud.onChooseCheckpoint((optionId) => {
  ensureBackgroundMusic();
  controller.chooseCheckpointOption(optionId);
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onPickRunBoon((boonId) => {
  ensureBackgroundMusic();
  controller.pickRunBoon(boonId);
  hud.render(controller.getViewState());
  gameScene.refreshState();
});

hud.onOpenLeaderboard(() => {
  ensureBackgroundMusic();
  if (!leaderboardReadEnabled) {
    hud.showLeaderboardUnavailable(
      'Firebase is not configured yet. Add the web app env vars first.',
    );
    return;
  }

  hud.showLeaderboardLoading();
  void fetchTopScores()
    .then((entries) => {
      hud.showLeaderboardEntries(entries, controller.getViewState().leaderboard.playerId);
    })
    .catch(() => {
      hud.showLeaderboardError('Could not load the top scores right now.');
    });
});

hud.onRetryLeaderboard(() => {
  ensureBackgroundMusic();
  if (!leaderboardReadEnabled) {
    hud.showLeaderboardUnavailable(
      'Firebase is not configured yet. Add the web app env vars first.',
    );
    return;
  }

  hud.showLeaderboardLoading();
  void fetchTopScores()
    .then((entries) => {
      hud.showLeaderboardEntries(entries, controller.getViewState().leaderboard.playerId);
    })
    .catch(() => {
      hud.showLeaderboardError('Could not load the top scores right now.');
    });
});

hud.onOpenSubmit(() => {
  ensureBackgroundMusic();
  if (!leaderboardSubmitEnabled) {
    hud.showLeaderboardUnavailable('Firebase is not configured yet. Add the web app env vars first.');
    return;
  }

  hud.openSubmitDialog(controller.getViewState().leaderboard.lastSubmittedInitials);
});

hud.onSubmitScore((initials) => {
  ensureBackgroundMusic();
  const normalizedInitials = normalizeInitials(initials);
  const viewState = controller.getViewState();

  if (normalizedInitials.length !== 3) {
    hud.setSubmitError('Use exactly 3 letters.');
    return;
  }

  hud.setSubmitBusy();

  void submitScore({
    playerId: viewState.leaderboard.playerId,
    initials: normalizedInitials,
    score: viewState.leaderboard.submitScore,
    level: viewState.progression.level,
    battleReached: viewState.battleIndex,
    loopCount: viewState.loopCount,
    endedBy: viewState.runEndedReason ?? 'retire',
  })
    .then((result) => {
      if (result.replacedBest) {
        controller.recordSubmittedScore(result.initials, result.score);
        hud.render(controller.getViewState());
        hud.setSubmitSuccess('Score posted.');
        window.setTimeout(() => {
          hud.closeOverlay();
        }, 900);
        return;
      }

      hud.setSubmitError('That score is not above your posted best.');
    })
    .catch(() => {
      hud.setSubmitError('Could not post score right now.');
    });
});

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
