import Phaser from 'phaser';

type WebAudioManager = Phaser.Sound.WebAudioSoundManager & {
  context?: AudioContext;
};

export async function playBigMatchCue(scene: Phaser.Scene): Promise<void> {
  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const riseLead = createVoice(context, 'triangle', now + 0.015, 0.32, 0.1);
  riseLead.oscillator.frequency.setValueAtTime(360, now + 0.015);
  riseLead.oscillator.frequency.exponentialRampToValueAtTime(820, now + 0.335);

  const riseHarmony = createVoice(context, 'square', now + 0.045, 0.24, 0.045);
  riseHarmony.oscillator.frequency.setValueAtTime(270, now + 0.045);
  riseHarmony.oscillator.frequency.exponentialRampToValueAtTime(540, now + 0.285);
}

export async function playClearPop(scene: Phaser.Scene, clearedTileCount: number): Promise<void> {
  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const peakGain = Math.min(0.06, 0.025 + clearedTileCount * 0.0045);
  const pop = createVoice(context, 'triangle', now, 0.085, peakGain);
  pop.oscillator.frequency.setValueAtTime(210, now);
  pop.oscillator.frequency.exponentialRampToValueAtTime(96, now + 0.085);
}

function createVoice(
  context: AudioContext,
  type: OscillatorType,
  startTime: number,
  duration: number,
  peakGain: number,
): { oscillator: OscillatorNode; gain: GainNode } {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.connect(gain);
  gain.connect(context.destination);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0002), startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };

  return { oscillator, gain };
}

function getAudioContext(scene: Phaser.Scene): AudioContext | undefined {
  const manager = scene.sound as WebAudioManager | undefined;

  if (manager?.context && typeof manager.context.createOscillator === 'function') {
    return manager.context;
  }

  return undefined;
}
