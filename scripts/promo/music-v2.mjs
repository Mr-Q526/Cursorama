/**
 * Cursorama 第二版宣传片的原创 44 秒电子配乐。
 * 声音由 JavaScript 加法合成、噪声滤波、节奏切片和立体声延迟生成。
 * ffmpeg 只负责最终响度与真实峰值控制，不加载外部音频素材。
 */
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

/** @typedef {{ left: Float32Array, right: Float32Array }} StereoBuffer */
/** @typedef {{ state: number }} RandomState */
/** @typedef {'pad'|'slice'|'sub'|'bass'|'reverse'} ToneKind */
/** @typedef {{ start: number, midi: number, duration: number, gain: number, pan: number, kind: ToneKind }} Tone */
/** @typedef {{ input_i: string, input_tp: string, input_lra: string, input_thresh: string, target_offset: string }} LoudnessMeasurement */

const AUDIO = {
  sampleRate: 48_000, channels: 2, bitDepth: 16, seconds: 44, bpm: 120, bars: 22,
  beatsPerBar: 4, secondsPerMinute: 60, octave: 12, concertMidi: 69, concertHz: 440,
  tau: Math.PI * 2, bitDepthDivisor: 8, pcmScale: 32_767,
};
const TIMING = {
  beat: AUDIO.secondsPerMinute / AUDIO.bpm,
  bar: AUDIO.beatsPerBar * AUDIO.secondsPerMinute / AUDIO.bpm,
  frames: AUDIO.sampleRate * AUDIO.seconds,
  transitions: [4, 8, 18, 27, 35, 39],
  sectionStarts: [0, 4, 8, 18, 27, 35, 39],
  finalChord: 42, finalTail: 1.72, finalFade: 0.82, beginningFade: 0.06,
};
const MASTER = { integrated: -15, truePeak: -2, loudnessRange: 6, sourcePeak: 0.8, softDrive: 1.12, maxOutputBytes: 8 * 1_024 * 1_024 };
const RANDOM = { seed: 0x1244ad71, multiplier: 1_664_525, increment: 1_013_904_223, modulus: 4_294_967_296 };
const FILTER = { airHigh: 5_200, airLow: 440, snareLow: 850, snareHigh: 6_000, hatLow: 3_500, hatHigh: 8_000, dcCutoff: 26 };
const TONE = {
  padAttack: 0.27, padRelease: 0.62, padVibratoRate: 0.34, padDetune: 0.0035,
  sliceAttack: 0.003, sliceDecay: 8.5, sliceRelease: 0.042, sliceCutoff: 3_100,
  bassAttack: 0.009, bassRelease: 0.07, bassDecay: 1.3,
  subAttack: 0.024, subRelease: 0.11,
  reverseAttackExponent: 2.6, reverseRelease: 0.032,
  padPartials: [0.72, 0.2, 0.08], padRatios: [1, 2, 3],
  slicePartials: [0.7, 0.18, 0.09, 0.03], sliceRatios: [1, 2, 3.002, 4],
  bassPartials: [0.82, 0.14, 0.04], bassRatios: [1, 2, 3],
  padStereo: 0.83, sliceStereo: 0.6, subLevel: 0.12, bassLevel: 0.15,
  padLevel: 0.17, sliceLevel: 0.078, leadLevel: 0.07,
};
const DRUM = {
  kickSeconds: 0.38, kickAttackHz: 172, kickBodyHz: 48, kickPitchDecay: 45, kickAmplitudeDecay: 11.2,
  kickClickHz: 1_150, kickClickGain: 0.065, kickClickDecay: 128, kickLevel: 0.29,
  snareSeconds: 0.2, snareAttack: 0.001, snareNoiseDecay: 24, snareBodyHz: 184,
  snareBodyGain: 0.28, snareBodyDecay: 27, snareLevel: 0.18,
  clapDelay: 0.008, clapRepeats: 3, clapLevel: 0.048,
  hatSeconds: 0.059, openHatSeconds: 0.16, hatDecay: 67, openHatDecay: 25, hatLevel: 0.033,
  ghostSnareLevel: 0.045, rimLevel: 0.023,
  fillBeats: [2.5, 2.875, 3.25, 3.5, 3.75], fillLevel: 0.078,
  kickPatterns: [[0, 1.5, 2, 3.25], [0, 0.75, 2.5, 3.5], [0, 1.75, 2.5, 3.25]],
  snares: [1, 3], ghosts: [1.75, 2.875], hatCount: 16, hatSubdivision: 4,
  hatAccent: [0.85, 0.32, 0.58, 0.39, 0.7, 0.26, 1, 0.33], hatSwingSeconds: 0.008,
  rimBeats: [0.5, 2.25, 3.75],
};
const SPACE = {
  taps: [0.107, 0.193, 0.317, 0.463, 0.691], rightOffset: 0.016,
  feedback: 0.44, crossFeedback: 0.08, damping: 0.17, wet: 0.2,
};
const EFFECT = {
  reverseSeconds: 0.82, reversePeak: 0.11, reversePanStart: -0.65, reversePanRange: 1.3,
  reverseToneMidi: 81, reverseToneLevel: 0.052, impactSeconds: 0.6,
  impactStartHz: 88, impactEndHz: 35, impactPitchDecay: 9, impactDecay: 8.5, impactLevel: 0.11,
  tickSeconds: 0.032, tickHz: 980, tickDecay: 127, tickLevel: 0.035,
  duckSeconds: 0.2, duckMinimum: 0.43, duckRecoverExponent: 0.7,
};
const SCORE = {
  chords: [[50, 53, 57, 60, 64], [46, 50, 53, 57, 60], [53, 57, 60, 64, 67], [48, 52, 55, 60, 62]],
  bassRoots: [38, 34, 41, 36],
  energy: [0.42, 0.77, 1, 1.09, 0.94, 1.03, 0.81],
  padEnergy: [1.05, 0.9, 0.78, 1, 1.12, 0.9, 1.2],
  subBeats: [0, 1.5, 2.5, 3.25], bassBeats: [0.25, 1.75, 2.75, 3.5],
  bassIntervals: [0, 0, 7, 12], bassDuration: 0.31, subDuration: 0.63,
  sliceBeats: [0.25, 0.75, 1.5, 2.25, 2.75, 3.5, 3.75],
  sliceOrder: [2, 3, 1, 2, 4, 1, 3], sliceDuration: 0.19,
  hookBeats: [0, 0.75, 1.5, 2.5, 3.25], hookNotes: [74, 69, 76, 77, 74], hookDuration: 0.18,
  leadBeats: [0.75, 1.75, 2.5, 3.25], leadChordOrder: [4, 2, 3, 1], leadDuration: 0.23,
  leadPan: [-0.25, 0.12, 0.4, -0.16],
  introBars: 2, brandBars: 4, breakBar: 9, backgroundBar: 14, exportBar: 18, closingBar: 20,
  fillBars: new Set([3, 8, 12, 16, 18]),
  openingImpacts: [0.13, 2.05], openingTicks: [0.5, 0.875, 1.5, 2.75, 3.25, 3.5, 3.75],
  finaleChord: [50, 53, 57, 62, 69], finaleBassMidi: 26, finaleMotif: [74, 77, 69],
  finaleMotifOffsets: [0, 0.23, 0.45], finaleMotifDuration: 0.72,
};
const WAV = { header: 44, riffOffset: 0, lengthOffset: 4, formatOffset: 8, formatSizeOffset: 16, pcmOffset: 20, channelsOffset: 22, sampleRateOffset: 24, byteRateOffset: 28, alignmentOffset: 32, bitDepthOffset: 34, dataOffset: 36, dataSizeOffset: 40, formatSize: 16, pcm: 1, riffExcluded: 8 };

