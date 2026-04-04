import Phaser from 'phaser';
import { CrowsCacheGame } from '../../game/CrowsCacheGame.ts';
import {
  BOARD_COLORS,
  BACKGROUND_TEXTURE_KEYS,
  DEFAULT_STATUS,
  FX_TEXTURE_KEYS,
  TILE_TEXTURE_KEYS,
} from '../../game/assets/manifest.ts';
import {
  GRID_SIZE,
  type BoardResolveStep,
  type BoardResolutionResult,
  type BoardState,
  type Cell,
  type SpawnedTile,
  type Tile,
  type TileMove,
} from '../../game/simulation/types.ts';
import type { MatchCrowState } from '../../game/simulation/engine.ts';
import type { GameHud } from '../../ui/createHud.ts';
import { CrowActor } from '../view/CrowActor.ts';
import {
  MATCHCROW_POSTFX_PIPELINE_KEY,
  MatchCrowPostFxPipeline,
} from '../view/MatchCrowPostFxPipeline.ts';
import { playBigMatchCue, playClearPop, playCrowTweet } from '../view/MatchCrowSfx.ts';

interface ArenaLayout {
  boardX: number;
  boardY: number;
  boardSize: number;
  tileSize: number;
  crowPerch: Phaser.Math.Vector2;
  center: Phaser.Math.Vector2;
}

interface DragState {
  cell: Cell;
  startX: number;
  startY: number;
  pointerId: number;
}

interface SparkleBurstOptions {
  alpha?: number;
  count?: number;
  depth?: number;
  duration?: number;
  scaleMultiplier?: number;
  spreadX?: number;
  spreadY?: number;
}

export class GameScene extends Phaser.Scene {
  private readonly controller: CrowsCacheGame;
  private readonly hud: GameHud;
  private currentState: MatchCrowState;
  private readonly tileSprites = new Map<string, Phaser.GameObjects.Image>();
  private layout: ArenaLayout = {
    boardX: 0,
    boardY: 0,
    boardSize: 0,
    tileSize: 0,
    crowPerch: new Phaser.Math.Vector2(0, 0),
    center: new Phaser.Math.Vector2(0, 0),
  };
  private backgroundImage?: Phaser.GameObjects.Image;
  private arenaGraphics?: Phaser.GameObjects.Graphics;
  private postFx?: MatchCrowPostFxPipeline;
  private crow?: CrowActor;
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

  previewCrowCaw(): Promise<void> {
    if (!this.sys.isActive()) {
      return Promise.resolve();
    }

    return playCrowTweet(this);
  }

  create(): void {
    this.currentState = this.controller.getState();
    this.backgroundImage = this.add
      .image(0, 0, BACKGROUND_TEXTURE_KEYS.duskForest)
      .setOrigin(0.5)
      .setDepth(-60)
      .setScrollFactor(0);
    this.arenaGraphics = this.add.graphics().setDepth(-10);
    this.createSparkles();
    this.installPostFx();

    this.crow = new CrowActor(this, new Phaser.Math.Vector2(0, 0));

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.clearDragState, this);
    this.input.on('pointerupoutside', this.clearDragState, this);
    this.scale.on('resize', this.handleResize, this);

    this.handleResize(this.scale.gameSize);
    this.resetBoard(this.currentState.board);
    this.syncCrowToState();
    this.hud.render(this.controller.getViewState());
    this.hud.setStatus(this.currentState.lastMessage || DEFAULT_STATUS);

