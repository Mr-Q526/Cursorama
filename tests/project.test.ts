import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseProject, projectBytes, readProjectBytes } from '../shared';
import type { ProjectData } from '../shared';

const metadata: ProjectData = { schemaVersion: 1, name: '保存验证', duration: 10, width: 1920, height: 1080, samples: [{ time: 1, x: 0.5, y: 0.3, kind: 'click' }], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 1, trimEnd: 9, sourceType: 'video', hasAudio: true, cursorEmbedded: false };

describe('项目持久化', () => {
  it('同时保留原始视频、鼠标轨迹、设置和裁剪区间', () => {
    const payload = Uint8Array.from([10, 20, 30, 40]).buffer;
    const restored = readProjectBytes(projectBytes(metadata, payload));
    expect(restored.data).toEqual(metadata);
    expect(new Uint8Array(restored.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(payload));
  });
  it('从 Node Buffer 或非零偏移量的视图读取时，不把头部与缓冲池内容混入视频', () => {
    const payload = Uint8Array.from([10, 20, 30, 40]).buffer;
    const packed = Buffer.from(projectBytes(metadata, payload));
    const pooled = Buffer.alloc(packed.length + 20);
    packed.copy(pooled, 10);
    for (const input of [packed, pooled.subarray(10, 10 + packed.length)]) {
      const restored = readProjectBytes(input);
      expect(restored.bytes?.byteLength).toBe(payload.byteLength);
      expect(new Uint8Array(restored.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(payload));
    }
  });
  it('拒绝损坏或被截断的项目', () => {
    expect(() => readProjectBytes(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => readProjectBytes(projectBytes(metadata).slice(0, 30))).toThrow();
  });
  it('拒绝不合法镜头倍率与裁剪区间', () => {
    expect(() => parseProject({ ...metadata, trimEnd: 0 })).toThrow();
    expect(() => parseProject({ ...metadata, settings: { ...DEFAULT_SETTINGS, zoom: 99 } })).toThrow();
  });
  it('保存录制帧率，兼容旧工程并拒绝非法帧率', () => {
    const data = { ...metadata, frameRate: 60 };
    expect(readProjectBytes(projectBytes(data, Uint8Array.from([1]).buffer)).data.frameRate).toBe(60);
    expect(parseProject(metadata).frameRate).toBeUndefined();
    for (const frameRate of [0, -1, 300, Number.NaN, '60']) expect(() => parseProject({ ...metadata, frameRate })).toThrow('INVALID_FRAME_RATE');
  });
  it('拒绝缺失视频内容的录制项目', () => {
    expect(() => readProjectBytes(projectBytes(metadata))).toThrow('MISSING_VIDEO');
  });
  it('拒绝无序轨迹，避免回放时指针跳变', () => {
    expect(() => parseProject({ ...metadata, samples: [...metadata.samples, { time: 0.2, x: 0.5, y: 0.5, kind: 'move' }] })).toThrow('UNSORTED_SAMPLES');
  });
  it('兼容旧项目，并且保守地避免系统鼠标重复', () => {
    expect(parseProject({ ...metadata, cursorEmbedded: undefined }).cursorEmbedded).toBe(true);
    expect(() => parseProject({ ...metadata, cursorEmbedded: 'false' })).toThrow('INVALID_CURSOR_SOURCE');
  });
  it('保存毛玻璃强度，并为旧工程补上默认效果', () => {
    const settings = { ...DEFAULT_SETTINGS, edgeGlass: 82 };
    expect(parseProject({ ...metadata, settings }).settings.edgeGlass).toBe(82);
    expect(parseProject({ ...metadata, settings: { ...settings, edgeGlass: undefined } }).settings.edgeGlass).toBe(DEFAULT_SETTINGS.edgeGlass);
    for (const edgeGlass of [-1, 101, '55', Number.NaN]) {
      expect(() => parseProject({ ...metadata, settings: { ...settings, edgeGlass } })).toThrow('INVALID_SETTINGS');
    }
  });
  it('保存输入焦点和持续操作信号，并拒绝损坏的焦点区域', () => {
    const sample = { time: 2, x: 0.8, y: 0.6, kind: 'typing', focus: { x: 0.4, y: 0.3, width: 0.25, height: 0.04, source: 'control' } } as const;
    const project = { ...metadata, samples: [...metadata.samples, sample] };
    expect(readProjectBytes(projectBytes(project, Uint8Array.from([1]).buffer)).data.samples[1]).toEqual(sample);
    for (const focus of [null, {}, { ...sample.focus, x: -1 }, { ...sample.focus, width: 2 }, { ...sample.focus, source: 'text' }]) {
      expect(() => parseProject({ ...project, samples: [{ ...sample, focus }] })).toThrow('INVALID_PROJECT');
    }
  });
});
