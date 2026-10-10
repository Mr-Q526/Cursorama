import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MusicClip } from '../shared';
import { AUDIO_WAVEFORM, AUDIO_WAVEFORM_BUDGET_ERROR, buildAudioWaveform, buildAudioWaveformAsync, decodeAudioWaveform, musicEnvelopePoints, sampleMusicWaveform } from '../src/engine/audio-waveform';
import { MUSIC_FADES, musicClipGain } from '../src/soundtracks/gain';

const CLIP: MusicClip = { id: 'music', mediaId: 'audio', start: 5, sourceIn: 1, sourceOut: 3, volume: 0.4 };
const PCM = { sampleRate: 1024, seconds: 4 } as const;
const TASK_TEST = { extraFrames: 17, chunkCount: 3, decodeDelay: 10, channels: 8 } as const;
type DecodedAudioFixture = Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>;

function decodedAudioFixture(): DecodedAudioFixture {
  return { length: PCM.sampleRate, numberOfChannels: 1, sampleRate: PCM.sampleRate, getChannelData: () => new Float32Array(PCM.sampleRate).fill(0.5) };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('时间线真实音频波形', () => {
  it('保留短促峰值与反相立体声，静音不会产生装饰波形', () => {
    const left = new Float32Array(PCM.sampleRate * PCM.seconds);
    const right = new Float32Array(left.length);
    left[777] = 0.6; right[777] = -0.6;
    right[1800] = 0.9;
    const wave = buildAudioWaveform([left, right], PCM.sampleRate);
    expect(wave.duration).toBe(PCM.seconds);
    expect(wave.peaks[Math.floor(777 / 4)]).toBeCloseTo(0.6);
    expect(wave.peaks[Math.floor(1800 / 4)]).toBeCloseTo(0.9);
    expect(wave.peaks.filter((peak) => peak > 0)).toHaveLength(2);
    expect(buildAudioWaveform([new Float32Array(left.length)], PCM.sampleRate).peaks.every((peak) => peak === 0)).toBe(true);
  });

  it('显示裁剪的素材区间，移动片段不改变波形，减小音量影响实际增益', () => {
    const pcm = new Float32Array(PCM.sampleRate * PCM.seconds);
    pcm.fill(0.2, 0, PCM.sampleRate);
    pcm.fill(0.7, PCM.sampleRate, PCM.sampleRate * 2);
    pcm.fill(0.3, PCM.sampleRate * 2, PCM.sampleRate * 3);
    pcm.fill(1, PCM.sampleRate * 3);
    const wave = buildAudioWaveform([pcm], PCM.sampleRate);
    const points = sampleMusicWaveform(wave, CLIP, 17);
    expect(points[3].peak).toBeCloseTo(0.7);
    expect(points[13].peak).toBeCloseTo(0.3);
    expect(points.map(({ peak }) => peak)).not.toContain(1);
    expect(sampleMusicWaveform(wave, { ...CLIP, start: 25 }, 17)).toEqual(points);
    const quiet = sampleMusicWaveform(wave, { ...CLIP, volume: 0.2 }, 17);
    expect(quiet[3].peak).toBe(points[3].peak);
    expect(quiet[3].gain).toBeCloseTo(points[3].gain / 2);
    expect(points[0].gain).toBe(0);
    expect(points.at(-1)?.gain).toBe(0);
  });

  it('两首音频保留原始振幅差异，越出素材的区间显示静音', () => {
    const loud = buildAudioWaveform([new Float32Array(PCM.sampleRate).fill(0.8)], PCM.sampleRate);
    const quiet = buildAudioWaveform([new Float32Array(PCM.sampleRate).fill(0.1)], PCM.sampleRate);
    expect(Math.max(...loud.peaks) / Math.max(...quiet.peaks)).toBeCloseTo(8);
    expect(sampleMusicWaveform(loud, { ...CLIP, sourceIn: 2, sourceOut: 3 }, 17).every(({ peak }) => peak === 0)).toBe(true);
    expect(() => buildAudioWaveform([], PCM.sampleRate)).toThrow('INVALID_AUDIO_WAVEFORM');
    expect(() => buildAudioWaveform([new Float32Array(1), new Float32Array(2)], PCM.sampleRate)).toThrow('INVALID_AUDIO_WAVEFORM');
    expect(() => buildAudioWaveform([new Float32Array(1)], 0)).toThrow('INVALID_AUDIO_WAVEFORM');
  });

  it('长音频仅缓存有限峰值，异常采样不会产生无效 SVG 坐标', () => {
    const pcm = new Float32Array(40_000).fill(0.2); pcm[7] = Number.NaN; pcm[8] = Number.POSITIVE_INFINITY;
    const wave = buildAudioWaveform([pcm], 1);
    expect(wave.peaks.length).toBe(AUDIO_WAVEFORM.maxPeaks);
    expect(wave.peaks.every(Number.isFinite)).toBe(true);
    expect(sampleMusicWaveform(wave, CLIP, Number.NaN)).toHaveLength(AUDIO_WAVEFORM.minimumPoints);
    expect(sampleMusicWaveform(wave, CLIP, 99_999)).toHaveLength(AUDIO_WAVEFORM.maximumPoints);
    expect(sampleMusicWaveform(wave, { ...CLIP, sourceOut: CLIP.sourceIn }, 17)).toEqual([]);
  });

  it('同一音频只解码一次，不启动实时音频；失败能重试', async () => {
    const decode = vi.fn(async () => decodedAudioFixture());
    const constructor = vi.fn();
    class Decoder {
      constructor(...args: number[]) { constructor(...args); }
      decodeAudioData = decode;
    }
    vi.stubGlobal('OfflineAudioContext', Decoder);
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const first = decodeAudioWaveform(blob);
    expect(decodeAudioWaveform(blob)).toBe(first);
    const wave = await first;
    expect(await decodeAudioWaveform(blob)).toBe(wave);
    expect(decode).toHaveBeenCalledOnce();
    expect(constructor).toHaveBeenCalledWith(AUDIO_WAVEFORM.decodeChannels, AUDIO_WAVEFORM.decodeFrames, 8_000);
    const retryBlob = new Blob([new Uint8Array([4, 5, 6])]);
    decode.mockRejectedValueOnce(new Error('UNSUPPORTED_AUDIO'));
    await expect(decodeAudioWaveform(retryBlob)).rejects.toThrow('UNSUPPORTED_AUDIO');
    expect((await decodeAudioWaveform(retryBlob)).peaks[0]).toBe(0.5);
    await expect(decodeAudioWaveform(new Blob())).rejects.toThrow('EMPTY_AUDIO_WAVEFORM');
  });
});

describe('波形生成资源预算与调度', () => {
  it('超时长或文件体积预算在读取文件和解码前拒绝，重试正常素材不受影响', async () => {
    const decode = vi.fn(async () => decodedAudioFixture());
    const constructor = vi.fn();
    class Decoder {
      constructor() { constructor(); }
      decodeAudioData = decode;
    }
    class OversizedBlob extends Blob {
      override get size(): number { return AUDIO_WAVEFORM.maxBlobBytes + 1; }
    }
    vi.stubGlobal('OfflineAudioContext', Decoder);
    const blob = new Blob([new Uint8Array([1])]);
    const oversized = new OversizedBlob();
    const read = vi.spyOn(blob, 'arrayBuffer');
    const oversizedRead = vi.spyOn(oversized, 'arrayBuffer');
    await expect(decodeAudioWaveform(blob, AUDIO_WAVEFORM.maxDuration + 1)).rejects.toThrow(AUDIO_WAVEFORM_BUDGET_ERROR);
    await expect(decodeAudioWaveform(oversized, 1)).rejects.toThrow(AUDIO_WAVEFORM_BUDGET_ERROR);
    expect(read).not.toHaveBeenCalled();
    expect(oversizedRead).not.toHaveBeenCalled();
    expect(constructor).not.toHaveBeenCalled();
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) await expect(decodeAudioWaveform(blob, duration)).rejects.toThrow('INVALID_AUDIO_WAVEFORM');
    expect((await decodeAudioWaveform(blob, AUDIO_WAVEFORM.maxDuration)).peaks[0]).toBe(0.5);
    expect(decode).toHaveBeenCalledOnce();
    await expect(decodeAudioWaveform(blob, AUDIO_WAVEFORM.maxDuration + 1)).rejects.toThrow(AUDIO_WAVEFORM_BUDGET_ERROR);
    expect(decode).toHaveBeenCalledOnce();
  });

  it('元数据缺失或偏短时仍检查真实解码时长及多声道内存，失败缓存可重试', async () => {
    const channels = vi.fn(() => new Float32Array(1));
    const sampleRate = AUDIO_WAVEFORM.decodeSampleRate;
    const oversizedPCM: DecodedAudioFixture = {
      length: Math.floor(AUDIO_WAVEFORM.maxPCMBytes / Float32Array.BYTES_PER_ELEMENT / TASK_TEST.channels) + 1,
      sampleRate,
      numberOfChannels: TASK_TEST.channels,
      getChannelData: channels
    };
    const longPCM: DecodedAudioFixture = { ...oversizedPCM, length: (AUDIO_WAVEFORM.maxDuration + 1) * sampleRate, numberOfChannels: 1 };
    const decode = vi.fn(async (): Promise<DecodedAudioFixture> => decodedAudioFixture());
    decode.mockResolvedValueOnce(longPCM).mockResolvedValueOnce(oversizedPCM);
    class Decoder { decodeAudioData = decode; }
    vi.stubGlobal('OfflineAudioContext', Decoder);
    const blob = new Blob([new Uint8Array([2])]);
    await expect(decodeAudioWaveform(blob)).rejects.toThrow(AUDIO_WAVEFORM_BUDGET_ERROR);
    await expect(decodeAudioWaveform(blob, 1)).rejects.toThrow(AUDIO_WAVEFORM_BUDGET_ERROR);
    expect(channels).not.toHaveBeenCalled();
    expect((await decodeAudioWaveform(blob, 1)).peaks[0]).toBe(0.5);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(sampleMusicWaveform(undefined, CLIP, 24).every(({ peak }) => peak === 0)).toBe(true);
    expect(Math.max(...musicEnvelopePoints(CLIP, 24).map(({ gain }) => gain))).toBe(CLIP.volume);
  });

  it('分块扫描保留全部短峰值，扫描期间其他主线程定时任务可以运行', async () => {
    vi.useFakeTimers();
    const frames = AUDIO_WAVEFORM.samplesPerTask * TASK_TEST.chunkCount + TASK_TEST.extraFrames;
    const left = new Float32Array(frames).fill(0.2);
    const right = new Float32Array(frames).fill(-0.3);
    left[AUDIO_WAVEFORM.samplesPerTask - 1] = 0.8;
    right[AUDIO_WAVEFORM.samplesPerTask] = -0.9;
    right[frames - 1] = -1;
    const expected = buildAudioWaveform([left, right], PCM.sampleRate);
    let finished = false;
    const pending = buildAudioWaveformAsync([left, right], PCM.sampleRate).then((waveform) => { finished = true; return waveform; });
    const heartbeat = vi.fn(() => expect(finished).toBe(false));
    setTimeout(heartbeat, 0);
    await vi.runAllTimersAsync();
    expect(heartbeat).toHaveBeenCalledOnce();
    expect(await pending).toEqual(expected);
    await expect(buildAudioWaveformAsync([], PCM.sampleRate)).rejects.toThrow('INVALID_AUDIO_WAVEFORM');
  });

  it('不同素材的解码串行运行，不会同时持有多份正在生成的 PCM', async () => {
    let active = 0;
    let maximum = 0;
    const decode = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, TASK_TEST.decodeDelay));
      active--;
      return decodedAudioFixture();
    });
    class Decoder { decodeAudioData = decode; }
    vi.stubGlobal('OfflineAudioContext', Decoder);
    const first = decodeAudioWaveform(new Blob([new Uint8Array([3])]), 1);
    const second = decodeAudioWaveform(new Blob([new Uint8Array([4])]), 1);
    await Promise.all([first, second]);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });
});

