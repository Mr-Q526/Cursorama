import { describe, expect, it } from 'vitest';
import { BACKGROUND_IMAGE_LIMITS, backgroundImageMetadata, backgroundImageMimeType, DEFAULT_SETTINGS, packProjectMedia, parseProject, projectBytes, readProjectBytes, unpackProjectMedia, validateBackgroundImagePayload, validBackgroundImageDimensions } from '../shared';
import type { BackgroundImageAsset, Project } from '../shared';
import { projectMetadata, runtimeFromStored } from '../src/engine/project-media';

const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVukAAAAASUVORK5CYII=', 'base64'));
const SOURCE_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const image: BackgroundImageAsset = {
  id: 'background-fixture', name: '自定义壁纸.png', mimeType: 'image/png', width: 1, height: 1,
  blob: new Blob([PNG_BYTES], { type: 'image/png' }), url: 'blob:fixture-image',
};
const demo: Project = {
  schemaVersion: 1, name: '自定义背景工程', duration: 3, width: 1920, height: 1080, frameRate: 60,
  samples: [], clips: [], settings: { ...DEFAULT_SETTINGS, background: 'custom' }, trimStart: 0, trimEnd: 3,
  sourceType: 'demo', hasAudio: false, backgroundImage: backgroundImageMetadata(image), backgroundImageAsset: image,
};

describe('自定义背景工程媒体', () => {
  it('封装原始图片字节、背景设置和尺寸，恢复时不依赖原文件或原 Blob URL', async () => {
    const metadata = projectMetadata(demo);
    const saved = projectBytes(metadata, await packProjectMedia(demo));
    const restored = readProjectBytes(saved);
    const media = unpackProjectMedia(restored.data, restored.bytes);
    expect(new Uint8Array(media.assets.get(image.id) ?? new ArrayBuffer(0))).toEqual(PNG_BYTES);
    expect(restored.data.backgroundImage).toEqual(backgroundImageMetadata(image));
    expect(restored.data.settings.background).toBe('custom');
    expect(restored.data.frameRate).toBe(60);
    expect(JSON.stringify(restored.data)).not.toContain(image.url);
    const runtime = runtimeFromStored(restored);
    try {
      expect(runtime.backgroundImageAsset?.url).not.toBe(image.url);
      expect(runtime.backgroundImageAsset?.mimeType).toBe('image/png');
      expect(new Uint8Array(await runtime.backgroundImageAsset?.blob.arrayBuffer() ?? new ArrayBuffer(0))).toEqual(PNG_BYTES);
    } finally { if (runtime.backgroundImageAsset) URL.revokeObjectURL(runtime.backgroundImageAsset.url); }
  });

  it('录制工程同时保存原视频和背景图片', async () => {
    const project: Project = { ...demo, sourceType: 'video', videoBlob: new Blob([SOURCE_BYTES], { type: 'video/webm' }) };
    const restored = readProjectBytes(projectBytes(projectMetadata(project), await packProjectMedia(project)));
    const media = unpackProjectMedia(restored.data, restored.bytes);
    expect(new Uint8Array(media.sourceBytes ?? new ArrayBuffer(0))).toEqual(SOURCE_BYTES);
    expect(new Uint8Array(media.assets.get(image.id) ?? new ArrayBuffer(0))).toEqual(PNG_BYTES);
  });

  it('切换内置壁纸保留自定义图片，删除图片后回到没有媒体的普通工程', async () => {
    const builtin = { ...demo, settings: { ...demo.settings, background: 'ripple' as const } };
    const restored = readProjectBytes(projectBytes(projectMetadata(builtin), await packProjectMedia(builtin)));
    expect(restored.data.settings.background).toBe('ripple');
    expect(unpackProjectMedia(restored.data, restored.bytes).assets.get(image.id)).toBeDefined();
    const removed: Project = { ...builtin, backgroundImage: undefined, backgroundImageAsset: undefined };
    expect(await packProjectMedia(removed)).toBeUndefined();
    expect(parseProject(projectMetadata(removed)).backgroundImage).toBeUndefined();
  });

  it('拒绝缺失图片的自定义工程、重复素材标识和不匹配的图片元数据', async () => {
    expect(() => parseProject({ ...demo, backgroundImage: undefined })).toThrow('MISSING_BACKGROUND_IMAGE');
    expect(() => parseProject({ ...demo, mediaAssets: [{ id: image.id, name: '素材.webm', kind: 'video', mimeType: 'video/webm', duration: 1 }] })).toThrow('INVALID_BACKGROUND_IMAGE');
    await expect(packProjectMedia({ ...demo, backgroundImageAsset: undefined })).rejects.toThrow('MISSING_BACKGROUND_IMAGE');
    await expect(packProjectMedia({ ...demo, backgroundImageAsset: { ...image, width: 100 } })).rejects.toThrow('INVALID_BACKGROUND_IMAGE');
    expect(() => readProjectBytes(projectBytes(projectMetadata(demo)))).toThrow('MISSING_BACKGROUND_IMAGE');
    expect(() => readProjectBytes(projectBytes(projectMetadata(demo), PNG_BYTES.buffer))).toThrow('INVALID_MEDIA_PACKAGE');
  });

  it('对图片格式、尺寸和体积设明确限制，不允许把 URL 或脚本充当图片媒体', () => {
    expect(backgroundImageMimeType(PNG_BYTES)).toBe('image/png');
    expect(backgroundImageMimeType(new Uint8Array([255, 216, 255, 224]))).toBe('image/jpeg');
    expect(backgroundImageMimeType(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
    expect(backgroundImageMimeType(new TextEncoder().encode('<svg/>'))).toBeUndefined();
    expect(validBackgroundImageDimensions(3840, 2160)).toBe(true);
    expect(validBackgroundImageDimensions(8192, 4320)).toBe(true);
    expect(validBackgroundImageDimensions(BACKGROUND_IMAGE_LIMITS.maxDimension + 1, 1)).toBe(false);
    expect(validBackgroundImageDimensions(16384, 16384)).toBe(false);
    expect(validBackgroundImageDimensions(1.5, 1)).toBe(false);
    expect(() => parseProject({ ...demo, backgroundImage: { ...demo.backgroundImage, mimeType: 'image/svg+xml' } })).toThrow('INVALID_BACKGROUND_IMAGE');
    expect(() => parseProject({ ...demo, backgroundImage: { ...demo.backgroundImage, id: 'source' } })).toThrow('INVALID_BACKGROUND_IMAGE');
    expect(() => parseProject({ ...demo, backgroundImage: { ...demo.backgroundImage, width: 0 } })).toThrow('INVALID_BACKGROUND_IMAGE');
    expect(() => validateBackgroundImagePayload(backgroundImageMetadata(image), new Uint8Array())).toThrow('INVALID_BACKGROUND_IMAGE_PAYLOAD');
    expect(() => validateBackgroundImagePayload(backgroundImageMetadata(image), new Uint8Array(BACKGROUND_IMAGE_LIMITS.maxBytes + 1))).toThrow('INVALID_BACKGROUND_IMAGE_PAYLOAD');
    expect(() => validateBackgroundImagePayload(backgroundImageMetadata(image), new TextEncoder().encode('https://example.com/image.png'))).toThrow('INVALID_BACKGROUND_IMAGE_PAYLOAD');
  });
});
