import Phaser from 'phaser';
import { CrowsCacheGame } from '../../game/CrowsCacheGame.ts';
import {
  BACKGROUND_TEXTURE_KEYS,
  BOARD_COLORS,
  ENEMY_TEXTURE_KEYS,
  TILE_TEXTURE_KEYS,
  getEnemyAttackTextureKey,
  getEnemyAttackTexturePath,
  getEnemyTextureSpec,
  getEnemyTexturePath,
} from '../../game/assets/manifest.ts';
import type { CampaignEvent, CampaignRunState } from '../../game/simulation/engine.ts';
import {
  GRID_SIZE,
  type BoardResolutionResult,
  type BoardState,
  type Cell,
  type SpawnedTile,
  type Tile,
  type TileMove,
} from '../../game/simulation/types.ts';
import type { GameHud } from '../../ui/createHud.ts';
import { CrowActor } from '../view/CrowActor.ts';
import { EnemyActor } from '../view/EnemyActor.ts';
import {
  CROWAXID_BEAT_INTERVAL_MS,
  ensureCrowaxidMusic,
  onCrowaxidMusic,
  stopCrowaxidMusic,
} from '../view/MatchCrowMusic.ts';
import {
  playBigMatchCue,
  playClearPop,
  playCombatImpactCue,
  playSupportCue,
} from '../view/MatchCrowSfx.ts';
import {
  createHeartGraphic,
  pickHeartAccentColor,
  pickHeartTextVariant,
} from '../view/heartFx.ts';

interface ArenaLayout {
  boardX: number;
  boardY: number;
  boardSize: number;
  tileSize: number;
  crowPerch: Phaser.Math.Vector2;
  enemyPerches: Phaser.Math.Vector2[];
}

interface DragState {
  cell: Cell;
  startX: number;
  startY: number;
  pointerId: number;
}

interface ActiveMusicNote {
  container: Phaser.GameObjects.Container;
  pulseGraphic: Phaser.GameObjects.Graphics;
  accentHeart?: Phaser.GameObjects.Graphics;
  morphHeart?: Phaser.GameObjects.Graphics;
  baseScale: number;
  pulseTween?: Phaser.Tweens.Tween;
  riseTween?: Phaser.Tweens.Tween;
  swayTween?: Phaser.Tweens.Tween;
  morphTween?: Phaser.Tweens.Tween;
}

type FloatingTextKind =
  | 'score'
  | 'bonus'
  | 'shield'
  | 'heal'
  | 'enemy-damage'
  | 'player-damage'
  | 'enemy-support'
  | 'generic';

interface FloatingTextOptions {
  kind?: FloatingTextKind;
  heartGlimpseChance?: number;
}

const MUSIC_NOTE_COLORS = ['#ffcf6b', '#ff87c9', '#7dd8ff', '#94f7a9', '#c1a2ff'];
const ENEMY_DAMAGE_TEXT_COLOR = '#ffc8dc';

function createEnemyTextureKeyMap(): Record<string, string> {
  return Object.fromEntries(ENEMY_TEXTURE_KEYS.map((enemyId) => [enemyId, enemyId]));
}

function createEnemyAttackTextureKeyMap(): Record<string, string | null> {
  return Object.fromEntries(
    ENEMY_TEXTURE_KEYS.map((enemyId) => {
      const textureSpec = getEnemyTextureSpec(enemyId);
      return [enemyId, textureSpec.attackTexture ? getEnemyAttackTextureKey(enemyId) : null];
    }),
  );
}

export class GameScene extends Phaser.Scene {
  private readonly controller: CrowsCacheGame;
  private readonly hud: GameHud;
  private currentState: CampaignRunState;
  private readonly tileSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly enemyActors = new Map<string, EnemyActor>();
  private enemyTextureKeys = createEnemyTextureKeyMap();
  private enemyAttackTextureKeys = createEnemyAttackTextureKeyMap();
  private layout: ArenaLayout = {
    boardX: 0,
    boardY: 0,
    boardSize: 0,
    tileSize: 0,
    crowPerch: new Phaser.Math.Vector2(0, 0),
    enemyPerches: [],
  };
  private backgroundImage?: Phaser.GameObjects.Image;
  private arenaGraphics?: Phaser.GameObjects.Graphics;
  private crow?: CrowActor;
  private dragState: DragState | null = null;
  private busy = false;
  private readonly activeMusicNotes = new Set<ActiveMusicNote>();
  private musicPlaying = false;
  private musicNoteSpawnTimer?: Phaser.Time.TimerEvent;
  private removeMusicListener?: () => void;
  private removeRestartListener?: () => void;

  constructor(controller: CrowsCacheGame, hud: GameHud) {
    super('game');
    this.controller = controller;
    this.hud = hud;
    this.currentState = controller.getState();
  }

  refreshState(): void {
    this.currentState = this.controller.getState();
    this.syncEnemiesToState();
  }

  ensureBackgroundMusic(): void {
    ensureCrowaxidMusic(this);
  }

