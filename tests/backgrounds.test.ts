import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseProject, projectBytes, readProjectBytes, WALLPAPER_IDS } from '../shared';
import type { ProjectData } from '../shared';
import { backgroundCover } from '../src/engine/backgrounds';

const demo: ProjectData = { schemaVersion: 1, name: '背景工程验证', duration: 3, width: 1920, height: 1080, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: 3, sourceType: 'demo', hasAudio: false };

describe('壁纸背景', () => {
  it.each(WALLPAPER_IDS)('%s 的背景、模糊和压暗设置随工程恢复', (background) => {
    const project = { ...demo, settings: { ...demo.settings, background, backgroundBlur: 12, backgroundDim: 25 } };
    expect(readProjectBytes(projectBytes(project)).data.settings).toEqual(project.settings);
  });
  it('旧工程自动补齐背景参数，拒绝无效壁纸和越界参数', () => {
    const settings = { ...demo.settings };
    delete settings.backgroundBlur; delete settings.backgroundDim;
    expect(parseProject({ ...demo, settings }).settings.backgroundBlur).toBe(0);
    expect(parseProject({ ...demo, settings }).settings.backgroundDim).toBe(0);
    expect(() => parseProject({ ...demo, settings: { ...settings, background: 'missing' } })).toThrow('INVALID_SETTINGS');
    expect(() => parseProject({ ...demo, settings: { ...settings, backgroundBlur: 90 } })).toThrow('INVALID_SETTINGS');
    expect(() => parseProject({ ...demo, settings: { ...settings, backgroundDim: -1 } })).toThrow('INVALID_SETTINGS');
  });
  it('横屏、竖屏和方形等比铺满，模糊时额外覆盖边缘', () => {
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const cover = backgroundCover(3840, 2160, width, height, 24);
      expect(cover.x).toBeLessThanOrEqual(-24);
      expect(cover.y).toBeLessThanOrEqual(-24);
      expect(cover.x + cover.width).toBeGreaterThanOrEqual(width + 24);
      expect(cover.y + cover.height).toBeGreaterThanOrEqual(height + 24);
      expect(cover.width / cover.height).toBeCloseTo(16 / 9);
    }
  });
});
