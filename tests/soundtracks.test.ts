import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, EDITING_LIMITS, ensureEditing, packProjectMedia, parseProject, projectBytes, readProjectBytes, unpackProjectMedia } from '../shared';
import type { MediaAsset, Project } from '../shared';
import { getSoundtrack, insertSoundtrack, musicClipGain, MUSIC_FADES, SOUNDTRACK_DEFAULTS, SOUNDTRACK_FILTERS, SOUNDTRACKS } from '../src/soundtracks';
import type { SoundtrackCategory } from '../src/soundtracks';
import { soundtracksCatalog } from '../src/i18n/soundtracks';
import { EXPANDED_SCORES, renderScore, SCORES, SYNTH_AUDIO, waveBytes } from '../scripts/soundtracks';
import type { ExpandedSoundtrackId } from '../scripts/soundtracks';

const SOURCE_DURATION = 10;
const AUDIO_BYTES = new Uint8Array([12, 25, 37, 49, 51]);
const REBUILD = { bars: 5, timeout: 30_000, amplitudeTolerance: 0.000001 } as const;
const EXPANDED_CATEGORIES: Readonly<Record<ExpandedSoundtrackId, SoundtrackCategory>> = { 'paper-lantern': 'acoustic', 'velvet-cafe': 'jazz', 'silver-screen': 'cinematic', 'pixel-journey': 'retro' };
const base: Project = { schemaVersion: 1, name: '配乐验证', duration: SOURCE_DURATION, width: 1920, height: 1080, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: SOURCE_DURATION, sourceType: 'demo', hasAudio: false };
const asset: MediaAsset = { id: 'soundtrack-fixture', name: '晨光键语.mp3', kind: 'audio', mimeType: SOUNDTRACK_DEFAULTS.mimeType, duration: 47, hasAudio: true, blob: new Blob([AUDIO_BYTES], { type: SOUNDTRACK_DEFAULTS.mimeType }), url: 'blob:soundtrack-fixture' };

