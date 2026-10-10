/** 以确定性的加法合成、轻量鼓组和立体声混响制作原创器乐，不使用外部采样。 */
import type { Instrument, Score } from './score';
import { SCORE_TIMING } from './score';

export interface StereoBuffer { left: Float32Array; right: Float32Array; sampleRate: number; }
export interface RenderedScore { audio: StereoBuffer; duration: number; waveform: number[]; }
type Random = () => number;
interface InstrumentVoice { partials: readonly number[]; ratios: readonly number[]; attack: number; decay: number; release: number; }

export const SYNTH_AUDIO = { sampleRate: 44_100, channels: 2, bitDepth: 16, waveformBars: 44, peak: 0.72 } as const;
const HARMONY = { referenceMidi: 69, referenceHz: 440, octave: 12, pianoDecayScale: 0.004, maxHumanDelay: 0.012, velocityRange: 0.18, phraseBars: 8, introBars: 2, outroBars: 2 } as const;
const MIX = { fadeIn: 0.9, fadeOut: 2.4, stereoWidth: 0.6, reverbCross: 0.28, reverbFeedback: 0.26, saturation: 0.83, lowPass: 11_000, noiseScale: 2, noiseOffset: 1 } as const;
const DRUMS = { kickLength: 0.36, kickBase: 47, kickBend: 68, kickBendRate: 34, kickDecay: 12, snareLength: 0.24, snareLow: 700, snareHigh: 5200, snareDecay: 18, snareBody: 170, hatLength: 0.13, hatLow: 4400, hatHigh: 7900, hatDecay: 37, noiseGain: 0.78, bodyGain: 0.16, brushGain: 0.075, softGain: 0.145, pulseGain: 0.16, hatRatio: 0.31 } as const;
const INSTRUMENTS: Record<Instrument, InstrumentVoice> = {
  piano: { partials: [1, 0.3, 0.135, 0.057, 0.024], ratios: [1, 2, 3.002, 4.009, 5.018], attack: 0.008, decay: 1.65, release: 0.28 },
  electric: { partials: [1, 0.155, 0.075, 0.016], ratios: [1, 2, 3, 6.006], attack: 0.014, decay: 1.05, release: 0.38 },
  pad: { partials: [0.62, 0.31, 0.15, 0.08, 0.025], ratios: [0.9985, 1.0015, 2, 3, 4], attack: 0.65, decay: 0.085, release: 1.5 },
  pluck: { partials: [1, 0.16, 0.04, 0.009], ratios: [1, 2, 3, 4], attack: 0.006, decay: 3.7, release: 0.16 },
  mallet: { partials: [1, 0.115, 0.038], ratios: [1, 2.76, 4.12], attack: 0.011, decay: 2.3, release: 0.3 },
  bass: { partials: [1, 0.1, 0.035], ratios: [1, 2, 3], attack: 0.023, decay: 0.48, release: 0.16 },
};
const REVERB_TAPS = [0.109, 0.173, 0.283, 0.421] as const;
const MELODY_STEPS = [0, 0.75, 1.5, 2, 2.75, 3.5] as const;
const AMBIENT_STEPS = [0.35, 1.25, 2.25, 3.3] as const;
const ARPEGGIO_ORDER = [0, 2, 1, 3, 0, 1, 2, 3] as const;

function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const RANDOM = { multiplier: 1664525, increment: 1013904223, modulus: 4294967296 } as const;
  return (): number => { state = (Math.imul(state, RANDOM.multiplier) + RANDOM.increment) >>> 0; return state / RANDOM.modulus; };
}

function createBuffer(duration: number): StereoBuffer {
  const length = Math.ceil(duration * SYNTH_AUDIO.sampleRate);
  return { left: new Float32Array(length), right: new Float32Array(length), sampleRate: SYNTH_AUDIO.sampleRate };
}

