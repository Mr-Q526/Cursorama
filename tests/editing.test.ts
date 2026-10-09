import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, deleteSegment, ensureEditing, getSegments, insertVideoSegment, parseProject, resolveTimeline, segmentRanges, SOURCE_MEDIA_ID, splitSegment, timelineDuration, updateSegment } from '../shared';
import type { MediaAssetData, ProjectData } from '../shared';

const SOURCE_DURATION = 10;
const asset: MediaAssetData = { id: 'insert-video', name: '片头.mp4', kind: 'video', mimeType: 'video/mp4', duration: 3, width: 720, height: 1280, hasAudio: true };
const audio: MediaAssetData = { id: 'music-track', name: '配乐.wav', kind: 'audio', mimeType: 'audio/wav', duration: SOURCE_DURATION };
const base: ProjectData = {
  schemaVersion: 1, name: '剪辑工程', duration: SOURCE_DURATION, width: 1920, height: 1080, samples: [{ time: 7, x: 0.2, y: 0.4, kind: 'click' }],
  clips: [{ id: 'camera-shot', start: 6, end: 8, x: 0.2, y: 0.4, zoom: 2, mode: 'focus', enabled: true, manual: false }],
  settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: SOURCE_DURATION, sourceType: 'video', hasAudio: true, cursorEmbedded: false,
};

function layeredProject(): ProjectData {
  const project = ensureEditing(base);
  project.mediaAssets = [audio];
  project.editing.music = [{ id: 'music-clip', mediaId: audio.id, start: 0, sourceIn: 0, sourceOut: SOURCE_DURATION, volume: 0.4 }];
  project.editing.subtitles = [{ id: 'caption', start: 2, end: 8, text: '演示操作' }, { id: 'removed-caption', start: 4.2, end: 5.8, text: '将被删去' }];
  return project;
}