  create(): void {
    this.currentState = this.controller.getState();
    this.backgroundImage = this.add.image(0, 0, BACKGROUND_TEXTURE_KEYS.duskForest).setDepth(-40);
    this.arenaGraphics = this.add.graphics().setDepth(-10);
    this.crow = new CrowActor(this, new Phaser.Math.Vector2());
    this.removeMusicListener = onCrowaxidMusic(this, {
      onPlaybackStateChange: (isPlaying) => {
        this.handleMusicPlaybackChange(isPlaying);
      },
      onBeat: () => {
        this.handleMusicBeat();
      },
    });
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.clearDragState, this);
    this.input.on('pointerupoutside', this.clearDragState, this);
    this.scale.on('resize', this.handleResize, this);
    this.handleResize(this.scale.gameSize);
    this.resetBoard(this.currentState.board);
    void this.reloadEnemyTextures().then(() => {
      this.syncEnemiesToState();
    });
    this.syncCrowToState();
    this.hud.render(this.controller.getViewState());
    this.removeRestartListener = this.controller.onRestart((state) => {
      this.busy = false;
      this.clearDragState();
      this.currentState = state;
      this.resetBoard(state.board);
      this.enemyActors.forEach((actor) => actor.destroy());
      this.enemyActors.clear();
      void this.reloadEnemyTextures().then(() => {
        this.syncEnemiesToState();
      });
      this.syncCrowToState();
      this.hud.render(this.controller.getViewState());
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeMusicListener?.();
      this.removeMusicListener = undefined;
      this.removeRestartListener?.();
      this.stopMusicNoteSpawner();
      this.clearMusicNotes();
      stopCrowaxidMusic(this);
      this.crow?.destroy();
      this.enemyActors.forEach((actor) => actor.destroy());
      this.enemyActors.clear();
      this.clearReloadedEnemyTextures();
      this.backgroundImage?.destroy();
      this.arenaGraphics?.destroy();
      this.clearBoardSprites();
    });
  }

  update(_time: number, delta: number): void {
    if (this.busy) {
      return;
    }

    const clockUpdate = this.controller.advanceClock(delta);

    if (clockUpdate.changed) {
      this.currentState = clockUpdate.state;
      this.hud.render(this.controller.getViewState());
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.ensureBackgroundMusic();

    if (this.busy || this.currentState.phase !== 'battle') {
      return;
    }

    const cell = this.pointerToCell(pointer.x, pointer.y);

    if (!cell) {
      return;
    }

    this.dragState = { cell, startX: pointer.x, startY: pointer.y, pointerId: pointer.id };
  }

  private handleMusicPlaybackChange(isPlaying: boolean): void {
    this.musicPlaying = isPlaying;

    if (isPlaying) {
      this.startMusicNoteSpawner();
      this.spawnMusicNote();
      this.spawnMusicNote();
      this.spawnMusicNote();
      return;
    }

    this.stopMusicNoteSpawner();
    this.fadeOutMusicNotes();
  }

  private handleMusicBeat(): void {
    if (!this.musicPlaying) {
      return;
    }

    this.activeMusicNotes.forEach((note) => {
      note.pulseTween?.remove();
      note.pulseGraphic.setScale(note.baseScale);
      note.accentHeart?.setScale(note.baseScale);
      note.pulseTween = this.tweens.add({
        targets: [note.pulseGraphic, note.accentHeart].filter(Boolean),
        scaleX: note.baseScale * 1.28,
        scaleY: note.baseScale * 1.28,
        duration: Math.round(CROWAXID_BEAT_INTERVAL_MS * 0.34),
        yoyo: true,
        ease: 'Sine.Out',
      });
    });

    const morphCandidates = Array.from(this.activeMusicNotes).filter(
      (note) => !note.morphTween && note.container.active,
    );

    if (morphCandidates.length > 0) {
      const selectedNote = Phaser.Utils.Array.GetRandom(morphCandidates);
      this.playMusicNoteHeartMorph(selectedNote);
    }

    if (this.activeMusicNotes.size < 9) {
      this.spawnMusicNote();
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (
      this.currentState.phase !== 'battle' ||
      !this.dragState ||
      this.dragState.pointerId !== pointer.id ||
      !pointer.isDown
    ) {
      return;
    }

    const deltaX = pointer.x - this.dragState.startX;
    const deltaY = pointer.y - this.dragState.startY;
    const threshold = this.layout.tileSize * 0.28;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) {
      return;
    }

    const from = this.dragState.cell;
    const direction =
      Math.abs(deltaX) > Math.abs(deltaY)
        ? { row: 0, col: deltaX > 0 ? 1 : -1 }
        : { row: deltaY > 0 ? 1 : -1, col: 0 };
    const to = { row: from.row + direction.row, col: from.col + direction.col };

    this.clearDragState();

    if (!this.isInsideBoard(to)) {
      return;
    }

    void this.performSwap(from, to);
  }

  private clearDragState(): void {
    this.dragState = null;
  }

  private async performSwap(from: Cell, to: Cell): Promise<void> {
    if (this.busy || this.currentState.phase !== 'battle') {
      return;
    }

    const firstTile = this.currentState.board.grid[from.row][from.col];
    const secondTile = this.currentState.board.grid[to.row][to.col];

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
      this.hud.render(this.controller.getViewState());

      if (result.reason?.includes('match')) {
        await Promise.all([
          tweenPromise(this, { targets: firstSprite, x: this.cellToPoint(to).x, y: this.cellToPoint(to).y, duration: 110, yoyo: true }),
          tweenPromise(this, { targets: secondSprite, x: this.cellToPoint(from).x, y: this.cellToPoint(from).y, duration: 110, yoyo: true }),
        ]);
      }

      this.busy = false;
      return;
    }

    this.currentState = result.state;
    await Promise.all([
      tweenPromise(this, { targets: firstSprite, x: this.cellToPoint(to).x, y: this.cellToPoint(to).y, duration: 140 }),
      tweenPromise(this, { targets: secondSprite, x: this.cellToPoint(from).x, y: this.cellToPoint(from).y, duration: 140 }),
    ]);

    if (result.boardResult) {
      await this.playBoardResolution(result.boardResult);
    }

    await this.playCombatEvents(result.events);

    if (result.battleAdvanced) {
      this.resetBoard(this.currentState.board);
    } else {
      this.realignBoardSprites(this.currentState.board);
    }

    this.syncEnemiesToState();
    this.syncCrowToState();
    this.hud.render(this.controller.getViewState());
    this.busy = false;
  }

  private async playBoardResolution(result: BoardResolutionResult): Promise<void> {
    for (const step of result.steps) {
      const point = getCentroid(step.clearedCells.map((cell) => this.cellToPoint(cell)));
      this.spawnFloatingText(`+${step.scoreDelta}`, point, '#ffe68a', { kind: 'score' });
      if (step.bigMatch) {
        void playBigMatchCue(this);
      }
      void playClearPop(this, step.clearedTileIds.length);
      await this.clearMatchedTiles(step.clearedTileIds);
      await this.animateDrops(step.droppedTiles, step.spawnedTiles);

    }

    if (result.reshuffled) {
      await Promise.all(
        result.reshuffleMoves.map((move) => {
          const sprite = this.tileSprites.get(move.tileId);
          return sprite
            ? tweenPromise(this, { targets: sprite, x: this.cellToPoint(move.to).x, y: this.cellToPoint(move.to).y, duration: 200 })
            : Promise.resolve();
        }),
      );
    }
  }

  private async playCombatEvents(events: CampaignEvent[]): Promise<void> {
    let activeTarget: EnemyActor | undefined;

    for (const event of events) {
      if (event.type === 'player-action') {
        if (event.action === 'attack' && event.targetId) {
          activeTarget = this.enemyActors.get(event.targetId);

          if (activeTarget && this.crow) {
            await this.crow.flyTo(activeTarget.getFocusPoint());
          }
        } else if (event.action === 'defend') {
          await this.crow?.hop(8, 220);
        } else if (event.action === 'heal') {
          await this.crow?.celebrate();
        }
        continue;
      }

      if (event.type === 'enemy-damaged') {
        const actor = this.enemyActors.get(event.enemyId);

        if (actor) {
          const impactPoint = actor.getFocusPoint();
          await actor.takeHit();
          void playCombatImpactCue(this, 0.9 + event.amount / 18);
          this.spawnLoveBurst(impactPoint, event.amount + event.blocked, event.defeated);
          this.spawnFloatingText(
            `${pickHeartTextVariant()} ${event.amount + event.blocked}`,
            impactPoint.clone().add(new Phaser.Math.Vector2(0, -this.layout.tileSize * 0.12)),
            ENEMY_DAMAGE_TEXT_COLOR,
            { kind: 'enemy-damage', heartGlimpseChance: 0 },
          );

          if (event.defeated) {
            await actor.faint();
            actor.destroy();
            this.enemyActors.delete(event.enemyId);
          }
        }

        if (activeTarget) {
          activeTarget = undefined;
          await this.crow?.returnHome();
        }
        continue;
      }

      if (event.type === 'enemy-action') {
        const actor = this.enemyActors.get(event.enemyId);

        if (!actor) {
          continue;
        }

        if (event.intentType === 'attack' && this.crow) {
          await actor.strikeAt(this.crow.getFocusPoint());
        } else if (event.intentType === 'guard') {
          await actor.brace();
        }
        continue;
      }

      if (event.type === 'player-damaged') {
        this.hud.pulsePlayerDamage();
        await this.crow?.takeHit();
        void playCombatImpactCue(this, 1 + event.amount / 16);
        this.spawnFloatingText(
          `-${event.amount + event.blocked}`,
          this.crow?.getFocusPoint() ?? this.layout.crowPerch,
          '#ffcf9c',
          { kind: 'player-damage', heartGlimpseChance: 0 },
        );
        continue;
      }

      if (event.type === 'player-shield') {
        void playSupportCue(this, 'shield', 0.8 + event.amount / 16);
        this.spawnFloatingText(
          `+${event.amount} SH`,
          this.crow?.getFocusPoint() ?? this.layout.crowPerch,
          '#9ff6ff',
          { kind: 'shield' },
        );
        continue;
      }

      if (event.type === 'player-heal') {
        void playSupportCue(this, 'heal', 0.8 + event.amount / 18);
        this.spawnFloatingText(
          `+${event.amount} HP`,
          this.crow?.getFocusPoint() ?? this.layout.crowPerch,
          '#bff39f',
          { kind: 'heal' },
        );
        continue;
      }

      if (event.type === 'enemy-shield' || event.type === 'enemy-heal') {
        const actor = this.enemyActors.get(event.enemyId);

        if (actor) {
          void playSupportCue(
            this,
            event.type === 'enemy-shield' ? 'shield' : 'heal',
            0.75 + event.amount / 20,
          );
          this.spawnFloatingText(
            `${event.type === 'enemy-shield' ? '+' + event.amount + ' SH' : '+' + event.amount + ' HP'}`,
            actor.getFocusPoint(),
            event.type === 'enemy-shield' ? '#9ff6ff' : '#bff39f',
            { kind: event.type === 'enemy-shield' ? 'shield' : 'heal' },
          );
        }
        continue;
      }

      if (event.type === 'timer') {
        this.hud.pulseTimer(event.amount);
        continue;
      }

      if (event.type === 'battle-cleared') {
        this.spawnFloatingText(
          `+${event.bonus}`,
          this.layout.crowPerch.clone().add(new Phaser.Math.Vector2(0, -50)),
          '#bff39f',
          { kind: 'bonus' },
        );
        await this.crow?.celebrate();
      }
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
        return tweenPromise(this, { targets: sprite, scale: sprite.scale * 0.2, alpha: 0, duration: 180 }).then(() => sprite.destroy());
      }),
    );
  }

  private async animateDrops(droppedTiles: TileMove[], spawnedTiles: SpawnedTile[]): Promise<void> {
    const dropTweens = droppedTiles.map((move) => {
      const sprite = this.tileSprites.get(move.tileId);
      return sprite
        ? tweenPromise(this, { targets: sprite, x: this.cellToPoint(move.to).x, y: this.cellToPoint(move.to).y, duration: 200 })
        : Promise.resolve();
    });
    const spawnTweens = spawnedTiles.map((spawn) => {
      const sprite = this.createTileSprite(spawn.tile, this.rowColToPoint(spawn.fromRow, spawn.to.col));
      this.tileSprites.set(spawn.tile.id, sprite);
      return tweenPromise(this, { targets: sprite, x: this.cellToPoint(spawn.to).x, y: this.cellToPoint(spawn.to).y, duration: 220 });
    });
    await Promise.all([...dropTweens, ...spawnTweens]);
  }

  private resetBoard(board: BoardState): void {
    this.clearBoardSprites();
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const tile = board.grid[row][col];
        if (!tile) {
          continue;
        }
        this.tileSprites.set(tile.id, this.createTileSprite(tile, this.cellToPoint({ row, col })));
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
        if (sprite) {
          const point = this.cellToPoint({ row, col });
          sprite.setPosition(point.x, point.y);
        }
      }
    }
  }

  private clearBoardSprites(): void {
    this.tileSprites.forEach((sprite) => sprite.destroy());
    this.tileSprites.clear();
  }

  private async reloadEnemyTextures(): Promise<void> {
    const cacheBust = `${Date.now()}`;
    this.clearReloadedEnemyTextures();
    const nextTextureKeys = createEnemyTextureKeyMap();
    const nextAttackTextureKeys = createEnemyAttackTextureKeyMap();

    await new Promise<void>((resolve) => {
      ENEMY_TEXTURE_KEYS.forEach((enemyId) => {
        const textureKey = `${enemyId}-${cacheBust}`;
        const textureSpec = getEnemyTextureSpec(enemyId);
        nextTextureKeys[enemyId] = textureKey;

        if (textureSpec.loadAs === 'spritesheet') {
          this.load.spritesheet(textureKey, getEnemyTexturePath(enemyId, cacheBust), {
            frameWidth: textureSpec.frameWidth ?? 32,
            frameHeight: textureSpec.frameHeight ?? 32,
            endFrame:
              textureSpec.frameCount && textureSpec.frameCount > 0
                ? textureSpec.frameCount - 1
                : undefined,
          });
        } else {
          this.load.image(textureKey, getEnemyTexturePath(enemyId, cacheBust));
        }

        const attackTexturePath = getEnemyAttackTexturePath(enemyId, cacheBust);

        if (textureSpec.attackTexture && attackTexturePath) {
          const attackTextureKey = `${getEnemyAttackTextureKey(enemyId)}-${cacheBust}`;
          nextAttackTextureKeys[enemyId] = attackTextureKey;
          this.load.spritesheet(attackTextureKey, attackTexturePath, {
            frameWidth: textureSpec.attackTexture.frameWidth,
            frameHeight: textureSpec.attackTexture.frameHeight,
            endFrame: Math.max(0, textureSpec.attackTexture.frameCount - 1),
          });
        }
      });

      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        ENEMY_TEXTURE_KEYS.forEach((enemyId) => {
          const textureKey = nextTextureKeys[enemyId];
          this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);

          const attackTextureKey = nextAttackTextureKeys[enemyId];

          if (attackTextureKey) {
            this.textures.get(attackTextureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
          }
        });
        this.enemyTextureKeys = nextTextureKeys;
        this.enemyAttackTextureKeys = nextAttackTextureKeys;
        resolve();
      });

      this.load.start();
    });
  }

  private clearReloadedEnemyTextures(): void {
    ENEMY_TEXTURE_KEYS.forEach((enemyId) => {
      const textureKey = this.enemyTextureKeys[enemyId];

      if (textureKey && textureKey !== enemyId && this.textures.exists(textureKey)) {
        const animationKey = `enemy-idle-${textureKey}`;

        if (this.anims.exists(animationKey)) {
          this.anims.remove(animationKey);
        }

        this.textures.remove(textureKey);
      }

      const attackTextureKey = this.enemyAttackTextureKeys[enemyId];

      if (attackTextureKey && attackTextureKey !== getEnemyAttackTextureKey(enemyId) && this.textures.exists(attackTextureKey)) {
        const attackAnimationKey = `enemy-attack-${attackTextureKey}`;

        if (this.anims.exists(attackAnimationKey)) {
          this.anims.remove(attackAnimationKey);
        }

        this.textures.remove(attackTextureKey);
      }
    });

    this.enemyTextureKeys = createEnemyTextureKeyMap();
    this.enemyAttackTextureKeys = createEnemyAttackTextureKeyMap();
  }

  private startMusicNoteSpawner(): void {
    if (this.musicNoteSpawnTimer) {
      return;
    }

    this.musicNoteSpawnTimer = this.time.addEvent({
      delay: Math.max(180, Math.round(CROWAXID_BEAT_INTERVAL_MS / 2)),
      loop: true,
      callback: () => {
        if (!this.musicPlaying || this.activeMusicNotes.size >= 12) {
          return;
        }

        this.spawnMusicNote();
      },
    });
  }

  private stopMusicNoteSpawner(): void {
    this.musicNoteSpawnTimer?.remove(false);
    this.musicNoteSpawnTimer = undefined;
  }

  private spawnMusicNote(): void {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;
    const x = Phaser.Math.Between(
      Math.round(width * 0.08),
      Math.round(width * 0.92),
    );
    const startY = height + Phaser.Math.Between(12, 40);
    const endY = Phaser.Math.Between(
      Math.round(height * 0.12),
      Math.round(height * 0.74),
    );
    const swayDistance = Phaser.Math.Between(12, 34);
    const riseDuration = Phaser.Math.Between(3800, 5600);
    const baseScale = Phaser.Math.FloatBetween(0.62, 1.12);
    const color = Phaser.Utils.Array.GetRandom(MUSIC_NOTE_COLORS);
    const noteVariant = Math.random() > 0.58 ? 'double' : 'single';
    const pulseGraphic = this.add.graphics();
    drawMusicNoteGraphic(pulseGraphic, color, noteVariant);
    pulseGraphic.setScale(baseScale);
    const accentHeart = Math.random() < 0.25
      ? this.createMusicNoteAccentHeart(noteVariant, baseScale)
      : undefined;

    const container = this.add
      .container(x, startY, [pulseGraphic, accentHeart].filter(Boolean) as Phaser.GameObjects.GameObject[])
      .setDepth(44)
      .setAlpha(0);
    container.setRotation(Phaser.Math.FloatBetween(-0.16, 0.16));

    const note: ActiveMusicNote = {
      container,
      pulseGraphic,
      accentHeart,
      baseScale,
    };
    this.activeMusicNotes.add(note);

    this.tweens.add({
      targets: container,
      alpha: 0.82,
      duration: 220,
      ease: 'Sine.Out',
    });

    note.riseTween = this.tweens.add({
      targets: container,
      y: endY,
      rotation: container.rotation + Phaser.Math.FloatBetween(-0.12, 0.12),
      duration: riseDuration,
      ease: 'Sine.Out',
      onComplete: () => {
        this.destroyMusicNote(note);
      },
    });

    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: Math.round(riseDuration * 0.64),
      duration: Math.round(riseDuration * 0.36),
      ease: 'Sine.In',
    });

    note.swayTween = this.tweens.add({
      targets: container,
      x: x + swayDistance * (Math.random() > 0.5 ? 1 : -1),
      duration: Phaser.Math.Between(900, 1500),
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private createMusicNoteAccentHeart(
    noteVariant: 'single' | 'double',
    baseScale: number,
  ): Phaser.GameObjects.Graphics {
    const heart = createHeartGraphic(this, {
      size: noteVariant === 'double' ? 11 : 10,
      fillColor: pickHeartAccentColor(),
      strokeColor: '#2c1835',
      fillAlpha: 0.92,
      strokeAlpha: 0.84,
      strokeWidth: 2,
    })
      .setPosition(noteVariant === 'double' ? 6 : -4, 8)
      .setScale(baseScale)
      .setRotation(Phaser.Math.FloatBetween(-0.18, 0.18))
      .setAlpha(0.84);

    return heart;
  }

  private playMusicNoteHeartMorph(note: ActiveMusicNote): void {
    const morphHeart =
      note.morphHeart ??
      createHeartGraphic(this, {
        size: 16,
        fillColor: pickHeartAccentColor(),
        strokeColor: '#fffaf8',
        fillAlpha: 0.98,
        strokeAlpha: 0.9,
        strokeWidth: 2,
      })
        .setPosition(0, 0)
        .setScale(note.baseScale * 0.48)
        .setAlpha(0);

    if (!note.morphHeart) {
      note.container.add(morphHeart);
      note.morphHeart = morphHeart;
    }

    morphHeart.setVisible(true);
    morphHeart.setAlpha(0);
    morphHeart.setScale(note.baseScale * 0.48);
    morphHeart.setRotation(Phaser.Math.FloatBetween(-0.24, 0.24));
    note.pulseGraphic.setAlpha(1);
    note.accentHeart?.setAlpha(0.84);
    note.morphTween?.remove();

    note.morphTween = this.tweens.add({
      targets: [morphHeart],
      alpha: 0.94,
      scaleX: note.baseScale * 1.06,
      scaleY: note.baseScale * 1.06,
      duration: Phaser.Math.Between(120, 180),
      yoyo: true,
      ease: 'Sine.InOut',
      onStart: () => {
        note.pulseGraphic.setAlpha(0.34);
        note.accentHeart?.setAlpha(0.24);
      },
      onComplete: () => {
        note.pulseGraphic.setAlpha(1);
        note.accentHeart?.setAlpha(0.84);
        morphHeart.setAlpha(0);
        morphHeart.setScale(note.baseScale * 0.48);
        note.morphTween = undefined;
      },
    });
  }

  private destroyMusicNote(note: ActiveMusicNote): void {
    note.pulseTween?.remove();
    note.riseTween?.remove();
    note.swayTween?.remove();
    note.morphTween?.remove();
    note.container.destroy(true);
    this.activeMusicNotes.delete(note);
  }

  private clearMusicNotes(): void {
    this.activeMusicNotes.forEach((note) => {
      note.pulseTween?.remove();
      note.riseTween?.remove();
      note.swayTween?.remove();
      note.morphTween?.remove();
      note.container.destroy(true);
    });
    this.activeMusicNotes.clear();
  }

  private fadeOutMusicNotes(): void {
    this.activeMusicNotes.forEach((note) => {
      note.pulseTween?.remove();
      note.riseTween?.remove();
      note.swayTween?.remove();
      note.morphTween?.remove();
      this.tweens.add({
        targets: note.container,
        alpha: 0,
        y: note.container.y - 28,
        duration: 220,
        ease: 'Sine.Out',
        onComplete: () => {
          this.destroyMusicNote(note);
        },
      });
    });
  }

  private syncEnemiesToState(): void {
    const livingEnemyIds = new Set(
      this.currentState.enemies.filter((enemy) => enemy.currentHp > 0).map((enemy) => enemy.id),
    );

    this.enemyActors.forEach((actor, enemyId) => {
      if (!livingEnemyIds.has(enemyId)) {
        actor.destroy();
        this.enemyActors.delete(enemyId);
      }
    });

    this.currentState.enemies.forEach((enemy, index) => {
      if (enemy.currentHp <= 0) {
        return;
      }

      const textureKey = this.enemyTextureKeys[enemy.enemyId] ?? enemy.enemyId;
      const attackTextureKey = this.enemyAttackTextureKeys[enemy.enemyId] ?? null;
      const perch = this.getEnemyPerch(enemy, index);
      let actor = this.enemyActors.get(enemy.id);

      if (!actor) {
        actor = new EnemyActor(
          this,
          perch,
          enemy.enemyId,
          textureKey,
          attackTextureKey,
        );
        this.enemyActors.set(enemy.id, actor);
      }

      actor.setEnemy(enemy.enemyId, textureKey, attackTextureKey);
      actor.setPerch(perch);
      actor.setScale(this.getEnemyScale(enemy));
    });
  }

  private syncCrowToState(): void {
    this.crow?.setPerch(this.layout.crowPerch);
    this.crow?.setScale(this.layout.tileSize / 19.5);
  }

  private createTileSprite(tile: Tile, point: Phaser.Math.Vector2): Phaser.GameObjects.Image {
    return this.add.image(point.x, point.y, TILE_TEXTURE_KEYS[tile.kind]).setOrigin(0.5).setDepth(10).setScale(this.layout.tileSize / 34);
  }

  private spawnFloatingText(
    text: string,
    point: Phaser.Math.Vector2,
    color: string,
    options: FloatingTextOptions = {},
  ): void {
    const label = this.add.text(point.x, point.y, text, {
      fontFamily: 'VT323',
      fontSize: `${Math.max(16, Math.round(this.layout.tileSize * 0.48))}px`,
      color,
      stroke: '#160d1b',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(60);

    const heartGlimpseChance =
      options.heartGlimpseChance ??
      ({
        score: 0.1,
        bonus: 0.1,
        shield: 0.06,
        heal: 0.06,
        'enemy-damage': 0,
        'player-damage': 0,
        'enemy-support': 0.06,
        generic: 0,
      } satisfies Record<FloatingTextKind, number>)[options.kind ?? 'generic'];

    if (heartGlimpseChance > 0 && Math.random() < heartGlimpseChance) {
      const actualText = text;
      const actualColor = color;
      label.setText(pickHeartTextVariant());
      label.setColor(pickHeartAccentColor());
      this.time.delayedCall(Phaser.Math.Between(90, 140), () => {
        if (!label.active) {
          return;
        }

        label.setText(actualText);
        label.setColor(actualColor);
      });
    }

    this.tweens.add({ targets: label, y: point.y - this.layout.tileSize * 0.65, alpha: 0, duration: 500, ease: 'Quad.Out', onComplete: () => label.destroy() });
  }

  private spawnLoveBurst(
    point: Phaser.Math.Vector2,
    intensity: number,
    defeated: boolean,
  ): void {
    const heartCount = Phaser.Math.Clamp(
      3 + Math.floor(intensity / 4) + (defeated ? 1 : 0),
      3,
      8,
    );

    for (let index = 0; index < heartCount; index += 1) {
      const heart = this.add
        .text(point.x, point.y, pickHeartTextVariant(), {
          fontFamily: 'VT323',
          fontSize: `${Math.max(14, Math.round(this.layout.tileSize * Phaser.Math.FloatBetween(0.36, 0.58)))}px`,
          color: pickHeartAccentColor(),
          stroke: '#2b1021',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(61)
        .setAlpha(0.96)
        .setRotation(Phaser.Math.FloatBetween(-0.28, 0.28));

      const offsetX = Phaser.Math.Between(
        -Math.round(this.layout.tileSize * 0.48),
        Math.round(this.layout.tileSize * 0.48),
      );
      const offsetY = Phaser.Math.Between(
        -Math.round(this.layout.tileSize * 0.38),
        Math.round(this.layout.tileSize * 0.12),
      );
      const riseY = Phaser.Math.Between(
        Math.round(this.layout.tileSize * 0.52),
        Math.round(this.layout.tileSize * 0.92),
      );
      const driftX = Phaser.Math.Between(
        -Math.round(this.layout.tileSize * 0.28),
        Math.round(this.layout.tileSize * 0.28),
      );
      const startScale = Phaser.Math.FloatBetween(0.72, 1.08);
      const endScale = startScale * Phaser.Math.FloatBetween(1.18, 1.42);

      heart.setPosition(point.x + offsetX, point.y + offsetY);
      heart.setScale(startScale);

      this.tweens.add({
        targets: heart,
        x: heart.x + driftX,
        y: heart.y - riseY,
        scale: endScale,
        alpha: 0,
        rotation: heart.rotation + Phaser.Math.FloatBetween(-0.22, 0.22),
        duration: Phaser.Math.Between(420, 680),
        delay: index * 28,
        ease: 'Quad.Out',
        onComplete: () => heart.destroy(),
      });
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const width = gameSize.width;
    const height = gameSize.height;
    const tileSize = Phaser.Math.Clamp(
      Math.min(Math.floor((width - 4) / GRID_SIZE), Math.floor((height - 4) / 9.35)),
      20,
      72,
    );
    const boardSize = tileSize * GRID_SIZE;
    const arenaHeight = boardSize + tileSize * 1.95;
    const arenaTop = Math.round((height - arenaHeight) / 2);
    const boardX = Math.round((width - boardSize) / 2);
    const boardY = Math.round(arenaTop + tileSize * 1.34);
    const centerX = Math.round(width / 2);
    this.layout = {
      boardX,
      boardY,
      boardSize,
      tileSize,
      crowPerch: new Phaser.Math.Vector2(centerX, Math.round(boardY + boardSize + tileSize * 0.2)),
      enemyPerches: [
        new Phaser.Math.Vector2(centerX - tileSize * 1.5, Math.round(boardY - tileSize * 0.38)),
        new Phaser.Math.Vector2(centerX + tileSize * 1.5, Math.round(boardY - tileSize * 0.38)),
      ],
    };
    this.drawBackdrop(width, height);
    this.drawArena();
    this.realignBoardSprites(this.currentState.board);
    this.syncEnemiesToState();
    this.syncCrowToState();
  }

  private drawBackdrop(width: number, height: number): void {
    if (!this.backgroundImage) {
      return;
    }
    const texture = this.textures.get(BACKGROUND_TEXTURE_KEYS.duskForest);
    const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!source) {
      return;
    }
    const scale = Math.max(width / source.width, height / source.height);
    this.backgroundImage.setDisplaySize(source.width * scale, source.height * scale);
    this.backgroundImage.setPosition(width / 2, height / 2);
  }

  private drawArena(): void {
    if (!this.arenaGraphics) {
      return;
    }
    const graphics = this.arenaGraphics;
    const { boardX, boardY, boardSize, tileSize, crowPerch } = this.layout;
    graphics.clear();
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(BOARD_COLORS.fill).color, 0.92);
    graphics.fillRect(boardX - tileSize * 0.4, boardY - tileSize * 0.4, boardSize + tileSize * 0.8, boardSize + tileSize * 0.8);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(BOARD_COLORS.inner).color, 1);
    graphics.fillRect(boardX, boardY, boardSize, boardSize);
    graphics.lineStyle(4, Phaser.Display.Color.HexStringToColor(BOARD_COLORS.border).color, 1);
    graphics.strokeRect(boardX, boardY, boardSize, boardSize);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = boardX + col * tileSize;
        const y = boardY + row * tileSize;
        const cellColor = (row + col) % 2 === 0 ? BOARD_COLORS.cell : BOARD_COLORS.cellShadow;
        graphics.fillStyle(Phaser.Display.Color.HexStringToColor(cellColor).color, 0.86);
        graphics.fillRect(x + tileSize * 0.06, y + tileSize * 0.06, tileSize * 0.88, tileSize * 0.88);
      }
    }
    this.currentState.enemies.forEach((enemy, index) => {
      if (enemy.currentHp <= 0 || getEnemyTextureSpec(enemy.enemyId).suppressPerch) {
        return;
      }

      const perch = this.getEnemyPerch(enemy, index);
      const fill = BOARD_COLORS.enemyPerch;
      const shadow = BOARD_COLORS.enemyPerchShadow;
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(shadow).color, 0.95);
      graphics.fillRect(perch.x - tileSize * 0.56, perch.y + tileSize * 0.08, tileSize * 1.12, tileSize * 0.22);
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1);
      graphics.fillRect(perch.x - tileSize * 0.5, perch.y, tileSize, tileSize * 0.16);
    });
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(BOARD_COLORS.playerPerchShadow).color, 0.95);
    graphics.fillRect(crowPerch.x - tileSize * 0.56, crowPerch.y + tileSize * 0.08, tileSize * 1.12, tileSize * 0.22);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(BOARD_COLORS.playerPerch).color, 1);
    graphics.fillRect(crowPerch.x - tileSize * 0.5, crowPerch.y, tileSize, tileSize * 0.16);
  }

  private getEnemyPerch(
    enemy: CampaignRunState['enemies'][number],
    index: number,
  ): Phaser.Math.Vector2 {
    const textureSpec = getEnemyTextureSpec(enemy.enemyId);

    if (textureSpec.boardHover) {
      return new Phaser.Math.Vector2(
        this.layout.boardX + this.layout.boardSize / 2,
        this.layout.boardY + this.layout.boardSize * (textureSpec.boardHoverYRatio ?? 0.22),
      );
    }

    return this.layout.enemyPerches[index] ?? new Phaser.Math.Vector2();
  }

  private getEnemyScale(enemy: CampaignRunState['enemies'][number]): number {
    const textureSpec = getEnemyTextureSpec(enemy.enemyId);

    if (textureSpec.boardHover) {
      return (this.layout.boardSize * (textureSpec.boardHoverScaleRatio ?? 0.58)) / (textureSpec.frameHeight ?? 450);
    }

    const sourceHeight = textureSpec.loadAs === 'spritesheet'
      ? (textureSpec.frameHeight ?? 32)
      : 32;
    const baseScale = (this.layout.tileSize * 1.52) / sourceHeight;

    return baseScale * (textureSpec.scaleMultiplier ?? 1);
  }

  private pointerToCell(x: number, y: number): Cell | null {
    const { boardX, boardY, boardSize, tileSize } = this.layout;
    if (x < boardX || y < boardY || x > boardX + boardSize || y > boardY + boardSize) {
      return null;
    }
    return { row: Math.floor((y - boardY) / tileSize), col: Math.floor((x - boardX) / tileSize) };
  }

  private cellToPoint(cell: Cell): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.layout.boardX + cell.col * this.layout.tileSize + this.layout.tileSize / 2,
      this.layout.boardY + cell.row * this.layout.tileSize + this.layout.tileSize / 2,
    );
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
  const total = points.reduce((sum, point) => sum.add(point), new Phaser.Math.Vector2());
  return total.scale(1 / points.length);
}

