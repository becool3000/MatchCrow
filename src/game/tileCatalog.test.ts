import { describe, expect, it } from 'vitest';
import {
  getUnlocksForLevel,
  getUnlockedTileDefinitions,
  pickRunTilePool,
  TILE_KIND_TO_ROLE,
} from './tileCatalog.ts';

describe('tile catalog unlocks', () => {
  it('exposes only the base five tiles at level 1', () => {
    expect(getUnlockedTileDefinitions(1).map((definition) => definition.kind)).toEqual([
      'key',
      'coin',
      'ring',
      'button',
      'trinket',
    ]);
  });

  it('matches the planned unlock schedule from levels 2 through 11', () => {
    expect(getUnlocksForLevel(2).map((definition) => definition.kind)).toEqual(['gem']);
    expect(getUnlocksForLevel(3).map((definition) => definition.kind)).toEqual(['thimble']);
    expect(getUnlocksForLevel(4).map((definition) => definition.kind)).toEqual(['medal']);
    expect(getUnlocksForLevel(5).map((definition) => definition.kind)).toEqual(['berry']);
    expect(getUnlocksForLevel(6).map((definition) => definition.kind)).toEqual(['pin']);
    expect(getUnlocksForLevel(7).map((definition) => definition.kind)).toEqual(['star']);
    expect(getUnlocksForLevel(8).map((definition) => definition.kind)).toEqual(['shell']);
    expect(getUnlocksForLevel(9).map((definition) => definition.kind)).toEqual(['compass']);
    expect(getUnlocksForLevel(10).map((definition) => definition.kind)).toEqual(['acorn']);
    expect(getUnlocksForLevel(11).map((definition) => definition.kind)).toEqual(['hourglass']);
  });

  it('picks exactly one unlocked tile per role for a run pool', () => {
    const runTilePool = pickRunTilePool(11, () => 0.9999);

    expect(runTilePool).toEqual({
      weak: 'hourglass',
      damage: 'star',
      grit: 'compass',
      guard: 'shell',
      heal: 'acorn',
    });

    expect(new Set(Object.values(runTilePool)).size).toBe(5);
    expect(TILE_KIND_TO_ROLE[runTilePool.weak]).toBe('weak');
    expect(TILE_KIND_TO_ROLE[runTilePool.damage]).toBe('damage');
    expect(TILE_KIND_TO_ROLE[runTilePool.grit]).toBe('grit');
    expect(TILE_KIND_TO_ROLE[runTilePool.guard]).toBe('guard');
    expect(TILE_KIND_TO_ROLE[runTilePool.heal]).toBe('heal');
  });
});