describe('实际音量包络', () => {
  it('曲线每一点与预览导出一致，长片段低密度采样也保留淡入淡出', () => {
    const long = { ...CLIP, sourceOut: 300 };
    const curve = musicEnvelopePoints(long, 24);
    expect(curve[0].gain).toBe(0);
    expect(curve.at(-1)?.gain).toBe(0);
    expect(curve.some(({ position }) => position === MUSIC_FADES.inSeconds / (long.sourceOut - long.sourceIn))).toBe(true);
    expect(curve.some(({ gain }) => gain === long.volume)).toBe(true);
    for (const point of curve) expect(point.gain).toBe(musicClipGain(long, long.start + point.position * (long.sourceOut - long.sourceIn)));
    expect(curve.map(({ position }) => position)).toEqual(curve.map(({ position }) => position).sort((left, right) => left - right));
  });

  it('短片段的淡入淡出交汇仍保持最高音量；静音曲线与零点一致', () => {
    const short = { ...CLIP, sourceOut: CLIP.sourceIn + 0.1 };
    expect(Math.max(...musicEnvelopePoints(short, 2).map(({ gain }) => gain))).toBeCloseTo(short.volume);
    expect(musicEnvelopePoints({ ...CLIP, volume: 0 }, 17).every(({ gain }) => gain === 0)).toBe(true);
    expect(musicEnvelopePoints({ ...CLIP, sourceOut: Number.NaN }, 17)).toEqual([]);
  });
});
