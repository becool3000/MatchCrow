import { DEFAULT_STATUS } from '../game/assets/manifest.ts';
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
  setStatus: (text: string) => void;
  pulseTimer: (bonusTimeMs: number) => void;
  onRestart: (handler: () => void) => void;
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
  options: { leaderboardReadEnabled: boolean; leaderboardSubmitEnabled: boolean },
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
          <div class="stat-box stat-box-timer" data-timer-box>
            <span>Time</span>
            <strong data-timer>${formatRemainingTime(initialState.timeRemainingMs)}</strong>
            <em class="timer-bonus" data-timer-bonus hidden>+0s</em>
          </div>
          <div class="hud-actions">
            <button type="button" class="hud-button" data-open-leaderboard>Top 100</button>
            <button type="button" class="hud-button" data-open-submit hidden>Submit Score</button>
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
  const timerEl = root.querySelector<HTMLElement>('[data-timer]');
  const timerBoxEl = root.querySelector<HTMLElement>('[data-timer-box]');
  const timerBonusEl = root.querySelector<HTMLElement>('[data-timer-bonus]');
  const statusEl = root.querySelector<HTMLElement>('[data-status]');
  const playfieldFrameEl = root.querySelector<HTMLElement>('[data-playfield-frame]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const leaderboardButton = root.querySelector<HTMLButtonElement>('[data-open-leaderboard]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-open-submit]');
  const overlayEl = root.querySelector<HTMLDivElement>('[data-overlay]');
  const overlayTitleEl = root.querySelector<HTMLElement>('[data-overlay-title]');
  const overlayBodyEl = root.querySelector<HTMLDivElement>('[data-overlay-body]');

  if (
    !canvasHost ||
    !scoreEl ||
    !highScoreEl ||
    !timerEl ||
    !timerBoxEl ||
    !timerBonusEl ||
    !statusEl ||
    !playfieldFrameEl ||
    !restartButton ||
    !leaderboardButton ||
    !submitButton ||
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
    }
  });

  ensuredOverlayEl.addEventListener('input', (event) => {
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
    overlayEl.hidden = true;
  };

  function renderOverlay(): void {
    if (!overlayMode) {
      ensuredOverlayEl.hidden = true;
      ensuredOverlayBodyEl.innerHTML = '';
      return;
    }

    ensuredOverlayEl.hidden = false;

    if (overlayMode === 'leaderboard') {
      ensuredOverlayTitleEl.textContent = 'Top 100';
      ensuredOverlayBodyEl.innerHTML = renderLeaderboardOverlay(leaderboardState);
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