describe('内置原创配乐', () => {
  it('同一乐谱与随机种子重复生成完全相同的立体声波形', () => {
    const score = { ...SCORES[0], bars: 1 };
    const first = waveBytes(renderScore(score).audio);
    const repeated = waveBytes(renderScore(score).audio);
    expect(first.equals(repeated)).toBe(true);
    expect(first.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(first.readUInt16LE(22)).toBe(2);
    expect(first.byteLength).toBeGreaterThan(44);
    expect(createHash('sha256').update(first).digest('hex')).toBe(createHash('sha256').update(repeated).digest('hex'));
  });

  it('曲目具有独立资源与不同节拍，所有风格筛选、乐谱、文案及实际文件一致', () => {
    expect(SOUNDTRACKS).toHaveLength(SCORES.length);
    expect(SOUNDTRACKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SOUNDTRACKS.map(({ category }) => category))).toEqual(new Set(SOUNDTRACK_FILTERS.filter((filter) => filter !== 'all')));
    expect(SOUNDTRACKS.map(({ id }) => id)).toEqual(SCORES.map(({ id }) => id));
    expect(new Set(SOUNDTRACKS.map(({ bpm }) => bpm)).size).toBe(SOUNDTRACKS.length);
    expect(new Set(SOUNDTRACKS.map(({ sha256 }) => sha256)).size).toBe(SOUNDTRACKS.length);
    for (const track of SOUNDTRACKS) {
      const bytes = readFileSync(path.resolve('public/music', `${track.id}.mp3`));
      expect(bytes.length).toBe(track.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(track.sha256);
      expect(track.duration).toBeGreaterThanOrEqual(30);
      expect(track.duration).toBeLessThanOrEqual(60);
      expect(track.waveform.length).toBeGreaterThan(30);
      expect(track.waveform.every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(Math.max(...track.waveform)).toBe(1);
      expect(getSoundtrack(track.id)).toBe(track);
      expect(soundtracksCatalog.tracks[track.id].title.length).toBeGreaterThan(0);
      expect(soundtracksCatalog.categories[track.category].length).toBeGreaterThan(0);
    }
  });

  it('四首扩展曲目各有独立配器、旋律、和声、节拍与分类', () => {
    expect(EXPANDED_SCORES).toHaveLength(Object.keys(EXPANDED_CATEGORIES).length);
    expect(new Set(EXPANDED_SCORES.map(({ instrument }) => instrument)).size).toBe(EXPANDED_SCORES.length);
    expect(new Set(EXPANDED_SCORES.map(({ rhythm }) => rhythm)).size).toBe(EXPANDED_SCORES.length);
    expect(new Set(EXPANDED_SCORES.map(({ melody }) => JSON.stringify(melody))).size).toBe(EXPANDED_SCORES.length);
    expect(new Set(EXPANDED_SCORES.map(({ chords }) => JSON.stringify(chords))).size).toBe(EXPANDED_SCORES.length);
    expect(new Set(SCORES.map(({ seed }) => seed)).size).toBe(SCORES.length);
    for (const score of EXPANDED_SCORES) expect(getSoundtrack(score.id).category).toBe(EXPANDED_CATEGORIES[score.id]);
  });

  it.each(EXPANDED_SCORES)('$id 包含真实旋律段落，同一乐谱可重建相同的有限立体声 PCM', (score) => {
    const excerpt = { ...score, bars: REBUILD.bars };
    const first = renderScore(excerpt);
    const repeated = renderScore(excerpt);
    expect(waveBytes(first.audio).equals(waveBytes(repeated.audio))).toBe(true);
    expect(first.waveform).toEqual(repeated.waveform);
    expect(first.audio.left.length).toBe(first.audio.right.length);
    let peak = 0;
    let stereoDifference = 0;
    for (let sample = 0; sample < first.audio.left.length; sample++) {
      const left = first.audio.left[sample];
      const right = first.audio.right[sample];
      if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error(`NON_FINITE_SOUNDTRACK_SAMPLE:${score.id}`);
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
      stereoDifference += (left - right) ** 2;
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(SYNTH_AUDIO.peak + REBUILD.amplitudeTolerance);
    expect(stereoDifference).toBeGreaterThan(0);
    expect(first.audio.left[0]).toBe(0);
    expect(first.audio.right[0]).toBe(0);
  }, REBUILD.timeout);

  it('从播放头添加配乐，并按工程剩余时长裁剪及默认轻声音量', () => {
    const { project, clipId } = insertSoundtrack(base, asset, 3);
    expect(project.editing?.music[0]).toEqual({ id: clipId, mediaId: asset.id, start: 3, sourceIn: 0, sourceOut: 7, volume: 0.3 });
    expect(project.media?.[asset.id]).toBe(asset);
    expect(project.mediaAssets?.[0]).not.toHaveProperty('url');
    expect(project.mediaAssets?.[0]).not.toHaveProperty('blob');
    expect(base.editing).toBeUndefined();
    expect(base.mediaAssets).toBeUndefined();
    expect(parseProject(project).editing).toEqual(project.editing);
  });

  it('播放头在终点或越界时仍生成可保存的有效音乐片段', () => {
    for (const position of [SOURCE_DURATION, SOURCE_DURATION * 2, -3, Number.NaN]) {
      const { project } = insertSoundtrack(base, asset, position);
      const clip = project.editing?.music[0];
      if (!clip) throw new Error('MISSING_TEST_MUSIC');
      expect(clip.start).toBeGreaterThanOrEqual(0);
      expect(clip.sourceOut - clip.sourceIn).toBeGreaterThanOrEqual(EDITING_LIMITS.minDuration);
      expect(clip.start + clip.sourceOut).toBeLessThanOrEqual(SOURCE_DURATION);
      expect(parseProject(project).editing?.music).toHaveLength(1);
    }
  });

  it('允许再次使用同一音频素材而不重复存储资源，并保留其他轨道', () => {
    const initial = ensureEditing(base);
    initial.editing.subtitles = [{ id: 'caption', start: 0, end: 3, text: '演示说明' }];
    const first = insertSoundtrack(initial, asset, 0).project;
    const second = insertSoundtrack(first, asset, 4).project;
    expect(second.editing?.music).toHaveLength(2);
    expect(new Set(second.editing?.music.map(({ id }) => id)).size).toBe(2);
    expect(second.mediaAssets).toHaveLength(1);
    expect(second.editing?.subtitles).toEqual(initial.editing.subtitles);
    expect(first.editing?.music).toHaveLength(1);
  });

  it('保存工程时携带配乐字节，恢复后保留音乐设置与素材', async () => {
    const { project } = insertSoundtrack(base, asset, 2);
    const stored = readProjectBytes(projectBytes(project, await packProjectMedia(project)));
    const media = unpackProjectMedia(stored.data, stored.bytes);
    expect(new Uint8Array(media.assets.get(asset.id) ?? new ArrayBuffer(0))).toEqual(AUDIO_BYTES);
    expect(stored.data.editing?.music).toEqual(project.editing?.music);
    expect(stored.data.mediaAssets?.[0].name).toBe(asset.name);
  });

  it('拒绝错误素材、空音频与同标识的冲突数据', () => {
    expect(() => insertSoundtrack(base, { ...asset, kind: 'video' }, 0)).toThrow('INVALID_SOUNDTRACK_ASSET');
    expect(() => insertSoundtrack(base, { ...asset, blob: new Blob() }, 0)).toThrow('INVALID_SOUNDTRACK_ASSET');
    const first = insertSoundtrack(base, asset, 0).project;
    expect(() => insertSoundtrack(first, { ...asset, duration: 1 }, 0)).toThrow('DUPLICATE_MEDIA_ASSET');
  });
});

describe('预览与导出共用音乐淡入淡出', () => {
  const clip = { start: 2, sourceIn: 5, sourceOut: 10, volume: 0.3 };
  it('片段外与边界静音，中间保持用户设定的音量', () => {
    expect(musicClipGain(clip, 1)).toBe(0);
    expect(musicClipGain(clip, 2)).toBe(0);
    expect(musicClipGain(clip, 7)).toBe(0);
    expect(musicClipGain(clip, 8)).toBe(0);
    expect(musicClipGain(clip, 4)).toBeCloseTo(clip.volume);
  });
  it('源区间裁剪后仍以输出片段的两端计算平滑增益', () => {
    expect(musicClipGain(clip, clip.start + MUSIC_FADES.inSeconds / 2)).toBeCloseTo(clip.volume / 2);
    expect(musicClipGain(clip, clip.start + clip.sourceOut - clip.sourceIn - MUSIC_FADES.outSeconds / 2)).toBeCloseTo(clip.volume / 2);
    const samples = [0, 0.05, 0.1, 0.15, 0.2, 0.25].map((elapsed) => musicClipGain(clip, clip.start + elapsed));
    expect(samples).toEqual([...samples].sort((left, right) => left - right));
  });
  it('超短音乐也有平滑过渡，随机定位不会依赖上一次计算', () => {
    const short = { ...clip, sourceOut: clip.sourceIn + 0.1 };
    const midpoint = musicClipGain(short, short.start + 0.05);
    expect(midpoint).toBeCloseTo(clip.volume);
    expect(musicClipGain(short, short.start + 0.025)).toBeCloseTo(clip.volume / 2);
    musicClipGain(short, short.start + 0.099);
    expect(musicClipGain(short, short.start + 0.05)).toBe(midpoint);
    expect(musicClipGain(short, Number.NaN)).toBe(0);
  });
});