/** @param {RandomState} random @returns {number} */
function noise(random) {
  random.state = (Math.imul(random.state, RANDOM.multiplier) + RANDOM.increment) >>> 0;
  return random.state / RANDOM.modulus * 2 - 1;
}
/** @param {number} value @returns {number} */
function unit(value) { return Math.max(0, Math.min(1, value)); }
/** @param {number} midi @returns {number} */
function hz(midi) { return AUDIO.concertHz * 2 ** ((midi - AUDIO.concertMidi) / AUDIO.octave); }
/** @param {number} frequency @returns {number} */
function filterAlpha(frequency) { return 1 - Math.exp(-AUDIO.tau * frequency / AUDIO.sampleRate); }
/** @returns {StereoBuffer} */
function buffer() { return { left: new Float32Array(TIMING.frames), right: new Float32Array(TIMING.frames) }; }
/** @param {number} start @param {number} duration @returns {[number, number]} */
function frameRange(start, duration) { return [Math.max(0, Math.floor(start * AUDIO.sampleRate)), Math.min(TIMING.frames, Math.ceil((start + duration) * AUDIO.sampleRate))]; }
/** @param {number} pan @returns {[number, number]} */
function panGains(pan) { const angle = (unit((pan + 1) / 2)) * Math.PI / 2; return [Math.cos(angle), Math.sin(angle)]; }
/** @param {StereoBuffer} track @param {number} frame @param {number} sample @param {[number,number]} gains */
function addSample(track, frame, sample, gains) { track.left[frame] += sample * gains[0]; track.right[frame] += sample * gains[1]; }
/** @param {number} time @param {number} duration @param {number} attack @param {number} release @returns {number} */
function envelope(time, duration, attack, release) { return unit(time / attack) * unit((duration - time) / release) ** 2; }

