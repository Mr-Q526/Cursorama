/** 分析真实解码的立体声 PCM，检查音量、静音区间、淡入淡出及声道差异。 */
export interface SoundtrackAudioStatistics {
  duration: number;
  peakDb: number;
  rmsDb: number;
  introDb: number;
  bodyDb: number;
  outroDb: number;
  stereoDifferenceDb: number;
  silentWindowRatio: number;
  clippedSamples: number;
}
export const AUDIO_CHECK = { channels: 2, bytesPerSample: 4, edgeSeconds: 0.1, windowSeconds: 0.5, bodyStart: 1, bodyEnd: 4, silenceDb: -65, floorDb: -120, clipping: 0.98, precision: 2 } as const;
const decibels = (value: number): number => Number((value > 0 ? 20 * Math.log10(value) : AUDIO_CHECK.floorDb).toFixed(AUDIO_CHECK.precision));

export function analyzePcm(bytes: Uint8Array, sampleRate: number): SoundtrackAudioStatistics {
  const frames = bytes.byteLength / (AUDIO_CHECK.channels * AUDIO_CHECK.bytesPerSample);
  if (!Number.isSafeInteger(frames) || frames < 1 || sampleRate < 1) throw new Error('INVALID_AUDIO_PCM');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const duration = frames / sampleRate;
  const edgeFrames = Math.max(1, Math.floor(AUDIO_CHECK.edgeSeconds * sampleRate));
  const windowFrames = Math.max(1, Math.floor(AUDIO_CHECK.windowSeconds * sampleRate));
  let peak = 0;
  let power = 0;
  let intro = 0;
  let outro = 0;
  let body = 0;
  let bodyFrames = 0;
  let difference = 0;
  let clippedSamples = 0;
  let windowPower = 0;
  let windowCount = 0;
  let silentWindows = 0;
  let windows = 0;
  for (let index = 0; index < frames; index++) {
    const offset = index * AUDIO_CHECK.channels * AUDIO_CHECK.bytesPerSample;
    const left = data.getFloat32(offset, true);
    const right = data.getFloat32(offset + AUDIO_CHECK.bytesPerSample, true);
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('INVALID_AUDIO_PCM');
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    if (Math.abs(left) >= AUDIO_CHECK.clipping) clippedSamples++;
    if (Math.abs(right) >= AUDIO_CHECK.clipping) clippedSamples++;
    const samplePower = (left ** 2 + right ** 2) / AUDIO_CHECK.channels;
    power += samplePower;
    difference += (left - right) ** 2;
    if (index < edgeFrames) intro += samplePower;
    if (index >= frames - edgeFrames) outro += samplePower;
    if (index >= AUDIO_CHECK.bodyStart * sampleRate && index < AUDIO_CHECK.bodyEnd * sampleRate) { body += samplePower; bodyFrames++; }
    windowPower += samplePower;
    windowCount++;
    if (windowCount === windowFrames || index === frames - 1) {
      windows++;
      if (decibels(Math.sqrt(windowPower / windowCount)) < AUDIO_CHECK.silenceDb) silentWindows++;
      windowPower = 0; windowCount = 0;
    }
  }
  return {
    duration: Number(duration.toFixed(AUDIO_CHECK.precision)), peakDb: decibels(peak), rmsDb: decibels(Math.sqrt(power / frames)),
    introDb: decibels(Math.sqrt(intro / Math.min(frames, edgeFrames))), bodyDb: decibels(Math.sqrt(body / Math.max(1, bodyFrames))),
    outroDb: decibels(Math.sqrt(outro / Math.min(frames, edgeFrames))), stereoDifferenceDb: decibels(Math.sqrt(difference / frames)),
    silentWindowRatio: Number((silentWindows / windows).toFixed(AUDIO_CHECK.precision)), clippedSamples,
  };
}
