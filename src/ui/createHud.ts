import { PERMANENT_UPGRADE_OPTIONS, type PermanentUpgradeId, type PlayerActionId } from '../game/campaignData.ts';
import type { MatchCrowViewState } from '../game/CrowsCacheGame.ts';
import type { LeaderboardEntry } from '../services/leaderboard.ts';

type OverlayMode = 'leaderboard' | 'submit' | null;

interface LeaderboardOverlayState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
  entries: LeaderboardEntry[];
  highlightedPlayerId: string;
  message: string;
}

interface SubmitOverlayState {
  status: 'idle' | 'submitting' | 'error' | 'success';
  initials: string;
  message: string;
}

export interface GameHud {
  canvasHost: HTMLDivElement;
  render: (state: MatchCrowViewState) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setStatus: (text: string) => void;
  pulsePlayerDamage: () => void;
  pulseTimer: (bonusTimeMs: number) => void;
  onRestart: (handler: () => void) => void;
  onSkipBattle: (handler: () => void) => void;
  onRetire: (handler: () => void) => void;
  onToggleSound: (handler: () => void) => void;
  onToggleMusic: (handler: () => void) => void;
  onSelectAction: (handler: (action: PlayerActionId) => void) => void;
  onChooseUpgrade: (handler: (upgradeId: PermanentUpgradeId) => void) => void;
  onOpenLeaderboard: (handler: () => void) => void;
  onRetryLeaderboard: (handler: () => void) => void;
  onOpenSubmit: (handler: () => void) => void;
  onSubmitScore: (handler: (initials: string) => void) => void;
  showLeaderboardLoading: () => void;
  showLeaderboardEntries: (entries: LeaderboardEntry[], highlightedPlayerId: string) => void;
  showLeaderboardError: (message: string) => void;
  showLeaderboardUnavailable: (message: string) => void;
  openSubmitDialog: (initials: string) => void;
  setSubmitBusy: () => void;
  setSubmitError: (message: string) => void;
  setSubmitSuccess: (message: string) => void;
  closeOverlay: () => void;
}

