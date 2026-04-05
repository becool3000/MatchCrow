import Phaser from 'phaser';

type WebAudioManager = Phaser.Sound.WebAudioSoundManager & {
  context?: AudioContext;
};

const SOUND_EFFECTS_STORAGE_KEY = 'matchcrow.sound-effects-enabled';

export const CROW_CAW_WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'] as const;

export type CrowCawWaveform = (typeof CROW_CAW_WAVEFORMS)[number];

export interface CrowCawTuning {
  noiseMs: number;
  noiseGain: number;
  attackMs: number;
  bodyMs: number;
  leadWave: CrowCawWaveform;
  bodyWave: CrowCawWaveform;
  leadGain: number;
  bodyGain: number;
  leadFreq: number;
  bodyFreq: number;
  endFreq: number;
  detuneCents: number;
  bandpassStart: number;
  bandpassEnd: number;
  lowpassStart: number;
  lowpassEnd: number;
  raspAmount: number;
  pitchJitterPercent: number;
  durationJitterPercent: number;
}

const NOISE_BUFFER_SECONDS = 0.05;
const noiseBufferCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const CUE_COMPRESSOR_THRESHOLD_DB = -28;
const CUE_COMPRESSOR_KNEE_DB = 28;
const CUE_COMPRESSOR_RATIO = 6;
const CUE_COMPRESSOR_ATTACK_SEC = 0.0025;
const CUE_COMPRESSOR_RELEASE_SEC = 0.16;
const BIG_MATCH_CUE_GAIN = 3.2;
const CLEAR_POP_CUE_GAIN = 4.1;
const IMPACT_CUE_GAIN = 4.2;
const SUPPORT_CUE_GAIN = 3.25;
const CROW_CAW_CUE_GAIN = 2.1;
// Paste Caw Lab exports here by replacing this entire constant block.
const DEFAULT_CROW_CAW_TUNING: CrowCawTuning = {
  noiseMs: 20,
  noiseGain: 0.018,
  attackMs: 40,
  bodyMs: 320,
  leadWave: 'sawtooth',
  bodyWave: 'sawtooth',
  leadGain: 0.0065,
  bodyGain: 0.0065,
  leadFreq: 511,
  bodyFreq: 260,
  endFreq: 320,
  detuneCents: 40,
  bandpassStart: 2200,
  bandpassEnd: 900,
  lowpassStart: 3200,
  lowpassEnd: 1000,
  raspAmount: 80,
  pitchJitterPercent: 2,
  durationJitterPercent: 10,
};

let crowCawTuning: CrowCawTuning = { ...DEFAULT_CROW_CAW_TUNING };
let soundEffectsEnabled = readStoredAudioEnabled(SOUND_EFFECTS_STORAGE_KEY, true);

export function areSoundEffectsEnabled(): boolean {
  return soundEffectsEnabled;
}

export function setSoundEffectsEnabled(enabled: boolean): boolean {
  soundEffectsEnabled = enabled;
  writeStoredAudioEnabled(SOUND_EFFECTS_STORAGE_KEY, enabled);
  return soundEffectsEnabled;
}

export function getCrowCawTuning(): CrowCawTuning {
  return { ...crowCawTuning };
}

export function resetCrowCawTuning(): CrowCawTuning {
  crowCawTuning = { ...DEFAULT_CROW_CAW_TUNING };
  return getCrowCawTuning();
}

