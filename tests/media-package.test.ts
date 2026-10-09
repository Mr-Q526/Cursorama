import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, deleteSegment, ensureEditing, getSegments, insertVideoSegment, MEDIA_PACKAGE_HEADER_SIZE, MEDIA_PACKAGE_MAGIC, packProjectMedia, projectBytes, readProjectBytes, resolveTimeline, splitSegment, unpackProjectMedia } from '../shared';
import type { MediaAsset, MediaPackageEntry, Project } from '../shared';

const SOURCE_BYTES = new Uint8Array([1, 2, 3, 4]);
const VIDEO_BYTES = new Uint8Array([10, 20, 30]);
const AUDIO_BYTES = new Uint8Array([50, 60, 70, 80, 90]);
const video: MediaAsset = { id: 'video-asset', name: '补充视频.mp4', kind: 'video', mimeType: 'video/mp4', duration: 2, width: 1280, height: 720, hasAudio: false, url: 'blob:fixture-video', blob: new Blob([VIDEO_BYTES], { type: 'video/mp4' }) };
const music: MediaAsset = { id: 'audio-asset', name: '音乐.mp3', kind: 'audio', mimeType: 'audio/mpeg', duration: 5, url: 'blob:fixture-audio', blob: new Blob([AUDIO_BYTES], { type: 'audio/mpeg' }) };
const base: Project = { schemaVersion: 1, name: '多素材保存', duration: 5, width: 1920, height: 1080, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: 5, sourceType: 'video', hasAudio: true, cursorEmbedded: false, videoBlob: new Blob([SOURCE_BYTES], { type: 'video/webm' }), videoUrl: 'blob:fixture-source' };

function mediaProject(): Project {
  const next = ensureEditing(insertVideoSegment(base, video, 2));
  next.mediaAssets = [...next.mediaAssets ?? [], { id: music.id, name: music.name, kind: music.kind, mimeType: music.mimeType, duration: music.duration }];
  next.media = { [video.id]: video, [music.id]: music };
  next.editing.music = [{ id: 'music-clip', mediaId: music.id, start: 1, sourceIn: 0, sourceOut: 5, volume: 0.4 }];
  return next;
}

function alteredManifest(payload: ArrayBuffer, entries: unknown[], version = 1): ArrayBuffer {
  const originalHeader = new DataView(payload).getUint32(MEDIA_PACKAGE_MAGIC.length, true);
  const body = new Uint8Array(payload, MEDIA_PACKAGE_HEADER_SIZE + originalHeader);
  const metadata = new TextEncoder().encode(JSON.stringify({ version, entries }));
  const result = new Uint8Array(MEDIA_PACKAGE_HEADER_SIZE + metadata.length + body.length);
  result.set(new TextEncoder().encode(MEDIA_PACKAGE_MAGIC));
  new DataView(result.buffer).setUint32(MEDIA_PACKAGE_MAGIC.length, metadata.length, true);
  result.set(metadata, MEDIA_PACKAGE_HEADER_SIZE);
  result.set(body, MEDIA_PACKAGE_HEADER_SIZE + metadata.length);
  return result.buffer;
}

const fixtureEntries: MediaPackageEntry[] = [
  { id: 'source', offset: 0, length: SOURCE_BYTES.length },
  { id: video.id, offset: SOURCE_BYTES.length, length: VIDEO_BYTES.length },
  { id: music.id, offset: SOURCE_BYTES.length + VIDEO_BYTES.length, length: AUDIO_BYTES.length },
];

