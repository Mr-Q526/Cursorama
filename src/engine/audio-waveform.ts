import type { MusicClip } from '../../shared';
import { MUSIC_FADES, musicClipGain } from '../soundtracks/gain';

export interface AudioWaveform {
  duration: number;
  peaks: Float32Array;
}

export interface MusicWaveformPoint {
  position: number;
  peak: number;
  gain: number;
}

export const AUDIO_WAVEFORM = {
  peaksPerSecond: 256,
  maxPeaks: 32_768,
  decodeSampleRate: 8_000,
  decodeChannels: 1,
  decodeFrames: 1,
  minimumPoints: 2,
  maximumPoints: 800,
  maxDuration: 15 * 60,
  maxBlobBytes: 32 * 1024 * 1024,
  maxPCMBytes: 64 * 1024 * 1024,
  samplesPerTask: 65_536,
  taskDelay: 0
} as const;
export const AUDIO_WAVEFORM_BUDGET_ERROR = 'AUDIO_WAVEFORM_BUDGET_EXCEEDED';
const WAVEFORM_ERRORS = { empty: 'EMPTY_AUDIO_WAVEFORM', invalid: 'INVALID_AUDIO_WAVEFORM' } as const;
const waveformCache = new WeakMap<Blob, Promise<AudioWaveform>>();
let decodeQueue: Promise<void> = Promise.resolve();
const unit = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function createAudioWaveform(channels: readonly Float32Array[], sampleRate: number): AudioWaveform {
  const frames = channels[0]?.length ?? 0;
  if (!frames || !Number.isFinite(sampleRate) || sampleRate <= 0 || channels.some((channel) => channel.length !== frames)) throw new Error(WAVEFORM_ERRORS.invalid);
  const duration = frames / sampleRate;
  const count = Math.min(frames, AUDIO_WAVEFORM.maxPeaks, Math.max(1, Math.ceil(duration * AUDIO_WAVEFORM.peaksPerSecond)));
  return { duration, peaks: new Float32Array(count) };
}

export function buildAudioWaveform(channels: readonly Float32Array[], sampleRate: number): AudioWaveform {
  const waveform = createAudioWaveform(channels, sampleRate);
  const frames = channels[0].length;
  const { peaks } = waveform;
  const count = peaks.length;
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor(bucket * frames / count);
    const end = Math.floor((bucket + 1) * frames / count);
    for (const channel of channels) for (let frame = start; frame < end; frame++) peaks[bucket] = Math.max(peaks[bucket], unit(Math.abs(channel[frame])));
  }
  return waveform;
}

const yieldWaveformTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, AUDIO_WAVEFORM.taskDelay));

export async function buildAudioWaveformAsync(channels: readonly Float32Array[], sampleRate: number): Promise<AudioWaveform> {
  const waveform = createAudioWaveform(channels, sampleRate);
  const frames = channels[0].length;
  const { peaks } = waveform;
  const count = peaks.length;
  let remaining = AUDIO_WAVEFORM.samplesPerTask;
  await yieldWaveformTask();
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor(bucket * frames / count);
    const end = Math.floor((bucket + 1) * frames / count);
    for (const channel of channels) {
      for (let frame = start; frame < end; frame++) {
        peaks[bucket] = Math.max(peaks[bucket], unit(Math.abs(channel[frame])));
        if (--remaining === 0) { await yieldWaveformTask(); remaining = AUDIO_WAVEFORM.samplesPerTask; }
      }
    }
  }
  return waveform;
}

function validateWaveformInput(blob: Blob, duration?: number): void {
  if (!blob.size) throw new Error(WAVEFORM_ERRORS.empty);
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) throw new Error(WAVEFORM_ERRORS.invalid);
  if (blob.size > AUDIO_WAVEFORM.maxBlobBytes || (duration !== undefined && duration > AUDIO_WAVEFORM.maxDuration)) throw new Error(AUDIO_WAVEFORM_BUDGET_ERROR);
}

function validateDecodedWaveform(buffer: AudioBuffer): void {
  const duration = buffer.length / buffer.sampleRate;
  const bytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(bytes) || bytes <= 0) throw new Error(WAVEFORM_ERRORS.invalid);
  if (duration > AUDIO_WAVEFORM.maxDuration || bytes > AUDIO_WAVEFORM.maxPCMBytes) throw new Error(AUDIO_WAVEFORM_BUDGET_ERROR);
}

export function decodeAudioWaveform(blob: Blob, duration?: number): Promise<AudioWaveform> {
  try { validateWaveformInput(blob, duration); }
  catch (error: unknown) { return Promise.reject(error); }
  const cached = waveformCache.get(blob);
  if (cached) return cached;
  const pending = decodeQueue.then(async (): Promise<AudioWaveform> => {
    const decoder = new OfflineAudioContext(AUDIO_WAVEFORM.decodeChannels, AUDIO_WAVEFORM.decodeFrames, AUDIO_WAVEFORM.decodeSampleRate);
    const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
    validateDecodedWaveform(buffer);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    return buildAudioWaveformAsync(channels, buffer.sampleRate);
  }).catch((error: unknown) => { waveformCache.delete(blob); throw error; });
  waveformCache.set(blob, pending);
  // 队列只负责串行化，错误仍通过 pending 交给调用方处理。
  decodeQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export function sampleMusicWaveform(waveform: AudioWaveform | undefined, clip: MusicClip, requestedPoints: number): MusicWaveformPoint[] {
  const duration = clip.sourceOut - clip.sourceIn;
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const count = Math.max(AUDIO_WAVEFORM.minimumPoints, Math.min(AUDIO_WAVEFORM.maximumPoints, Number.isFinite(requestedPoints) ? Math.round(requestedPoints) : AUDIO_WAVEFORM.minimumPoints));
  return Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    const elapsed = position * duration;
    const sourceStart = clip.sourceIn + duration * Math.max(0, (index - 0.5) / (count - 1));
    const sourceEnd = clip.sourceIn + duration * Math.min(1, (index + 0.5) / (count - 1));
    let peak = 0;
    if (waveform && waveform.duration > 0 && waveform.peaks.length && sourceEnd >= 0 && sourceStart < waveform.duration) {
      const first = Math.floor(unit(sourceStart / waveform.duration) * waveform.peaks.length);
      const last = Math.min(waveform.peaks.length, Math.max(first + 1, Math.ceil(unit(sourceEnd / waveform.duration) * waveform.peaks.length)));
      for (let bucket = first; bucket < last; bucket++) peak = Math.max(peak, waveform.peaks[bucket]);
    }
    return { position, peak, gain: musicClipGain(clip, clip.start + elapsed) };
  });
}

export function musicEnvelopePoints(clip: MusicClip, requestedPoints: number): MusicWaveformPoint[] {
  const duration = clip.sourceOut - clip.sourceIn;
  const points = sampleMusicWaveform(undefined, clip, requestedPoints);
  if (!points.length) return points;
  const boundaries = [Math.min(MUSIC_FADES.inSeconds, duration * MUSIC_FADES.shortClipRatio), duration - Math.min(MUSIC_FADES.outSeconds, duration * MUSIC_FADES.shortClipRatio)];
  for (const elapsed of boundaries) points.push({ position: elapsed / duration, peak: 0, gain: musicClipGain(clip, clip.start + elapsed) });
  return points.sort((left, right) => left.position - right.position);
}