export function exportCrowCawPreset(tuning: CrowCawTuning = getCrowCawTuning()): string {
  return [
    'const DEFAULT_CROW_CAW_TUNING: CrowCawTuning = {',
    `  noiseMs: ${formatCrowCawPresetValue(tuning.noiseMs)},`,
    `  noiseGain: ${formatCrowCawPresetValue(tuning.noiseGain)},`,
    `  attackMs: ${formatCrowCawPresetValue(tuning.attackMs)},`,
    `  bodyMs: ${formatCrowCawPresetValue(tuning.bodyMs)},`,
    `  leadWave: '${tuning.leadWave}',`,
    `  bodyWave: '${tuning.bodyWave}',`,
    `  leadGain: ${formatCrowCawPresetValue(tuning.leadGain)},`,
    `  bodyGain: ${formatCrowCawPresetValue(tuning.bodyGain)},`,
    `  leadFreq: ${formatCrowCawPresetValue(tuning.leadFreq)},`,
    `  bodyFreq: ${formatCrowCawPresetValue(tuning.bodyFreq)},`,
    `  endFreq: ${formatCrowCawPresetValue(tuning.endFreq)},`,
    `  detuneCents: ${formatCrowCawPresetValue(tuning.detuneCents)},`,
    `  bandpassStart: ${formatCrowCawPresetValue(tuning.bandpassStart)},`,
    `  bandpassEnd: ${formatCrowCawPresetValue(tuning.bandpassEnd)},`,
    `  lowpassStart: ${formatCrowCawPresetValue(tuning.lowpassStart)},`,
    `  lowpassEnd: ${formatCrowCawPresetValue(tuning.lowpassEnd)},`,
    `  raspAmount: ${formatCrowCawPresetValue(tuning.raspAmount)},`,
    `  pitchJitterPercent: ${formatCrowCawPresetValue(tuning.pitchJitterPercent)},`,
    `  durationJitterPercent: ${formatCrowCawPresetValue(tuning.durationJitterPercent)},`,
    '};',
  ].join('\n');
}

export function updateCrowCawTuning(patch: Partial<CrowCawTuning>): CrowCawTuning {
  const next = {
    ...crowCawTuning,
    ...patch,
  };

  crowCawTuning = {
    noiseMs: clampNumber(next.noiseMs, 10, 20, DEFAULT_CROW_CAW_TUNING.noiseMs),
    noiseGain: clampNumber(next.noiseGain, 0.002, 0.05, DEFAULT_CROW_CAW_TUNING.noiseGain),
    attackMs: clampNumber(next.attackMs, 5, 40, DEFAULT_CROW_CAW_TUNING.attackMs),
    bodyMs: clampNumber(next.bodyMs, 180, 320, DEFAULT_CROW_CAW_TUNING.bodyMs),
    leadWave: normalizeWaveform(next.leadWave, DEFAULT_CROW_CAW_TUNING.leadWave),
    bodyWave: normalizeWaveform(next.bodyWave, DEFAULT_CROW_CAW_TUNING.bodyWave),
    leadGain: clampNumber(next.leadGain, 0.004, 0.05, DEFAULT_CROW_CAW_TUNING.leadGain),
    bodyGain: clampNumber(next.bodyGain, 0.004, 0.05, DEFAULT_CROW_CAW_TUNING.bodyGain),
    leadFreq: clampNumber(next.leadFreq, 300, 650, DEFAULT_CROW_CAW_TUNING.leadFreq),
    bodyFreq: clampNumber(next.bodyFreq, 260, 600, DEFAULT_CROW_CAW_TUNING.bodyFreq),
    endFreq: clampNumber(next.endFreq, 120, 320, DEFAULT_CROW_CAW_TUNING.endFreq),
    detuneCents: clampNumber(next.detuneCents, 0, 40, DEFAULT_CROW_CAW_TUNING.detuneCents),
    bandpassStart: clampNumber(
      next.bandpassStart,
      500,
      2200,
      DEFAULT_CROW_CAW_TUNING.bandpassStart,
    ),
    bandpassEnd: clampNumber(next.bandpassEnd, 220, 900, DEFAULT_CROW_CAW_TUNING.bandpassEnd),
    lowpassStart: clampNumber(next.lowpassStart, 900, 3200, DEFAULT_CROW_CAW_TUNING.lowpassStart),
    lowpassEnd: clampNumber(next.lowpassEnd, 260, 1000, DEFAULT_CROW_CAW_TUNING.lowpassEnd),
    raspAmount: clampNumber(next.raspAmount, 0, 80, DEFAULT_CROW_CAW_TUNING.raspAmount),
    pitchJitterPercent: clampNumber(
      next.pitchJitterPercent,
      0,
      10,
      DEFAULT_CROW_CAW_TUNING.pitchJitterPercent,
    ),
    durationJitterPercent: clampNumber(
      next.durationJitterPercent,
      0,
      10,
      DEFAULT_CROW_CAW_TUNING.durationJitterPercent,
    ),
  };

  return getCrowCawTuning();
}