/** @param {StereoBuffer} track @param {Tone} tone */
function addTone(track, tone) {
  const [begin, end] = frameRange(tone.start, tone.duration);
  const frequency = hz(tone.midi);
  const gains = panGains(tone.pan);
  const alpha = filterAlpha(TONE.sliceCutoff);
  let filtered = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const phase = AUDIO.tau * frequency * time;
    let value = 0;
    let amplitude = 1;
    if (tone.kind === 'sub') {
      value = Math.sin(phase);
      amplitude = envelope(time, tone.duration, TONE.subAttack, TONE.subRelease);
    } else if (tone.kind === 'pad' || tone.kind === 'reverse') {
      for (let partial = 0; partial < TONE.padPartials.length; partial += 1) {
        const detune = TONE.padDetune * Math.sin(time * AUDIO.tau * TONE.padVibratoRate + partial);
        value += (Math.sin(phase * TONE.padRatios[partial] * (1 + detune)) + Math.sin(phase * TONE.padRatios[partial] * (1 - detune))) * TONE.padPartials[partial] / 2;
      }
      amplitude = tone.kind === 'reverse' ? unit(time / tone.duration) ** TONE.reverseAttackExponent * unit((tone.duration - time) / TONE.reverseRelease) : envelope(time, tone.duration, TONE.padAttack, TONE.padRelease);
    } else {
      const ratios = tone.kind === 'bass' ? TONE.bassRatios : TONE.sliceRatios;
      const partials = tone.kind === 'bass' ? TONE.bassPartials : TONE.slicePartials;
      for (let partial = 0; partial < partials.length; partial += 1) value += Math.sin(phase * ratios[partial]) * partials[partial];
      const decay = tone.kind === 'bass' ? TONE.bassDecay : TONE.sliceDecay;
      const attack = tone.kind === 'bass' ? TONE.bassAttack : TONE.sliceAttack;
      const release = tone.kind === 'bass' ? TONE.bassRelease : TONE.sliceRelease;
      amplitude = envelope(time, tone.duration, attack, release) * Math.exp(-time * decay);
      filtered += alpha * (value - filtered); value = filtered;
    }
    addSample(track, frame, value * amplitude * tone.gain, gains);
  }
}

/** @param {StereoBuffer} dry @param {number} start @param {number} gain @param {Float32Array} duck */
function kick(dry, start, gain, duck) {
  const [begin, end] = frameRange(start, DRUM.kickSeconds);
  const gains = panGains(0);
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const phase = AUDIO.tau * (DRUM.kickBodyHz * time + (DRUM.kickAttackHz - DRUM.kickBodyHz) / DRUM.kickPitchDecay * (1 - Math.exp(-DRUM.kickPitchDecay * time)));
    const body = Math.sin(phase) * Math.exp(-time * DRUM.kickAmplitudeDecay);
    const click = Math.sin(time * AUDIO.tau * DRUM.kickClickHz) * Math.exp(-time * DRUM.kickClickDecay) * DRUM.kickClickGain;
    const tail = unit((DRUM.kickSeconds - time) / TONE.bassRelease);
    addSample(dry, frame, (body + click) * tail * gain, gains);
  }
  const [, duckEnd] = frameRange(start, EFFECT.duckSeconds);
  for (let frame = begin; frame < duckEnd; frame += 1) {
    const progress = (frame - begin) / (duckEnd - begin);
    duck[frame] = Math.min(duck[frame], EFFECT.duckMinimum + (1 - EFFECT.duckMinimum) * progress ** EFFECT.duckRecoverExponent);
  }
}