    this.removeRestartListener = this.controller.onRestart((state) => {
      this.busy = false;
      this.clearDragState();
      this.currentState = state;
      this.resetBoard(state.board);
      this.syncCrowToState();
      this.hud.render(this.controller.getViewState());
      this.hud.setStatus(state.lastMessage || DEFAULT_STATUS);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeRestartListener?.();
      this.cameras.main.resetPostPipeline();
      this.crow?.destroy();
      this.sparkles.forEach((sparkle) => sparkle.destroy());
      this.backgroundImage?.destroy();
      this.arenaGraphics?.destroy();
      this.clearBoardSprites();
    });
  }

  update(_time: number, delta: number): void {
    if (this.postFx) {
      this.postFx.time = this.time.now / 1000;
    }

    if (!this.busy) {
      const clockUpdate = this.controller.advanceClock(delta);

      if (clockUpdate.changed) {
        this.currentState = clockUpdate.state;

        if (clockUpdate.displayedSecondChanged || clockUpdate.becameComplete) {
          this.hud.render(this.controller.getViewState());
        }

        if (clockUpdate.becameComplete) {
          this.clearDragState();
          this.spawnFloatingText('TIME!', this.layout.center, '#ffcf9c');
          this.cameras.main.flash(180, 255, 210, 160, false);
          void this.crow?.takeHit();
        }
      }
    }

    this.parallaxCurrent = Phaser.Math.Linear(this.parallaxCurrent, this.parallaxTarget, 0.08);

    if (this.backgroundImage) {
      this.backgroundImage.x = this.layout.center.x + this.parallaxCurrent * 0.12;
      this.backgroundImage.y = this.layout.center.y - this.layout.boardSize * 0.18;
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.busy || this.currentState.runComplete) {
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

    if (
      this.currentState.runComplete ||
      !this.dragState ||
      this.dragState.pointerId !== pointer.id ||
      !pointer.isDown
    ) {
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
    if (this.busy || this.currentState.runComplete) {
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
      this.currentState = result.state;
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

    if (result.result) {
      await this.playBoardResolution(result.result);
    }

    this.realignBoardSprites(this.currentState.board);
    this.syncCrowToState();
    this.hud.render(this.controller.getViewState());
    this.hud.setStatus(this.currentState.lastMessage);
    this.busy = false;
  }

  private async playBoardResolution(result: BoardResolutionResult): Promise<void> {
    for (const step of result.steps) {
      await this.animateBoardStep(step);
    }

    if (result.reshuffled && result.reshuffleMoves.length > 0) {
      await this.animateReshuffle(result.reshuffleMoves);
    }
  }

  private async animateBoardStep(step: BoardResolveStep): Promise<void> {
    const centroid = getCentroid(step.clearedCells.map((cell) => this.cellToPoint(cell)));

    if (step.bigMatch) {
      await this.crow?.flyTo(centroid);
      this.emitFeathers(centroid);
      this.triggerBigMatchImpact(centroid);
      await waitMs(78);
    } else {
      await this.crow?.hop(6, 180);
    }

    void playClearPop(this, step.clearedTileIds.length);
    this.spawnFloatingText(`+${step.scoreDelta}`, centroid, '#ffe68a');

    if (step.bonusTimeMs > 0) {
      this.spawnFloatingText(
        `+${formatBonusSeconds(step.bonusTimeMs)}s`,
        new Phaser.Math.Vector2(centroid.x, centroid.y - this.layout.tileSize * 0.36),
        '#9ff6ff',
      );
      this.hud.pulseTimer(step.bonusTimeMs);
    }

    await this.clearMatchedTiles(step.clearedTileIds);
    await this.animateDrops(step.droppedTiles, step.spawnedTiles);
    this.emitSparkles(
      centroid,
      step.bigMatch
        ? {
            alpha: 0.85,
            count: 6,
            depth: 54,
            duration: 320,
            scaleMultiplier: 1.3,
            spreadX: 26,
            spreadY: 24,
          }
        : undefined,
    );

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

  private async animateDrops(droppedTiles: TileMove[], spawnedTiles: SpawnedTile[]): Promise<void> {
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

  private resetBoard(board: BoardState): void {
    this.clearBoardSprites();

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

  private realignBoardSprites(board: BoardState): void {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const tile = board.grid[row][col];

        if (!tile) {
          continue;
        }

        const sprite = this.tileSprites.get(tile.id);

        if (!sprite) {
          continue;
        }

        const point = this.cellToPoint({ row, col });
        sprite.setPosition(point.x, point.y);
      }
    }
  }

  private clearBoardSprites(): void {
    this.tileSprites.forEach((sprite) => sprite.destroy());
    this.tileSprites.clear();
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

  private emitSparkles(point: Phaser.Math.Vector2, options: SparkleBurstOptions = {}): void {
    const count = options.count ?? 3;
    const spreadX = options.spreadX ?? 18;
    const spreadY = options.spreadY ?? 18;
    const depth = options.depth ?? 48;
    const alpha = options.alpha ?? 0.7;
    const duration = options.duration ?? 260;
    const scaleMultiplier = options.scaleMultiplier ?? 1;

    for (let index = 0; index < count; index += 1) {
      const sparkle = this.add
        .image(point.x, point.y, FX_TEXTURE_KEYS.sparkle)
        .setDepth(depth)
        .setScale((this.layout.tileSize / 52) * scaleMultiplier * (0.94 + index * 0.03))
        .setAlpha(alpha);

      this.tweens.add({
        targets: sparkle,
        x: point.x + Phaser.Math.Between(-spreadX, spreadX),
        y: point.y + Phaser.Math.Between(-spreadY, Math.round(spreadY * 0.55)),
        alpha: 0,
        scale: sparkle.scale * 1.4,
        duration,
        ease: 'Quad.Out',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private triggerBigMatchImpact(point: Phaser.Math.Vector2): void {
    this.flashBigMatchArea(point);
    this.emitSparkles(point, {
      alpha: 0.95,
      count: 8,
      depth: 55,
      duration: 360,
      scaleMultiplier: 1.42,
      spreadX: 30,
      spreadY: 28,
    });
    this.spawnBigMatchCallout('BIG MATCH', point);
    void playBigMatchCue(this);
    this.punchCameraZoom();
    this.cameras.main.shake(140, 0.0042);
  }

  private flashBigMatchArea(point: Phaser.Math.Vector2): void {
    const darkener = this.add
      .rectangle(
        this.layout.center.x,
        this.layout.center.y,
        this.layout.boardSize,
        this.layout.boardSize,
        0x0d0814,
        0.28,
      )
      .setDepth(34);
    const glow = this.add
      .circle(point.x, point.y, this.layout.tileSize * 0.72, 0xfff1bc, 0.25)
      .setDepth(35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const innerRing = this.add
      .circle(point.x, point.y, this.layout.tileSize * 0.42)
      .setDepth(36)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setStrokeStyle(Math.max(2, Math.round(this.layout.tileSize * 0.1)), 0xffffff, 0.92);
    const outerRing = this.add
      .circle(point.x, point.y, this.layout.tileSize * 0.82)
      .setDepth(35)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setStrokeStyle(Math.max(3, Math.round(this.layout.tileSize * 0.12)), 0xffd76f, 0.84);

    this.tweens.add({
      targets: [darkener, glow, innerRing, outerRing],
      alpha: 0,
      duration: 160,
      ease: 'Quad.Out',
      onComplete: () => {
        darkener.destroy();
        glow.destroy();
        innerRing.destroy();
        outerRing.destroy();
      },
    });

    this.tweens.add({
      targets: [glow, innerRing, outerRing],
      scale: 1.24,
      duration: 160,
      ease: 'Quad.Out',
    });
  }

  private spawnBigMatchCallout(
    text: string,
    point: Phaser.Math.Vector2,
    color = '#fff0ae',
    fontSize = Math.max(16, Math.round(this.layout.tileSize * 0.34)),
  ): void {
    const label = this.add
      .text(point.x, point.y, text, {
        fontFamily: '"Press Start 2P"',
        fontSize: `${fontSize}px`,
        color,
        align: 'center',
        stroke: '#160d1b',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(64)
      .setAlpha(0);

    this.tweens.add({
      targets: label,
      y: point.y - this.layout.tileSize * 0.52,
      alpha: 1,
      duration: 110,
      ease: 'Quad.Out',
      yoyo: true,
      hold: 180,
      onComplete: () => label.destroy(),
    });
  }

  private punchCameraZoom(): void {
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.zoom = 1;
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.035,
      duration: 90,
      ease: 'Quad.Out',
      yoyo: true,
    });
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

  private syncCrowToState(): void {
    if (!this.crow) {
      return;
    }

    this.crow.setPerch(this.layout.crowPerch);
    this.crow.setScale(this.layout.tileSize / 16);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const width = gameSize.width;
    const height = gameSize.height;
    const isCramped = width <= 360 || height <= 420;
    const isPhone = width <= 520;
    const horizontalInset = isCramped ? 10 : isPhone ? 14 : 18;
    const verticalInset = isCramped ? 8 : isPhone ? 12 : 16;
    const verticalUnits = GRID_SIZE + (isCramped ? 1.9 : isPhone ? 2.1 : 2.35);
    const widthBound = Math.floor((width - horizontalInset * 2) / GRID_SIZE);
    const heightBound = Math.floor((height - verticalInset * 2) / verticalUnits);
    const tileSize = Phaser.Math.Clamp(Math.min(widthBound, heightBound), 20, 64);
    const boardSize = tileSize * GRID_SIZE;
    const crowBand = tileSize * (isCramped ? 1.7 : isPhone ? 1.9 : 2.05);
    const contentHeight = boardSize + crowBand;
    const contentTop = Math.round((height - contentHeight) / 2);
    const boardY = Math.round(contentTop + tileSize * (isCramped ? 0.72 : isPhone ? 0.82 : 0.92));

    this.layout = {
      boardX: Math.round((width - boardSize) / 2),
      boardY,
      boardSize,
      tileSize,
      crowPerch: new Phaser.Math.Vector2(
        Math.round(width / 2),
        Math.round(boardY + boardSize + tileSize * (isCramped ? 0.34 : isPhone ? 0.4 : 0.48)),
      ),
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

    this.realignBoardSprites(this.currentState.board);
    this.syncCrowToState();
  }

  private drawBackdrop(width: number, height: number): void {
    if (!this.backgroundImage) {
      return;
    }

    this.cameras.main.setBackgroundColor('#120f1e');
    const texture = this.textures.get(BACKGROUND_TEXTURE_KEYS.duskForest);
    const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;

    if (!source) {
      return;
    }

    const scale = Math.max(width / source.width, height / source.height);

    this.backgroundImage.setDisplaySize(source.width * scale, source.height * scale);
    this.backgroundImage.setPosition(width / 2, height / 2);
  }

  private drawArena(width: number, height: number): void {
    if (!this.arenaGraphics) {
      return;
    }

    const { boardX, boardY, boardSize, tileSize, crowPerch, center } = this.layout;
    const pixel = Math.max(4, Math.floor(tileSize / 4));

    this.arenaGraphics.clear();
    this.arenaGraphics.fillStyle(0x8b7ab1, 0.18);
    this.arenaGraphics.fillRect(
      Math.round(center.x - boardSize * 0.68),
      Math.round(center.y - boardSize * 0.56),
      Math.round(boardSize * 1.36),
      Math.round(boardSize * 1.12),
    );

    this.arenaGraphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.fill).color,
      0.92,
    );
    this.arenaGraphics.fillRect(
      Math.round(boardX - tileSize * 0.4),
      Math.round(boardY - tileSize * 0.4),
      Math.round(boardSize + tileSize * 0.8),
      Math.round(boardSize + tileSize * 0.8),
    );
    this.arenaGraphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.inner).color,
      1,
    );
    this.arenaGraphics.fillRect(boardX, boardY, boardSize, boardSize);
    this.arenaGraphics.lineStyle(
      Math.max(3, pixel),
      Phaser.Display.Color.HexStringToColor(BOARD_COLORS.border).color,
      1,
    );
    this.arenaGraphics.strokeRect(boardX, boardY, boardSize, boardSize);

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = boardX + col * tileSize;
        const y = boardY + row * tileSize;
        const cellColor = (row + col) % 2 === 0 ? BOARD_COLORS.cell : BOARD_COLORS.cellShadow;
        this.arenaGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(cellColor).color, 0.86);
        this.arenaGraphics.fillRect(
          Math.round(x + tileSize * 0.06),
          Math.round(y + tileSize * 0.06),
          Math.round(tileSize * 0.88),
          Math.round(tileSize * 0.88),
        );
      }
    }

    this.drawPerch(crowPerch, tileSize, BOARD_COLORS.playerPerch, BOARD_COLORS.playerPerchShadow);

    this.drawPixelGlow(
      Math.round(width * 0.78),
      Math.round(Math.max(tileSize * 1.2, height * 0.12)),
      Math.max(tileSize * 0.68, 16),
      0xfce59a,
      0.14,
    );
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
    this.arenaGraphics.fillRect(
      Math.round(perch.x - tileSize * 0.56),
      Math.round(perch.y + tileSize * 0.08),
      Math.round(tileSize * 1.12),
      Math.round(tileSize * 0.22),
    );
    this.arenaGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1);
    this.arenaGraphics.fillRect(
      Math.round(perch.x - tileSize * 0.5),
      Math.round(perch.y),
      Math.round(tileSize),
      Math.round(tileSize * 0.16),
    );
  }

  private drawPixelGlow(
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
  ): void {
    if (!this.arenaGraphics) {
      return;
    }

    const block = Math.max(4, Math.round(size / 4));
    const half = Math.round(size / 2);

    this.arenaGraphics.fillStyle(color, alpha);
    for (let row = -half; row <= half; row += block) {
      for (let col = -half; col <= half; col += block) {
        if (Math.abs(row) + Math.abs(col) > size) {
          continue;
        }

        this.arenaGraphics.fillRect(x + col, y + row, block, block);
      }
    }
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
    return cell.row >= 0 && cell.row < GRID_SIZE && cell.col >= 0 && cell.col < GRID_SIZE;
  }
}

function getCentroid(points: Phaser.Math.Vector2[]): Phaser.Math.Vector2 {
  if (points.length === 0) {
    return new Phaser.Math.Vector2(0, 0);
  }

  const total = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return new Phaser.Math.Vector2(total.x / points.length, total.y / points.length);
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

function waitMs(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function formatBonusSeconds(bonusTimeMs: number): string {
  const seconds = bonusTimeMs / 1_000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1).replace(/\.0$/, '');
}
