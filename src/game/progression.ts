export interface MatchCrowProgressionState {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  progressRatio: number;
}

const MIN_RUN_XP = 5;
const SCORE_PER_XP = 10;
const BASE_LEVEL_XP = 100;
const LEVEL_XP_STEP = 50;

export function getRunXpForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }

  return Math.max(MIN_RUN_XP, Math.floor(score / SCORE_PER_XP));
}

export function getProgressionState(totalXp: number): MatchCrowProgressionState {
  const safeTotalXp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let levelStartXp = 0;
  let xpForNextLevel = getXpForNextLevel(level);

  while (safeTotalXp >= levelStartXp + xpForNextLevel) {
    levelStartXp += xpForNextLevel;
    level += 1;
    xpForNextLevel = getXpForNextLevel(level);
  }

  const xpIntoLevel = safeTotalXp - levelStartXp;
  const xpToNextLevel = Math.max(0, xpForNextLevel - xpIntoLevel);

  return {
    totalXp: safeTotalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel,
    progressRatio: xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 0,
  };
}

function getXpForNextLevel(level: number): number {
  return BASE_LEVEL_XP + Math.max(0, level - 1) * LEVEL_XP_STEP;
}