function drawMusicNoteGraphic(
  graphics: Phaser.GameObjects.Graphics,
  color: string,
  variant: 'single' | 'double',
): void {
  const fillColor = Phaser.Display.Color.HexStringToColor(color).color;
  const shadowColor = Phaser.Display.Color.HexStringToColor('#1a1022').color;

  graphics.clear();
  graphics.fillStyle(shadowColor, 0.34);

  if (variant === 'double') {
    graphics.fillEllipse(-10, 9, 12, 10);
    graphics.fillEllipse(7, 9, 12, 10);
    graphics.fillRect(-6, -18, 3, 28);
    graphics.fillRect(11, -18, 3, 28);
    graphics.fillTriangle(13, -18, 13, -6, 25, -10);
  } else {
    graphics.fillEllipse(-2, 9, 12, 10);
    graphics.fillRect(2, -20, 3, 30);
    graphics.fillTriangle(4, -20, 4, -8, 16, -12);
  }

  graphics.fillStyle(fillColor, 0.96);

  if (variant === 'double') {
    graphics.fillEllipse(-12, 7, 12, 10);
    graphics.fillEllipse(5, 7, 12, 10);
    graphics.fillRect(-8, -20, 3, 28);
    graphics.fillRect(9, -20, 3, 28);
    graphics.fillTriangle(11, -20, 11, -8, 23, -12);
  } else {
    graphics.fillEllipse(-4, 7, 12, 10);
    graphics.fillRect(0, -22, 3, 30);
    graphics.fillTriangle(2, -22, 2, -10, 14, -14);
  }
}

function tweenPromise(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}
