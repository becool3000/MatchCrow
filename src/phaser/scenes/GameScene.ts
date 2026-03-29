import Phaser from 'phaser';
import { CrowsCacheGame } from '../../game/CrowsCacheGame.ts';
import {
  BOARD_COLORS,
  DEFAULT_STATUS,
  FX_TEXTURE_KEYS,
  TILE_TEXTURE_KEYS,
} from '../../game/assets/manifest.ts';
import {
  ENEMY_DEFINITIONS,
  GRID_SIZE,
  type BoardResolveStep,
  type Cell,
  type HybridBattleState,
  type HybridEvent,
  type SpecialSlotId,
  type SpawnedTile,
  type Tile,
  type TileMove,
} from '../../game/simulation/types.ts';
import type { GameHud } from '../../ui/createHud.ts';
import { CrowActor } from '../view/CrowActor.ts';
import { EnemyActor } from '../view/EnemyActor.ts';
import {
  MATCHCROW_POSTFX_PIPELINE_KEY,
  MatchCrowPostFxPipeline,
} from '../view/MatchCrowPostFxPipeline.ts';

interface ArenaLayout {
  boardX: number;
  boardY: number;
  boardSize: number;
  tileSize: number;
  enemyPerch: Phaser.Math.Vector2;
  crowPerch: Phaser.Math.Vector2;
  center: Phaser.Math.Vector2;
}

interface DragState {
  cell: Cell;
  startX: number;
  startY: number;
  pointerId: number;
}

const FOREST_POINTS = [
  { x: 0.08, height: 0.28, width: 0.1 },
  { x: 0.18, height: 0.34, width: 0.14 },
  { x: 0.34, height: 0.26, width: 0.11 },
  { x: 0.47, height: 0.38, width: 0.16 },
  { x: 0.64, height: 0.24, width: 0.12 },
  { x: 0.78, height: 0.36, width: 0.16 },
  { x: 0.9, height: 0.28, width: 0.1 },
] as const;

export class GameScene extends Phaser.Scene {
  private readonly controller: CrowsCacheGame;
  private readonly hud: GameHud;
  private currentState: HybridBattleState;
  private readonly tileSprites = new Map<string, Phaser.GameObjects.Image>();
  private layout: ArenaLayout = {
    boardX: 0,
    boardY: 0,
    boardSize: 0,
    tileSize: 0,
    enemyPerch: new Phaser.Math.Vector2(0, 0),
    crowPerch: new Phaser.Math.Vector2(0, 0),
    center: new Phaser.Math.Vector2(0, 0),
  };
  private farForest?: Phaser.GameObjects.Graphics;
  private nearForest?: Phaser.GameObjects.Graphics;
  private arenaGraphics?: Phaser.GameObjects.Graphics;
  private postFx?: MatchCrowPostFxPipeline;
  private crow?: CrowActor;
  private enemy?: EnemyActor;
  private sparkles: Phaser.GameObjects.Image[] = [];
  private parallaxTarget = 0;
  private parallaxCurrent = 0;
  private dragState: DragState | null = null;
  private busy = false;
  private removeRestartListener?: () => void;

  constructor(controller: CrowsCacheGame, hud: GameHud) {
    super('game');
    this.controller = controller;
    this.hud = hud;
    this.currentState = controller.getState();
  }

  create(): void {
    this.currentState = this.controller.getState();
    this.farForest = this.add.graphics().setDepth(-40);
    this.nearForest = this.add.graphics().setDepth(-30);
    this.arenaGraphics = this.add.graphics().setDepth(-10);
    this.createSparkles();
    this.installPostFx();

    this.crow = new CrowActor(this, new Phaser.Math.Vector2(0, 0));
    this.enemy = new EnemyActor(this, new Phaser.Math.Vector2(0, 0), this.currentState.enemy.id);

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.clearDragState, this);
    this.input.on('pointerupoutside', this.clearDragState, this);
    this.scale.on('resize', this.handleResize, this);

