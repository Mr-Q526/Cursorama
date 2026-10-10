/** 聚焦音效的真实解码统计，检查峰值、削波、首尾过渡与立体声差异。 */
export interface FocusCueStatistics { duration: number; peakDb: number; rmsDb: number; firstEdgeDb: number; lastEdgeDb: number; stereoDifferenceDb: number; clippedSamples: number; }
export const FOCUS_CUE_CHECK = { channels: 2, bytesPerSample: 4, edgeSeconds: 0.003, clipping: 0.98, silenceDb: -120, precision: 2 } as const;
const decibels = (amplitude: number): number => Number((amplitude > 0 ? 20 * Math.log10(amplitude) : FOCUS_CUE_CHECK.silenceDb).toFixed(FOCUS_CUE_CHECK.precision));

export function analyzeFocusCuePcm(bytes: Uint8Array, sampleRate: number): FocusCueStatistics {
  const frameBytes = FOCUS_CUE_CHECK.channels * FOCUS_CUE_CHECK.bytesPerSample;
  const frames = bytes.byteLength / frameBytes;
  if (!Number.isSafeInteger(frames) || frames < 1 || sampleRate <= 0) throw new Error('INVALID_FOCUS_CUE_PCM');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const edgeFrames = Math.min(frames, Math.max(1, Math.ceil(FOCUS_CUE_CHECK.edgeSeconds * sampleRate)));
  let maximum = 0;
  let power = 0;
  let firstPower = 0;
  let lastPower = 0;
  let difference = 0;
  let clippedSamples = 0;
  for (let index = 0; index < frames; index++) {
    const left = view.getFloat32(index * frameBytes, true);
    const right = view.getFloat32(index * frameBytes + FOCUS_CUE_CHECK.bytesPerSample, true);
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('INVALID_FOCUS_CUE_PCM');
    maximum = Math.max(maximum, Math.abs(left), Math.abs(right));
    if (Math.abs(left) >= FOCUS_CUE_CHECK.clipping) clippedSamples++;
    if (Math.abs(right) >= FOCUS_CUE_CHECK.clipping) clippedSamples++;
    const framePower = (left ** 2 + right ** 2) / FOCUS_CUE_CHECK.channels;
    power += framePower; difference += (left - right) ** 2;
    if (index < edgeFrames) firstPower += framePower;
    if (index >= frames - edgeFrames) lastPower += framePower;
  }
  return { duration: frames / sampleRate, peakDb: decibels(maximum), rmsDb: decibels(Math.sqrt(power / frames)), firstEdgeDb: decibels(Math.sqrt(firstPower / edgeFrames)), lastEdgeDb: decibels(Math.sqrt(lastPower / edgeFrames)), stereoDifferenceDb: decibels(Math.sqrt(difference / frames)), clippedSamples };
}
