import {
  initializeRun,
  pickReward,
  skipSpecial,
  trySwap,
  useSpecial,
} from './simulation/engine.ts';
import type {
  Cell,
  HybridBattleState,
  HybridResolution,
  SpecialSlotId,
} from './simulation/types.ts';

type RestartListener = (state: HybridBattleState) => void;

export class CrowsCacheGame {
  private readonly rng: () => number;
  private state: HybridBattleState;
  private readonly restartListeners = new Set<RestartListener>();

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.state = initializeRun(this.rng);
  }

  getState(): HybridBattleState {
    return this.state;
  }

  trySwap(from: Cell, to: Cell): HybridResolution {
    const result = trySwap(this.state, from, to, this.rng);

    if (result.accepted) {
      this.state = result.state;
    }

    return result;
  }

  useSpecial(slotId: SpecialSlotId): HybridResolution {
    const result = useSpecial(this.state, slotId, this.rng);

    if (result.accepted) {
      this.state = result.state;
    }

    return result;
  }

  skipSpecial(): HybridResolution {
    const result = skipSpecial(this.state, this.rng);

    if (result.accepted) {
      this.state = result.state;
    }

    return result;
  }

  pickReward(rewardId: string): HybridResolution {
    const result = pickReward(this.state, rewardId, this.rng);

    if (result.accepted) {
      this.state = result.state;
    }

    return result;
  }

  restart(): HybridBattleState {
    this.state = initializeRun(this.rng);
    this.restartListeners.forEach((listener) => listener(this.state));
    return this.state;
  }

  onRestart(listener: RestartListener): () => void {
    this.restartListeners.add(listener);

    return () => {
      this.restartListeners.delete(listener);
    };
  }
}