function note(buffer: StereoBuffer, midi: number, start: number, length: number, gain: number, pan: number, instrument: Instrument): void {
  const voice = INSTRUMENTS[instrument];
  const frequency = HARMONY.referenceHz * 2 ** ((midi - HARMONY.referenceMidi) / HARMONY.octave);
  const omega = Math.PI * 2 * frequency;
  const startSample = Math.max(0, Math.floor(start * buffer.sampleRate));
  const endSample = Math.min(buffer.left.length, Math.ceil((start + length + voice.release) * buffer.sampleRate));
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  const leftGain = Math.cos(angle) * gain;
  const rightGain = Math.sin(angle) * gain;
  const decay = instrument === 'piano' ? voice.decay + frequency * HARMONY.pianoDecayScale : voice.decay;
  for (let index = startSample; index < endSample; index++) {
    const time = (index - startSample) / buffer.sampleRate;
    const attack = Math.min(1, time / voice.attack);
    const release = time > length ? Math.max(0, 1 - (time - length) / voice.release) ** 2 : 1;
    let value = 0;
    for (let partial = 0; partial < voice.partials.length; partial++) {
      const harmonicDecay = Math.exp(-time * decay * (1 + partial * 0.35));
      value += Math.sin(omega * voice.ratios[partial] * time) * voice.partials[partial] * harmonicDecay;
    }
    value *= attack * release;
    buffer.left[index] += value * leftGain;
    buffer.right[index] += value * rightGain;
  }
}

function drum(buffer: StereoBuffer, start: number, kind: 'kick' | 'snare' | 'hat', gain: number, random: Random): void {
  const length = kind === 'kick' ? DRUMS.kickLength : kind === 'snare' ? DRUMS.snareLength : DRUMS.hatLength;
  const begin = Math.max(0, Math.floor(start * buffer.sampleRate));
  const end = Math.min(buffer.left.length, Math.ceil((start + length) * buffer.sampleRate));
  const low = kind === 'hat' ? DRUMS.hatLow : DRUMS.snareLow;
  const high = kind === 'hat' ? DRUMS.hatHigh : DRUMS.snareHigh;
  const lowAlpha = 1 - Math.exp(-Math.PI * 2 * low / buffer.sampleRate);
  const highAlpha = 1 - Math.exp(-Math.PI * 2 * high / buffer.sampleRate);
  let lowNoise = 0;
  let highNoise = 0;
  for (let index = begin; index < end; index++) {
    const time = (index - begin) / buffer.sampleRate;
    let value: number;
    if (kind === 'kick') {
      const phase = Math.PI * 2 * (DRUMS.kickBase * time + DRUMS.kickBend / DRUMS.kickBendRate * (1 - Math.exp(-DRUMS.kickBendRate * time)));
      value = Math.sin(phase) * Math.exp(-time * DRUMS.kickDecay);
    } else {
      const noise = random() * MIX.noiseScale - MIX.noiseOffset;
      lowNoise += lowAlpha * (noise - lowNoise);
      highNoise += highAlpha * (noise - highNoise);
      const decay = kind === 'snare' ? DRUMS.snareDecay : DRUMS.hatDecay;
      value = (highNoise - lowNoise) * DRUMS.noiseGain * Math.exp(-time * decay);
      if (kind === 'snare') value += Math.sin(Math.PI * 2 * DRUMS.snareBody * time) * DRUMS.bodyGain * Math.exp(-time * decay);
    }
    value *= Math.min(1, time / INSTRUMENTS.pluck.attack) * Math.max(0, 1 - time / length) * gain;
    buffer.left[index] += value * (kind === 'hat' ? 0.48 : 0.7);
    buffer.right[index] += value * (kind === 'hat' ? 0.82 : 0.7);
  }
}

function rhythm(buffer: StereoBuffer, score: Score, bar: number, beat: number, start: number, random: Random): void {
  if (score.rhythm === 'none' || bar < HARMONY.introBars || bar >= score.bars - HARMONY.outroBars) return;
  const gain = score.rhythm === 'brush' ? DRUMS.brushGain : score.rhythm === 'soft' ? DRUMS.softGain : DRUMS.pulseGain;
  const variant = bar % HARMONY.phraseBars;
  const kicks = score.rhythm === 'pulse' ? [0, 1, 2, 3] : variant === 6 ? [0, 1.75, 2.5] : [0, 2.25];
  for (const position of kicks) drum(buffer, start + position * beat, 'kick', gain, random);
  for (const position of [1, 3]) drum(buffer, start + (position + score.swing * 0.2) * beat, 'snare', gain * 0.58, random);
  for (let step = 0; step < ARPEGGIO_ORDER.length; step++) {
    if (score.rhythm === 'brush' && step % 2 === 0) continue;
    const position = step / 2 + (step % 2 ? score.swing : 0);
    drum(buffer, start + position * beat, 'hat', gain * DRUMS.hatRatio * (step % 2 ? 0.72 : 1), random);
  }
}