describe('视频剪辑时间轴', () => {
  it('兼容旧工程，并将点击效果保留在原录制的源时间', () => {
    expect(getSegments(base)).toEqual([{ id: 'source-segment', mediaId: SOURCE_MEDIA_ID, sourceIn: 0, sourceOut: SOURCE_DURATION, speed: 1, volume: 1 }]);
    const mapping = resolveTimeline(base, 7);
    expect(mapping.sourceTime).toBe(7);
    expect(mapping.samples).toBe(base.samples);
    expect(mapping.clips).toBe(base.clips);
    expect(mapping.cursorEmbedded).toBe(false);
    expect(base.editing).toBeUndefined();
  });

  it('按输出时间分割倍速片段，边界切换不会重复前一帧', () => {
    const doubled = updateSegment(base, 'source-segment', { speed: 2 });
    const project = splitSegment(doubled, 'source-segment', 2);
    const segments = getSegments(project);
    expect(segments).toHaveLength(2);
    expect(segments.map(({ sourceIn, sourceOut }) => [sourceIn, sourceOut])).toEqual([[0, 4], [4, 10]]);
    expect(timelineDuration(project)).toBe(5);
    expect(resolveTimeline(project, 2).segment.id).toBe(segments[1].id);
    expect(resolveTimeline(project, 3.5).sourceTime).toBe(7);
    expect(project.duration).toBe(SOURCE_DURATION);
    expect(project.trimEnd).toBe(5);
    expect(resolveTimeline(project, 100).sourceTime).toBe(SOURCE_DURATION);
  });

  it('删除中间片段后裁切字幕、音乐，并保留后半段音频的源位置', () => {
    const layered = layeredProject();
    const firstSplit = splitSegment(layered, 'source-segment', 4);
    const middleId = getSegments(firstSplit)[1].id;
    const split = splitSegment(firstSplit, middleId, 6);
    const project = deleteSegment(split, middleId);
    expect(timelineDuration(project)).toBe(8);
    expect(project.trimEnd).toBe(8);
    expect(project.editing?.subtitles).toEqual([{ id: 'caption', start: 2, end: 6, text: '演示操作' }]);
    expect(project.editing?.music.map(({ start, sourceIn, sourceOut }) => ({ start, sourceIn, sourceOut }))).toEqual([
      { start: 0, sourceIn: 0, sourceOut: 4 }, { start: 4, sourceIn: 6, sourceOut: 10 },
    ]);
    expect(resolveTimeline(project, 4).sourceTime).toBe(6);
    expect(layered.editing?.music[0].sourceOut).toBe(10);
    expect(parseProject(project).editing).toEqual(project.editing);
  });

  it('插入视频时分割当前片段并把原字幕和音乐移到素材之后', () => {
    const project = insertVideoSegment(layeredProject(), asset, 5);
    expect(segmentRanges(project).map(({ outputStart, outputEnd }) => [outputStart, outputEnd])).toEqual([[0, 5], [5, 8], [8, 13]]);
    expect(project.editing?.music.map(({ start, sourceIn, sourceOut }) => [start, sourceIn, sourceOut])).toEqual([[0, 0, 5], [8, 5, 10]]);
    expect(project.editing?.subtitles.filter(({ text }) => text === '演示操作').map(({ start, end }) => [start, end])).toEqual([[2, 5], [8, 11]]);
    const inserted = resolveTimeline(project, 6);
    expect(inserted.mediaId).toBe(asset.id);
    expect(inserted.sourceTime).toBe(1);
    expect(inserted.width).toBe(720);
    expect(inserted.height).toBe(1280);
    expect(inserted.samples).toEqual([]);
    expect(inserted.clips).toEqual([]);
    expect(resolveTimeline(project, 10).sourceTime).toBe(7);
    expect(project.trimEnd).toBe(13);
    expect(project.duration).toBe(SOURCE_DURATION);
    expect(parseProject(project).trimEnd).toBe(13);
  });

  it('倍速变化同时调整字幕位置、选区和音乐终点', () => {
    const project = updateSegment(layeredProject(), 'source-segment', { speed: 2, volume: 0.7 });
    expect(project.editing?.subtitles[0]).toMatchObject({ start: 1, end: 4 });
    expect(project.editing?.music[0]).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 5 });
    expect(project.trimEnd).toBe(5);
    expect(parseProject(project).editing).toEqual(project.editing);
  });

  it('裁掉源片段的头尾时删除对应内容，不把字幕压缩到错误时间', () => {
    const project = updateSegment(layeredProject(), 'source-segment', { sourceIn: 3, sourceOut: 7 });
    expect(timelineDuration(project)).toBe(4);
    expect(project.editing?.subtitles[0]).toMatchObject({ start: 0, end: 4 });
    expect(project.editing?.subtitles[1].start).toBeCloseTo(1.2);
    expect(project.editing?.subtitles[1].end).toBeCloseTo(2.8);
    expect(project.editing?.music[0]).toMatchObject({ start: 0, sourceIn: 3, sourceOut: 7 });
    expect(resolveTimeline(project, 2).sourceTime).toBe(5);
    expect(parseProject(project).trimEnd).toBe(4);
  });

  it('插在起点或末尾时保持输出选区完整', () => {
    for (const time of [0, SOURCE_DURATION]) {
      const project = insertVideoSegment(base, asset, time);
      expect(project.trimStart).toBe(0);
      expect(project.trimEnd).toBe(13);
      expect(getSegments(project)).toHaveLength(2);
    }
  });

  it('保护最后一个片段，并拒绝非法倍率和越界源区间', () => {
    expect(() => deleteSegment(base, 'source-segment')).toThrow('LAST_VIDEO_SEGMENT');
    for (const speed of [0, -1, 100, Number.NaN]) expect(() => updateSegment(base, 'source-segment', { speed })).toThrow('INVALID_SEGMENT');
    expect(() => updateSegment(base, 'source-segment', { sourceOut: 11 })).toThrow('INVALID_SEGMENT');
    expect(splitSegment(base, 'source-segment', 0)).toBe(base);
    expect(deleteSegment(base, 'missing')).toBe(base);
  });

  it('持久化校验拒绝未知素材、重复片段和不合法字幕', () => {
    const project = insertVideoSegment(base, asset, 0);
    const editing = project.editing;
    if (!editing) throw new Error('MISSING_TEST_EDITING');
    expect(() => parseProject({ ...project, mediaAssets: [] })).toThrow('INVALID_EDITING');
    expect(() => parseProject({ ...project, editing: { ...editing, segments: [editing.segments[0], editing.segments[0]] } })).toThrow('INVALID_EDITING');
    expect(() => parseProject({ ...project, editing: { ...editing, subtitles: [{ id: 'caption', start: 0, end: 15, text: '越界' }] } })).toThrow('INVALID_EDITING');
    expect(() => parseProject({ ...project, mediaAssets: [{ ...asset, id: '__proto__' }] })).toThrow('INVALID_MEDIA_ASSETS');
    expect(() => parseProject({ ...project, mediaAssets: [{ ...asset, mimeType: 'text/html' }] })).toThrow('INVALID_MEDIA_ASSETS');
  });

  it('字幕清空后仍可保存，且重复插入已有素材不会重复存储资源', () => {
    const project = ensureEditing(insertVideoSegment(insertVideoSegment(base, asset, 0), asset, 3));
    project.editing.subtitles = [{ id: 'empty-caption', start: 0, end: 1, text: '' }];
    expect(project.mediaAssets).toHaveLength(1);
    expect(parseProject(project).editing?.subtitles[0].text).toBe('');
  });
});
