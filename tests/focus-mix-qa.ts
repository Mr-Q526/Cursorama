import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FocusSoundExportReport } from './focus-sound-qa';

export interface FocusMixReport { cueLevels: number[]; idleLevel: number; disabledLevel: number; musicIdleLevel: number; mixedIdleLevel: number; mixedCueLevels: number[]; musicCueLevels: number[]; }
const execute = promisify(execFile);
const QA = { sampleRate: 44_100, bytesPerSample: 4, cueOffset: 0.06, cueLength: 0.38, idleStart: 1.6, idleEnd: 2.1, minimumCueLevel: 0.001, maximumSilence: 0.0001, minimumMusic: 0.0001, mixedRatio: 1.2, musicContinuityTolerance: 0.4, minimumDuration: 3.7, maximumDuration: 4.2 } as const;

async function decodeAudio(root: string, file: string): Promise<Float32Array> {
  const executable = path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe');
  const probe = await execute(executable, ['-hide_banner', '-i', file, '-f', 'null', 'NUL'], { windowsHide: true });
  if (!probe.stderr.includes('Audio:')) return new Float32Array();
  const { stdout } = await execute(executable, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(QA.sampleRate), '-f', 'f32le', 'pipe:1'], { windowsHide: true, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  const samples = new Float32Array(stdout.length / QA.bytesPerSample);
  for (let index = 0; index < samples.length; index++) samples[index] = stdout.readFloatLE(index * QA.bytesPerSample);
  return samples;
}

function energy(samples: Float32Array, start: number, end: number): number {
  const from = Math.floor(start * QA.sampleRate); const to = Math.min(samples.length, Math.floor(end * QA.sampleRate));
  let sum = 0;
  for (let index = from; index < to; index++) sum += samples[index] ** 2;
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

export async function verifyFocusMixQA(root: string, exports: FocusSoundExportReport): Promise<FocusMixReport> {
  const [isolated, disabled, mixed, music] = await Promise.all([exports.isolated, exports.disabled, exports.mixed, exports.musicOnly].map((file) => decodeAudio(root, file)));
  for (const samples of [isolated, mixed, music]) {
    const duration = samples.length / QA.sampleRate;
    if (duration < QA.minimumDuration || duration > QA.maximumDuration) throw new Error(`QA_FOCUS_AUDIO_DURATION:${duration}`);
  }
  const cueEnergy = (samples: Float32Array): number[] => exports.cues.map((time) => energy(samples, time + QA.cueOffset, time + QA.cueOffset + QA.cueLength));
  const cueLevels = cueEnergy(isolated);
  const idleLevel = energy(isolated, QA.idleStart, QA.idleEnd);
  const disabledLevel = energy(disabled, 0, QA.maximumDuration);
  const mixedCueLevels = cueEnergy(mixed); const musicCueLevels = cueEnergy(music);
  const musicIdleLevel = energy(music, QA.idleStart, QA.idleEnd); const mixedIdleLevel = energy(mixed, QA.idleStart, QA.idleEnd);
  if (cueLevels.some((level) => level < QA.minimumCueLevel) || idleLevel > QA.maximumSilence || disabledLevel > QA.maximumSilence) throw new Error(`QA_FOCUS_TRIGGER_ENERGY:${JSON.stringify({ cueLevels, idleLevel, disabledLevel })}`);
  if (musicIdleLevel < QA.minimumMusic || Math.abs(mixedIdleLevel - musicIdleLevel) / musicIdleLevel > QA.musicContinuityTolerance || mixedCueLevels.some((level, index) => level < musicCueLevels[index] * QA.mixedRatio)) throw new Error(`QA_FOCUS_MIX_ENERGY:${JSON.stringify({ mixedCueLevels, musicCueLevels, musicIdleLevel, mixedIdleLevel })}`);
  return { cueLevels, idleLevel, disabledLevel, musicIdleLevel, mixedIdleLevel, mixedCueLevels, musicCueLevels };
}
