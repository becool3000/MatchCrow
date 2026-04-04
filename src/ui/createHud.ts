import { DEFAULT_STATUS, TEXTURE_FILE_PATHS } from '../game/assets/manifest.ts';
import type { MatchCrowViewState } from '../game/CrowsCacheGame.ts';
import {
  getRoadmapUnlocks,
  getRunPoolDefinitions,
  getTileDefinitions,
  isBaseTileKind,
  TILE_ROLE_LABELS,
  type TileDefinition,
} from '../game/tileCatalog.ts';
import {
  CROW_CAW_WAVEFORMS,
  type CrowCawTuning,
  type CrowCawWaveform,
} from '../phaser/view/MatchCrowSfx.ts';
import type { LeaderboardEntry } from '../services/leaderboard.ts';

type OverlayMode = 'leaderboard' | 'submit' | 'cawDebug' | 'collection' | null;

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

interface CawLabOverlayState {
  tuning: CrowCawTuning;
  message: string;
  status: 'idle' | 'success' | 'error';
}

export interface GameHud {
  canvasHost: HTMLDivElement;
  render: (state: MatchCrowViewState) => void;
  setStatus: (text: string) => void;
  pulseTimer: (bonusTimeMs: number) => void;
  onRestart: (handler: () => void) => void;
  onOpenLeaderboard: (handler: () => void) => void;
  onRetryLeaderboard: (handler: () => void) => void;
  onOpenSubmit: (handler: () => void) => void;
  onSubmitScore: (handler: (initials: string) => void) => void;
  onOpenCawLab: (handler: () => void) => void;
  onPreviewCaw: (handler: () => void) => void;
  onUpdateCawTuning: (handler: (patch: Partial<CrowCawTuning>) => void) => void;
  onResetCawTuning: (handler: () => void) => void;
  onExportCawPreset: (handler: (tuning: CrowCawTuning) => void) => void;
  showLeaderboardLoading: () => void;
  showLeaderboardEntries: (entries: LeaderboardEntry[], highlightedPlayerId: string) => void;
  showLeaderboardError: (message: string) => void;
  showLeaderboardUnavailable: (message: string) => void;
  openSubmitDialog: (initials: string) => void;
  openCawLab: (tuning: CrowCawTuning) => void;
  syncCawLab: (tuning: CrowCawTuning) => void;
  setCawLabMessage: (message: string, status: 'idle' | 'success' | 'error') => void;
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
    initialCrowCawTuning: CrowCawTuning;
  },
): GameHud {
  root.innerHTML = `
    <div class="page-shell">
      <main class="game-shell">
        <header class="hud-strip">
          <span class="brand-chip">MatchCrow</span>
          <div class="stat-box">
            <span>Score</span>
            <strong data-score>000000</strong>
          </div>
          <div class="stat-box">
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
          <div class="stat-box stat-box-timer" data-timer-box>
            <span>Time</span>
            <strong data-timer>${formatRemainingTime(initialState.timeRemainingMs)}</strong>
            <em class="timer-bonus" data-timer-bonus hidden>+0s</em>
          </div>
          <div class="hud-actions">
            <button type="button" class="hud-button" data-open-leaderboard>Top 100</button>
            <button type="button" class="hud-button" data-open-submit hidden>Submit Score</button>
            <button type="button" class="hud-button hud-button-secondary" data-open-collection>Collection</button>
            <button type="button" class="hud-button hud-button-secondary" data-open-caw-lab>Caw Lab</button>
            <button type="button" class="restart-button" data-restart>Reset</button>
          </div>
        </header>

        <p class="status-strip" data-status>${DEFAULT_STATUS}</p>

        <section class="playfield-frame" data-playfield-frame>
          <div class="playfield-canvas" data-canvas></div>
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
  const timerEl = root.querySelector<HTMLElement>('[data-timer]');
  const timerBoxEl = root.querySelector<HTMLElement>('[data-timer-box]');
  const timerBonusEl = root.querySelector<HTMLElement>('[data-timer-bonus]');
  const statusEl = root.querySelector<HTMLElement>('[data-status]');
  const playfieldFrameEl = root.querySelector<HTMLElement>('[data-playfield-frame]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const leaderboardButton = root.querySelector<HTMLButtonElement>('[data-open-leaderboard]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-open-submit]');
  const collectionButton = root.querySelector<HTMLButtonElement>('[data-open-collection]');
  const cawLabButton = root.querySelector<HTMLButtonElement>('[data-open-caw-lab]');
  const overlayEl = root.querySelector<HTMLDivElement>('[data-overlay]');
  const overlayTitleEl = root.querySelector<HTMLElement>('[data-overlay-title]');
  const overlayBodyEl = root.querySelector<HTMLDivElement>('[data-overlay-body]');

  if (
    !canvasHost ||
    !scoreEl ||
    !highScoreEl ||
    !levelEl ||
    !levelXpEl ||
    !timerEl ||
    !timerBoxEl ||
    !timerBonusEl ||
    !statusEl ||
    !playfieldFrameEl ||
    !restartButton ||
    !leaderboardButton ||
    !submitButton ||
    !collectionButton ||
    !cawLabButton ||
    !overlayEl ||
    !overlayTitleEl ||
    !overlayBodyEl
  ) {
    throw new Error('MatchCrow HUD failed to initialize.');
  }

  const ensuredOverlayEl = overlayEl;
  const ensuredOverlayTitleEl = overlayTitleEl;
  const ensuredOverlayBodyEl = overlayBodyEl;

  const restartHandlers = new Set<() => void>();
  const openLeaderboardHandlers = new Set<() => void>();
  const retryLeaderboardHandlers = new Set<() => void>();
  const openSubmitHandlers = new Set<() => void>();
  const submitHandlers = new Set<(initials: string) => void>();
  const openCawLabHandlers = new Set<() => void>();
  const previewCawHandlers = new Set<() => void>();
  const updateCawTuningHandlers = new Set<(patch: Partial<CrowCawTuning>) => void>();
  const resetCawTuningHandlers = new Set<() => void>();
  const exportCawPresetHandlers = new Set<(tuning: CrowCawTuning) => void>();

  let currentState = initialState;
  let overlayMode: OverlayMode = null;
  let timerPulseTimeout: number | undefined;
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
  let cawLabState: CawLabOverlayState = {
    tuning: { ...options.initialCrowCawTuning },
    message: '',
    status: 'idle',
  };

  restartButton.addEventListener('click', () => {
    restartHandlers.forEach((handler) => handler());
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

  collectionButton.addEventListener('click', () => {
    overlayMode = 'collection';
    renderOverlay();
  });

  cawLabButton.addEventListener('click', () => {
    openCawLabHandlers.forEach((handler) => handler());
  });

  ensuredOverlayEl.addEventListener('click', (event) => {
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

    if (target.closest('[data-preview-caw]')) {
      previewCawHandlers.forEach((handler) => handler());
      return;
    }

    if (target.closest('[data-reset-caw]')) {
      resetCawTuningHandlers.forEach((handler) => handler());
      return;
    }

    if (target.closest('[data-export-caw]')) {
      exportCawPresetHandlers.forEach((handler) => handler({ ...cawLabState.tuning }));
    }
  });

  ensuredOverlayEl.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;

    if (!target) {
      return;
    }

    if (target.dataset.initialsInput === 'true') {
      const sanitized = target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      target.value = sanitized;
      submitState = {
        ...submitState,
        initials: sanitized,
      };
      return;
    }

    if (target.dataset.cawField) {
      handleCawTuningInput(target);
    }
  });

  ensuredOverlayEl.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;

    if (!target || !target.dataset.cawField) {
      return;
    }

    handleCawTuningInput(target);
  });

  ensuredOverlayEl.addEventListener('submit', (event) => {
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

  const setStatus = (text: string): void => {
    statusEl.textContent = text;
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
    timerEl.textContent = formatRemainingTime(state.timeRemainingMs);
    timerBoxEl.dataset.urgent = `${!state.runComplete && state.timeRemainingMs <= 15_000}`;
    timerBoxEl.dataset.complete = `${state.runComplete}`;
    statusEl.dataset.complete = `${state.runComplete}`;
    playfieldFrameEl.dataset.locked = `${state.runComplete}`;
    setStatus(state.lastMessage || DEFAULT_STATUS);

    submitButton.hidden = !options.leaderboardSubmitEnabled || !state.leaderboard.canSubmit;
    submitButton.disabled = !state.leaderboard.canSubmit;
    submitButton.title = state.leaderboard.submitReason ?? '';
    leaderboardButton.dataset.enabled = `${options.leaderboardReadEnabled}`;

    renderOverlay();
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

  const openCawLab = (tuning: CrowCawTuning): void => {
    overlayMode = 'cawDebug';
    cawLabState = {
      tuning: { ...tuning },
      message: '',
      status: 'idle',
    };
    renderOverlay();
  };

  const syncCawLab = (tuning: CrowCawTuning): void => {
    cawLabState = {
      ...cawLabState,
      tuning: { ...tuning },
    };

    if (overlayMode === 'cawDebug') {
      renderOverlay();
    }
  };

  const setCawLabMessage = (message: string, status: 'idle' | 'success' | 'error'): void => {
    cawLabState = {
      ...cawLabState,
      message,
      status,
    };

    if (overlayMode === 'cawDebug') {
      renderOverlay();
    }
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
    overlayMode = null;
    ensuredOverlayEl.dataset.mode = '';
    overlayEl.hidden = true;
  };

  function handleCawTuningInput(target: HTMLInputElement | HTMLSelectElement): void {
    const field = target.dataset.cawField as keyof CrowCawTuning | undefined;

    if (!field) {
      return;
    }

    const nextValue = parseCawFieldValue(field, target.value);

    cawLabState = {
      ...cawLabState,
      tuning: {
        ...cawLabState.tuning,
        [field]: nextValue,
      },
      message: '',
      status: 'idle',
    };

    updateCawTuningHandlers.forEach((handler) => handler({ [field]: nextValue }));
    syncCawRowValue(target, nextValue);
  }

  function renderOverlay(): void {
    if (!overlayMode) {
      ensuredOverlayEl.hidden = true;
      ensuredOverlayEl.dataset.mode = '';
      ensuredOverlayBodyEl.innerHTML = '';
      return;
    }

    ensuredOverlayEl.hidden = false;
    ensuredOverlayEl.dataset.mode = overlayMode;

    if (overlayMode === 'leaderboard') {
      ensuredOverlayTitleEl.textContent = 'Top 100';
      ensuredOverlayBodyEl.innerHTML = renderLeaderboardOverlay(leaderboardState);
      return;
    }

    if (overlayMode === 'collection') {
      ensuredOverlayTitleEl.textContent = 'Collection';
      ensuredOverlayBodyEl.innerHTML = renderCollectionOverlay(currentState);
      return;
    }

    if (overlayMode === 'cawDebug') {
      ensuredOverlayTitleEl.textContent = 'Caw Lab';
      ensuredOverlayBodyEl.innerHTML = renderCawDebugOverlay(cawLabState);
      return;
    }

    ensuredOverlayTitleEl.textContent = 'Submit Score';
    ensuredOverlayBodyEl.innerHTML = renderSubmitOverlay(submitState, currentState.highScore);
    const initialsInput = ensuredOverlayBodyEl.querySelector<HTMLInputElement>('[data-initials-input]');
    initialsInput?.focus();
    initialsInput?.setSelectionRange(initialsInput.value.length, initialsInput.value.length);
  }

  render(initialState);

  return {
    canvasHost,
    render,
    setStatus,
    pulseTimer,
    onRestart(handler: () => void) {
      restartHandlers.add(handler);
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
    onOpenCawLab(handler: () => void) {
      openCawLabHandlers.add(handler);
    },
    onPreviewCaw(handler: () => void) {
      previewCawHandlers.add(handler);
    },
    onUpdateCawTuning(handler: (patch: Partial<CrowCawTuning>) => void) {
      updateCawTuningHandlers.add(handler);
    },
    onResetCawTuning(handler: () => void) {
      resetCawTuningHandlers.add(handler);
    },
    onExportCawPreset(handler: (tuning: CrowCawTuning) => void) {
      exportCawPresetHandlers.add(handler);
    },
    showLeaderboardLoading,
    showLeaderboardEntries,
    showLeaderboardError,
    showLeaderboardUnavailable,
    openSubmitDialog,
    openCawLab,
    syncCawLab,
    setCawLabMessage,
    setSubmitBusy,
    setSubmitError,
    setSubmitSuccess,
    closeOverlay,
  };
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
              <span class="leaderboard-initials">${escapeHtml(entry.initials)}</span>
              <span class="leaderboard-score">${entry.score.toString().padStart(6, '0')}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderSubmitOverlay(state: SubmitOverlayState, highScore: number): string {
  const statusClass =
    state.status === 'error'
      ? 'overlay-message overlay-message-error'
      : state.status === 'success'
        ? 'overlay-message overlay-message-success'
        : 'overlay-message';

  return `
    <form class="submit-form" data-submit-form="true">
      <p class="overlay-copy">Post your local best of ${highScore.toString().padStart(6, '0')}.</p>
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

function renderCollectionOverlay(state: MatchCrowViewState): string {
  const roleOrder = ['damage', 'guard', 'grit', 'heal', 'weak'] as const;
  const unlockedKinds = new Set(state.unlocks.unlockedTileKinds);
  const activeKinds = new Set(Object.values(state.unlocks.runTilePool));
  const activeTiles = getRunPoolDefinitions(state.unlocks.runTilePool);
  const roadmap = getRoadmapUnlocks();
  const allTiles = getTileDefinitions();
  const newUnlockLabels = state.unlocks.newlyUnlockedTileKinds
    .map((kind) => allTiles.find((definition) => definition.kind === kind)?.label ?? kind)
    .join(', ');
  const progressPercent = Math.max(0, Math.min(100, Math.round(state.progression.progressRatio * 100)));

  return `
    <section class="collection-screen">
      ${
        newUnlockLabels
          ? `<p class="overlay-message overlay-message-success">New for next run: ${escapeHtml(newUnlockLabels)}.</p>`
          : ''
      }
      <div class="collection-summary">
        <section class="collection-panel">
          <p class="collection-kicker">Progression</p>
          <div class="collection-level-row">
            <strong class="collection-level-value">Level ${state.progression.level}</strong>
            <span class="collection-level-detail">${formatLevelXp(
              state.progression.xpIntoLevel,
              state.progression.xpForNextLevel,
            )}</span>
          </div>
          <div class="collection-progress">
            <span class="collection-progress-fill" style="width: ${progressPercent}%"></span>
          </div>
        </section>
        <section class="collection-panel">
          <p class="collection-kicker">Active This Run</p>
          <div class="collection-active-grid">
            ${activeTiles
              .map((definition) =>
                renderCollectionTileCard(definition, ['Active This Run', TILE_ROLE_LABELS[definition.role]]),
              )
              .join('')}
          </div>
        </section>
      </div>

      <section class="collection-panel">
        <p class="collection-kicker">Roadmap</p>
        <div class="collection-roadmap">
          ${roadmap
            .map((definition) => {
              const unlocked = state.progression.level >= definition.unlockLevel;
              return `
                <div class="collection-roadmap-row" data-unlocked="${unlocked}">
                  <span class="collection-roadmap-level">LV ${definition.unlockLevel}</span>
                  <span class="collection-roadmap-name">${escapeHtml(definition.label)}</span>
                  <span class="collection-roadmap-role">${escapeHtml(TILE_ROLE_LABELS[definition.role])}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </section>

      <div class="collection-groups">
        ${roleOrder
          .map((role) => {
            const roleTiles = allTiles.filter((definition) => definition.role === role);
            return `
              <section class="collection-panel">
                <div class="collection-group-head">
                  <p class="collection-kicker">${escapeHtml(TILE_ROLE_LABELS[role])}</p>
                  <span class="collection-group-note">1 active per run</span>
                </div>
                <div class="collection-tile-grid">
                  ${roleTiles
                    .map((definition) => {
                      const badges = [
                        isBaseTileKind(definition.kind) ? 'Base' : null,
                        unlockedKinds.has(definition.kind) ? 'Unlocked' : 'Locked',
                        activeKinds.has(definition.kind) ? 'Active This Run' : null,
                      ].filter((badge): badge is string => Boolean(badge));

                      return renderCollectionTileCard(definition, badges);
                    })
                    .join('')}
                </div>
              </section>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderCollectionTileCard(definition: TileDefinition, badges: string[]): string {
  const texturePath = TEXTURE_FILE_PATHS[definition.textureKey] ?? '';

  return `
    <article class="collection-tile-card">
      <div class="collection-tile-head">
        <img
          class="collection-tile-sprite"
          src="${escapeAttribute(texturePath)}"
          alt="${escapeAttribute(definition.label)}"
        />
        <div class="collection-tile-copy">
          <strong>${escapeHtml(definition.label)}</strong>
          <span>Level ${definition.unlockLevel}</span>
        </div>
      </div>
      <div class="collection-badges">
        ${badges
          .map((badge) => `<span class="collection-badge">${escapeHtml(badge)}</span>`)
          .join('')}
      </div>
    </article>
  `;
}

function renderCawDebugOverlay(state: CawLabOverlayState): string {
  const tuning = state.tuning;
  const statusClass =
    state.status === 'error'
      ? 'overlay-message overlay-message-error'
      : state.status === 'success'
        ? 'overlay-message overlay-message-success'
        : 'overlay-message';

  return `
    <section class="caw-lab">
      <p class="overlay-copy">Preview and tune the synthetic crow call live.</p>
      <div class="overlay-actions overlay-actions-spread caw-lab-actions">
        <button type="button" class="overlay-action" data-preview-caw>Preview Caw</button>
        <button type="button" class="overlay-action" data-export-caw>Export Preset</button>
        <button type="button" class="overlay-action overlay-action-secondary" data-reset-caw>
          Reset Defaults
        </button>
      </div>
      <p class="${statusClass}">
        ${escapeHtml(
          state.message || 'Export copies a full DEFAULT_CROW_CAW_TUNING block for MatchCrowSfx.ts.',
        )}
      </p>
      <div class="caw-grid">
        ${renderCawSlider('noiseMs', 'Noise Burst', tuning.noiseMs, 10, 20, 0.5)}
        ${renderCawSlider('noiseGain', 'Noise Gain', tuning.noiseGain, 0.002, 0.05, 0.001)}
        ${renderCawSlider('attackMs', 'Attack', tuning.attackMs, 5, 40, 0.5)}
        ${renderCawSlider('bodyMs', 'Body Length', tuning.bodyMs, 180, 320, 1)}
        ${renderCawSelect('leadWave', 'Lead Wave', tuning.leadWave)}
        ${renderCawSelect('bodyWave', 'Body Wave', tuning.bodyWave)}
        ${renderCawSlider('leadGain', 'Lead Gain', tuning.leadGain, 0.004, 0.05, 0.001)}
        ${renderCawSlider('bodyGain', 'Body Gain', tuning.bodyGain, 0.004, 0.05, 0.001)}
        ${renderCawSlider('leadFreq', 'Lead Pitch', tuning.leadFreq, 300, 650, 1)}
        ${renderCawSlider('bodyFreq', 'Body Pitch', tuning.bodyFreq, 260, 600, 1)}
        ${renderCawSlider('endFreq', 'Tail Pitch', tuning.endFreq, 120, 320, 1)}
        ${renderCawSlider('detuneCents', 'Detune', tuning.detuneCents, 0, 40, 0.5)}
        ${renderCawSlider('bandpassStart', 'Bandpass Start', tuning.bandpassStart, 500, 2200, 5)}
        ${renderCawSlider('bandpassEnd', 'Bandpass End', tuning.bandpassEnd, 220, 900, 5)}
        ${renderCawSlider('lowpassStart', 'Lowpass Start', tuning.lowpassStart, 900, 3200, 10)}
        ${renderCawSlider('lowpassEnd', 'Lowpass End', tuning.lowpassEnd, 260, 1000, 5)}
        ${renderCawSlider('raspAmount', 'Rasp', tuning.raspAmount, 0, 80, 1)}
        ${renderCawSlider('pitchJitterPercent', 'Pitch Jitter', tuning.pitchJitterPercent, 0, 10, 0.1)}
        ${renderCawSlider(
          'durationJitterPercent',
          'Duration Jitter',
          tuning.durationJitterPercent,
          0,
          10,
          0.1,
        )}
      </div>
    </section>
  `;
}

function renderCawSlider(
  field: Exclude<keyof CrowCawTuning, 'leadWave' | 'bodyWave'>,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
): string {
  const id = `caw-${field}`;

  return `
    <label class="caw-control" for="${id}" data-caw-row>
      <span class="caw-control-head">
        <span class="caw-control-label">${label}</span>
        <span class="caw-control-value" data-caw-value>${formatCawFieldValue(field, value)}</span>
      </span>
      <input
        id="${id}"
        class="caw-slider"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
        data-caw-field="${field}"
      />
    </label>
  `;
}

function renderCawSelect(
  field: Extract<keyof CrowCawTuning, 'leadWave' | 'bodyWave'>,
  label: string,
  value: CrowCawWaveform,
): string {
  const id = `caw-${field}`;

  return `
    <label class="caw-control" for="${id}" data-caw-row>
      <span class="caw-control-head">
        <span class="caw-control-label">${label}</span>
        <span class="caw-control-value" data-caw-value>${escapeHtml(value)}</span>
      </span>
      <select id="${id}" class="caw-select" data-caw-field="${field}">
        ${CROW_CAW_WAVEFORMS.map((waveform) => {
          const selected = waveform === value ? 'selected' : '';
          return `<option value="${waveform}" ${selected}>${waveform}</option>`;
        }).join('')}
      </select>
    </label>
  `;
}

function parseCawFieldValue(field: keyof CrowCawTuning, rawValue: string): number | CrowCawWaveform {
  if (field === 'leadWave' || field === 'bodyWave') {
    return CROW_CAW_WAVEFORMS.includes(rawValue as CrowCawWaveform)
      ? (rawValue as CrowCawWaveform)
      : CROW_CAW_WAVEFORMS[0];
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function syncCawRowValue(
  target: HTMLInputElement | HTMLSelectElement,
  value: number | CrowCawWaveform,
): void {
  const field = target.dataset.cawField as keyof CrowCawTuning | undefined;
  const valueEl = target.closest<HTMLElement>('[data-caw-row]')?.querySelector<HTMLElement>('[data-caw-value]');

  if (!field || !valueEl) {
    return;
  }

  valueEl.textContent = formatCawFieldValue(field, value);
}

function formatCawFieldValue(
  field: keyof CrowCawTuning,
  value: number | CrowCawWaveform,
): string {
  if (field === 'leadWave' || field === 'bodyWave') {
    return `${value}`;
  }

  if (field === 'noiseMs' || field === 'attackMs' || field === 'bodyMs') {
    return `${Number(value).toFixed(field === 'bodyMs' ? 0 : 1).replace(/\.0$/, '')} ms`;
  }

  if (field === 'leadFreq' || field === 'bodyFreq' || field === 'endFreq' || field === 'bandpassStart' || field === 'bandpassEnd' || field === 'lowpassStart' || field === 'lowpassEnd') {
    return `${Math.round(Number(value))} Hz`;
  }

  if (field === 'detuneCents') {
    return `${Number(value).toFixed(1).replace(/\.0$/, '')} ct`;
  }

  if (field === 'pitchJitterPercent' || field === 'durationJitterPercent') {
    return `${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
  }

  return Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
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
  const totalSeconds = Math.ceil(Math.max(0, timeRemainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatBonusSeconds(bonusTimeMs: number): string {
  const seconds = bonusTimeMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1).replace(/\.0$/, '');
}

function formatLevelXp(xpIntoLevel: number, xpForNextLevel: number): string {
  return `${Math.max(0, Math.floor(xpIntoLevel))} / ${Math.max(1, Math.floor(xpForNextLevel))} XP`;
}