export function createHud(
  root: HTMLDivElement,
  initialState: MatchCrowViewState,
  options: {
    leaderboardReadEnabled: boolean;
    leaderboardSubmitEnabled: boolean;
    devToolsEnabled: boolean;
    soundEnabled: boolean;
    musicEnabled: boolean;
  },
): GameHud {
  root.innerHTML = `
    <div class="page-shell">
      <main class="game-shell game-shell-battle">
        <header class="hud-strip">
          <div class="hud-audio-controls">
            <button
              type="button"
              class="hud-audio-button"
              data-toggle-sound
              data-enabled="${options.soundEnabled}"
              aria-label="Toggle sound effects"
              title="Sound effects"
            >
              <span class="hud-audio-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="hud-audio-svg hud-audio-svg-speaker">
                  <path d="M4 10h4.8L13.5 6v12l-4.7-4H4z" fill="currentColor"></path>
                  <path d="M16 9c1.55 1.25 1.55 4.75 0 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"></path>
                  <path d="M18.8 6.7c2.95 2.8 2.95 7.8 0 10.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"></path>
                </svg>
              </span>
              <span class="hud-audio-slash" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              class="hud-audio-button"
              data-toggle-music
              data-enabled="${options.musicEnabled}"
              aria-label="Toggle music"
              title="Music"
            >
              <span class="hud-audio-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="hud-audio-svg hud-audio-svg-note">
                  <circle cx="9" cy="17.2" r="3.35" fill="currentColor"></circle>
                  <circle cx="17.2" cy="14.3" r="3.1" fill="currentColor"></circle>
                  <rect x="12.15" y="4.2" width="2.25" height="12.1" fill="currentColor"></rect>
                  <rect x="20.05" y="2.6" width="2.1" height="11.4" fill="currentColor"></rect>
                  <path d="M14.4 4.3 22.1 2.6v3.45L14.4 7.75z" fill="currentColor"></path>
                </svg>
              </span>
              <span class="hud-audio-slash" aria-hidden="true"></span>
            </button>
          </div>
          <span class="brand-chip">MatchCrow</span>
          <div class="stat-box">
            <span>Score</span>
            <strong data-score>000000</strong>
          </div>
          <div class="stat-box stat-box-high">
            <span>High</span>
            <strong data-high-score>000000</strong>
          </div>
          <div class="stat-box stat-box-level">
            <span>Level</span>
            <strong data-level>${initialState.progression.level.toString().padStart(2, '0')}</strong>
            <em class="stat-box-detail" data-level-xp>${formatLevelXp(
              initialState.progression.xpIntoLevel,
              initialState.progression.xpForNextLevel,
            )}</em>
          </div>
          <div class="stat-box stat-box-battle">
            <span>Battle</span>
            <strong data-battle>${initialState.battleIndex.toString().padStart(2, '0')}</strong>
            <em class="stat-box-detail" data-loop>Loop ${initialState.loopCount + 1}</em>
          </div>
          <div class="stat-box stat-box-hp">
            <span>HP</span>
            <strong data-hp>${formatHp(initialState.player.currentHp, initialState.player.maxHp)}</strong>
            <em class="stat-box-detail" data-shield>Shield ${initialState.player.shield}</em>
          </div>
          <div class="stat-box stat-box-timer" data-timer-box>
            <span>Timer</span>
            <strong data-timer>${formatRemainingTime(initialState.battleTimerMs)}</strong>
            <em class="timer-bonus" data-timer-bonus hidden>+0s</em>
          </div>
          <div class="hud-actions">
            <button type="button" class="hud-button" data-open-leaderboard>Top 100</button>
            <button type="button" class="hud-button" data-open-submit hidden>Submit Score</button>
            ${
              options.devToolsEnabled
                ? '<button type="button" class="hud-button hud-button-secondary" data-skip-battle>Skip Battle</button>'
                : ''
            }
            <button type="button" class="hud-button hud-button-secondary" data-retire>Retire</button>
            <button type="button" class="restart-button" data-restart>New Run</button>
          </div>
        </header>

        <section class="playfield-frame" data-playfield-frame>
          <div class="playfield-canvas" data-canvas></div>
        </section>

        <section class="combat-strip">
          <div class="command-grid" data-command-grid></div>
          <div class="enemy-summary" data-enemy-summary></div>
        </section>
      </main>

      <div class="overlay-shell" data-overlay hidden>
        <div class="overlay-card">
          <div class="overlay-head">
            <strong data-overlay-title>Overlay</strong>
            <button type="button" class="overlay-close" data-close-overlay>Close</button>
          </div>
          <div class="overlay-body" data-overlay-body></div>
        </div>
      </div>
    </div>
  `;

  const canvasHost = root.querySelector<HTMLDivElement>('[data-canvas]');
  const scoreEl = root.querySelector<HTMLElement>('[data-score]');
  const highScoreEl = root.querySelector<HTMLElement>('[data-high-score]');
  const levelEl = root.querySelector<HTMLElement>('[data-level]');
  const levelXpEl = root.querySelector<HTMLElement>('[data-level-xp]');
  const battleEl = root.querySelector<HTMLElement>('[data-battle]');
  const loopEl = root.querySelector<HTMLElement>('[data-loop]');
  const hpBoxEl = root.querySelector<HTMLElement>('.stat-box-hp');
  const hpEl = root.querySelector<HTMLElement>('[data-hp]');
  const shieldEl = root.querySelector<HTMLElement>('[data-shield]');
  const timerEl = root.querySelector<HTMLElement>('[data-timer]');
  const timerBoxEl = root.querySelector<HTMLElement>('[data-timer-box]');
  const timerBonusEl = root.querySelector<HTMLElement>('[data-timer-bonus]');
  const playfieldFrameEl = root.querySelector<HTMLElement>('[data-playfield-frame]');
  const commandGridEl = root.querySelector<HTMLDivElement>('[data-command-grid]');
  const enemySummaryEl = root.querySelector<HTMLDivElement>('[data-enemy-summary]');
  const soundToggleButton = root.querySelector<HTMLButtonElement>('[data-toggle-sound]');
  const musicToggleButton = root.querySelector<HTMLButtonElement>('[data-toggle-music]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const skipBattleButton = root.querySelector<HTMLButtonElement>('[data-skip-battle]');
  const retireButton = root.querySelector<HTMLButtonElement>('[data-retire]');
  const leaderboardButton = root.querySelector<HTMLButtonElement>('[data-open-leaderboard]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-open-submit]');
  const overlayEl = root.querySelector<HTMLDivElement>('[data-overlay]');
  const overlayTitleEl = root.querySelector<HTMLElement>('[data-overlay-title]');
  const overlayBodyEl = root.querySelector<HTMLDivElement>('[data-overlay-body]');
  const overlayCloseButton = root.querySelector<HTMLButtonElement>('[data-close-overlay]');

  if (
    !canvasHost ||
    !scoreEl ||
    !highScoreEl ||
    !levelEl ||
    !levelXpEl ||
    !battleEl ||
    !loopEl ||
    !hpBoxEl ||
    !hpEl ||
    !shieldEl ||
    !timerEl ||
    !timerBoxEl ||
    !timerBonusEl ||
    !playfieldFrameEl ||
    !commandGridEl ||
    !enemySummaryEl ||
    !soundToggleButton ||
    !musicToggleButton ||
    !restartButton ||
    !retireButton ||
    !leaderboardButton ||
    !submitButton ||
    !overlayEl ||
    !overlayTitleEl ||
    !overlayBodyEl ||
    !overlayCloseButton
  ) {
    throw new Error('MatchCrow HUD failed to initialize.');
  }

  const ensuredOverlayEl = overlayEl;
  const ensuredOverlayTitleEl = overlayTitleEl;
  const ensuredOverlayBodyEl = overlayBodyEl;
  const ensuredOverlayCloseButton = overlayCloseButton;

  const restartHandlers = new Set<() => void>();
  const skipBattleHandlers = new Set<() => void>();
  const retireHandlers = new Set<() => void>();
  const toggleSoundHandlers = new Set<() => void>();
  const toggleMusicHandlers = new Set<() => void>();
  const selectActionHandlers = new Set<(action: PlayerActionId) => void>();
  const chooseUpgradeHandlers = new Set<(upgradeId: PermanentUpgradeId) => void>();
  const openLeaderboardHandlers = new Set<() => void>();
  const retryLeaderboardHandlers = new Set<() => void>();
  const openSubmitHandlers = new Set<() => void>();
  const submitHandlers = new Set<(initials: string) => void>();

  let currentState = initialState;
  let overlayMode: OverlayMode = null;
  let soundEnabled = options.soundEnabled;
  let musicEnabled = options.musicEnabled;
  let playerDamagePulseTimeout: number | undefined;
  let timerPulseTimeout: number | undefined;
  let lastPointerSelectedAction: PlayerActionId | null = null;
  let leaderboardState: LeaderboardOverlayState = {
    status: 'idle',
    entries: [],
    highlightedPlayerId: '',
    message: '',
  };
  let submitState: SubmitOverlayState = {
    status: 'idle',
    initials: initialState.leaderboard.lastSubmittedInitials,
    message: '',
  };

  restartButton.addEventListener('click', () => {
    restartHandlers.forEach((handler) => handler());
  });

  skipBattleButton?.addEventListener('click', () => {
    skipBattleHandlers.forEach((handler) => handler());
  });

  retireButton.addEventListener('click', () => {
    retireHandlers.forEach((handler) => handler());
  });

  soundToggleButton.addEventListener('click', () => {
    toggleSoundHandlers.forEach((handler) => handler());
  });

  musicToggleButton.addEventListener('click', () => {
    toggleMusicHandlers.forEach((handler) => handler());
  });

  leaderboardButton.addEventListener('click', () => {
    openLeaderboardHandlers.forEach((handler) => handler());
  });

  submitButton.addEventListener('click', () => {
    if (submitButton.hidden) {
      return;
    }

    openSubmitHandlers.forEach((handler) => handler());
  });

  const handleCommandSelection = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>('[data-action-id]')?.dataset.actionId as PlayerActionId | undefined;

    if (!action) {
      return;
    }

    if (event.type === 'click' && lastPointerSelectedAction === action) {
      lastPointerSelectedAction = null;
      return;
    }

    if (event.type === 'pointerdown') {
      lastPointerSelectedAction = action;
    } else {
      lastPointerSelectedAction = null;
    }

    event.preventDefault();
    selectActionHandlers.forEach((handler) => handler(action));
  };

  commandGridEl.addEventListener('pointerdown', handleCommandSelection);
  commandGridEl.addEventListener('click', handleCommandSelection);

  overlayEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;

    if (!target) {
      return;
    }

    if (target.closest('[data-close-overlay]')) {
      closeOverlay();
      return;
    }

    if (target.closest('[data-retry-leaderboard]')) {
      retryLeaderboardHandlers.forEach((handler) => handler());
      return;
    }

    const upgradeId = target.closest<HTMLElement>('[data-upgrade-id]')?.dataset.upgradeId as
      | PermanentUpgradeId
      | undefined;

    if (upgradeId) {
      chooseUpgradeHandlers.forEach((handler) => handler(upgradeId));
    }
  });

  overlayEl.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;

    if (!target || target.dataset.initialsInput !== 'true') {
      return;
    }

    const sanitized = target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    target.value = sanitized;
    submitState = {
      ...submitState,
      initials: sanitized,
    };
  });

  overlayEl.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement | null;

    if (!form || form.dataset.submitForm !== 'true') {
      return;
    }

    event.preventDefault();

    const initialsInput = form.querySelector<HTMLInputElement>('[data-initials-input]');

    if (!initialsInput) {
      return;
    }

    submitHandlers.forEach((handler) => handler(initialsInput.value));
  });

  const setStatus = (_text: string): void => {};

  const pulsePlayerDamage = (): void => {
    if (playerDamagePulseTimeout) {
      window.clearTimeout(playerDamagePulseTimeout);
    }

    hpBoxEl.classList.remove('hp-damage-pulse');
    hpEl.classList.remove('hp-damage-value');
    shieldEl.classList.remove('hp-damage-detail');

    void hpBoxEl.offsetWidth;

    hpBoxEl.classList.add('hp-damage-pulse');
    hpEl.classList.add('hp-damage-value');
    shieldEl.classList.add('hp-damage-detail');

    playerDamagePulseTimeout = window.setTimeout(() => {
      hpBoxEl.classList.remove('hp-damage-pulse');
      hpEl.classList.remove('hp-damage-value');
      shieldEl.classList.remove('hp-damage-detail');
      playerDamagePulseTimeout = undefined;
    }, 620);
  };

  const pulseTimer = (bonusTimeMs: number): void => {
    if (bonusTimeMs <= 0) {
      return;
    }

    if (timerPulseTimeout) {
      window.clearTimeout(timerPulseTimeout);
    }

    timerBonusEl.hidden = false;
    timerBonusEl.textContent = `+${formatBonusSeconds(bonusTimeMs)}s`;
    timerBoxEl.classList.remove('timer-pulse');
    timerBonusEl.classList.remove('timer-bonus-active');

    void timerBoxEl.offsetWidth;

    timerBoxEl.classList.add('timer-pulse');
    timerBonusEl.classList.add('timer-bonus-active');
    timerPulseTimeout = window.setTimeout(() => {
      timerBoxEl.classList.remove('timer-pulse');
      timerBonusEl.classList.remove('timer-bonus-active');
      timerBonusEl.hidden = true;
      timerPulseTimeout = undefined;
    }, 860);
  };

  const render = (state: MatchCrowViewState): void => {
    currentState = state;
    scoreEl.textContent = state.score.toString().padStart(6, '0');
    highScoreEl.textContent = state.highScore.toString().padStart(6, '0');
    levelEl.textContent = state.progression.level.toString().padStart(2, '0');
    levelXpEl.textContent = formatLevelXp(state.progression.xpIntoLevel, state.progression.xpForNextLevel);
    battleEl.textContent = state.battleIndex.toString().padStart(2, '0');
    loopEl.textContent = `Loop ${state.loopCount + 1}`;
    hpEl.textContent = formatHp(state.player.currentHp, state.player.maxHp);
    shieldEl.textContent = `Shield ${state.player.shield}`;
    timerEl.textContent = formatRemainingTime(state.battleTimerMs);
    timerBoxEl.dataset.urgent = `${state.phase === 'battle' && state.battleTimerMs <= 8_000}`;
    timerBoxEl.dataset.complete = `${state.phase === 'ended'}`;
    playfieldFrameEl.dataset.locked = `${state.phase === 'ended'}`;
    restartButton.disabled = state.phase === 'battle';
    if (skipBattleButton) {
      skipBattleButton.disabled = state.phase !== 'battle';
    }
    retireButton.disabled = state.phase !== 'battle';
    submitButton.hidden = !options.leaderboardSubmitEnabled || !state.leaderboard.canSubmit;
    submitButton.disabled = !state.leaderboard.canSubmit;
    submitButton.title = state.leaderboard.submitReason ?? '';
    leaderboardButton.dataset.enabled = `${options.leaderboardReadEnabled}`;
    soundToggleButton.dataset.enabled = `${soundEnabled}`;
    musicToggleButton.dataset.enabled = `${musicEnabled}`;

    commandGridEl.innerHTML = renderCommandGrid(state);
    enemySummaryEl.innerHTML = renderEnemySummary(state);
    enemySummaryEl.hidden = state.enemies.every((enemy) => enemy.currentHp <= 0);
    renderOverlay();
  };

  const setSoundEnabled = (enabled: boolean): void => {
    soundEnabled = enabled;
    soundToggleButton.dataset.enabled = `${soundEnabled}`;
  };

  const setMusicEnabled = (enabled: boolean): void => {
    musicEnabled = enabled;
    musicToggleButton.dataset.enabled = `${musicEnabled}`;
  };

  const showLeaderboardLoading = (): void => {
    overlayMode = 'leaderboard';
    leaderboardState = {
      ...leaderboardState,
      status: 'loading',
      message: '',
      entries: [],
      highlightedPlayerId: currentState.leaderboard.playerId,
    };
    renderOverlay();
  };

  const showLeaderboardEntries = (
    entries: LeaderboardEntry[],
    highlightedPlayerId: string,
  ): void => {
    overlayMode = 'leaderboard';
    leaderboardState = {
      status: 'ready',
      entries,
      highlightedPlayerId,
      message: entries.length === 0 ? 'No scores posted yet.' : '',
    };
    renderOverlay();
  };

  const showLeaderboardError = (message: string): void => {
    overlayMode = 'leaderboard';
    leaderboardState = {
      ...leaderboardState,
      status: 'error',
      message,
      entries: [],
    };
    renderOverlay();
  };

  const showLeaderboardUnavailable = (message: string): void => {
    overlayMode = 'leaderboard';
    leaderboardState = {
      ...leaderboardState,
      status: 'unavailable',
      message,
      entries: [],
    };
    renderOverlay();
  };

  const openSubmitDialog = (initials: string): void => {
    overlayMode = 'submit';
    submitState = {
      status: 'idle',
      initials: initials || currentState.leaderboard.lastSubmittedInitials,
      message: '',
    };
    renderOverlay();
  };

  const setSubmitBusy = (): void => {
    submitState = {
      ...submitState,
      status: 'submitting',
      message: 'Submitting...',
    };
    renderOverlay();
  };

  const setSubmitError = (message: string): void => {
    submitState = {
      ...submitState,
      status: 'error',
      message,
    };
    renderOverlay();
  };

  const setSubmitSuccess = (message: string): void => {
    submitState = {
      ...submitState,
      status: 'success',
      message,
    };
    renderOverlay();
  };

  const closeOverlay = (): void => {
    if (currentState.pendingUpgrades) {
      return;
    }

    overlayMode = null;
    ensuredOverlayEl.dataset.mode = '';
    ensuredOverlayEl.hidden = true;
  };

  function renderOverlay(): void {
    if (overlayMode === 'leaderboard') {
      ensuredOverlayEl.hidden = false;
      ensuredOverlayEl.dataset.mode = 'leaderboard';
      ensuredOverlayCloseButton.hidden = false;
      ensuredOverlayTitleEl.textContent = 'Top 100';
      ensuredOverlayBodyEl.innerHTML = renderLeaderboardOverlay(leaderboardState);
      return;
    }

    if (overlayMode === 'submit') {
      ensuredOverlayEl.hidden = false;
      ensuredOverlayEl.dataset.mode = 'submit';
      ensuredOverlayCloseButton.hidden = false;
      ensuredOverlayTitleEl.textContent = 'Submit Score';
      ensuredOverlayBodyEl.innerHTML = renderSubmitOverlay(submitState, currentState.leaderboard.submitScore);
      const initialsInput = ensuredOverlayBodyEl.querySelector<HTMLInputElement>('[data-initials-input]');
      initialsInput?.focus();
      initialsInput?.setSelectionRange(initialsInput.value.length, initialsInput.value.length);
      return;
    }

    if (currentState.pendingUpgrades) {
      ensuredOverlayEl.hidden = false;
      ensuredOverlayEl.dataset.mode = 'upgrade';
      ensuredOverlayCloseButton.hidden = true;
      ensuredOverlayTitleEl.textContent = 'Permanent Upgrade';
      ensuredOverlayBodyEl.innerHTML = renderUpgradeOverlay(currentState);
      return;
    }

    ensuredOverlayEl.hidden = true;
    ensuredOverlayEl.dataset.mode = '';
    ensuredOverlayBodyEl.innerHTML = '';
    ensuredOverlayCloseButton.hidden = false;
  }

  render(initialState);

  return {
    canvasHost,
    render,
    setSoundEnabled,
    setMusicEnabled,
    setStatus,
    pulsePlayerDamage,
    pulseTimer,
    onRestart(handler: () => void) {
      restartHandlers.add(handler);
    },
    onSkipBattle(handler: () => void) {
      skipBattleHandlers.add(handler);
    },
    onRetire(handler: () => void) {
      retireHandlers.add(handler);
    },
    onToggleSound(handler: () => void) {
      toggleSoundHandlers.add(handler);
    },
    onToggleMusic(handler: () => void) {
      toggleMusicHandlers.add(handler);
    },
    onSelectAction(handler: (action: PlayerActionId) => void) {
      selectActionHandlers.add(handler);
    },
    onChooseUpgrade(handler: (upgradeId: PermanentUpgradeId) => void) {
      chooseUpgradeHandlers.add(handler);
    },
    onOpenLeaderboard(handler: () => void) {
      openLeaderboardHandlers.add(handler);
    },
    onRetryLeaderboard(handler: () => void) {
      retryLeaderboardHandlers.add(handler);
    },
    onOpenSubmit(handler: () => void) {
      openSubmitHandlers.add(handler);
    },
    onSubmitScore(handler: (initials: string) => void) {
      submitHandlers.add(handler);
    },
    showLeaderboardLoading,
    showLeaderboardEntries,
    showLeaderboardError,
    showLeaderboardUnavailable,
    openSubmitDialog,
    setSubmitBusy,
    setSubmitError,
    setSubmitSuccess,
    closeOverlay,
  };
}

