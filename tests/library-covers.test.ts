import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { COVER_DATA_PREFIX, DEFAULT_SETTINGS, isLibraryCover, packProjectMedia, parseProject } from '../shared';
import type { ExportRequest, MediaAsset, Project, ProjectData } from '../shared';
import { LocalLibrary } from '../storage/library';
import { generateLibraryThumbnail } from '../storage/thumbnails';

export interface CoverFixture { path: string; bytes: ArrayBuffer; cover: string; }

const COVER_QA = { prefix: 'cursorama-covers-test-', name: '视频封面验证', duration: 1, shortDuration: 0.1, width: 160, height: 90, fps: 10, timeout: 20_000, missingBinary: 'missing-ffmpeg-for-cache-test', assetId: 'inserted-video', segmentId: 'inserted-segment' } as const;
const encode = promisify(execFile);
const binary = ffmpeg ?? '';
let temporary = '';
let fixture: CoverFixture;
let shortPath = '';
let metadata: ProjectData;

beforeAll(async () => {
  if (!binary) throw new Error('COVER_TEST_FFMPEG_MISSING');
  temporary = await mkdtemp(path.join(tmpdir(), COVER_QA.prefix));
  const videoPath = path.join(temporary, 'video.mp4');
  shortPath = path.join(temporary, 'short.mp4');
  const source = `color=c=steelblue:s=${COVER_QA.width}x${COVER_QA.height}:r=${COVER_QA.fps}`;
  await encode(binary, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', source, '-t', String(COVER_QA.duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath], { windowsHide: true, timeout: COVER_QA.timeout });
  await encode(binary, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-t', String(COVER_QA.shortDuration), '-c', 'copy', shortPath], { windowsHide: true, timeout: COVER_QA.timeout });
  const content = await readFile(videoPath);
  fixture = { path: videoPath, bytes: content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer, cover: await generateLibraryThumbnail(binary, { path: videoPath, time: 0 }) };
  metadata = { schemaVersion: 1, name: COVER_QA.name, duration: COVER_QA.duration, width: COVER_QA.width, height: COVER_QA.height, sourceType: 'video', hasAudio: false, cursorEmbedded: true, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: COVER_QA.duration };
});

afterAll(async () => {
  const resolved = await realpath(temporary);
  if (path.dirname(resolved) !== await realpath(tmpdir()) || !path.basename(resolved).startsWith(COVER_QA.prefix)) throw new Error('INVALID_COVER_TEST_DIRECTORY');
  await rm(resolved, { recursive: true, force: true });
});

describe('本地视频封面', () => {
  it('工程封面随元数据保存恢复，项目库直接读取它', async () => {
    const library = new LocalLibrary(path.join(temporary, 'metadata'));
    const saved = await library.saveProject({ ...metadata, libraryCover: fixture.cover }, fixture.bytes);
    const id = saved.projectId ?? '';
    expect((await library.openProject(id)).data.libraryCover).toBe(fixture.cover);
    expect((await library.list()).projects[0].cover).toBe(fixture.cover);
    expect(await library.cover(id, COVER_QA.missingBinary)).toBe(fixture.cover);
    for (const libraryCover of ['https://outside.example/cover.jpg', `${COVER_DATA_PREFIX}invalid!`, 1]) {
      expect(() => parseProject({ ...metadata, libraryCover })).toThrow('INVALID_LIBRARY_COVER');
    }
  });

  it('旧工程从真实视频生成 JPEG，并在重启后复用磁盘缓存', async () => {
    const library = new LocalLibrary(path.join(temporary, 'legacy'));
    const saved = await library.saveProject(metadata, fixture.bytes);
    const id = saved.projectId ?? '';
    const covers = await Promise.all([library.cover(id, binary), library.cover(id, binary)]);
    expect(isLibraryCover(covers[0])).toBe(true);
    expect(covers[1]).toBe(covers[0]);
    const restarted = new LocalLibrary(library.root);
    expect(await restarted.cover(id, COVER_QA.missingBinary)).toBe(covers[0]);
    expect((await library.openProject(id)).bytes).toEqual(fixture.bytes);
  });

  it('导出成片生成独立封面，图片缓存不改变视频文件', async () => {
    const library = new LocalLibrary(path.join(temporary, 'exports'));
    const saved = await library.saveProject(metadata, fixture.bytes);
    const id = saved.projectId ?? '';
    const request: ExportRequest = { bytes: fixture.bytes, mimeType: 'video/mp4', format: 'mp4', name: metadata.name, duration: metadata.duration, fps: 30, quality: 'high', projectId: id };
    const video = await library.exportVideo(request, (target) => copyFile(fixture.path, target));
    const videoId = video.videoId ?? '';
    const before = await stat(video.path ?? '');
    const cover = await library.cover(id, binary, videoId);
    expect(isLibraryCover(cover)).toBe(true);
    expect(await library.cover(id, COVER_QA.missingBinary, videoId)).toBe(cover);
    const after = await stat(video.path ?? '');
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('包含插入视频的工程根据输出时间解包并选择对应素材', async () => {
    const library = new LocalLibrary(path.join(temporary, 'packed'));
    const asset: MediaAsset = { id: COVER_QA.assetId, name: COVER_QA.name, kind: 'video', mimeType: 'video/mp4', duration: COVER_QA.duration, width: COVER_QA.width, height: COVER_QA.height, hasAudio: false, blob: new Blob([fixture.bytes], { type: 'video/mp4' }), url: '' };
    const { blob: _blob, url: _url, ...assetData } = asset;
    const data: ProjectData = { ...metadata, mediaAssets: [assetData], editing: { segments: [{ id: COVER_QA.segmentId, mediaId: asset.id, sourceIn: 0, sourceOut: asset.duration, speed: 1, volume: 1 }], music: [], subtitles: [] } };
    const project: Project = { ...data, videoBlob: new Blob([Uint8Array.from([1, 2, 3])]), media: { [asset.id]: asset } };
    const payload = await packProjectMedia(project);
    const saved = await library.saveProject(data, payload);
    expect(isLibraryCover(await library.cover(saved.projectId ?? '', binary))).toBe(true);
  });

  it('极短成片在取样位置超过末帧时退回首帧', async () => {
    expect(isLibraryCover(await generateLibraryThumbnail(binary, { path: shortPath, time: COVER_QA.duration }))).toBe(true);
  });

  it('插入素材缺失时拒绝覆盖已经保存的工程', async () => {
    const library = new LocalLibrary(path.join(temporary, 'missing-media'));
    const saved = await library.saveProject(metadata, fixture.bytes);
    const id = saved.projectId ?? '';
    const damaged: ProjectData = { ...metadata, mediaAssets: [{ id: COVER_QA.assetId, name: COVER_QA.name, kind: 'video', mimeType: 'video/mp4', duration: COVER_QA.duration, width: COVER_QA.width, height: COVER_QA.height }] };
    await expect(library.saveProject(damaged, fixture.bytes, id)).rejects.toThrow('INVALID_MEDIA_PACKAGE');
    await expect(library.saveProject({ ...damaged, sourceType: 'demo' }, undefined, id)).rejects.toThrow('MISSING_MEDIA_ASSET');
    expect((await library.openProject(id)).data).toEqual(metadata);
    expect((await library.openProject(id)).bytes).toEqual(fixture.bytes);
  });

  it('缺失封面保留占位，非法标识拒绝访问，歧义输入不覆盖源文件', async () => {
    const library = new LocalLibrary(path.join(temporary, 'unavailable'));
    const saved = await library.saveProject({ ...metadata, sourceType: 'demo' });
    expect(await library.cover(saved.projectId ?? '', binary)).toBeNull();
    await expect(library.cover('../project', binary)).rejects.toThrow('INVALID_LIBRARY_ID');
    await expect(library.cover(saved.projectId ?? '', binary, '../video')).rejects.toThrow('INVALID_LIBRARY_ID');
    await expect(generateLibraryThumbnail(binary, { path: fixture.path, bytes: fixture.bytes, time: 0 })).rejects.toThrow('AMBIGUOUS_COVER_SOURCE');
    expect((await stat(fixture.path)).size).toBe(fixture.bytes.byteLength);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const damaged = await library.saveProject(metadata, Uint8Array.from([1, 2, 3]).buffer);
      expect(await library.cover(damaged.projectId ?? '', binary)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
});