describe('工程媒体封装', () => {
  it('同一个工程保存源视频、插入视频、音乐及完整编辑数据', async () => {
    const project = mediaProject();
    const payload = await packProjectMedia(project);
    const restored = readProjectBytes(projectBytes(project, payload));
    const unpacked = unpackProjectMedia(restored.data, restored.bytes);
    expect(new Uint8Array(unpacked.sourceBytes ?? new ArrayBuffer(0))).toEqual(SOURCE_BYTES);
    expect(new Uint8Array(unpacked.assets.get(video.id) ?? new ArrayBuffer(0))).toEqual(VIDEO_BYTES);
    expect(new Uint8Array(unpacked.assets.get(music.id) ?? new ArrayBuffer(0))).toEqual(AUDIO_BYTES);
    expect(restored.data.editing).toEqual(project.editing);
    expect(restored.data.mediaAssets?.map(({ id }) => id)).toEqual([video.id, music.id]);
  });

  it('兼容只有一个源视频的旧工程 payload', async () => {
    const payload = await packProjectMedia(base);
    expect(new Uint8Array(payload ?? new ArrayBuffer(0))).toEqual(SOURCE_BYTES);
    expect(unpackProjectMedia(base, payload).sourceBytes).toBe(payload);
    expect(unpackProjectMedia(base, payload).assets.size).toBe(0);
    expect(await packProjectMedia({ ...base, sourceType: 'demo', videoBlob: undefined })).toBeUndefined();
  });

  it('分割同一音乐素材后保存恢复，两段音轨保持不同的源入点', async () => {
    const layered = ensureEditing({ ...base, mediaAssets: [{ id: music.id, name: music.name, kind: music.kind, mimeType: music.mimeType, duration: music.duration }], media: { [music.id]: music } });
    layered.editing.music = [{ id: 'music-clip', mediaId: music.id, start: 0, sourceIn: 0, sourceOut: 5, volume: 0.4 }];
    const first = splitSegment(layered, 'source-segment', 2);
    const middleId = getSegments(first)[1].id;
    const project = deleteSegment(splitSegment(first, middleId, 3), middleId);
    const restored = readProjectBytes(projectBytes(project, await packProjectMedia(project)));
    const tracks = restored.data.editing?.music;
    expect(tracks?.map(({ mediaId, start, sourceIn, sourceOut }) => [mediaId, start, sourceIn, sourceOut])).toEqual([[music.id, 0, 0, 2], [music.id, 2, 3, 5]]);
    expect(unpackProjectMedia(restored.data, restored.bytes).assets.size).toBe(1);
    expect(resolveTimeline(restored.data, 2).sourceTime).toBe(3);
    const musicTime = 2.5;
    const active = tracks?.find((clip) => musicTime >= clip.start && musicTime < clip.start + clip.sourceOut - clip.sourceIn);
    expect(active).toBeDefined();
    expect(active ? active.sourceIn + musicTime - active.start : undefined).toBe(3.5);
  });

  it('演示工程也能保存导入素材，且不要求原始视频', async () => {
    const project = { ...mediaProject(), sourceType: 'demo' as const, videoBlob: undefined, videoUrl: undefined };
    const payload = await packProjectMedia(project);
    const unpacked = unpackProjectMedia(project, payload);
    expect(unpacked.sourceBytes).toBeUndefined();
    expect(unpacked.assets.size).toBe(2);
    expect(readProjectBytes(projectBytes(project, payload)).data.sourceType).toBe('demo');
  });

  it('素材必须齐全，避免保存出只能在当前会话播放的工程', async () => {
    await expect(packProjectMedia({ ...mediaProject(), media: {} })).rejects.toThrow('MISSING_MEDIA_ASSET');
    await expect(packProjectMedia({ ...base, videoBlob: undefined })).rejects.toThrow('MISSING_VIDEO');
    expect(() => unpackProjectMedia(mediaProject(), SOURCE_BYTES.buffer)).toThrow('INVALID_MEDIA_PACKAGE');
    expect(() => unpackProjectMedia(mediaProject())).toThrow('MISSING_VIDEO');
  });

  it('拒绝重复或未知素材、重叠偏移、整数溢出和额外尾部数据', async () => {
    const project = mediaProject();
    const payload = await packProjectMedia(project);
    if (!payload) throw new Error('MISSING_TEST_PAYLOAD');
    const badEntries: unknown[][] = [
      [fixtureEntries[0], { ...fixtureEntries[1], id: 'source' }, fixtureEntries[2]],
      [fixtureEntries[0], { ...fixtureEntries[1], id: 'unknown' }, fixtureEntries[2]],
      [fixtureEntries[0], { ...fixtureEntries[1], offset: 0 }, fixtureEntries[2]],
      [fixtureEntries[0], { ...fixtureEntries[1], length: Number.MAX_SAFE_INTEGER }, fixtureEntries[2]],
      [fixtureEntries[0], { ...fixtureEntries[1], offset: -1 }, fixtureEntries[2]],
      [fixtureEntries[0], { ...fixtureEntries[1], length: 0 }, fixtureEntries[2]],
      [fixtureEntries[0], fixtureEntries[1]],
    ];
    for (const entries of badEntries) expect(() => unpackProjectMedia(project, alteredManifest(payload, entries))).toThrow('INVALID_MEDIA_PACKAGE');
    expect(() => unpackProjectMedia(project, alteredManifest(payload, fixtureEntries, 2))).toThrow('INVALID_MEDIA_PACKAGE');
    expect(() => unpackProjectMedia(project, payload.slice(0, -1))).toThrow('INVALID_MEDIA_PACKAGE');
    const withTail = new Uint8Array(payload.byteLength + 1);
    withTail.set(new Uint8Array(payload));
    expect(() => unpackProjectMedia(project, withTail.buffer)).toThrow('INVALID_MEDIA_PACKAGE');
  });

  it('拒绝损坏的媒体头，读工程时就给出错误', async () => {
    const project = mediaProject();
    const payload = await packProjectMedia(project);
    if (!payload) throw new Error('MISSING_TEST_PAYLOAD');
    const corrupt = payload.slice(0);
    new DataView(corrupt).setUint32(MEDIA_PACKAGE_MAGIC.length, 0xffffffff, true);
    expect(() => readProjectBytes(projectBytes(project, corrupt))).toThrow('INVALID_MEDIA_PACKAGE');
  });
});