function renderCommandGrid(state: MatchCrowViewState): string {
  return (['attack', 'defend', 'heal'] as const)
    .map((action) => {
      const selected = state.selectedAction === action;
      const disabled = state.phase !== 'battle';

      return `
        <button
          type="button"
          class="command-button${selected ? ' command-button-selected' : ''}"
          data-action-id="${action}"
          ${disabled ? 'disabled' : ''}
        >
          <strong>${escapeHtml(capitalize(action))}</strong>
        </button>
      `;
    })
    .join('');
}

function renderEnemySummary(state: MatchCrowViewState): string {
  const livingEnemies = state.enemies.filter((enemy) => enemy.currentHp > 0);

  if (livingEnemies.length === 0) {
    return '';
  }

  return livingEnemies
    .map(
      (enemy) => `
        <div class="enemy-summary-row">
          <span class="enemy-summary-name">${escapeHtml(enemy.name)}</span>
          <strong class="enemy-summary-hp">${enemy.currentHp}/${enemy.maxHp}</strong>
        </div>
      `,
    )
    .join('');
}

function renderUpgradeOverlay(state: MatchCrowViewState): string {
  return `
    <section class="upgrade-screen">
      <p class="overlay-copy">Choose ${state.pendingUpgrades?.remainingChoices ?? 0} permanent upgrade${
        (state.pendingUpgrades?.remainingChoices ?? 0) === 1 ? '' : 's'
      }. They apply on your next run.</p>
      <p class="overlay-message overlay-message-success">
        Run score ${state.score.toString().padStart(6, '0')} earned +${state.postRun.awardedXp} XP.
      </p>
      <div class="upgrade-grid">
        ${PERMANENT_UPGRADE_OPTIONS.map(
          (option) => `
            <button type="button" class="upgrade-card" data-upgrade-id="${option.id}">
              <strong>${escapeHtml(option.label)}</strong>
              <span>${escapeHtml(option.description)}</span>
            </button>
          `,
        ).join('')}
      </div>
    </section>
  `;
}

