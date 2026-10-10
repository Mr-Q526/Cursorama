import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOCUS_SOUND_IDS as SHARED_IDS } from '../shared';
import { FOCUS_SOUND_ASSETS, FOCUS_SOUND_IDS, FOCUS_SOUND_LIMITS, getFocusSoundAsset } from '../src/focus-sounds';
import { FOCUS_CUE_SCORES, focusCueWaveBytes, renderFocusCue } from '../scripts/focus-sounds';

const WAV = { header: 44, dataOffset: 40, channelsOffset: 22, sampleRateOffset: 24, bitDepthOffset: 34, sampleScale: 32768, frameBytes: 4, maximumPeak: 0.4, edgeTolerance: 0.0001 } as const;

describe('原创聚焦音效资源', () => {
  it('资源列表与共享设置使用同一份四款固定标识', () => {
    expect(FOCUS_SOUND_IDS).toBe(SHARED_IDS);
    expect(FOCUS_SOUND_IDS).toHaveLength(4);
    expect(FOCUS_CUE_SCORES.map(({ id }) => id)).toEqual(FOCUS_SOUND_IDS);
    expect(new Set(FOCUS_SOUND_IDS).size).toBe(FOCUS_SOUND_IDS.length);
  });

  it('本地WAV资源与大小、时长和SHA256清单严格一致', () => {
    for (const id of FOCUS_SOUND_IDS) {
      const sound = getFocusSoundAsset(id);
      const bytes = readFileSync(path.resolve('public/focus-sounds', `${id}.wav`));
      expect(sound).toBe(FOCUS_SOUND_ASSETS[id]);
      expect(sound.bytes).toBe(bytes.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sound.sha256);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.readUInt16LE(WAV.channelsOffset)).toBe(2);
      expect(bytes.readUInt32LE(WAV.sampleRateOffset)).toBe(44100);
      expect(bytes.readUInt16LE(WAV.bitDepthOffset)).toBe(16);
      expect(bytes.readUInt32LE(WAV.dataOffset)).toBe(bytes.byteLength - WAV.header);
      expect((bytes.byteLength - WAV.header) / WAV.frameBytes / 44100).toBeCloseTo(sound.duration);
      expect(sound.duration).toBeGreaterThanOrEqual(FOCUS_SOUND_LIMITS.minimumDuration);
      expect(sound.duration).toBeLessThanOrEqual(FOCUS_SOUND_LIMITS.maximumDuration);
    }
  });

  it('四款声音具有不同波形，并且原始峰值留有混音余量', () => {
    expect(new Set(Object.values(FOCUS_SOUND_ASSETS).map(({ sha256 }) => sha256)).size).toBe(4);
    for (const id of FOCUS_SOUND_IDS) {
      const bytes = readFileSync(path.resolve('public/focus-sounds', `${id}.wav`));
      let maximum = 0;
      for (let offset = WAV.header; offset < bytes.byteLength; offset += 2) maximum = Math.max(maximum, Math.abs(bytes.readInt16LE(offset) / WAV.sampleScale));
      expect(maximum).toBeLessThan(WAV.maximumPeak);
      expect(maximum).toBeGreaterThan(0.2);
    }
  });

  it('带微小立体声差异，首尾淡化不会产生硬切爆音', () => {
    for (const score of FOCUS_CUE_SCORES) {
      const audio = renderFocusCue(score);
      expect(audio.left.length).toBe(audio.right.length);
      expect(audio.left[0]).toBe(0);
      expect(audio.right[0]).toBe(0);
      expect(Math.abs(audio.left.at(-1) ?? 1)).toBeLessThan(WAV.edgeTolerance);
      expect(Math.abs(audio.right.at(-1) ?? 1)).toBeLessThan(WAV.edgeTolerance);
      expect(audio.left.some((value, index) => value !== audio.right[index])).toBe(true);
    }
  });

  it('同一合成代码与种子可以重建仓库内完全一致的音效文件', () => {
    for (const score of FOCUS_CUE_SCORES) {
      const generated = focusCueWaveBytes(renderFocusCue(score));
      const stored = readFileSync(path.resolve('public/focus-sounds', `${score.id}.wav`));
      expect(generated.equals(stored)).toBe(true);
    }
  });
});
