import Phaser from 'phaser';
import { BACKGROUND_MUSIC_PLAYLIST } from '../../game/assets/manifest.ts';

const MUSIC_STORAGE_KEY = 'matchcrow.music-enabled';
const CROWAXID_VOLUME = 0.3;
const CROWAXID_BPM = 118;
const CROWAXID_SILENCE_MS = 30_000;
export const CROWAXID_BEAT_INTERVAL_MS = Math.round(60_000 / CROWAXID_BPM);

const controllerByScene = new WeakMap<Phaser.Scene, CrowaxidMusicController>();
let musicEnabled = readStoredMusicEnabled();

export interface CrowaxidMusicListener {
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onBeat?: (beatIndex: number) => void;
}

export function ensureCrowaxidMusic(scene: Phaser.Scene): void {
  getOrCreateController(scene).ensureStarted();
}

export function isCrowaxidMusicEnabled(): boolean {
  return musicEnabled;
}

export function setCrowaxidMusicEnabled(scene: Phaser.Scene, enabled: boolean): boolean {
  musicEnabled = enabled;
  writeStoredMusicEnabled(enabled);
  getOrCreateController(scene).setEnabled(enabled);
  return musicEnabled;
}

export function canSkipCrowaxidMusic(): boolean {
  return BACKGROUND_MUSIC_PLAYLIST.length > 1;
}

export function skipCrowaxidMusic(scene: Phaser.Scene): boolean {
  return getOrCreateController(scene).skipToNextTrack();
}

export function onCrowaxidMusic(
  scene: Phaser.Scene,
  listener: CrowaxidMusicListener,
): () => void {
  return getOrCreateController(scene).subscribe(listener);
}

export function stopCrowaxidMusic(scene: Phaser.Scene): void {
  controllerByScene.get(scene)?.dispose();
  controllerByScene.delete(scene);
}

class CrowaxidMusicController {
  private readonly scene: Phaser.Scene;
  private readonly playlist: readonly string[];
  private readonly volume: number;
  private readonly silenceMs: number;
  private activeSound?: Phaser.Sound.BaseSound;
  private beatTimer?: Phaser.Time.TimerEvent;
  private silenceTimer?: Phaser.Time.TimerEvent;
  private readonly listeners = new Set<CrowaxidMusicListener>();
  private started = false;
  private disposed = false;
  private beatIndex = 0;
  private enabled = musicEnabled;
  private currentTrackIndex = 0;

  constructor(
    scene: Phaser.Scene,
    playlist: readonly string[],
    volume = CROWAXID_VOLUME,
    silenceMs = CROWAXID_SILENCE_MS,
  ) {
    this.scene = scene;
    this.playlist = playlist;
    this.volume = volume;
    this.silenceMs = silenceMs;
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  subscribe(listener: CrowaxidMusicListener): () => void {
    this.listeners.add(listener);
    listener.onPlaybackStateChange?.(this.enabled && Boolean(this.activeSound?.isPlaying));

    return () => {
      this.listeners.delete(listener);
    };
  }

  ensureStarted(): void {
    if (this.started || this.disposed) {
      return;
    }

    this.started = true;
    if (this.enabled) {
      this.playTrack();
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;

    if (!enabled) {
      this.stopPlayback();
      return;
    }

    if (this.started) {
      this.playTrack();
    }
  }

  skipToNextTrack(): boolean {
    if (this.disposed || this.playlist.length < 2) {
      return false;
    }

    this.started = true;
    this.advanceTrack();
    this.silenceTimer?.remove(false);
    this.silenceTimer = undefined;

    if (!this.enabled) {
      return true;
    }

    this.stopPlayback();
    this.playTrack();
    return true;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stopBeatTimer();
    this.silenceTimer?.remove(false);
    this.silenceTimer = undefined;
    this.activeSound?.destroy();
    this.activeSound = undefined;
    this.emitPlaybackState(false);
  }

  private playTrack(): void {
    if (this.disposed || !this.enabled || this.activeSound || this.playlist.length === 0) {
      return;
    }

    if (this.scene.sound.locked) {
      this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, this.playTrack, this);
      return;
    }

    const sound = this.scene.sound.add(this.playlist[this.currentTrackIndex], {
      loop: false,
      volume: this.volume,
    });

    this.activeSound = sound;
    sound.once(Phaser.Sound.Events.COMPLETE, this.handleComplete, this);

    if (!sound.play()) {
      sound.destroy();
      this.activeSound = undefined;
      this.stopBeatTimer();
      this.emitPlaybackState(false);
      return;
    }

    this.emitPlaybackState(true);
    this.startBeatTimer();
  }

  private handleComplete(): void {
    this.advanceTrack();
    this.stopPlayback();

    if (this.disposed || !this.enabled) {
      return;
    }

    this.silenceTimer?.remove(false);
    this.silenceTimer = this.scene.time.delayedCall(this.silenceMs, () => {
      this.silenceTimer = undefined;
      this.playTrack();
    });
  }

  private advanceTrack(): void {
    if (this.playlist.length === 0) {
      return;
    }

    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
  }

  private startBeatTimer(): void {
    this.stopBeatTimer();
    this.beatIndex = 0;
    this.emitBeat();
    this.beatTimer = this.scene.time.addEvent({
      delay: CROWAXID_BEAT_INTERVAL_MS,
      loop: true,
      callback: () => {
        this.emitBeat();
      },
    });
  }

  private stopBeatTimer(): void {
    this.beatTimer?.remove(false);
    this.beatTimer = undefined;
  }

  private stopPlayback(): void {
    this.stopBeatTimer();
    this.silenceTimer?.remove(false);
    this.silenceTimer = undefined;

    if (this.activeSound) {
      if (this.activeSound.isPlaying) {
        this.activeSound.stop();
      }
      this.activeSound.destroy();
      this.activeSound = undefined;
    }

    this.emitPlaybackState(false);
  }

  private emitPlaybackState(isPlaying: boolean): void {
    this.listeners.forEach((listener) => {
      listener.onPlaybackStateChange?.(isPlaying);
    });
  }

  private emitBeat(): void {
    const nextBeat = this.beatIndex;
    this.beatIndex += 1;
    this.listeners.forEach((listener) => {
      listener.onBeat?.(nextBeat);
    });
  }
}

function getOrCreateController(scene: Phaser.Scene): CrowaxidMusicController {
  let controller = controllerByScene.get(scene);

  if (!controller) {
    controller = new CrowaxidMusicController(scene, BACKGROUND_MUSIC_PLAYLIST);
    controllerByScene.set(scene, controller);
  }

  return controller;
}

function readStoredMusicEnabled(): boolean {
  try {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(MUSIC_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeStoredMusicEnabled(enabled: boolean): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures.
  }
}
