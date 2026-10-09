import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared';
import type { MotionClip, PointerSample } from '../shared';
import { cameraAt, generateClips, samplePointer } from '../src/engine/motion';

const click = (time: number, x = 0.8, y = 0.2): PointerSample => ({ time, x, y, kind: 'click' });
const clip: MotionClip = { id: 'focus', start: 1, end: 4, x: 0.8, y: 0.2, zoom: 2, mode: 'cinematic', enabled: true, manual: false };

describe('自动镜头', () => {
  it('合并连续点击，避免相邻镜头反复缩放', () => {
    const clips = generateClips([click(2), click(2.7), click(3.2), click(7)], 10, 'cinematic');
    expect(clips).toHaveLength(2);
    expect(clips[0].start).toBeCloseTo(1.55);
    expect(clips[0].end).toBeCloseTo(5.2);
    expect(clips[1].end).toBe(9);
  });
  it('结束附近的点击不会生成超出视频的镜头', () => {
    const clips = generateClips([click(9.9)], 10, 'focus');
    expect(clips[0].end).toBe(10);
  });
  it('不会用鼠标移动冒充点击生成镜头', () => {
    expect(generateClips([{ time: 3, x: 0.7, y: 0.3, kind: 'move' }], 10, 'focus')).toEqual([]);
  });
  it('镜头进出时回到原始画面，放大后取景不越界', () => {
    const samples = [click(2, 1, 0)];
    const start = cameraAt(1, samples, [clip], DEFAULT_SETTINGS);
    const middle = cameraAt(2, samples, [clip], DEFAULT_SETTINGS);
    const end = cameraAt(4, samples, [clip], DEFAULT_SETTINGS);
    expect(start.zoom).toBe(1); expect(end.zoom).toBe(1); expect(middle.zoom).toBe(2);
    expect(middle.x).toBeLessThanOrEqual(1 - 0.5 / middle.zoom);
    expect(middle.y).toBeGreaterThanOrEqual(0.5 / middle.zoom);
    expect(middle.rotateY).toBeGreaterThan(0);
  });
  it('手动焦点不被后续鼠标移动覆盖', () => {
    const camera = cameraAt(2, [click(2, 0.1, 0.9)], [{ ...clip, x: 0.7, y: 0.3, manual: true }], DEFAULT_SETTINGS);
    expect(camera.x).toBeCloseTo(0.7); expect(camera.y).toBeCloseTo(0.3);
  });
  it('关闭的镜头不改变画面', () => {
    const camera = cameraAt(2, [click(2)], [{ ...clip, enabled: false }], DEFAULT_SETTINGS);
    expect(camera.zoom).toBe(1); expect(camera.rotateX).toBe(0); expect(camera.rotateY).toBe(0);
  });
  it('全景模式不会产生缩放或三维倾斜', () => {
    const camera = cameraAt(2, [click(2)], [{ ...clip, mode: 'overview' }], DEFAULT_SETTINGS);
    expect(camera.zoom).toBe(1); expect(camera.rotateX).toBe(0); expect(camera.rotateY).toBe(0);
  });
  it('正确插值鼠标位置，避免轨迹跳变', () => {
    const point = samplePointer([{ time: 1, x: 0, y: 0, kind: 'move' }, { time: 3, x: 1, y: 1, kind: 'move' }], 2);
    expect(point.x).toBeCloseTo(0.5); expect(point.y).toBeCloseTo(0.5);
  });
});