    this.handleResize(this.scale.gameSize);
    this.resetBoard(this.currentState.board);
    this.syncActorsToState(true);
    this.hud.render(this.currentState);
    this.hud.setStatus(this.currentState.log || DEFAULT_STATUS);

    this.removeRestartListener = this.controller.onRestart((state) => {
      this.currentState = state;
      this.resetBoard(state.board);
      this.syncActorsToState(true);
      this.hud.render(state);
      this.hud.setStatus(state.log);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeRestartListener?.();
      this.cameras.main.resetPostPipeline();
      this.crow?.destroy();
      this.enemy?.destroy();
    });
  }

  update(): void {
    if (this.postFx) {
      this.postFx.time = this.time.now / 1000;
    }

    this.parallaxCurrent = Phaser.Math.Linear(this.parallaxCurrent, this.parallaxTarget, 0.08);

    if (this.farForest) {
      this.farForest.x = this.parallaxCurrent * 0.45;
    }

    if (this.nearForest) {
      this.nearForest.x = this.parallaxCurrent;
    }
  }

  async useSpecial(slotId: SpecialSlotId): Promise<void> {
    if (this.busy) {
      return;
    }

    const result = this.controller.useSpecial(slotId);

    if (!result.accepted) {
      this.hud.setStatus(result.reason ?? DEFAULT_STATUS);
      return;
    }

    this.currentState = result.state;
    this.busy = true;
    await this.playEvents(result.events);
    this.syncActorsToState();
    this.hud.render(this.currentState);
    this.hud.setStatus(this.currentState.log);
    this.busy = false;
  }

  async skipSpecial(): Promise<void> {
    if (this.busy) {
      return;
    }

    const result = this.controller.skipSpecial();

    if (!result.accepted) {
      this.hud.setStatus(result.reason ?? DEFAULT_STATUS);
      return;
    }

    this.currentState = result.state;
    this.busy = true;
    await this.playEvents(result.events);
    this.syncActorsToState();
    this.hud.render(this.currentState);
    this.hud.setStatus(this.currentState.log);
    this.busy = false;
  }

  async pickReward(rewardId: string): Promise<void> {
    if (this.busy) {
      return;
    }

    const result = this.controller.pickReward(rewardId);

    if (!result.accepted) {
      this.hud.setStatus(result.reason ?? DEFAULT_STATUS);
      return;
    }

    this.currentState = result.state;
    this.busy = true;
    await this.playEvents(result.events);
    this.syncActorsToState(true);
    this.hud.render(this.currentState);
    this.hud.setStatus(this.currentState.log);
    this.busy = false;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.busy || this.currentState.phase !== 'player_board_turn') {
      return;
    }

    const cell = this.pointerToCell(pointer.x, pointer.y);

    if (!cell) {
      return;
    }

    this.dragState = {
      cell,
      startX: pointer.x,
      startY: pointer.y,
      pointerId: pointer.id,
    };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.parallaxTarget = Phaser.Math.Clamp(
      (pointer.x / Math.max(this.scale.width, 1) - 0.5) * 18,
      -18,
      18,
    );

    if (!this.dragState || this.dragState.pointerId !== pointer.id || !pointer.isDown) {
      return;
    }

    const from = this.dragState.cell;
    const deltaX = pointer.x - this.dragState.startX;
    const deltaY = pointer.y - this.dragState.startY;
    const threshold = this.layout.tileSize * 0.28;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) {
      return;
    }

    const direction =
      Math.abs(deltaX) > Math.abs(deltaY)
        ? { row: 0, col: deltaX > 0 ? 1 : -1 }
        : { row: deltaY > 0 ? 1 : -1, col: 0 };

    const target = {
      row: from.row + direction.row,
      col: from.col + direction.col,
    };

    this.clearDragState();

    if (!this.isInsideBoard(target)) {
      return;
    }

    void this.performSwap(from, target);
  }

  private clearDragState(): void {
    this.dragState = null;
  }

  private async performSwap(from: Cell, to: Cell): Promise<void> {
    if (this.busy) {
      return;
    }

    const beforeBoard = this.currentState.board;
    const firstTile = beforeBoard.grid[from.row][from.col];
    const secondTile = beforeBoard.grid[to.row][to.col];

    if (!firstTile || !secondTile) {
      return;
    }

    const firstSprite = this.tileSprites.get(firstTile.id);
    const secondSprite = this.tileSprites.get(secondTile.id);

    if (!firstSprite || !secondSprite) {
      return;
    }

    this.busy = true;
    const result = this.controller.trySwap(from, to);

    if (!result.accepted) {
      this.hud.setStatus(result.reason ?? DEFAULT_STATUS);

      if (result.reason?.includes('match')) {
        await this.animateRejectedSwap(firstSprite, secondSprite, from, to);
      }

      this.busy = false;
      return;
    }

    this.currentState = result.state;

    if (result.swap) {
      await this.animateAcceptedSwap(firstSprite, secondSprite, result.swap.from, result.swap.to);
    }

    await this.playEvents(result.events);
    this.resetBoard(this.currentState.board);
    this.syncActorsToState();
    this.hud.render(this.currentState);
    this.hud.setStatus(this.currentState.log);
    this.busy = false;
  }

  private async playEvents(events: HybridEvent[]): Promise<void> {
    let activeAction: Extract<HybridEvent, { type: 'action' }> | undefined;

    for (const event of events) {
      if (event.type === 'action') {
        activeAction = event;
      }

      switch (event.type) {
        case 'message':
          this.hud.setStatus(event.text);
          await wait(this, 90);
          break;
        case 'encounter':
          this.enemy?.setEnemy(event.enemyId);
          this.enemy?.restore();
          this.resetBoard(this.currentState.board);
          this.emitSparkles(this.layout.enemyPerch);
          this.spawnFloatingText(
            ENEMY_DEFINITIONS[event.enemyId].name,
            this.layout.enemyPerch.clone().add(new Phaser.Math.Vector2(0, -this.layout.tileSize * 1.2)),
            '#ffe8ae',
          );
          await wait(this, 180);
          break;
        case 'board_step':
          await this.animateBoardStep(event.step);
          break;
        case 'board_reshuffle':
          await this.animateReshuffle(event.moves);
          break;
        case 'intent':
          this.hud.setStatus(`Incoming: ${event.intent.label}. ${event.intent.description}`);
          await wait(this, 90);
          break;
        case 'action':
          await this.playActionLead(event);
          break;
        case 'damage':
          await this.playDamageEvent(event, activeAction);
          break;
        case 'heal':
          await this.playHealEvent(event);
          break;
        case 'guard':
          await this.playGuardEvent(event);
          break;
        case 'grit':
          this.spawnFloatingText(
            `Grit +${event.amount}`,
            this.crow?.getFocusPoint() ?? this.layout.crowPerch,
            '#90f6ff',
          );
          await wait(this, 90);
          break;
        case 'status':
          await this.playStatusEvent(event);
          break;
        case 'status_tick':
          await this.playStatusTickEvent(event);
          break;
        case 'reward_picked':
          this.emitFeathers(this.layout.crowPerch);
          await this.crow?.celebrate();
          break;
        case 'reward_ready':
          this.cameras.main.flash(120, 255, 236, 190);
          await wait(this, 140);
          break;
        case 'victory':
          await this.enemy?.faint();
          this.cameras.main.shake(140, 0.003);
          await this.crow?.celebrate();
          break;
        case 'defeat':
          this.cameras.main.shake(180, 0.004);
          await this.crow?.takeHit();
          break;
      }
    }
  }

  private async playActionLead(
    event: Extract<HybridEvent, { type: 'action' }>,
  ): Promise<void> {
    if (event.actor === 'player') {
      if (event.actionId === 'feather-flurry') {
        await this.crow?.flyTo(
          this.enemy?.getFocusPoint().clone().add(new Phaser.Math.Vector2(-18, 4)) ??
            this.layout.enemyPerch,
        );
        return;
      }

      await this.crow?.hop(8, 200);
      return;
    }

    if (event.actionId === 'burrow' || event.actionId === 'mirror-guard' || event.actionId === 'preen') {
      await this.enemy?.brace();
      return;
    }

    await this.enemy?.strikeAt(this.crow?.getFocusPoint() ?? this.layout.crowPerch);
  }

  private async playDamageEvent(
    event: Extract<HybridEvent, { type: 'damage' }>,
    activeAction?: Extract<HybridEvent, { type: 'action' }>,
  ): Promise<void> {
    const point =
      event.target === 'enemy' ? this.enemy?.getFocusPoint() : this.crow?.getFocusPoint();
    const color = event.target === 'enemy' ? '#ffcf8d' : '#ff9b92';
    const blockedText = event.blocked > 0 ? ` (${event.blocked} guard)` : '';

    this.spawnFloatingText(`-${event.amount}${blockedText}`, point ?? this.layout.center, color);

    if (event.target === 'enemy') {
      await this.enemy?.takeHit();

      if (activeAction?.actor === 'player' && activeAction.actionId === 'feather-flurry') {
        await this.crow?.returnHome();
      }
    } else {
      await this.crow?.takeHit();
    }

    this.cameras.main.shake(90, 0.0025);
  }

  private async playHealEvent(event: Extract<HybridEvent, { type: 'heal' }>): Promise<void> {
    const point =
      event.target === 'enemy' ? this.enemy?.getFocusPoint() : this.crow?.getFocusPoint();

    this.spawnFloatingText(`+${event.amount}`, point ?? this.layout.center, '#aff48c');

    if (event.target === 'enemy') {
      await this.enemy?.brace();
    } else {
      await this.crow?.hop(8, 180);
    }
  }

  private async playGuardEvent(event: Extract<HybridEvent, { type: 'guard' }>): Promise<void> {
    const point =
      event.target === 'enemy' ? this.enemy?.getFocusPoint() : this.crow?.getFocusPoint();

    this.spawnFloatingText(`Guard +${event.amount}`, point ?? this.layout.center, '#90f6ff');

    if (event.target === 'enemy') {
      await this.enemy?.brace();
    } else {
      await this.crow?.hop(7, 180);
    }
  }

  private async playStatusEvent(event: Extract<HybridEvent, { type: 'status' }>): Promise<void> {
    const point =
      event.target === 'enemy' ? this.enemy?.getFocusPoint() : this.crow?.getFocusPoint();

    this.spawnFloatingText(
      `${event.statusId.toUpperCase()} ${event.potency}/${event.duration}`,
      point ?? this.layout.center,
      '#ffe68a',
    );
    await wait(this, 100);
  }

  private async playStatusTickEvent(
    event: Extract<HybridEvent, { type: 'status_tick' }>,
  ): Promise<void> {
    const point =
      event.target === 'enemy' ? this.enemy?.getFocusPoint() : this.crow?.getFocusPoint();
    const prefix = event.statusId === 'bleed' ? '-' : '+';
    const color = event.statusId === 'bleed' ? '#ff9b92' : '#aff48c';

    this.spawnFloatingText(
      `${event.statusId.toUpperCase()} ${prefix}${event.amount}`,
      point ?? this.layout.center,
      color,
    );
    await wait(this, 100);
  }

  private async animateBoardStep(step: BoardResolveStep): Promise<void> {
    const centroid = getCentroid(step.clearedCells.map((cell) => this.cellToPoint(cell)));

    if (step.bigMatch) {
      await this.crow?.flyTo(centroid);
      this.emitFeathers(centroid);
      this.cameras.main.shake(110, 0.0028);
    }

    await this.clearMatchedTiles(step.clearedTileIds);
    await this.animateDrops(step.droppedTiles, step.spawnedTiles);
    this.emitSparkles(centroid);

    if (step.bigMatch) {
      await this.crow?.returnHome();
    }
  }

  private async clearMatchedTiles(tileIds: string[]): Promise<void> {
    await Promise.all(
      tileIds.map((tileId) => {
        const sprite = this.tileSprites.get(tileId);

        if (!sprite) {
          return Promise.resolve();
        }

        this.tileSprites.delete(tileId);

        return tweenPromise(this, {
          targets: sprite,
          scale: sprite.scale * 0.2,
          alpha: 0,
          angle: 32,
          duration: 180,
          ease: 'Quad.Out',
        }).then(() => {
          sprite.destroy();
        });
      }),
    );
  }

  private async animateDrops(
    droppedTiles: TileMove[],
    spawnedTiles: SpawnedTile[],
  ): Promise<void> {
    const dropTweens = droppedTiles.map((move) => {
      const sprite = this.tileSprites.get(move.tileId);

      if (!sprite) {
        return Promise.resolve();
      }

      return tweenPromise(this, {
        targets: sprite,
        x: this.cellToPoint(move.to).x,
        y: this.cellToPoint(move.to).y,
        duration: 220,
        ease: 'Cubic.In',
      });
    });

    const spawnTweens = spawnedTiles.map((spawn) => {
      const sprite = this.createTileSprite(
        spawn.tile,
        this.rowColToPoint(spawn.fromRow, spawn.to.col),
      );
      this.tileSprites.set(spawn.tile.id, sprite);

      return tweenPromise(this, {
        targets: sprite,
        x: this.cellToPoint(spawn.to).x,
        y: this.cellToPoint(spawn.to).y,
        duration: 250,
        ease: 'Bounce.Out',
      });
    });

    await Promise.all([...dropTweens, ...spawnTweens]);
  }

  private async animateReshuffle(moves: TileMove[]): Promise<void> {
    await Promise.all(
      moves.map((move) => {
        const sprite = this.tileSprites.get(move.tileId);

        if (!sprite) {
          return Promise.resolve();
        }

        return tweenPromise(this, {
          targets: sprite,
          x: this.cellToPoint(move.to).x,
          y: this.cellToPoint(move.to).y,
          duration: 240,
          ease: 'Sine.InOut',
        });
      }),
    );
  }

  private async animateRejectedSwap(
    firstSprite: Phaser.GameObjects.Image,
    secondSprite: Phaser.GameObjects.Image,
    from: Cell,
    to: Cell,
  ): Promise<void> {
    await Promise.all([
      tweenPromise(this, {
        targets: firstSprite,
        x: this.cellToPoint(to).x,
        y: this.cellToPoint(to).y,
        duration: 110,
        ease: 'Sine.Out',
        yoyo: true,
      }),
      tweenPromise(this, {
        targets: secondSprite,
        x: this.cellToPoint(from).x,
        y: this.cellToPoint(from).y,
        duration: 110,
        ease: 'Sine.Out',
        yoyo: true,
      }),
    ]);
  }

  private async animateAcceptedSwap(
    firstSprite: Phaser.GameObjects.Image,
    secondSprite: Phaser.GameObjects.Image,
    from: Cell,
    to: Cell,
  ): Promise<void> {
    await Promise.all([
      tweenPromise(this, {
        targets: firstSprite,
        x: this.cellToPoint(to).x,
        y: this.cellToPoint(to).y,
        duration: 150,
        ease: 'Cubic.Out',
      }),
      tweenPromise(this, {
        targets: secondSprite,
        x: this.cellToPoint(from).x,
        y: this.cellToPoint(from).y,
        duration: 150,
        ease: 'Cubic.Out',
      }),
    ]);
  }

  private resetBoard(board: HybridBattleState['board']): void {
    this.tileSprites.forEach((sprite) => sprite.destroy());
    this.tileSprites.clear();

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const tile = board.grid[row][col];

        if (!tile) {
          continue;
        }

        const sprite = this.createTileSprite(tile, this.cellToPoint({ row, col }));
        this.tileSprites.set(tile.id, sprite);
      }
    }
  }

  private createSparkles(): void {
    for (let index = 0; index < 8; index += 1) {
      const sparkle = this.add
        .image(0, 0, FX_TEXTURE_KEYS.sparkle)
        .setDepth(-18)
        .setScale(0.65 + index * 0.04)
        .setAlpha(0.35);

      this.tweens.add({
        targets: sparkle,
        alpha: { from: 0.15, to: 0.65 },
        scale: { from: sparkle.scale * 0.9, to: sparkle.scale * 1.1 },
        duration: 1400 + index * 120,
        ease: 'Sine.InOut',
        repeat: -1,
        yoyo: true,
        delay: index * 70,
      });

      this.sparkles.push(sparkle);
    }
  }

  private createTileSprite(tile: Tile, point: Phaser.Math.Vector2): Phaser.GameObjects.Image {
    return this.add
      .image(point.x, point.y, TILE_TEXTURE_KEYS[tile.kind])
      .setOrigin(0.5)
      .setDepth(10)
      .setScale(this.layout.tileSize / 34);
  }

  private emitFeathers(point: Phaser.Math.Vector2): void {
    for (let index = 0; index < 5; index += 1) {
      const feather = this.add
        .image(point.x, point.y, FX_TEXTURE_KEYS.feather)
        .setOrigin(0.5)
        .setDepth(48)
        .setScale((this.layout.tileSize / 48) * (0.9 + index * 0.04));

      this.tweens.add({
        targets: feather,
        x: point.x + Phaser.Math.Between(-22, 22),
        y: point.y + Phaser.Math.Between(-16, 14),
        alpha: 0,
        angle: Phaser.Math.Between(-80, 80),
        duration: 340,
        ease: 'Cubic.Out',
        onComplete: () => feather.destroy(),
      });
    }
  }

  private emitSparkles(point: Phaser.Math.Vector2): void {
    for (let index = 0; index < 3; index += 1) {
      const sparkle = this.add
        .image(point.x, point.y, FX_TEXTURE_KEYS.sparkle)
        .setDepth(48)
        .setScale(this.layout.tileSize / 52)
        .setAlpha(0.7);

      this.tweens.add({
        targets: sparkle,
        x: point.x + Phaser.Math.Between(-18, 18),
        y: point.y + Phaser.Math.Between(-18, 10),
        alpha: 0,
        scale: sparkle.scale * 1.4,
        duration: 260,
        ease: 'Quad.Out',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private spawnFloatingText(text: string, point: Phaser.Math.Vector2, color: string): void {
    const label = this.add
      .text(point.x, point.y, text, {
        fontFamily: 'VT323',
        fontSize: `${Math.max(16, Math.round(this.layout.tileSize * 0.48))}px`,
        color,
        stroke: '#160d1b',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.tweens.add({
      targets: label,
      y: point.y - this.layout.tileSize * 0.65,
      alpha: 0,
      duration: 500,
      ease: 'Quad.Out',
      onComplete: () => label.destroy(),
    });
  }

  private syncActorsToState(force = false): void {
    if (!this.crow || !this.enemy) {
      return;
    }

    this.crow.setPerch(this.layout.crowPerch);
    this.crow.setScale(this.layout.tileSize / 16);
    this.enemy.setPerch(this.layout.enemyPerch);
    this.enemy.setScale(this.layout.tileSize / 18);

    if (force) {
      this.enemy.setEnemy(this.currentState.enemy.id);
      this.enemy.restore();
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const width = gameSize.width;
    const height = gameSize.height;
    const tileSize = Math.max(28, Math.floor(Math.min(width * 0.105, height * 0.075)));
    const boardSize = tileSize * GRID_SIZE;
    let boardY = Math.round(height * 0.22);
    const minBoardY = Math.round(tileSize * 1.7);
    const maxBoardY = Math.round(height - boardSize - tileSize * 2.2);

    boardY = Phaser.Math.Clamp(boardY, minBoardY, maxBoardY);

    this.layout = {
      boardX: Math.round((width - boardSize) / 2),
      boardY,
      boardSize,
      tileSize,
      enemyPerch: new Phaser.Math.Vector2(Math.round(width / 2), boardY - tileSize * 0.92),
      crowPerch: new Phaser.Math.Vector2(Math.round(width / 2), boardY + boardSize + tileSize * 0.88),
      center: new Phaser.Math.Vector2(Math.round(width / 2), Math.round(boardY + boardSize / 2)),
    };

    this.drawBackdrop(width, height);
    this.drawArena(width, height);

    this.sparkles.forEach((sparkle, index) => {
      sparkle.setPosition(
        this.layout.boardX + boardSize * (0.1 + (index % 4) * 0.25),
        this.layout.boardY + boardSize * (0.08 + Math.floor(index / 4) * 0.88),
      );
    });

    this.tileSprites.forEach((sprite) => {
      sprite.setScale(tileSize / 34);
    });

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const tile = this.currentState.board.grid[row][col];

        if (!tile) {
          continue;
        }

        this.tileSprites.get(tile.id)?.setPosition(
          this.cellToPoint({ row, col }).x,
          this.cellToPoint({ row, col }).y,
        );
      }
    }

    this.syncActorsToState(true);
  }

  private drawBackdrop(width: number, height: number): void {
    if (!this.farForest || !this.nearForest) {
      return;
    }

    this.cameras.main.setBackgroundColor('#120f1e');

    this.farForest.clear();
    this.farForest.fillGradientStyle(0x21183a, 0x21183a, 0x4e4874, 0x6b6695, 1);
    this.farForest.fillRect(0, 0, width, height);
    this.drawForestLayer(this.farForest, width, height, 0x241631, 0.44);

    this.nearForest.clear();
    this.drawForestLayer(this.nearForest, width, height, 0x1b1026, 0.62);
  }

  private drawForestLayer(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    color: number,
    alpha: number,
  ): void {
    graphics.fillStyle(color, alpha);

    FOREST_POINTS.forEach((point) => {
      const baseX = width * point.x;
      const baseY = height;
      const treeHeight = height * point.height;
      const treeWidth = width * point.width;

      graphics.fillTriangle(
        baseX,
        baseY - treeHeight,
        baseX - treeWidth,
        baseY,
        baseX + treeWidth,
        baseY,
      );
      graphics.fillRect(
        baseX - treeWidth * 0.08,
        baseY - treeHeight * 0.2,
        treeWidth * 0.16,
        treeHeight * 0.24,
      );
    });
  }

  private drawArena(width: number, height: number): void {
    if (!this.arenaGraphics) {
      return;
    }

    const { boardX, boardY, boardSize, tileSize, enemyPerch, crowPerch, center } = this.layout;

    this.arenaGraphics.clear();
    this.arenaGraphics.fillStyle(0x8b7ab1, 0.18);
    this.arenaGraphics.fillEllipse(center.x, center.y, boardSize * 1.34, boardSize * 1.1);

    this.arenaGraphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.fill).color,
      0.92,
    );
    this.arenaGraphics.fillRoundedRect(
      boardX - tileSize * 0.4,
      boardY - tileSize * 0.4,
      boardSize + tileSize * 0.8,
      boardSize + tileSize * 0.8,
      tileSize * 0.28,
    );
    this.arenaGraphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.inner).color,
      1,
    );
    this.arenaGraphics.fillRoundedRect(boardX, boardY, boardSize, boardSize, tileSize * 0.18);
    this.arenaGraphics.lineStyle(
      4,
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.border).color,
      1,
    );
    this.arenaGraphics.strokeRoundedRect(boardX, boardY, boardSize, boardSize, tileSize * 0.18);

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = boardX + col * tileSize;
        const y = boardY + row * tileSize;
        const cellColor = (row + col) % 2 === 0 ? BOARD_COLORS.cell : BOARD_COLORS.cellShadow;
        this.arenaGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(cellColor).color, 0.86);
        this.arenaGraphics.fillRoundedRect(
          x + tileSize * 0.06,
          y + tileSize * 0.06,
          tileSize * 0.88,
          tileSize * 0.88,
          tileSize * 0.18,
        );
      }
    }

    this.drawPerch(enemyPerch, tileSize, BOARD_COLORS.enemyPerch, BOARD_COLORS.enemyPerchShadow);
    this.drawPerch(crowPerch, tileSize, BOARD_COLORS.playerPerch, BOARD_COLORS.playerPerchShadow);

    this.arenaGraphics.fillStyle(0xfce59a, 0.14);
    this.arenaGraphics.fillCircle(width * 0.78, Math.max(tileSize * 1.2, height * 0.12), tileSize * 0.75);
  }

  private drawPerch(
    perch: Phaser.Math.Vector2,
    tileSize: number,
    fill: string,
    shadow: string,
  ): void {
    if (!this.arenaGraphics) {
      return;
    }

    this.arenaGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(shadow).color, 0.95);
    this.arenaGraphics.fillEllipse(perch.x, perch.y + tileSize * 0.12, tileSize * 1.12, tileSize * 0.34);
    this.arenaGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1);
    this.arenaGraphics.fillEllipse(perch.x, perch.y + tileSize * 0.04, tileSize * 1.02, tileSize * 0.26);
  }

  private installPostFx(): void {
    const renderer = this.game.renderer;

    if (!('pipelines' in renderer)) {
      return;
    }

    renderer.pipelines.addPostPipeline(
      MATCHCROW_POSTFX_PIPELINE_KEY,
      MatchCrowPostFxPipeline,
    );

    this.cameras.main.setPostPipeline(MATCHCROW_POSTFX_PIPELINE_KEY);
    const pipeline = this.cameras.main.getPostPipeline(MATCHCROW_POSTFX_PIPELINE_KEY);

    this.postFx = Array.isArray(pipeline)
      ? (pipeline[0] as MatchCrowPostFxPipeline | undefined)
      : (pipeline as MatchCrowPostFxPipeline | undefined);
  }

  private pointerToCell(x: number, y: number): Cell | null {
    const { boardX, boardY, boardSize, tileSize } = this.layout;

    if (x < boardX || y < boardY || x > boardX + boardSize || y > boardY + boardSize) {
      return null;
    }

    return {
      row: Math.floor((y - boardY) / tileSize),
      col: Math.floor((x - boardX) / tileSize),
    };
  }

  private cellToPoint(cell: Cell): Phaser.Math.Vector2 {
    return this.rowColToPoint(cell.row, cell.col);
  }

  private rowColToPoint(row: number, col: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.layout.boardX + col * this.layout.tileSize + this.layout.tileSize / 2,
      this.layout.boardY + row * this.layout.tileSize + this.layout.tileSize / 2,
    );
  }

  private isInsideBoard(cell: Cell): boolean {
    return (
      cell.row >= 0 &&
      cell.row < GRID_SIZE &&
      cell.col >= 0 &&
      cell.col < GRID_SIZE
    );
  }
}

function tweenPromise(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig,
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      ...config,
      onComplete: () => resolve(),
    });
  });
}

function wait(scene: Phaser.Scene, time: number): Promise<void> {
  return new Promise((resolve) => {
    scene.time.delayedCall(time, () => resolve());
  });
}

function getCentroid(points: Phaser.Math.Vector2[]): Phaser.Math.Vector2 {
  const total = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    new Phaser.Math.Vector2(0, 0),
  );

  return total.scale(1 / Math.max(points.length, 1));
}