export async function playBigMatchCue(scene: Phaser.Scene): Promise<void> {
  if (!soundEffectsEnabled) {
    return;
  }

  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const bus = createCueBus(context, BIG_MATCH_CUE_GAIN, 1.4);
  const riseLead = createVoice(context, 'triangle', now + 0.01, 0.34, 0.34, bus.input);
  riseLead.oscillator.frequency.setValueAtTime(460, now + 0.01);
  riseLead.oscillator.frequency.exponentialRampToValueAtTime(1120, now + 0.33);

  const riseHarmony = createVoice(context, 'square', now + 0.04, 0.28, 0.2, bus.input);
  riseHarmony.oscillator.frequency.setValueAtTime(330, now + 0.04);
  riseHarmony.oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.28);

  createNoiseBurst(context, now + 0.015, 0.045, 0.055, bus.input, 1);
  scheduleDisconnection(context, now + 0.48, bus.input, bus.compressor, bus.output);
}

export async function playClearPop(scene: Phaser.Scene, clearedTileCount: number): Promise<void> {
  if (!soundEffectsEnabled) {
    return;
  }

  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const bus = createCueBus(context, CLEAR_POP_CUE_GAIN, 1.55);
  const peakGain = Math.min(0.48, 0.18 + clearedTileCount * 0.035);
  const pop = createVoice(context, 'square', now, 0.14, peakGain, bus.input);
  pop.oscillator.frequency.setValueAtTime(560, now);
  pop.oscillator.frequency.exponentialRampToValueAtTime(220, now + 0.14);
  createNoiseBurst(context, now, 0.04, 0.06, bus.input, 1);
  scheduleDisconnection(context, now + 0.22, bus.input, bus.compressor, bus.output);
}

export async function playCombatImpactCue(
  scene: Phaser.Scene,
  intensity = 1,
): Promise<void> {
  if (!soundEffectsEnabled) {
    return;
  }

  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const bus = createCueBus(context, IMPACT_CUE_GAIN, 1.45);
  const strength = Phaser.Math.Clamp(intensity, 0.6, 2);
  const thump = createVoice(context, 'sawtooth', now, 0.13, 0.26 * strength, bus.input, 0.008);
  thump.oscillator.frequency.setValueAtTime(280, now);
  thump.oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.09);

  const snap = createVoice(context, 'triangle', now + 0.012, 0.09, 0.18 * strength, bus.input, 0.004);
  snap.oscillator.frequency.setValueAtTime(920, now + 0.012);
  snap.oscillator.frequency.exponentialRampToValueAtTime(360, now + 0.09);

  createNoiseBurst(context, now, 0.05, 0.075 * strength, bus.input, 1);
  scheduleDisconnection(context, now + 0.2, bus.input, bus.compressor, bus.output);
}

export async function playSupportCue(
  scene: Phaser.Scene,
  kind: 'shield' | 'heal',
  intensity = 1,
): Promise<void> {
  if (!soundEffectsEnabled) {
    return;
  }

  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const bus = createCueBus(context, SUPPORT_CUE_GAIN, 1.3);
  const strength = Phaser.Math.Clamp(intensity, 0.6, 2);

  if (kind === 'shield') {
    const ping = createVoice(context, 'triangle', now, 0.16, 0.22 * strength, bus.input, 0.01);
    ping.oscillator.frequency.setValueAtTime(540, now);
    ping.oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.14);
    const ping2 = createVoice(context, 'sine', now + 0.02, 0.12, 0.14 * strength, bus.input, 0.006);
    ping2.oscillator.frequency.setValueAtTime(780, now + 0.02);
    ping2.oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
  } else {
    const rise = createVoice(context, 'sine', now, 0.18, 0.2 * strength, bus.input, 0.02);
    rise.oscillator.frequency.setValueAtTime(430, now);
    rise.oscillator.frequency.exponentialRampToValueAtTime(940, now + 0.16);
    createNoiseBurst(context, now + 0.01, 0.05, 0.04 * strength, bus.input, 1);
  }

  scheduleDisconnection(context, now + 0.24, bus.input, bus.compressor, bus.output);
}

