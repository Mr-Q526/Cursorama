import { describe, expect, it } from 'vitest';
import { exportBitrate, hasEmbeddedCursor, preferredResolution, previewDimensions } from '../src/engine';

describe('预览与输出清晰度', () => {
  it('狭小预览依然保持 1080p 缓冲区', () => {
    const size = previewDimensions('16:9', 764, 122, 1.1);
    expect([size.pixelWidth, size.pixelHeight]).toEqual([1920, 1080]);
    expect(size.displayHeight).toBe(122);
  });
  it('高分屏全屏预览按设备像素重新渲染', () => {
    const size = previewDimensions('16:9', 1920, 1080, 2);
    expect([size.pixelWidth, size.pixelHeight]).toEqual([3840, 2160]);
  });
  it('竖屏预览保持比例且编码尺寸为偶数', () => {
    const size = previewDimensions('9:16', 600, 900, 1.5);
    expect(size.pixelWidth % 2).toBe(0);
    expect(size.pixelHeight % 2).toBe(0);
    expect(size.displayWidth / size.displayHeight).toBeCloseTo(9 / 16);
  });
  it('高分辨率素材默认匹配高分辨率导出', () => {
    expect(preferredResolution(2160)).toBe('2160p');
    expect(preferredResolution(1440)).toBe('1440p');
    expect(preferredResolution(1080)).toBe('1080p');
  });
  it('4K 高质量导出提升码率，避免沿用 1080p 固定码率', () => {
    expect(exportBitrate(3840, 2160, { resolution: '2160p', fps: 30, format: 'mp4', quality: 'high' })).toBe(64_000_000);
  });
  it('旧视频项目按包含系统鼠标处理，已知分离的鼠标允许重绘', () => {
    expect(hasEmbeddedCursor({ sourceType: 'video' })).toBe(true);
    expect(hasEmbeddedCursor({ sourceType: 'video', cursorEmbedded: false })).toBe(false);
  });
});