/** @param {StereoBuffer} dry @param {RandomState} random @param {number} start @param {number} gain @param {boolean} ghost */
function snare(dry, random, start, gain, ghost = false) {
  const [begin, end] = frameRange(start, DRUM.snareSeconds);
  const lowAlpha = filterAlpha(FILTER.snareLow); const highAlpha = filterAlpha(FILTER.snareHigh);
  const gains = panGains(ghost ? -0.18 : 0.04);
  let low = 0; let high = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const white = noise(random); low += lowAlpha * (white - low); high += highAlpha * (white - high);
    const hiss = (high - low) * Math.exp(-time * DRUM.snareNoiseDecay);
    const body = Math.sin(AUDIO.tau * DRUM.snareBodyHz * time) * Math.exp(-time * DRUM.snareBodyDecay) * DRUM.snareBodyGain;
    addSample(dry, frame, (hiss + body) * envelope(time, DRUM.snareSeconds, DRUM.snareAttack, TONE.sliceRelease) * gain, gains);
  }
}

/** @param {StereoBuffer} dry @param {RandomState} random @param {number} start @param {number} gain @param {boolean} open @param {number} pan */
function hat(dry, random, start, gain, open, pan) {
  const duration = open ? DRUM.openHatSeconds : DRUM.hatSeconds;
  const [begin, end] = frameRange(start, duration); const gains = panGains(pan);
  const lowAlpha = filterAlpha(FILTER.hatLow); const highAlpha = filterAlpha(FILTER.hatHigh);
  let low = 0; let high = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate; const white = noise(random);
    low += lowAlpha * (white - low); high += highAlpha * (white - high);
    const value = (high - low) * Math.exp(-time * (open ? DRUM.openHatDecay : DRUM.hatDecay)) * unit((duration - time) / TONE.sliceRelease);
    addSample(dry, frame, value * gain, gains);
  }
}

/** @param {StereoBuffer} dry @param {number} start @param {number} gain */
function tick(dry, start, gain) {
  const [begin, end] = frameRange(start, EFFECT.tickSeconds); const gains = panGains(-0.35);
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    addSample(dry, frame, Math.sin(AUDIO.tau * EFFECT.tickHz * time) * Math.exp(-time * EFFECT.tickDecay) * gain, gains);
  }
}

/** @param {StereoBuffer} dry @param {StereoBuffer} space @param {RandomState} random @param {number} transition */
function transition(dry, space, random, transition) {
  const start = transition - EFFECT.reverseSeconds;
  const [begin, end] = frameRange(start, EFFECT.reverseSeconds);
  const lowAlpha = filterAlpha(FILTER.airLow); const highAlpha = filterAlpha(FILTER.airHigh);
  let low = 0; let high = 0;
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate; const progress = time / EFFECT.reverseSeconds;
    const white = noise(random); low += lowAlpha * (white - low); high += highAlpha * (white - high);
    const sweep = progress ** TONE.reverseAttackExponent * unit((EFFECT.reverseSeconds - time) / TONE.reverseRelease);
    addSample(space, frame, (high - low) * sweep * EFFECT.reversePeak, panGains(EFFECT.reversePanStart + progress * EFFECT.reversePanRange));
  }
  addTone(space, { start, midi: EFFECT.reverseToneMidi, duration: EFFECT.reverseSeconds, gain: EFFECT.reverseToneLevel, pan: 0.4, kind: 'reverse' });
  impact(dry, transition, EFFECT.impactLevel);
  tick(dry, transition, EFFECT.tickLevel);
}

