/** 原创聚焦音效合成器：仅使用振荡器、滤波噪声与包络，不使用第三方采样。 */
import type { FocusSoundId } from '../../shared/types';

export type FocusCueId = FocusSoundId;
export interface FocusCueScore { id: FocusCueId; duration: number; seed: number; peak: number; }
export interface FocusCueRender { id: FocusCueId; duration: number; sampleRate: number; left: Float32Array; right: Float32Array; }
type Random = () => number;
interface NoiseState { low: number; high: number; }

export const FOCUS_CUE_AUDIO = { sampleRate: 44_100, channels: 2, bitDepth: 16, introFade: 0.006, tailFade: 0.025 } as const;
export const FOCUS_CUE_SCORES: readonly FocusCueScore[] = [
  { id: 'soft-tap', duration: 0.24, seed: 42361, peak: 0.35 },
  { id: 'air-sweep', duration: 0.48, seed: 76279, peak: 0.3 },
  { id: 'glass-chime', duration: 0.6, seed: 81713, peak: 0.34 },
  { id: 'gentle-pop', duration: 0.3, seed: 98347, peak: 0.33 },
];
const RANDOM = { multiplier: 1664525, increment: 1013904223, modulus: 4294967296 } as const;
const TAP = { bodyHz: 425, bodyBendHz: 165, bendRate: 30, decay: 24, colorHz: 920, colorGain: 0.14, colorDecay: 38, noiseGain: 0.04, noiseLow: 700, noiseHigh: 3400 } as const;
const SWEEP = { minimumHz: 270, maximumHz: 1800, widthHz: 1600, tonalHz: 340, tonalGain: 0.09, noiseGain: 0.95 } as const;
const GLASS = { fundamentalHz: 1050, fundamentalDecay: 10, upperHz: 1665, upperGain: 0.22, upperDecay: 17, shimmerHz: 2482, shimmerGain: 0.045, shimmerDecay: 26, reflectionDelay: 0.025, reflectionGain: 0.14 } as const;
const POP = { bodyHz: 185, bodyBendHz: 345, bendRate: 26, decay: 23, overtoneHz: 690, overtoneGain: 0.13, overtoneDecay: 33, bounceDelay: 0.075, bounceHz: 525, bounceGain: 0.15, bounceDecay: 30 } as const;
const SPACE = { rightDelaySeconds: 0.004, directGain: 0.93, delayedGain: 0.07 } as const;

function randomGenerator(seed: number): Random {
  let state = seed >>> 0;
  return (): number => { state = (Math.imul(state, RANDOM.multiplier) + RANDOM.increment) >>> 0; return state / RANDOM.modulus; };
}

function bandNoise(state: NoiseState, noise: number, low: number, high: number): number {
  state.low += (1 - Math.exp(-Math.PI * 2 * low / FOCUS_CUE_AUDIO.sampleRate)) * (noise - state.low);
  state.high += (1 - Math.exp(-Math.PI * 2 * high / FOCUS_CUE_AUDIO.sampleRate)) * (noise - state.high);
  return state.high - state.low;
}

function frequencySweep(time: number, base: number, bend: number, rate: number): number {
  return Math.sin(Math.PI * 2 * (base * time + bend / rate * (1 - Math.exp(-rate * time))));
}

