import { DEFAULT_STATUS } from '../game/assets/manifest.ts';
import {
  ENEMY_DEFINITIONS,
  RELIC_DEFINITIONS,
  SPECIAL_DEFINITIONS,
  SPECIAL_SLOT_IDS,
  STATUS_LABELS,
  type HybridBattleState,
  type RewardOption,
  type SpecialSlotId,
  type StatusEffect,
} from '../game/simulation/types.ts';

export interface GameHud {
  canvasHost: HTMLDivElement;
  render: (state: HybridBattleState) => void;
  setStatus: (text: string) => void;
  onRestart: (handler: () => void) => void;
  onStart: (handler: () => void) => void;
  onSpecial: (handler: (slotId: SpecialSlotId) => void) => void;
  onSkip: (handler: () => void) => void;
  onReward: (handler: (rewardId: string) => void) => void;
}

export function createHud(root: HTMLDivElement, initialState: HybridBattleState): GameHud {
  const specialButtons = SPECIAL_SLOT_IDS.map((slotId) => {
    const special = SPECIAL_DEFINITIONS[slotId];

    return `
      <button type="button" class="special-button" data-special="${slotId}">
        <span class="special-name">${special.label}</span>
        <span class="special-meta">${special.cost} grit</span>
      </button>
    `;
  }).join('');

  root.innerHTML = `
    <div class="page-shell">
      <section class="start-screen" data-start-screen>
        <div class="start-card">
          <h1>MatchCrow</h1>
          <div class="start-copy">
            <div class="start-tip">
              <span class="tip-label">Swap</span>
              <p>Match shiny tiles to deal damage, gain guard, grit, and healing.</p>
            </div>
            <div class="start-tip">
              <span class="tip-label">Spend</span>
              <p>After each settled swap, use one special or pass before the enemy strikes.</p>
            </div>
          </div>
          <button type="button" class="start-button" data-start>Start Scrap</button>
        </div>
      </section>
      <main class="game-shell">
        <header class="hud-strip">
          <span class="brand-chip">MatchCrow</span>
          <div class="score-box">
            <strong class="score-value" data-score>000000</strong>
          </div>
          <button type="button" class="restart-button" data-restart>Reset</button>
        </header>
        <section class="combat-top">
          <div class="pill-row">
            <span class="encounter-pill" data-encounter>Fight 1 / 4</span>
            <span class="turn-pill" data-turn>Your Turn</span>
          </div>
          <div class="enemy-strip">
            <div class="enemy-head">
              <strong data-enemy-name>Enemy</strong>
              <span data-enemy-hp>0 / 0</span>
              <span data-enemy-guard>Guard 0</span>
            </div>
            <p class="enemy-intent" data-enemy-intent>Read the foe.</p>
            <div class="status-row status-row-enemy" data-enemy-statuses></div>
          </div>
        </section>
        <section class="playfield-frame">
          <p class="screen-reader-status" data-status>${DEFAULT_STATUS}</p>
          <div class="playfield-canvas" data-canvas></div>
          <div class="phase-overlay" data-overlay hidden></div>
        </section>
        <section class="battle-panel">
          <div class="player-strip">
            <div class="player-head">
              <strong>MatchCrow</strong>
              <span>Crow Duelist</span>
            </div>
            <div class="player-stats">
              <span>HP <strong data-player-hp>34 / 34</strong></span>
              <span>Guard <strong data-player-guard>0</strong></span>
              <span>Grit <strong data-player-grit>1 / 5</strong></span>
            </div>
            <div class="status-row" data-player-statuses></div>
          </div>
          <p class="battle-status" data-visible-status>${DEFAULT_STATUS}</p>
          <div class="special-row">
            ${specialButtons}
            <button type="button" class="skip-button" data-skip>Pass</button>
          </div>
        </section>
      </main>
    </div>
  `;

  const pageShell = root.querySelector<HTMLDivElement>('.page-shell');
  const startButton = root.querySelector<HTMLButtonElement>('[data-start]');
  const canvasHost = root.querySelector<HTMLDivElement>('[data-canvas]');
  const scoreEl = root.querySelector<HTMLElement>('[data-score]');
  const statusEl = root.querySelector<HTMLElement>('[data-status]');
  const visibleStatusEl = root.querySelector<HTMLElement>('[data-visible-status]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const encounterEl = root.querySelector<HTMLElement>('[data-encounter]');
  const turnEl = root.querySelector<HTMLElement>('[data-turn]');
  const playerHpEl = root.querySelector<HTMLElement>('[data-player-hp]');
  const playerGuardEl = root.querySelector<HTMLElement>('[data-player-guard]');
  const playerGritEl = root.querySelector<HTMLElement>('[data-player-grit]');
  const playerStatusesEl = root.querySelector<HTMLDivElement>('[data-player-statuses]');
  const enemyNameEl = root.querySelector<HTMLElement>('[data-enemy-name]');
  const enemyHpEl = root.querySelector<HTMLElement>('[data-enemy-hp]');
  const enemyGuardEl = root.querySelector<HTMLElement>('[data-enemy-guard]');
  const enemyIntentEl = root.querySelector<HTMLElement>('[data-enemy-intent]');
  const enemyStatusesEl = root.querySelector<HTMLDivElement>('[data-enemy-statuses]');
  const overlayEl = root.querySelector<HTMLDivElement>('[data-overlay]');
  const specialEls = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-special]'));
  const skipButton = root.querySelector<HTMLButtonElement>('[data-skip]');

  if (
    !pageShell ||
    !startButton ||
    !canvasHost ||
    !scoreEl ||
    !statusEl ||
    !visibleStatusEl ||
    !restartButton ||
    !encounterEl ||
    !turnEl ||
    !playerHpEl ||
    !playerGuardEl ||
    !playerGritEl ||
    !playerStatusesEl ||
    !enemyNameEl ||
    !enemyHpEl ||
    !enemyGuardEl ||
    !enemyIntentEl ||
    !enemyStatusesEl ||
    !overlayEl ||
    !skipButton ||
    specialEls.length !== SPECIAL_SLOT_IDS.length
  ) {
    throw new Error('MatchCrow HUD failed to initialize.');
  }

  const startHandlers = new Set<() => void>();
  const restartHandlers = new Set<() => void>();
  const specialHandlers = new Set<(slotId: SpecialSlotId) => void>();
  const skipHandlers = new Set<() => void>();
  const rewardHandlers = new Set<(rewardId: string) => void>();

  const fireRestart = (): void => {
    restartHandlers.forEach((handler) => handler());
  };

  restartButton.addEventListener('click', fireRestart);

  startButton.addEventListener('click', () => {
    pageShell.classList.add('is-started');
    startHandlers.forEach((handler) => handler());
  });

  specialEls.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) {
        return;
      }

      const slotId = button.dataset.special as SpecialSlotId | undefined;

      if (!slotId) {
        return;
      }

      specialHandlers.forEach((handler) => handler(slotId));
    });
  });

  skipButton.addEventListener('click', () => {
    if (skipButton.disabled) {
      return;
    }

    skipHandlers.forEach((handler) => handler());
  });

  const setStatus = (text: string): void => {
    statusEl.textContent = text;
    visibleStatusEl.textContent = text;
  };

  const render = (state: HybridBattleState): void => {
    scoreEl.textContent = state.score.toString().padStart(6, '0');
    encounterEl.textContent = `Fight ${Math.min(state.encounterIndex + 1, state.encounters.length)} / ${
      state.encounters.length
    }`;
    turnEl.textContent =
      state.phase === 'player_board_turn'
        ? 'Board Turn'
        : state.phase === 'player_special_window'
          ? 'Special Window'
          : state.phase === 'enemy_turn'
            ? 'Enemy Turn'
            : state.phase === 'reward'
              ? 'Reward'
              : state.phase === 'victory'
                ? 'Victory'
                : 'Down';
    playerHpEl.textContent = `${state.player.hp} / ${state.player.maxHp}`;
    playerGuardEl.textContent = `${state.player.guard}`;
    playerGritEl.textContent = `${state.player.grit} / ${state.player.maxGrit}`;
    playerStatusesEl.innerHTML = renderStatuses(state.player.statuses);
    enemyNameEl.textContent = ENEMY_DEFINITIONS[state.enemy.id].name;
    enemyHpEl.textContent = `${state.enemy.hp} / ${state.enemy.maxHp}`;
    enemyGuardEl.textContent = `Guard ${state.enemy.guard}`;
    enemyIntentEl.textContent =
      state.phase === 'reward' || state.phase === 'victory'
        ? 'Choose your next edge.'
        : state.phase === 'defeat'
          ? 'The run is over.'
          : `${state.enemyIntent.label}: ${state.enemyIntent.description}`;
    enemyStatusesEl.innerHTML = renderStatuses(state.enemy.statuses);
    setStatus(state.log || DEFAULT_STATUS);

    specialEls.forEach((button) => {
      const slotId = button.dataset.special as SpecialSlotId;
      const special = state.specials[slotId];
      const definition = SPECIAL_DEFINITIONS[slotId];
      const disabled =
        state.phase !== 'player_special_window' ||
        special.cooldownRemaining > 0 ||
        state.player.grit < definition.cost;

      button.disabled = disabled;
      button.dataset.cooldown = special.cooldownRemaining > 0 ? `${special.cooldownRemaining}` : '';
      button.querySelector('.special-meta')!.textContent =
        special.cooldownRemaining > 0
          ? `cd ${special.cooldownRemaining}`
          : `lv ${special.level} / ${definition.cost} grit`;
    });

    skipButton.disabled = state.phase !== 'player_special_window';
    renderOverlay(state, overlayEl, fireRestart, rewardHandlers);
  };

  render(initialState);

  return {
    canvasHost,
    render,
    setStatus,
    onRestart(handler: () => void) {
      restartHandlers.add(handler);
    },
    onStart(handler: () => void) {
      startHandlers.add(handler);
    },
    onSpecial(handler: (slotId: SpecialSlotId) => void) {
      specialHandlers.add(handler);
    },
    onSkip(handler: () => void) {
      skipHandlers.add(handler);
    },
    onReward(handler: (rewardId: string) => void) {
      rewardHandlers.add(handler);
    },
  };
}