function renderLeaderboardOverlay(state: LeaderboardOverlayState): string {
  if (state.status === 'loading') {
    return `<p class="overlay-copy">Loading the top scores...</p>`;
  }

  if (state.status === 'unavailable') {
    return `<p class="overlay-copy">${escapeHtml(state.message || 'Leaderboard is not configured.')}</p>`;
  }

  if (state.status === 'error') {
    return `
      <p class="overlay-copy">${escapeHtml(state.message || 'Could not load scores.')}</p>
      <button type="button" class="overlay-action" data-retry-leaderboard>Retry</button>
    `;
  }

  if (state.entries.length === 0) {
    return `<p class="overlay-copy">${escapeHtml(state.message || 'No scores posted yet.')}</p>`;
  }

  return `
    <div class="leaderboard-list">
      ${state.entries
        .map((entry, index) => {
          const classes =
            entry.playerId === state.highlightedPlayerId
              ? 'leaderboard-row leaderboard-row-local'
              : 'leaderboard-row';

          return `
            <div class="${classes}">
              <span class="leaderboard-rank">${index + 1}</span>
              <div class="leaderboard-copy">
                <span class="leaderboard-initials">${escapeHtml(entry.initials)}</span>
                <span class="leaderboard-level">Lv ${entry.level}</span>
              </div>
              <span class="leaderboard-score">${entry.score.toString().padStart(6, '0')}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderSubmitOverlay(state: SubmitOverlayState, score: number): string {
  const statusClass =
    state.status === 'error'
      ? 'overlay-message overlay-message-error'
      : state.status === 'success'
        ? 'overlay-message overlay-message-success'
        : 'overlay-message';

  return `
    <form class="submit-form" data-submit-form="true">
      <p class="overlay-copy">Post this run score of ${score.toString().padStart(6, '0')}.</p>
      <label class="submit-label" for="submit-initials">Initials</label>
      <input
        id="submit-initials"
        class="submit-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="3"
        value="${escapeAttribute(state.initials)}"
        data-initials-input="true"
      />
      <p class="${statusClass}">${escapeHtml(state.message || 'Use exactly 3 letters.')}</p>
      <div class="overlay-actions">
        <button type="button" class="overlay-action overlay-action-secondary" data-close-overlay>Cancel</button>
        <button type="submit" class="overlay-action" ${state.status === 'submitting' ? 'disabled' : ''}>
          ${state.status === 'submitting' ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function formatRemainingTime(timeRemainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, timeRemainingMs) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatBonusSeconds(bonusTimeMs: number): string {
  const seconds = bonusTimeMs / 1_000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1).replace(/\.0$/, '');
}

function formatLevelXp(xpIntoLevel: number, xpForNextLevel: number): string {
  return `${Math.max(0, Math.floor(xpIntoLevel))} / ${Math.max(1, Math.floor(xpForNextLevel))} XP`;
}

function formatHp(currentHp: number, maxHp: number): string {
  return `${currentHp}/${maxHp}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