function cueValue(score: FocusCueScore, time: number, random: Random, state: NoiseState): number {
  const phase = time / score.duration;
  const noise = random() * 2 - 1;
  switch (score.id) {
    case 'soft-tap':
      return frequencySweep(time, TAP.bodyHz, TAP.bodyBendHz, TAP.bendRate) * Math.exp(-time * TAP.decay)
        + Math.sin(Math.PI * 2 * TAP.colorHz * time) * TAP.colorGain * Math.exp(-time * TAP.colorDecay)
        + bandNoise(state, noise, TAP.noiseLow, TAP.noiseHigh) * TAP.noiseGain * Math.exp(-time * TAP.colorDecay);
    case 'air-sweep': {
      const center = SWEEP.minimumHz + Math.sin(Math.PI * phase) ** 2 * (SWEEP.maximumHz - SWEEP.minimumHz);
      const air = bandNoise(state, noise, center, center + SWEEP.widthHz) * SWEEP.noiseGain;
      return (air + Math.sin(Math.PI * 2 * SWEEP.tonalHz * time) * SWEEP.tonalGain) * Math.sin(Math.PI * phase) ** 2;
    }
    case 'glass-chime': {
      const reflection = Math.max(0, time - GLASS.reflectionDelay);
      return Math.sin(Math.PI * 2 * GLASS.fundamentalHz * time) * Math.exp(-time * GLASS.fundamentalDecay)
        + Math.sin(Math.PI * 2 * GLASS.upperHz * time) * GLASS.upperGain * Math.exp(-time * GLASS.upperDecay)
        + Math.sin(Math.PI * 2 * GLASS.shimmerHz * time) * GLASS.shimmerGain * Math.exp(-time * GLASS.shimmerDecay)
        + Math.sin(Math.PI * 2 * GLASS.fundamentalHz * reflection) * GLASS.reflectionGain * Math.exp(-reflection * GLASS.upperDecay);
    }
    case 'gentle-pop': {
      const bounce = Math.max(0, time - POP.bounceDelay);
      return frequencySweep(time, POP.bodyHz, POP.bodyBendHz, POP.bendRate) * Math.exp(-time * POP.decay)
        + Math.sin(Math.PI * 2 * POP.overtoneHz * time) * POP.overtoneGain * Math.exp(-time * POP.overtoneDecay)
        + Math.sin(Math.PI * 2 * POP.bounceHz * bounce) * POP.bounceGain * Math.exp(-bounce * POP.bounceDecay);
    }
  }
}

export function renderFocusCue(score: FocusCueScore): FocusCueRender {
  const length = Math.round(score.duration * FOCUS_CUE_AUDIO.sampleRate);
  const mono = new Float32Array(length);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const state: NoiseState = { low: 0, high: 0 };
  const random = randomGenerator(score.seed);
  let maximum = 0;
  for (let index = 0; index < length; index++) {
    const time = index / FOCUS_CUE_AUDIO.sampleRate;
    const fade = Math.min(1, time / FOCUS_CUE_AUDIO.introFade, (score.duration - time) / FOCUS_CUE_AUDIO.tailFade);
    mono[index] = cueValue(score, time, random, state) * fade ** 2;
    maximum = Math.max(maximum, Math.abs(mono[index]));
  }
  const scale = maximum > 0 ? score.peak / maximum : 0;
  const delay = Math.round(SPACE.rightDelaySeconds * FOCUS_CUE_AUDIO.sampleRate);
  for (let index = 0; index < length; index++) {
    const tail = Math.min(1, (length - index) / (FOCUS_CUE_AUDIO.tailFade * FOCUS_CUE_AUDIO.sampleRate));
    left[index] = mono[index] * scale;
    right[index] = (mono[index] * SPACE.directGain + (index >= delay ? mono[index - delay] * SPACE.delayedGain : 0)) * scale * tail ** 2;
  }
  return { id: score.id, duration: score.duration, sampleRate: FOCUS_CUE_AUDIO.sampleRate, left, right };
}

export function focusCueWaveBytes(audio: FocusCueRender): Buffer {
  const WAV = { header: 44, formatSize: 16, pcm: 1, scale: 32767, bytesPerSample: FOCUS_CUE_AUDIO.bitDepth / 8 } as const;
  const blockAlign = FOCUS_CUE_AUDIO.channels * WAV.bytesPerSample;
  const bytes = Buffer.alloc(WAV.header + audio.left.length * blockAlign);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(WAV.formatSize, 16); bytes.writeUInt16LE(WAV.pcm, 20); bytes.writeUInt16LE(FOCUS_CUE_AUDIO.channels, 22);
  bytes.writeUInt32LE(audio.sampleRate, 24); bytes.writeUInt32LE(audio.sampleRate * blockAlign, 28);
  bytes.writeUInt16LE(blockAlign, 32); bytes.writeUInt16LE(FOCUS_CUE_AUDIO.bitDepth, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - WAV.header, 40);
  for (let index = 0; index < audio.left.length; index++) {
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.left[index])) * WAV.scale), WAV.header + index * blockAlign);
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.right[index])) * WAV.scale), WAV.header + index * blockAlign + WAV.bytesPerSample);
  }
  return bytes;
}