function renderStatuses(statuses: StatusEffect[]): string {
  if (statuses.length === 0) {
    return '<span class="status-chip is-empty">Clear</span>';
  }

  return statuses
    .map(
      (status) =>
        `<span class="status-chip">${STATUS_LABELS[status.id]} ${status.potency}/${status.duration}</span>`,
    )
    .join('');
}

function renderOverlay(
  state: HybridBattleState,
  overlayEl: HTMLDivElement,
  onRestart: () => void,
  rewardHandlers: Set<(rewardId: string) => void>,
): void {
  if (state.phase === 'reward') {
    overlayEl.hidden = false;
    overlayEl.innerHTML = `
      <div class="overlay-card">
        <strong class="overlay-title">Pick One Reward</strong>
        <div class="reward-grid">
          ${state.rewardOptions.map(renderRewardCard).join('')}
        </div>
      </div>
    `;

    overlayEl.querySelectorAll<HTMLButtonElement>('[data-reward]').forEach((button) => {
      button.addEventListener('click', () => {
        const rewardId = button.dataset.reward;

        if (!rewardId) {
          return;
        }

        rewardHandlers.forEach((handler) => handler(rewardId));
      });
    });

    return;
  }

  if (state.phase === 'victory' || state.phase === 'defeat') {
    overlayEl.hidden = false;
    overlayEl.innerHTML = `
      <div class="overlay-card overlay-card-end">
        <strong class="overlay-title">${
          state.phase === 'victory' ? 'Run Cleared' : 'Crow Down'
        }</strong>
        <p>${state.log}</p>
        <button type="button" class="start-button overlay-button" data-overlay-restart>
          ${state.phase === 'victory' ? 'Play Again' : 'Try Again'}
        </button>
      </div>
    `;

    overlayEl
      .querySelector<HTMLButtonElement>('[data-overlay-restart]')
      ?.addEventListener('click', onRestart);

    return;
  }

  overlayEl.hidden = true;
  overlayEl.innerHTML = '';
}

function renderRewardCard(option: RewardOption): string {
  let extra = option.description;

  if (option.kind === 'relic' && option.relicId) {
    extra = RELIC_DEFINITIONS[option.relicId].description;
  }

  return `
    <button type="button" class="reward-card" data-reward="${option.id}">
      <span class="reward-kind">${option.kind}</span>
      <strong>${option.label}</strong>
      <span>${extra}</span>
    </button>
  `;
}
