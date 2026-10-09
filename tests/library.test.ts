import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, projectBytes } from '../shared';
import type { ExportRequest, ProjectData } from '../shared';
import { LocalLibrary } from '../storage/library';
import { atomicReplace } from '../storage/files';

const metadata: ProjectData = { schemaVersion: 1, name: '本地保存验证', duration: 10, width: 1920, height: 1080, samples: [{ time: 1, x: 0.5, y: 0.3, kind: 'click' }], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 1, trimEnd: 9, sourceType: 'video', hasAudio: true, cursorEmbedded: false };
const media = Uint8Array.from([10, 20, 30, 40]).buffer;
let temporary = '';
let library: LocalLibrary;

beforeEach(async () => { temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-library-test-')); library = new LocalLibrary(path.join(temporary, 'library')); });
afterEach(async () => {
  if (!path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(temporary).startsWith('cursorama-library-test-')) throw new Error('INVALID_TEST_DIRECTORY');
  await rm(temporary, { recursive: true, force: true });
});

function exportRequest(projectId: string): ExportRequest {
  return { bytes: media, mimeType: 'video/webm', format: 'mp4', name: metadata.name, quality: 'high', duration: 8, fps: 30, projectId };
}

describe('磁盘项目库', () => {
  it.skipIf(process.platform !== 'win32')('Windows 短暂锁文件时仍可原子替换，旧文件保留到成功完成', async () => {
    const original = path.join(temporary, 'project.cursorama');
    const pending = path.join(temporary, 'project.partial');
    await writeFile(original, '原工程');
    await writeFile(pending, '更新后的工程');
    let locked = true;
    await atomicReplace(pending, original, async (source, target) => {
      if (locked) {
        locked = false;
        expect((await readFile(target)).toString()).toBe('原工程');
        throw Object.assign(new Error('模拟 Windows 文件短暂占用'), { code: 'EPERM' });
      }
      await rename(source, target);
    });
    expect((await readFile(original)).toString()).toBe('更新后的工程');
  });

  it('默认工程与成片目录位于软件目录下', async () => {
    const snapshot = await library.list();
    expect(snapshot.storage).toEqual({ projectDirectory: path.join(library.root, 'projects'), exportDirectory: path.join(library.root, 'exports') });
  });

  it('分别修改保存和导出位置，重启后保留设置与历史文件，旧工程继续原位编辑', async () => {
    const old = await library.saveProject(metadata, media);
    const first = await library.exportVideo(exportRequest(old.projectId ?? ''), (target) => writeFile(target, new Uint8Array(media)));
    const settings = { projectDirectory: path.join(temporary, 'chosen-projects'), exportDirectory: path.join(temporary, 'chosen-exports') };
    await library.configure(settings);
    const fresh = await library.saveProject({ ...metadata, name: '新位置的工程' }, media);
    expect(path.dirname(path.dirname(fresh.path ?? ''))).toBe(settings.projectDirectory);
    const edited = await library.saveProject({ ...metadata, name: '旧位置继续编辑' }, media, old.projectId);
    expect(edited.path).toBe(old.path);
    const second = await library.exportVideo(exportRequest(old.projectId ?? ''), (target) => writeFile(target, new Uint8Array(media)));
    expect(path.dirname(path.dirname(second.path ?? ''))).toBe(settings.exportDirectory);
    const restarted = new LocalLibrary(library.root);
    const snapshot = await restarted.list();
    expect(snapshot.storage).toEqual(settings);
    expect(snapshot.projects).toHaveLength(2);
    expect(snapshot.projects.find((item) => item.id === old.projectId)?.videos).toHaveLength(2);
    expect(await restarted.videoPath(old.projectId ?? '', first.videoId ?? '')).toBe(first.path);
    expect(await restarted.videoPath(old.projectId ?? '', second.videoId ?? '')).toBe(second.path);
    expect((await restarted.openProject(old.projectId ?? '')).data.name).toBe('旧位置继续编辑');
    expect((await readFile(first.path ?? '')).byteLength).toBe(media.byteLength);
  });

  it('无效或不可写的目标不会覆盖已保存的配置', async () => {
    const original = { projectDirectory: path.join(temporary, 'saved-projects'), exportDirectory: path.join(temporary, 'saved-exports') };
    await library.configure(original);
    await expect(library.configure({ ...original, projectDirectory: 'relative-directory' })).rejects.toThrow('INVALID_STORAGE_DIRECTORY');
    const occupied = path.join(temporary, 'not-a-directory');
    await writeFile(occupied, '保留原文件');
    await expect(library.configure({ projectDirectory: path.join(temporary, 'unused-projects'), exportDirectory: occupied })).rejects.toThrow();
    expect((await new LocalLibrary(library.root).list()).storage).toEqual(original);
    expect((await readFile(occupied)).toString()).toBe('保留原文件');
  });

  it('兼容旧库中的工程及工程内的成片，不复制或搬动旧文件', async () => {
    const legacy = path.join(temporary, 'old-library');
    const id = randomUUID();
    const videoId = randomUUID();
    const directory = path.join(legacy, 'projects', id);
    const videos = path.join(directory, 'exports');
    await mkdir(videos, { recursive: true });
    await writeFile(path.join(directory, 'project.cursorama'), projectBytes(metadata, media));
    await writeFile(path.join(videos, `${videoId}.mp4`), new Uint8Array(media));
    const upgraded = new LocalLibrary(library.root, { legacyRoots: [legacy] });
    const snapshot = await upgraded.list();
    expect(snapshot.projects[0].path).toBe(path.join(directory, 'project.cursorama'));
    expect(snapshot.projects[0].videos).toHaveLength(1);
    const saved = await upgraded.saveProject({ ...metadata, name: '原位更新' }, media, id);
    expect(saved.path).toBe(path.join(directory, 'project.cursorama'));
    expect((await upgraded.openProject(id)).data.name).toBe('原位更新');
  });

  it('切换目录等待正在写入的成片完成，不把文件与索引分到两个位置', async () => {
    const saved = await library.saveProject(metadata, media);
    let start: () => void = () => undefined;
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const exporting = library.exportVideo(exportRequest(saved.projectId ?? ''), async (target) => { start(); await released; await writeFile(target, new Uint8Array(media)); });
    await started;
    const settings = { projectDirectory: path.join(temporary, 'queued-projects'), exportDirectory: path.join(temporary, 'queued-exports') };
    const configuring = library.configure(settings);
    release();
    const exported = await exporting;
    const snapshot = await configuring;
    expect(exported.path?.startsWith(path.join(library.root, 'exports'))).toBe(true);
    expect(snapshot.storage).toEqual(settings);
    expect(snapshot.projects[0].videos[0].path).toBe(exported.path);
  });

  it('新建为空，保存与重复保存保持同一个工程，重新实例化后可恢复原素材和编辑数据', async () => {
    expect((await library.list()).projects).toEqual([]);
    const saved = await library.saveProject(metadata, media);
    const edited: ProjectData = { ...metadata, name: '改名后的工程', settings: { ...metadata.settings, padding: 12 }, trimEnd: 8 };
    const updated = await library.saveProject(edited, media, saved.projectId);
    expect(updated.path).toBe(saved.path);
    const restarted = new LocalLibrary(library.root);
    const snapshot = await restarted.list();
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0].id).toBe(saved.projectId);
    expect(snapshot.projects[0].name).toBe(edited.name);
    const reopened = await restarted.openProject(snapshot.projects[0].id);
    expect(reopened.data).toEqual(edited);
    expect(new Uint8Array(reopened.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(media));
  });

  it('每次导出保留独立成片并关联工程，重新扫描真实文件后仍可打开', async () => {
    const saved = await library.saveProject(metadata, media);
    const value = exportRequest(saved.projectId ?? '');
    const first = await library.exportVideo(value, (target) => writeFile(target, new Uint8Array(media)));
    const second = await library.exportVideo(value, (target) => writeFile(target, new Uint8Array(media)));
    expect(first.path).not.toBe(second.path);
    const restarted = new LocalLibrary(library.root);
    const project = (await restarted.list()).projects[0];
    expect(project.videos).toHaveLength(2);
    const target = await restarted.videoPath(project.id, first.videoId ?? '');
    expect(await readFile(target)).toEqual(Buffer.from(media));
    expect((await restarted.openProject(project.id)).data).toEqual(metadata);
  });

  it('导出失败不会登记半成品或损坏工程', async () => {
    const saved = await library.saveProject(metadata, media);
    await expect(library.exportVideo(exportRequest(saved.projectId ?? ''), async (target) => { await writeFile(target, new Uint8Array(media)); throw new Error('ENCODER_FAILED'); })).rejects.toThrow('ENCODER_FAILED');
    const snapshot = await library.list();
    expect(snapshot.projects[0].videos).toEqual([]);
    expect((await library.openProject(snapshot.projects[0].id)).data).toEqual(metadata);
  });

  it('损坏工程单独报告，移走成片后列表刷新且打开失败，正常工程不受影响', async () => {
    const first = await library.saveProject(metadata, media);
    const damaged = await library.saveProject({ ...metadata, name: '损坏工程' }, media);
    await writeFile(damaged.path ?? '', new Uint8Array([1, 2, 3]));
    const exported = await library.exportVideo(exportRequest(first.projectId ?? ''), (target) => writeFile(target, new Uint8Array(media)));
    await rm(exported.path ?? '');
    const snapshot = await library.list();
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.unavailable).toBe(1);
    expect(snapshot.projects[0].videos).toEqual([]);
    await expect(library.videoPath(first.projectId ?? '', exported.videoId ?? '')).rejects.toThrow('VIDEO_NOT_FOUND');
  });

  it('拒绝路径穿越、无效素材和未保存工程的导出', async () => {
    await expect(library.saveProject(metadata)).rejects.toThrow('MISSING_VIDEO');
    await expect(library.saveProject(metadata, media, '../outside')).rejects.toThrow('INVALID_LIBRARY_ID');
    await expect(library.openProject('../outside')).rejects.toThrow('INVALID_LIBRARY_ID');
    await expect(library.exportVideo({ ...exportRequest(''), projectId: undefined }, (target) => writeFile(target, new Uint8Array(media)))).rejects.toThrow('PROJECT_NOT_SAVED');
    const saved = await library.saveProject(metadata, media);
    await expect(library.videoPath(saved.projectId ?? '', '../outside')).rejects.toThrow('INVALID_LIBRARY_ID');
  });

  it('拒绝通过目录联接读写项目库外的文件', async () => {
    await library.list();
    const outside = path.join(temporary, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'project.cursorama'), '外部文件');
    const id = randomUUID();
    await symlink(outside, path.join(library.root, 'projects', id), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(library.openProject(id)).rejects.toThrow('INVALID_LIBRARY_PATH');
    await expect(library.saveProject(metadata, media, id)).rejects.toThrow('INVALID_LIBRARY_PATH');
    expect((await readFile(path.join(outside, 'project.cursorama'))).toString()).toBe('外部文件');
  });

  it('连续保存按顺序落盘，后一次修改覆盖前一次且不会产生重复条目', async () => {
    const saved = await library.saveProject(metadata, media);
    await Promise.all([
      library.saveProject({ ...metadata, name: '第一次修改' }, media, saved.projectId),
      library.saveProject({ ...metadata, name: '最终修改' }, media, saved.projectId),
    ]);
    const snapshot = await library.list();
    expect(snapshot.projects).toHaveLength(1);
    expect((await library.openProject(saved.projectId ?? '')).data.name).toBe('最终修改');
  });

  it('刷新、读取大工程和自动保存并发发生时，文件保持完整且替换不会被读取阻塞', async () => {
    const stress = { mediaBytes: 8 * 1024 * 1024, iterations: 20 } as const;
    const bytes = new ArrayBuffer(stress.mediaBytes);
    const saved = await library.saveProject(metadata, bytes);
    for (let index = 0; index < stress.iterations; index++) {
      const edited = { ...metadata, name: `${metadata.name}-${index}` };
      const [, result, restored] = await Promise.all([library.list(), library.saveProject(edited, bytes, saved.projectId), library.openProject(saved.projectId ?? '')]);
      expect(result.path).toBe(saved.path);
      expect(restored.bytes?.byteLength).toBe(stress.mediaBytes);
    }
    expect((await library.openProject(saved.projectId ?? '')).data.name).toBe(`${metadata.name}-${stress.iterations - 1}`);
  }, 30_000);
});