export async function playCrowTweet(scene: Phaser.Scene): Promise<void> {
  if (!soundEffectsEnabled) {
    return;
  }

  const context = getAudioContext(scene);

  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const tuning = getCrowCawTuning();
  const startTime = context.currentTime + 0.002;
  const pitchJitter = createJitterFactor(tuning.pitchJitterPercent);
  const durationJitter = createJitterFactor(tuning.durationJitterPercent);
  const attackTime = tuning.attackMs / 1000;
  const bodyDuration = (tuning.bodyMs / 1000) * durationJitter;
  const endTime = startTime + bodyDuration + 0.05;
  const bus = createCueBus(context, CROW_CAW_CUE_GAIN);
  const rasp = context.createWaveShaper();
  const bodyBandpass = context.createBiquadFilter();
  const bodyLowpass = context.createBiquadFilter();

  rasp.curve = createDistortionCurve(tuning.raspAmount);
  rasp.oversample = '2x';

  bodyBandpass.type = 'bandpass';
  bodyBandpass.Q.value = 1.1;
  bodyBandpass.frequency.setValueAtTime(tuning.bandpassStart * pitchJitter, startTime);
  bodyBandpass.frequency.exponentialRampToValueAtTime(
    tuning.bandpassEnd * pitchJitter,
    startTime + bodyDuration,
  );

  bodyLowpass.type = 'lowpass';
  bodyLowpass.Q.value = 0.8;
  bodyLowpass.frequency.setValueAtTime(tuning.lowpassStart * pitchJitter, startTime);
  bodyLowpass.frequency.exponentialRampToValueAtTime(
    tuning.lowpassEnd * pitchJitter,
    startTime + bodyDuration,
  );

  bodyBandpass.connect(bodyLowpass);
  bodyLowpass.connect(rasp);
  rasp.connect(bus.input);

  createNoiseBurst(
    context,
    startTime,
    (tuning.noiseMs / 1000) * durationJitter,
    tuning.noiseGain,
    rasp,
    pitchJitter,
  );

  const cawLead = createVoice(
    context,
    tuning.leadWave,
    startTime,
    bodyDuration * 0.78,
    tuning.leadGain,
    bodyBandpass,
    attackTime * 0.75,
  );
  cawLead.oscillator.frequency.setValueAtTime(tuning.leadFreq * pitchJitter, startTime);
  cawLead.oscillator.frequency.exponentialRampToValueAtTime(
    ((tuning.leadFreq + tuning.endFreq) * 0.5) * pitchJitter,
    startTime + bodyDuration * 0.34,
  );
  cawLead.oscillator.frequency.exponentialRampToValueAtTime(
    tuning.endFreq * pitchJitter,
    startTime + bodyDuration * 0.78,
  );
  cawLead.oscillator.detune.setValueAtTime(-tuning.detuneCents, startTime);

  const cawBody = createVoice(
    context,
    tuning.bodyWave,
    startTime + 0.006,
    bodyDuration,
    tuning.bodyGain,
    bodyBandpass,
    attackTime,
  );
  cawBody.oscillator.frequency.setValueAtTime(tuning.bodyFreq * pitchJitter, startTime + 0.006);
  cawBody.oscillator.frequency.exponentialRampToValueAtTime(
    ((tuning.bodyFreq + tuning.endFreq) * 0.5) * pitchJitter,
    startTime + bodyDuration * 0.48,
  );
  cawBody.oscillator.frequency.exponentialRampToValueAtTime(
    tuning.endFreq * pitchJitter,
    startTime + bodyDuration,
  );
  cawBody.oscillator.detune.setValueAtTime(tuning.detuneCents, startTime + 0.006);

  scheduleDisconnection(context, endTime, bodyBandpass, bodyLowpass, rasp, bus.input, bus.compressor);
}

