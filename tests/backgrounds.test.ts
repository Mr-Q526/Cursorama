import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, parseProject, projectBytes, readProjectBytes, WALLPAPER_IDS } from '../shared';
import type { ProjectData } from '../shared';
import { WALLPAPER_ASSETS, WALLPAPER_COLLECTIONS, backgroundCover } from '../src/engine/backgrounds';

const demo: ProjectData = { schemaVersion: 1, name: '背景工程验证', duration: 3, width: 1920, height: 1080, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: 3, sourceType: 'demo', hasAudio: false };

describe('壁纸背景', () => {
  it('分类覆盖全部壁纸，每个背景都有可用于预览和导出的原始资源', () => {
    const ids = WALLPAPER_COLLECTIONS.flatMap((collection) => collection.wallpapers);
    expect([...ids].sort()).toEqual([...WALLPAPER_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of WALLPAPER_IDS) {
      expect(WALLPAPER_ASSETS[id].image).toContain(`wallpapers/${id}.svg`);
      const image = readFileSync(path.resolve('public', 'wallpapers', `${id}.svg`), 'utf8');
      expect(image).toContain('width="3840" height="2160" viewBox="0 0 3840 2160"');
      expect(image).toContain('</svg>');
    }
  });
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
