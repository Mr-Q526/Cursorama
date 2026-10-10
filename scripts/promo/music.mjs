/**
 * 为 Cursorama 宣传视频生成 48 秒原创电子器乐配乐。
 *
 * 作品规格：120 BPM、F 小调、24 小节、48 kHz 双声道 PCM WAV。
 * 所有声部均由本文件的确定性加法合成与噪声合成生成，不依赖外部采样。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIO = {
  sampleRate: 48_000,
  channels: 2,
  bitDepth: 16,
  bpm: 120,
  beatsPerBar: 4,
  bars: 24,
  secondsPerMinute: 60,
  totalSeconds: 48,
  concertFrequency: 440,
  concertMidi: 69,
  semitonesPerOctave: 12,
  centsPerOctave: 1_200,
  decibelAmplitudeDivisor: 20,
};

const MIX = {
  tau: Math.PI * 2,
  targetPeakDb: -1.5,
  softClipDrive: 1.04,
  fadeInSeconds: 0.12,
  fadeOutSeconds: 0.82,
  padLevel: 0.085,
  bassLevel: 0.22,
  glassLevel: 0.105,
  reverbLevel: 0.17,
  stereoWidth: 0.72,
  panAngleDivisor: 4,
  padBarOverlap: 1.22,
  padDetuneCents: 5,
  padPanStep: 0.2,
  padPanCenter: 1.5,
  melodyLevel: 0.072,
  drumLevel: 0.19,
  transitionLevel: 0.16,
  transitionEnergyLevel: 0.08,
  clickLevel: 0.2,
  clickEnergyLevel: 0.1,
};

const ENVELOPE = {
  glassAttack: 0.002,
  glassRelease: 0.34,
  padAttack: 0.3,
  padRelease: 0.55,
  bassAttack: 0.012,
  bassRelease: 0.11,
};

const DRUM = {
  kickDuration: 0.34,
  kickStartHz: 126,
  kickEndHz: 47,
  kickDecay: 10.5,
  snareDuration: 0.22,
  snareDecay: 20,
  snareToneHz: 190,
  hatDuration: 0.075,
  hatDecay: 52,
  clickDuration: 0.045,
  kickPitchDecay: 26,
  kickChannelLevel: 0.72,
  snareFilterAlpha: 0.36,
  snareFilterMix: 0.45,
  snareToneDecay: 23,
  snareToneLevel: 0.22,
  snareNoiseLevel: 0.78,
  snareLeftLevel: 0.68,
  snareRightLevel: 0.8,
  hatLeftLevel: 0.27,
  hatRightLevel: 0.46,
  snareLevel: 0.74,
  hatAccentLevel: 0.76,
  hatSoftLevel: 0.52,
  hatSwing: 0.035,
  buildKickLevel: 0.6,
  buildHatLevel: 0.35,
  buildHatRise: 0.42,
};

const REVERB = {
  taps: [0.113, 0.179, 0.271, 0.397, 0.587],
  feedback: 0.28,
  cross: 0.2,
};

const OUTPUT = {
  directory: '.qa/promo',
  fileName: 'soundtrack.wav',
};

const SYNTH = {
  glassPartials: [1, 0.27, 0.12, 0.035],
  glassRatios: [1, 2.01, 3.97, 6.03],
  warmPartials: [1, 0.22, 0.08],
  warmRatios: [1, 2, 3],
  glassDecay: 7,
  triangleAmplitude: 4,
};

const RANDOM = { seed: 0x6d2b79f5, multiplier: 1_664_525, increment: 1_013_904_223, modulus: 4_294_967_296 };

const EFFECTS = {
  clickFrequency: 2_850,
  clickDecay: 118,
  clickLeftLevel: 0.38,
  clickRightLevel: 0.62,
  whooshSeconds: 0.72,
  whooshRiseRatio: 0.78,
  whooshFallRatio: 0.62,
  whooshPanStart: -0.7,
  whooshPanTravel: 1.4,
  whooshChannelLevel: 0.24,
  transitionAnticipation: 0.18,
  subDropSeconds: 0.52,
  subDropStartFrequency: 95,
  subDropFrequencyFall: 42,
  subDropDecay: 5.4,
  subDropChannelLevel: 0.32,
  finalWhooshStart: 41.2,
  finalWhooshLevel: 0.22,
};

const VOICING = {
  bassIntervals: [0, 0, 7, 12],
  bassBeats: [0, 1.5, 2.5, 3.5],
  bassLongBeats: 1.25,
  bassShortBeats: 0.58,
  arpeggioOrder: [0, 2, 1, 3, 1, 2, 0, 2, 3, 2, 1, 2, 0, 1, 2, 3],
  arpeggioSubdivisions: 4,
  arpeggioStrongAccent: 1.22,
  arpeggioMediumAccent: 0.92,
  arpeggioSoftAccent: 0.72,
  arpeggioDurationBeats: 0.42,
  arpeggioPanStart: -0.35,
  arpeggioPanTravel: 0.7,
  arpeggioPanSteps: 8,
  arpeggioDetune: [-7, 4, 0],
  melodyBeats: [0, 0.75, 1.5, 2, 2.75, 3.5],
  melodyLongBeats: 0.48,
  melodyShortBeats: 0.34,
  melodyStrongAccent: 1.1,
  melodySoftAccent: 0.84,
  melodyPanCenter: 0.18,
  melodyPanStep: 0.12,
  melodyPanCycle: 3,
  melodyDetune: [3, -4],
  drumKickBeats: [0, 1, 2, 3],
  drumSnareBeats: [1, 3],
  hatCount: 8,
};

const SCORE = {
  chords: [[53, 56, 60, 63], [49, 53, 56, 60], [56, 60, 63, 67], [51, 55, 58, 65]],
  roots: [41, 37, 44, 39],
  melodies: [[77, 80, 84, 80, 77, 75], [73, 77, 80, 77, 73, 72], [75, 80, 84, 82, 80, 77], [75, 79, 82, 79, 75, 72]],
  transitionBars: new Set([3, 6, 10, 14, 18, 21]),
  sectionStartBars: [0, 3, 6, 10, 14, 18, 21],
  sectionEnergy: [0.42, 0.62, 0.85, 0.96, 0.88, 1.02, 0.82],
  bassStartBar: 2,
  drumsStartBar: 3,
  highArpeggioSection: 4,
  outroStartBar: 21,
  finalMelodyBar: 22,
  resolveBar: 23,
  buildOffsetBeats: 2,
  buildLevel: 0.13,
  outroDrumLevel: 0.14,
  subDropBeats: 3.2,
  subDropLevel: 0.14,
  finalDrumLevel: 0.13,
  finalMelody: [77, 80, 84, 87, 84, 80],
  finalMelodyLevel: 0.094,
  resolveBassDurationBars: 0.98,
  resolveBassLevel: 0.16,
  resolveGlassDurationBars: 0.94,
  resolveGlassLevel: 0.082,
  resolveBassMidi: 41,
  resolveGlassMidi: 65,
};

const WAV = {
  headerBytes: 44,
  pcmFormat: 1,
  formatBytes: 16,
  bytesPerSample: AUDIO.bitDepth / 8,
  scale: 32_767,
  riffLengthExclusion: 8,
  riffOffset: 0,
  lengthOffset: 4,
  formatNameOffset: 8,
  formatLengthOffset: 16,
  encodingOffset: 20,
  channelsOffset: 22,
  sampleRateOffset: 24,
  byteRateOffset: 28,
  blockAlignOffset: 32,
  bitDepthOffset: 34,
  dataNameOffset: 36,
  dataSizeOffset: 40,
};

const BAR_SECONDS = AUDIO.beatsPerBar * AUDIO.secondsPerMinute / AUDIO.bpm;
const BEAT_SECONDS = AUDIO.secondsPerMinute / AUDIO.bpm;
const FRAME_COUNT = Math.round(AUDIO.totalSeconds * AUDIO.sampleRate);
const TARGET_PEAK = 10 ** (MIX.targetPeakDb / AUDIO.decibelAmplitudeDivisor);

/** @typedef {'sine'|'triangle'|'bass'|'glass'} Waveform */