/** @param {StereoBuffer} dry @param {number} start @param {number} gain */
function impact(dry, start, gain) {
  const [begin, end] = frameRange(start, EFFECT.impactSeconds); const gains = panGains(0);
  for (let frame = begin; frame < end; frame += 1) {
    const time = (frame - begin) / AUDIO.sampleRate;
    const phase = AUDIO.tau * (EFFECT.impactEndHz * time + (EFFECT.impactStartHz - EFFECT.impactEndHz) / EFFECT.impactPitchDecay * (1 - Math.exp(-time * EFFECT.impactPitchDecay)));
    addSample(dry, frame, Math.sin(phase) * Math.exp(-time * EFFECT.impactDecay) * unit((EFFECT.impactSeconds - time) / TONE.subRelease) * gain, gains);
  }
}

/** @param {StereoBuffer} dry @param {RandomState} random @param {Float32Array} duck @param {number} bar @param {number} gain */
function rhythm(dry, random, duck, bar, gain) {
  const start = bar * TIMING.bar;
  for (const beat of DRUM.kickPatterns[bar % DRUM.kickPatterns.length]) kick(dry, start + beat * TIMING.beat, DRUM.kickLevel * gain, duck);
  for (const beat of DRUM.snares) {
    snare(dry, random, start + beat * TIMING.beat, DRUM.snareLevel * gain);
    for (let repeat = 0; repeat < DRUM.clapRepeats; repeat += 1) snare(dry, random, start + beat * TIMING.beat + repeat * DRUM.clapDelay, DRUM.clapLevel * gain, true);
  }
  for (const beat of DRUM.ghosts) if (bar % 2 === 0) snare(dry, random, start + beat * TIMING.beat, DRUM.ghostSnareLevel * gain, true);
  for (let step = 0; step < DRUM.hatCount; step += 1) {
    if (step % 4 === 1 && bar % 3 !== 0) continue;
    const swing = step % 2 === 1 ? DRUM.hatSwingSeconds : 0;
    const accent = DRUM.hatAccent[step % DRUM.hatAccent.length];
    hat(dry, random, start + step * TIMING.beat / DRUM.hatSubdivision + swing, DRUM.hatLevel * accent * gain, step === DRUM.hatCount - 2, step % 2 === 0 ? 0.31 : -0.42);
  }
  for (const beat of DRUM.rimBeats) tick(dry, start + beat * TIMING.beat, DRUM.rimLevel * gain);
  if (SCORE.fillBars.has(bar)) for (const beat of DRUM.fillBeats) snare(dry, random, start + beat * TIMING.beat, DRUM.fillLevel * gain, true);
}

/** @param {StereoBuffer} space */
function addSpace(space) {
  const lines = SPACE.taps.map((seconds) => ({ left: new Float32Array(Math.ceil(seconds * AUDIO.sampleRate)), right: new Float32Array(Math.ceil((seconds + SPACE.rightOffset) * AUDIO.sampleRate)), leftIndex: 0, rightIndex: 0, filteredLeft: 0, filteredRight: 0 }));
  for (let frame = 0; frame < TIMING.frames; frame += 1) {
    const left = space.left[frame]; const right = space.right[frame]; let wetLeft = 0; let wetRight = 0;
    for (const line of lines) {
      const delayedLeft = line.left[line.leftIndex]; const delayedRight = line.right[line.rightIndex];
      line.filteredLeft += SPACE.damping * (delayedLeft - line.filteredLeft); line.filteredRight += SPACE.damping * (delayedRight - line.filteredRight);
      line.left[line.leftIndex] = left + line.filteredLeft * SPACE.feedback + line.filteredRight * SPACE.crossFeedback;
      line.right[line.rightIndex] = right + line.filteredRight * SPACE.feedback + line.filteredLeft * SPACE.crossFeedback;
      line.leftIndex = (line.leftIndex + 1) % line.left.length; line.rightIndex = (line.rightIndex + 1) % line.right.length;
      wetLeft += delayedLeft; wetRight += delayedRight;
    }
    space.left[frame] = left + wetLeft * SPACE.wet / lines.length; space.right[frame] = right + wetRight * SPACE.wet / lines.length;
  }
}