function arrangeBar(dry: StereoBuffer, wet: StereoBuffer, score: Score, bar: number, random: Random): void {
  const beat = SCORE_TIMING.secondsPerMinute / score.bpm;
  const start = bar * SCORE_TIMING.beatsPerBar * beat;
  const harmonyIndex = bar % score.chords.length;
  const chord = score.chords[harmonyIndex];
  const section = Math.floor(bar / HARMONY.phraseBars);
  const resolving = bar >= score.bars - HARMONY.outroBars;
  const velocity = (): number => 1 - HARMONY.velocityRange / 2 + random() * HARMONY.velocityRange;
  for (let voice = 0; voice < chord.length; voice++) {
    const spread = (voice / (chord.length - 1) - 0.5) * MIX.stereoWidth;
    note(wet, chord[voice] + HARMONY.octave, start, SCORE_TIMING.beatsPerBar * beat, score.pad / chord.length, spread, 'pad');
  }
  note(dry, chord[0] - HARMONY.octave, start + HARMONY.maxHumanDelay, beat * (resolving ? 3.6 : 1.7), score.bass * velocity(), 0, 'bass');
  if (score.rhythm !== 'none' && !resolving) note(dry, chord[0] - HARMONY.octave, start + beat * 2.35, beat * 1.35, score.bass * 0.72 * velocity(), 0, 'bass');
  if (score.arpeggio && !resolving) {
    const accompaniment = score.instrument === 'piano' ? 'piano' : 'electric';
    for (let step = 0; step < ARPEGGIO_ORDER.length; step++) {
      const midi = chord[ARPEGGIO_ORDER[step]] + HARMONY.octave;
      const position = step / 2 + (step % 2 ? score.swing : 0);
      note(wet, midi, start + position * beat + random() * HARMONY.maxHumanDelay, beat * 1.5, score.melodyGain * 0.35 * velocity(), -0.3, accompaniment);
    }
  } else if (!score.arpeggio) {
    for (let voice = 1; voice < chord.length; voice++) note(wet, chord[voice] + HARMONY.octave, start + voice * 0.035, beat * 3.2, score.melodyGain * 0.26 * velocity(), -0.3, 'electric');
  }
  if (bar >= HARMONY.introBars && !resolving && bar % HARMONY.phraseBars !== HARMONY.phraseBars - 1) {
    const melody = score.melody[harmonyIndex];
    const steps = score.rhythm === 'none' ? AMBIENT_STEPS : MELODY_STEPS;
    for (let index = 0; index < steps.length; index++) {
      if (section === 0 && index % 3 === 2) continue;
      const phraseIndex = section === 1 ? (index + 2) % melody.length : index % melody.length;
      const position = steps[index] + (index % 2 ? score.swing * 0.3 : 0);
      note(wet, melody[phraseIndex], start + position * beat + random() * HARMONY.maxHumanDelay, beat * (score.rhythm === 'none' ? 1.3 : 0.72), score.melodyGain * velocity(), 0.25, score.instrument);
    }
  }
  if (resolving) note(wet, chord[1] + HARMONY.octave * 2, start + beat * 0.6, beat * 3.1, score.melodyGain * 0.58, 0.1, score.instrument);
  rhythm(dry, score, bar, beat, start, random);
}