/** @typedef {{left: Float32Array, right: Float32Array}} StereoBuffer */

/** @typedef {{start: number, duration: number, gain: number, pan: number, waveform: Waveform, attack: number, release: number, frequency: number, detune?: number}} Voice */

/** @typedef {{state: number}} Random */

/** @returns {Random} */
function createRandom() {
  return { state: RANDOM.seed };
}

/** @param {Random} random @returns {number} */
function randomUnit(random) {
  random.state = (Math.imul(random.state, RANDOM.multiplier) + RANDOM.increment) >>> 0;
  return random.state / RANDOM.modulus;
}

/** @param {number} midi @returns {number} */
function midiToFrequency(midi) {
  return AUDIO.concertFrequency * 2 ** ((midi - AUDIO.concertMidi) / AUDIO.semitonesPerOctave);
}

/** @param {number} value @returns {number} */
function clampUnit(value) {
  return Math.max(-1, Math.min(1, value));
}

/** @param {number} value @param {number} minimum @param {number} maximum @returns {number} */
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** @param {number} value @param {number} minimum @param {number} maximum @returns {number} */
function smoothStep(value, minimum, maximum) {
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

/** @param {number} time @param {number} duration @param {number} attack @param {number} release @returns {number} */
function envelope(time, duration, attack, release) {
  const attackGain = attack > 0 ? Math.min(1, time / attack) : 1;
  const releaseStart = duration - release;
  const releaseGain = time > releaseStart ? Math.max(0, (duration - time) / release) : 1;
  return attackGain * releaseGain * releaseGain;
}

/** @param {Waveform} waveform @param {number} phase @returns {number} */
function oscillator(waveform, phase) {
  const cycle = (phase / MIX.tau) % 1;
  if (waveform === 'triangle') return 1 - SYNTH.triangleAmplitude * Math.abs(Math.round(cycle) - cycle);
  return Math.sin(phase);
}

/** @param {number} pan @returns {[number, number]} */
function panGains(pan) {
  const angle = (clampUnit(pan) + 1) * Math.PI / MIX.panAngleDivisor;
  return [Math.cos(angle), Math.sin(angle)];
}

/** @returns {StereoBuffer} */
function createBuffer() {
  return { left: new Float32Array(FRAME_COUNT), right: new Float32Array(FRAME_COUNT) };
}

/**
 * 将一个有包络的加法合成声部写入双声道缓冲区。
 * @param {StereoBuffer} buffer
 * @param {Voice} voice
 */
function addVoice(buffer, voice) {
  const startFrame = Math.max(0, Math.floor(voice.start * AUDIO.sampleRate));
  const endFrame = Math.min(FRAME_COUNT, Math.ceil((voice.start + voice.duration) * AUDIO.sampleRate));
  const [leftPan, rightPan] = panGains(voice.pan * MIX.stereoWidth);
  const frequency = voice.frequency * 2 ** ((voice.detune ?? 0) / AUDIO.centsPerOctave);
  const phaseStep = MIX.tau * frequency / AUDIO.sampleRate;
  const partials = voice.waveform === 'glass' ? SYNTH.glassPartials : SYNTH.warmPartials;
  const ratios = voice.waveform === 'glass' ? SYNTH.glassRatios : SYNTH.warmRatios;
  const partialTotal = partials.reduce((sum, value) => sum + value, 0);
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const time = (frame - startFrame) / AUDIO.sampleRate;
    const decay = voice.waveform === 'glass' ? Math.exp(-time * SYNTH.glassDecay) : 1;
    const gain = voice.gain * envelope(time, voice.duration, voice.attack, voice.release) * decay;
    let value = 0;
    for (let partial = 0; partial < partials.length; partial += 1) {
      value += oscillator(voice.waveform, phaseStep * (frame - startFrame) * ratios[partial]) * partials[partial];
    }
    value *= gain / partialTotal;
    buffer.left[frame] += value * leftPan;
    buffer.right[frame] += value * rightPan;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain */
function addKick(buffer, start, gain) {
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + DRUM.kickDuration) * AUDIO.sampleRate));
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const phase = MIX.tau * (DRUM.kickEndHz * time + (DRUM.kickStartHz - DRUM.kickEndHz) / DRUM.kickPitchDecay * (1 - Math.exp(-time * DRUM.kickPitchDecay)));
    const value = Math.sin(phase) * Math.exp(-time * DRUM.kickDecay) * gain;
    buffer.left[frame] += value * DRUM.kickChannelLevel;
    buffer.right[frame] += value * DRUM.kickChannelLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain @param {Random} random */