/** @returns {StereoBuffer} */
function compose() {
  const dry = buffer(); const musical = buffer(); const bass = buffer();
  const duck = new Float32Array(TIMING.frames).fill(1); const random = { state: RANDOM.seed };
  for (let bar = 0; bar < AUDIO.bars - 1; bar += 1) {
    const start = bar * TIMING.bar; const chord = SCORE.chords[bar % SCORE.chords.length];
    const section = TIMING.sectionStarts.reduce((selected, begins, index) => start >= begins ? index : selected, 0);
    const energy = SCORE.energy[section]; const root = SCORE.bassRoots[bar % SCORE.bassRoots.length];
    chord.forEach((midi, index) => addTone(musical, { start, midi: midi + AUDIO.octave, duration: TIMING.bar + TONE.padRelease, gain: TONE.padLevel * SCORE.padEnergy[section] / chord.length, pan: (index / (chord.length - 1) - 0.5) * TONE.padStereo, kind: 'pad' }));
    if (bar >= SCORE.introBars) {
      SCORE.subBeats.forEach((beat) => addTone(bass, { start: start + beat * TIMING.beat, midi: root - AUDIO.octave, duration: SCORE.subDuration, gain: TONE.subLevel * energy, pan: 0, kind: 'sub' }));
      SCORE.bassBeats.forEach((beat, index) => addTone(bass, { start: start + beat * TIMING.beat, midi: root + SCORE.bassIntervals[index], duration: SCORE.bassDuration, gain: TONE.bassLevel * energy, pan: 0, kind: 'bass' }));
      SCORE.sliceBeats.forEach((beat, index) => addTone(musical, { start: start + beat * TIMING.beat, midi: chord[SCORE.sliceOrder[index]], duration: SCORE.sliceDuration, gain: TONE.sliceLevel * energy, pan: index % 2 === 0 ? -TONE.sliceStereo : TONE.sliceStereo, kind: 'slice' }));
    }
    if (bar >= SCORE.introBars && bar < SCORE.closingBar) rhythm(dry, random, duck, bar, energy);
    if (bar >= SCORE.brandBars && bar % 2 === 0) SCORE.leadBeats.forEach((beat, index) => addTone(musical, { start: start + beat * TIMING.beat, midi: chord[SCORE.leadChordOrder[index]] + AUDIO.octave, duration: SCORE.leadDuration, gain: TONE.leadLevel * energy, pan: SCORE.leadPan[index], kind: 'slice' }));
    if (bar === 1 || bar === SCORE.breakBar || bar === SCORE.exportBar) SCORE.hookBeats.forEach((beat, index) => addTone(musical, { start: start + beat * TIMING.beat, midi: SCORE.hookNotes[index], duration: SCORE.hookDuration, gain: TONE.leadLevel * energy, pan: SCORE.leadPan[index % SCORE.leadPan.length], kind: 'slice' }));
  }
  for (const start of SCORE.openingImpacts) impact(dry, start, EFFECT.impactLevel);
  for (const start of SCORE.openingTicks) tick(dry, start, EFFECT.tickLevel);
  for (const time of TIMING.transitions) transition(dry, musical, random, time);
  SCORE.finaleChord.forEach((midi, index) => addTone(musical, { start: TIMING.finalChord, midi, duration: TIMING.finalTail, gain: TONE.padLevel / SCORE.finaleChord.length, pan: (index - 2) / 4, kind: 'pad' }));
  addTone(bass, { start: TIMING.finalChord, midi: SCORE.finaleBassMidi, duration: TIMING.finalTail, gain: TONE.subLevel, pan: 0, kind: 'sub' });
  SCORE.finaleMotif.forEach((midi, index) => addTone(musical, { start: TIMING.finalChord + SCORE.finaleMotifOffsets[index], midi, duration: SCORE.finaleMotifDuration, gain: TONE.leadLevel, pan: SCORE.leadPan[index], kind: 'slice' }));
  impact(dry, TIMING.finalChord, EFFECT.impactLevel);
  addSpace(musical);
  for (let frame = 0; frame < TIMING.frames; frame += 1) {
    dry.left[frame] += bass.left[frame] * duck[frame] + musical.left[frame] * Math.sqrt(duck[frame]);
    dry.right[frame] += bass.right[frame] * duck[frame] + musical.right[frame] * Math.sqrt(duck[frame]);
  }
  return dry;
}