function addSpace(dry: StereoBuffer, wet: StereoBuffer, space: number): void {
  const lines = REVERB_TAPS.map((time, index) => ({ left: new Float32Array(Math.round(time * wet.sampleRate)), right: new Float32Array(Math.round((time + 0.013 + index * 0.007) * wet.sampleRate)), leftIndex: 0, rightIndex: 0 }));
  for (let index = 0; index < dry.left.length; index++) {
    let left = 0;
    let right = 0;
    for (const line of lines) {
      const delayedLeft = line.left[line.leftIndex];
      const delayedRight = line.right[line.rightIndex];
      line.left[line.leftIndex] = wet.left[index] + delayedLeft * MIX.reverbFeedback + delayedRight * MIX.reverbCross;
      line.right[line.rightIndex] = wet.right[index] + delayedRight * MIX.reverbFeedback + delayedLeft * MIX.reverbCross;
      line.leftIndex = (line.leftIndex + 1) % line.left.length;
      line.rightIndex = (line.rightIndex + 1) % line.right.length;
      left += delayedLeft;
      right += delayedRight;
    }
    dry.left[index] += wet.left[index] + left * space / lines.length;
    dry.right[index] += wet.right[index] + right * space / lines.length;
  }
}

function master(audio: StereoBuffer, duration: number): number[] {
  const alpha = 1 - Math.exp(-Math.PI * 2 * MIX.lowPass / audio.sampleRate);
  let left = 0;
  let right = 0;
  let peak = 0;
  for (let index = 0; index < audio.left.length; index++) {
    const time = index / audio.sampleRate;
    const fade = Math.min(1, time / MIX.fadeIn, (duration - time) / MIX.fadeOut);
    left += alpha * (audio.left[index] - left);
    right += alpha * (audio.right[index] - right);
    audio.left[index] = Math.tanh(left * MIX.saturation) * fade;
    audio.right[index] = Math.tanh(right * MIX.saturation) * fade;
    peak = Math.max(peak, Math.abs(audio.left[index]), Math.abs(audio.right[index]));
  }
  const scale = peak > 0 ? SYNTH_AUDIO.peak / peak : 1;
  const bars = new Array<number>(SYNTH_AUDIO.waveformBars).fill(0);
  const counts = new Array<number>(SYNTH_AUDIO.waveformBars).fill(0);
  for (let index = 0; index < audio.left.length; index++) {
    audio.left[index] *= scale;
    audio.right[index] *= scale;
    const bar = Math.min(bars.length - 1, Math.floor(index / audio.left.length * bars.length));
    bars[bar] += (audio.left[index] ** 2 + audio.right[index] ** 2) / SYNTH_AUDIO.channels;
    counts[bar]++;
  }
  const rms = bars.map((sum, index) => Math.sqrt(sum / counts[index]));
  const maximum = Math.max(...rms);
  return rms.map((value) => Number((value / maximum).toFixed(3)));
}

export function renderScore(score: Score): RenderedScore {
  const duration = score.bars * SCORE_TIMING.beatsPerBar * SCORE_TIMING.secondsPerMinute / score.bpm + SCORE_TIMING.tailSeconds;
  const dry = createBuffer(duration);
  const wet = createBuffer(duration);
  const random = seededRandom(score.seed);
  for (let bar = 0; bar < score.bars; bar++) arrangeBar(dry, wet, score, bar, random);
  addSpace(dry, wet, score.space);
  return { audio: dry, duration, waveform: master(dry, duration) };
}

export function waveBytes(audio: StereoBuffer): Buffer {
  const WAV = { header: 44, pcm: 1, formatSize: 16, scale: 32767, bytesPerSample: SYNTH_AUDIO.bitDepth / 8 } as const;
  const blockAlign = SYNTH_AUDIO.channels * WAV.bytesPerSample;
  const bytes = Buffer.alloc(WAV.header + audio.left.length * blockAlign);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(WAV.formatSize, 16); bytes.writeUInt16LE(WAV.pcm, 20); bytes.writeUInt16LE(SYNTH_AUDIO.channels, 22);
  bytes.writeUInt32LE(audio.sampleRate, 24); bytes.writeUInt32LE(audio.sampleRate * blockAlign, 28);
  bytes.writeUInt16LE(blockAlign, 32); bytes.writeUInt16LE(SYNTH_AUDIO.bitDepth, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - WAV.header, 40);
  for (let index = 0; index < audio.left.length; index++) {
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.left[index])) * WAV.scale), WAV.header + index * blockAlign);
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.right[index])) * WAV.scale), WAV.header + index * blockAlign + WAV.bytesPerSample);
  }
  return bytes;
}