function addSnare(buffer, start, gain, random) {
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + DRUM.snareDuration) * AUDIO.sampleRate));
  let filtered = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const white = randomUnit(random) * 2 - 1;
    filtered += (white - filtered) * DRUM.snareFilterAlpha;
    const noise = (white - filtered * DRUM.snareFilterMix) * Math.exp(-time * DRUM.snareDecay);
    const tone = Math.sin(MIX.tau * DRUM.snareToneHz * time) * Math.exp(-time * DRUM.snareToneDecay) * DRUM.snareToneLevel;
    const value = (noise * DRUM.snareNoiseLevel + tone) * gain;
    buffer.left[frame] += value * DRUM.snareLeftLevel;
    buffer.right[frame] += value * DRUM.snareRightLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain @param {Random} random */
function addHat(buffer, start, gain, random) {
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + DRUM.hatDuration) * AUDIO.sampleRate));
  let previous = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const white = randomUnit(random) * 2 - 1;
    const high = white - previous;
    previous = white;
    const value = high * Math.exp(-time * DRUM.hatDecay) * gain;
    buffer.left[frame] += value * DRUM.hatLeftLevel;
    buffer.right[frame] += value * DRUM.hatRightLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain */
function addClick(buffer, start, gain) {
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + DRUM.clickDuration) * AUDIO.sampleRate));
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const value = Math.sin(MIX.tau * EFFECTS.clickFrequency * time) * Math.exp(-time * EFFECTS.clickDecay) * gain;
    buffer.left[frame] += value * EFFECTS.clickLeftLevel;
    buffer.right[frame] += value * EFFECTS.clickRightLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain @param {Random} random */