function createVoice(
  context: AudioContext,
  type: OscillatorType,
  startTime: number,
  duration: number,
  peakGain: number,
  destination: AudioNode = context.destination,
  attackTime = 0.02,
): { oscillator: OscillatorNode; gain: GainNode } {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.connect(gain);
  gain.connect(destination);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0002), startTime + attackTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };

  return { oscillator, gain };
}

function createNoiseBurst(
  context: AudioContext,
  startTime: number,
  duration: number,
  peakGain: number,
  destination: AudioNode,
  pitchJitter: number,
): void {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoiseBuffer(context);

  filter.type = 'bandpass';
  filter.Q.value = 1.8;
  filter.frequency.setValueAtTime(1700 * pitchJitter, startTime);
  filter.frequency.exponentialRampToValueAtTime(1180 * pitchJitter, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0002), startTime + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.start(startTime);
  source.stop(startTime + duration + 0.01);

  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

function createCueBus(context: AudioContext, gainValue: number, makeupGainValue = 1): {
  input: GainNode;
  compressor: DynamicsCompressorNode;
  output: GainNode;
} {
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();

  input.gain.value = gainValue;
  compressor.threshold.value = CUE_COMPRESSOR_THRESHOLD_DB;
  compressor.knee.value = CUE_COMPRESSOR_KNEE_DB;
  compressor.ratio.value = CUE_COMPRESSOR_RATIO;
  compressor.attack.value = CUE_COMPRESSOR_ATTACK_SEC;
  compressor.release.value = CUE_COMPRESSOR_RELEASE_SEC;
  output.gain.value = makeupGainValue;

  input.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);

  return { input, compressor, output };
}

function getNoiseBuffer(context: AudioContext): AudioBuffer {
  const cached = noiseBufferCache.get(context);

  if (cached) {
    return cached;
  }

  const length = Math.ceil(context.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }

  noiseBufferCache.set(context, buffer);

  return buffer;
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 256;
  const curve = new Float32Array<ArrayBuffer>(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }

  return curve;
}

function createJitterFactor(percentValue: number): number {
  const percent = Math.max(0, percentValue) / 100;

  if (percent <= 0) {
    return 1;
  }

  return Math.random() > 0.5 ? 1 + percent : 1 - percent;
}

function scheduleDisconnection(context: AudioContext, endTime: number, ...nodes: AudioNode[]): void {
  const delayMs = Math.max(0, (endTime - context.currentTime + 0.05) * 1000);

  globalThis.setTimeout(() => {
    nodes.forEach((node) => node.disconnect());
  }, delayMs);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function formatCrowCawPresetValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(4))}`;
}

function normalizeWaveform(value: string, fallback: CrowCawWaveform): CrowCawWaveform {
  return isCrowCawWaveform(value) ? value : fallback;
}

function isCrowCawWaveform(value: string): value is CrowCawWaveform {
  return CROW_CAW_WAVEFORMS.includes(value as CrowCawWaveform);
}

function getAudioContext(scene: Phaser.Scene): AudioContext | undefined {
  const manager = scene.sound as WebAudioManager | undefined;

  if (manager?.context && typeof manager.context.createOscillator === 'function') {
    return manager.context;
  }

  return undefined;
}

function readStoredAudioEnabled(storageKey: string, fallback: boolean): boolean {
  try {
    if (typeof window === 'undefined') {
      return fallback;
    }

    const rawValue = window.localStorage.getItem(storageKey);

    if (rawValue === null) {
      return fallback;
    }

    return rawValue !== 'false';
  } catch {
    return fallback;
  }
}

function writeStoredAudioEnabled(storageKey: string, enabled: boolean): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures.
  }
}