/** @param {StereoBuffer} track */
function prepareMaster(track) {
  const alpha = filterAlpha(FILTER.dcCutoff); let dcLeft = 0; let dcRight = 0; let peak = 0;
  for (let frame = 0; frame < TIMING.frames; frame += 1) {
    const time = frame / AUDIO.sampleRate; const fade = Math.min(1, time / TIMING.beginningFade, (AUDIO.seconds - time) / TIMING.finalFade);
    dcLeft += alpha * (track.left[frame] - dcLeft); dcRight += alpha * (track.right[frame] - dcRight);
    track.left[frame] = Math.tanh((track.left[frame] - dcLeft) * MASTER.softDrive) * fade;
    track.right[frame] = Math.tanh((track.right[frame] - dcRight) * MASTER.softDrive) * fade;
    peak = Math.max(peak, Math.abs(track.left[frame]), Math.abs(track.right[frame]));
  }
  const scale = MASTER.sourcePeak / Math.max(peak, Number.EPSILON);
  for (let frame = 0; frame < TIMING.frames; frame += 1) { track.left[frame] *= scale; track.right[frame] *= scale; }
}

/** @param {StereoBuffer} track @returns {Buffer} */
function wave(track) {
  const bytesPerSample = AUDIO.bitDepth / AUDIO.bitDepthDivisor; const alignment = AUDIO.channels * bytesPerSample;
  const output = Buffer.alloc(WAV.header + TIMING.frames * alignment);
  output.write('RIFF', WAV.riffOffset); output.writeUInt32LE(output.length - WAV.riffExcluded, WAV.lengthOffset); output.write('WAVEfmt ', WAV.formatOffset);
  output.writeUInt32LE(WAV.formatSize, WAV.formatSizeOffset); output.writeUInt16LE(WAV.pcm, WAV.pcmOffset); output.writeUInt16LE(AUDIO.channels, WAV.channelsOffset);
  output.writeUInt32LE(AUDIO.sampleRate, WAV.sampleRateOffset); output.writeUInt32LE(AUDIO.sampleRate * alignment, WAV.byteRateOffset);
  output.writeUInt16LE(alignment, WAV.alignmentOffset); output.writeUInt16LE(AUDIO.bitDepth, WAV.bitDepthOffset); output.write('data', WAV.dataOffset); output.writeUInt32LE(output.length - WAV.header, WAV.dataSizeOffset);
  for (let frame = 0; frame < TIMING.frames; frame += 1) {
    const offset = WAV.header + frame * alignment;
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.left[frame])) * AUDIO.pcmScale), offset);
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.right[frame])) * AUDIO.pcmScale), offset + bytesPerSample);
  }
  return output;
}

/** @param {string[]} argumentsList @param {Buffer} input @returns {string} */
function executeFfmpeg(argumentsList, input) {
  if (typeof ffmpeg !== 'string' || !ffmpeg) throw new Error('PROMO_FFMPEG_MISSING');
  const result = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-y', ...argumentsList], { input, windowsHide: true, maxBuffer: MASTER.maxOutputBytes });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PROMO_AUDIO_MASTER_FAILED: ${result.stderr.toString('utf8')}`);
  return result.stderr.toString('utf8');
}

/** @param {Buffer} input @param {string} target */
async function normalize(input, target) {
  const filter = `loudnorm=I=${MASTER.integrated}:TP=${MASTER.truePeak}:LRA=${MASTER.loudnessRange}`;
  const report = executeFfmpeg(['-i', 'pipe:0', '-af', `${filter}:print_format=json`, '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'], input);
  const jsonStart = report.lastIndexOf('{'); const jsonEnd = report.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('PROMO_AUDIO_MEASUREMENT_MISSING');
  /** @type {LoudnessMeasurement} */
  const measured = JSON.parse(report.slice(jsonStart, jsonEnd + 1));
  const normalization = `${filter}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  executeFfmpeg(['-loglevel', 'error', '-i', 'pipe:0', '-af', normalization, '-ar', String(AUDIO.sampleRate), '-ac', String(AUDIO.channels), '-c:a', 'pcm_s16le', '-t', String(AUDIO.seconds), target], input);
}

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, '..', '..');
const output = path.join(projectRoot, '.qa', 'promo-v2', 'soundtrack.wav');
await mkdir(path.dirname(output), { recursive: true });
const audio = compose(); prepareMaster(audio);
await normalize(wave(audio), output);
console.info(`已生成第二版原创配乐：${output}`);
console.info(`44 秒，120 BPM，D 小调，48 kHz 双声道；母带目标 ${MASTER.integrated} LUFS / ${MASTER.truePeak} dBTP。`);