function addWhoosh(buffer, start, gain, random) {
  const duration = EFFECTS.whooshSeconds;
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + duration) * AUDIO.sampleRate));
  let previous = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const noise = randomUnit(random) * 2 - 1;
    const high = noise - previous;
    previous = noise;
    const rise = smoothStep(time, 0, duration * EFFECTS.whooshRiseRatio);
    const fall = 1 - smoothStep(time, duration * EFFECTS.whooshFallRatio, duration);
    const pan = EFFECTS.whooshPanStart + time / duration * EFFECTS.whooshPanTravel;
    const [leftPan, rightPan] = panGains(pan);
    const value = high * rise * fall * gain;
    buffer.left[frame] += value * leftPan * EFFECTS.whooshChannelLevel;
    buffer.right[frame] += value * rightPan * EFFECTS.whooshChannelLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} gain */
function addSubDrop(buffer, start, gain) {
  const duration = EFFECTS.subDropSeconds;
  const begin = Math.max(0, Math.floor(start * AUDIO.sampleRate));
  const end = Math.min(FRAME_COUNT, Math.ceil((start + duration) * AUDIO.sampleRate));
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const frequency = EFFECTS.subDropStartFrequency - EFFECTS.subDropFrequencyFall * smoothStep(time, 0, duration);
    const value = Math.sin(MIX.tau * frequency * time) * Math.exp(-time * EFFECTS.subDropDecay) * gain;
    buffer.left[frame] += value * EFFECTS.subDropChannelLevel;
    buffer.right[frame] += value * EFFECTS.subDropChannelLevel;
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {readonly number[]} chord @param {number} gain */
function addPad(buffer, start, chord, gain) {
  const frequencies = chord.map(midiToFrequency);
  const duration = BAR_SECONDS * MIX.padBarOverlap;
  for (let index = 0; index < frequencies.length; index += 1) {
    addVoice(buffer, {
      start,
      duration,
      gain: gain / frequencies.length,
      pan: (index - MIX.padPanCenter) * MIX.padPanStep,
      waveform: 'triangle',
      attack: ENVELOPE.padAttack,
      release: ENVELOPE.padRelease,
      frequency: frequencies[index],
      detune: index % 2 === 0 ? -MIX.padDetuneCents : MIX.padDetuneCents,
    });
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} root @param {number} gain */
function addBassBar(buffer, start, root, gain) {
  const notes = VOICING.bassIntervals.map((interval) => root + interval);
  const positions = VOICING.bassBeats;
  for (let index = 0; index < notes.length; index += 1) {
    addVoice(buffer, {
      start: start + positions[index] * BEAT_SECONDS,
      duration: BEAT_SECONDS * (index === 0 ? VOICING.bassLongBeats : VOICING.bassShortBeats),
      gain,
      pan: 0,
      waveform: 'bass',
      attack: ENVELOPE.bassAttack,
      release: ENVELOPE.bassRelease,
      frequency: midiToFrequency(notes[index]),
    });
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {readonly number[]} chord @param {number} gain @param {number} section */
function addArpeggio(buffer, start, chord, gain, section) {
  const pattern = VOICING.arpeggioOrder;
  for (let step = 0; step < pattern.length; step += 1) {
    const accent = step % VOICING.arpeggioSubdivisions === 0 ? VOICING.arpeggioStrongAccent : step % 2 === 0 ? VOICING.arpeggioMediumAccent : VOICING.arpeggioSoftAccent;
    const octave = section >= SCORE.highArpeggioSection ? AUDIO.semitonesPerOctave : 0;
    addVoice(buffer, {
      start: start + step * BEAT_SECONDS / VOICING.arpeggioSubdivisions,
      duration: BEAT_SECONDS * VOICING.arpeggioDurationBeats,
      gain: gain * accent,
      pan: VOICING.arpeggioPanStart + (step % VOICING.arpeggioPanSteps) / (VOICING.arpeggioPanSteps - 1) * VOICING.arpeggioPanTravel,
      waveform: 'glass',
      attack: ENVELOPE.glassAttack,
      release: ENVELOPE.glassRelease,
      frequency: midiToFrequency(chord[pattern[step]] + octave),
      detune: VOICING.arpeggioDetune[step % VOICING.arpeggioDetune.length],
    });
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {readonly number[]} notes @param {number} gain */
function addMelodyBar(buffer, start, notes, gain) {
  const positions = VOICING.melodyBeats;
  for (let index = 0; index < positions.length; index += 1) {
    addVoice(buffer, {
      start: start + positions[index] * BEAT_SECONDS,
      duration: BEAT_SECONDS * (index % 2 === 0 ? VOICING.melodyLongBeats : VOICING.melodyShortBeats),
      gain: gain * (index === 0 ? VOICING.melodyStrongAccent : VOICING.melodySoftAccent),
      pan: VOICING.melodyPanCenter + (index % VOICING.melodyPanCycle - 1) * VOICING.melodyPanStep,
      waveform: 'glass',
      attack: ENVELOPE.glassAttack,
      release: ENVELOPE.glassRelease,
      frequency: midiToFrequency(notes[index % notes.length]),
      detune: VOICING.melodyDetune[index % VOICING.melodyDetune.length],
    });
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} level @param {Random} random */
function addDrumBar(buffer, start, level, random) {
  for (const beat of VOICING.drumKickBeats) addKick(buffer, start + beat * BEAT_SECONDS, level);
  for (const beat of VOICING.drumSnareBeats) addSnare(buffer, start + beat * BEAT_SECONDS, level * DRUM.snareLevel, random);
  for (let step = 0; step < VOICING.hatCount; step += 1) {
    const swing = step % 2 === 1 ? BEAT_SECONDS * DRUM.hatSwing : 0;
    addHat(buffer, start + step * BEAT_SECONDS / 2 + swing, level * (step % AUDIO.beatsPerBar === 2 ? DRUM.hatAccentLevel : DRUM.hatSoftLevel), random);
  }
}

/** @param {StereoBuffer} buffer @param {number} start @param {number} level @param {Random} random */
function addBuildBar(buffer, start, level, random) {
  addKick(buffer, start, level * DRUM.buildKickLevel);
  for (let step = 0; step < VOICING.hatCount; step += 1) {
    addHat(buffer, start + step * BEAT_SECONDS / 2, level * (DRUM.buildHatLevel + step / VOICING.hatCount * DRUM.buildHatRise), random);
  }
}

/** @param {StereoBuffer} buffer */
function applyReverb(buffer) {
  const maxTapFrames = Math.ceil(Math.max(...REVERB.taps) * AUDIO.sampleRate);
  const delayLeft = new Float32Array(maxTapFrames);
  const delayRight = new Float32Array(maxTapFrames);
  const indices = REVERB.taps.map((seconds) => Math.max(1, Math.round(seconds * AUDIO.sampleRate)));
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const dryLeft = buffer.left[frame];
    const dryRight = buffer.right[frame];
    let wetLeft = 0;
    let wetRight = 0;
    for (const delay of indices) {
      const source = (frame - delay + maxTapFrames) % maxTapFrames;
      wetLeft += delayLeft[source];
      wetRight += delayRight[source];
    }
    const write = frame % maxTapFrames;
    delayLeft[write] = dryLeft + (wetLeft * REVERB.feedback + wetRight * REVERB.cross) / indices.length;
    delayRight[write] = dryRight + (wetRight * REVERB.feedback + wetLeft * REVERB.cross) / indices.length;
    buffer.left[frame] = dryLeft + wetLeft * MIX.reverbLevel / indices.length;
    buffer.right[frame] = dryRight + wetRight * MIX.reverbLevel / indices.length;
  }
}

/** @param {StereoBuffer} buffer @returns {number} */
function master(buffer) {
  let peak = 0;
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const time = frame / AUDIO.sampleRate;
    const edgeFade = Math.min(1, time / MIX.fadeInSeconds, (AUDIO.totalSeconds - time) / MIX.fadeOutSeconds);
    buffer.left[frame] = Math.tanh(buffer.left[frame] * MIX.softClipDrive) * edgeFade;
    buffer.right[frame] = Math.tanh(buffer.right[frame] * MIX.softClipDrive) * edgeFade;
    peak = Math.max(peak, Math.abs(buffer.left[frame]), Math.abs(buffer.right[frame]));
  }
  const scale = peak > 0 ? TARGET_PEAK / peak : 1;
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    buffer.left[frame] *= scale;
    buffer.right[frame] *= scale;
  }
  return scale * peak;
}

/** @param {StereoBuffer} buffer @returns {Buffer} */
function encodeWave(buffer) {
  const blockAlign = AUDIO.channels * WAV.bytesPerSample;
  const dataBytes = FRAME_COUNT * blockAlign;
  const output = Buffer.alloc(WAV.headerBytes + dataBytes);
  output.write('RIFF', WAV.riffOffset);
  output.writeUInt32LE(output.length - WAV.riffLengthExclusion, WAV.lengthOffset);
  output.write('WAVEfmt ', WAV.formatNameOffset);
  output.writeUInt32LE(WAV.formatBytes, WAV.formatLengthOffset);
  output.writeUInt16LE(WAV.pcmFormat, WAV.encodingOffset);
  output.writeUInt16LE(AUDIO.channels, WAV.channelsOffset);
  output.writeUInt32LE(AUDIO.sampleRate, WAV.sampleRateOffset);
  output.writeUInt32LE(AUDIO.sampleRate * blockAlign, WAV.byteRateOffset);
  output.writeUInt16LE(blockAlign, WAV.blockAlignOffset);
  output.writeUInt16LE(AUDIO.bitDepth, WAV.bitDepthOffset);
  output.write('data', WAV.dataNameOffset);
  output.writeUInt32LE(dataBytes, WAV.dataSizeOffset);
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const offset = WAV.headerBytes + frame * blockAlign;
    output.writeInt16LE(Math.round(clampUnit(buffer.left[frame]) * WAV.scale), offset);
    output.writeInt16LE(Math.round(clampUnit(buffer.right[frame]) * WAV.scale), offset + WAV.bytesPerSample);
  }
  return output;
}

/** @param {StereoBuffer} dry @param {StereoBuffer} musical @param {Random} random */
function arrange(dry, musical, random) {
  for (let bar = 0; bar < AUDIO.bars; bar += 1) {
    const start = bar * BAR_SECONDS;
    const chord = SCORE.chords[bar === SCORE.resolveBar ? 0 : bar % SCORE.chords.length];
    const root = SCORE.roots[bar === SCORE.resolveBar ? 0 : bar % SCORE.roots.length];
    const section = SCORE.sectionStartBars.reduce((selected, begin, index) => bar >= begin ? index : selected, 0);
    const energy = SCORE.sectionEnergy[section];
    addPad(musical, start, chord.map((note) => note + AUDIO.semitonesPerOctave), MIX.padLevel * energy);
    if (bar >= SCORE.bassStartBar && bar < SCORE.resolveBar) addBassBar(dry, start, root, MIX.bassLevel * energy);
    if (bar >= SCORE.bassStartBar && bar < SCORE.resolveBar) addArpeggio(musical, start, chord, MIX.glassLevel * energy, section);
    if (bar >= SCORE.drumsStartBar && bar < SCORE.finalMelodyBar) addMelodyBar(musical, start, SCORE.melodies[bar % SCORE.melodies.length], MIX.melodyLevel * energy);
    if (bar >= SCORE.drumsStartBar && bar < SCORE.outroStartBar) addDrumBar(dry, start, MIX.drumLevel * energy, random);
    if (bar === SCORE.bassStartBar) addBuildBar(dry, start + BEAT_SECONDS * SCORE.buildOffsetBeats, SCORE.buildLevel, random);
    if (bar === SCORE.outroStartBar) {
      addDrumBar(dry, start, SCORE.outroDrumLevel, random);
      addSubDrop(dry, start + BEAT_SECONDS * SCORE.subDropBeats, SCORE.subDropLevel);
    }
    if (bar === SCORE.finalMelodyBar) {
      addDrumBar(dry, start, SCORE.finalDrumLevel, random);
      addMelodyBar(musical, start, SCORE.finalMelody, SCORE.finalMelodyLevel);
    }
    if (bar === SCORE.resolveBar) {
      addVoice(dry, {
        start: start,
        duration: BAR_SECONDS * SCORE.resolveBassDurationBars,
        gain: SCORE.resolveBassLevel,
        pan: 0,
        waveform: 'triangle',
        attack: ENVELOPE.padAttack,
        release: ENVELOPE.padRelease,
        frequency: midiToFrequency(SCORE.resolveBassMidi),
      });
      addVoice(musical, {
        start: start,
        duration: BAR_SECONDS * SCORE.resolveGlassDurationBars,
        gain: SCORE.resolveGlassLevel,
        pan: 0,
        waveform: 'glass',
        attack: ENVELOPE.glassAttack,
        release: ENVELOPE.glassRelease,
        frequency: midiToFrequency(SCORE.resolveGlassMidi),
      });
    }
    if (SCORE.transitionBars.has(bar)) {
      addWhoosh(dry, start - EFFECTS.transitionAnticipation, MIX.transitionLevel + energy * MIX.transitionEnergyLevel, random);
      addClick(dry, start, MIX.clickLevel + energy * MIX.clickEnergyLevel);
    }
  }
  addWhoosh(dry, EFFECTS.finalWhooshStart, EFFECTS.finalWhooshLevel, random);
  applyReverb(musical);
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    dry.left[frame] += musical.left[frame];
    dry.right[frame] += musical.right[frame];
  }
}

/** @param {string} target @returns {Promise<void>} */
async function main(target) {
  const buffer = createBuffer();
  arrange(buffer, createBuffer(), createRandom());
  const peak = master(buffer);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, encodeWave(buffer));
  console.info(`已生成 ${target}`);
  console.info(`规格：${AUDIO.sampleRate} Hz，${AUDIO.channels} 声道，${AUDIO.totalSeconds} 秒，${AUDIO.bpm} BPM`);
  console.info(`峰值：${(AUDIO.decibelAmplitudeDivisor * Math.log10(Math.max(peak, Number.EPSILON))).toFixed(2)} dBFS`);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');
const outputPath = path.resolve(projectRoot, OUTPUT.directory, OUTPUT.fileName);
await main(outputPath);

\n