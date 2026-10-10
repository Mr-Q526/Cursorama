import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MOTION } from '../shared';
import type { MotionClip, PointerSample } from '../shared';
import { cameraAt, generateClips, recordedFocus, samplePointer } from '../src/engine/motion';

const click = (time: number, x = 0.8, y = 0.2): PointerSample => ({ time, x, y, kind: 'click' });
const clip: MotionClip = { id: 'focus', start: 1, end: 4, x: 0.8, y: 0.2, zoom: 2, mode: 'cinematic', enabled: true, manual: false };
const inputFocus = { x: 0.35, y: 0.32, width: 0.35, height: 0.05, source: 'control' } as const;
const typing = (time: number, focus = inputFocus): PointerSample => ({ time, x: 0.9, y: 0.9, kind: 'typing', focus });

describe('自动镜头', () => {
  it('合并连续点击，避免相邻镜头反复缩放', () => {
    const clips = generateClips([click(2), click(2.7), click(3.2), click(7)], 10, 'cinematic');
    expect(clips).toHaveLength(2);
    expect(clips[0].start).toBe(2);
    expect(clips[0].end).toBeCloseTo(3.2 + MOTION.holdAfterClick + MOTION.settleDuration);
    expect(clips[1].end).toBeCloseTo(7 + MOTION.holdAfterClick + MOTION.settleDuration);
  });
  it('结束附近的点击不会生成超出视频的镜头', () => {
    const clips = generateClips([click(9.7)], 10, 'focus');
    expect(clips[0].end).toBe(10);
  });
  it('不会用鼠标移动冒充点击生成镜头', () => {
    expect(generateClips([{ time: 3, x: 0.7, y: 0.3, kind: 'move' }], 10, 'focus')).toEqual([]);
  });
  it('补充镜头沿用最近一次真实点击，忽略移动与未来点击', () => {
    const samples = [click(1, 0.7, 0.3), { time: 2, x: 0.1, y: 0.9, kind: 'move' } as const, click(4, 0.4, 0.6)];
    expect(recordedFocus(samples, 3)).toEqual({ x: 0.7, y: 0.3 });
    expect(recordedFocus(samples, 4)).toEqual({ x: 0.4, y: 0.6 });
    expect(recordedFocus(samples, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(recordedFocus([], 3)).toEqual({ x: 0.5, y: 0.5 });
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
  it('点击发生之后才放大，停留后平滑退出；末尾短于有效镜头的点击不闪一下', () => {
    const samples = [click(2)]; const clips = generateClips(samples, 8, 'focus');
    expect(cameraAt(1.99, samples, clips, DEFAULT_SETTINGS).zoom).toBe(1);
    expect(cameraAt(2, samples, clips, DEFAULT_SETTINGS).zoom).toBe(1);
    expect(cameraAt(2.7, samples, clips, DEFAULT_SETTINGS).zoom).toBe(2);
    const ending = cameraAt(clips[0].end - MOTION.settleDuration / 2, samples, clips, DEFAULT_SETTINGS);
    expect(ending.zoom).toBeGreaterThan(1); expect(ending.zoom).toBeLessThan(2);
    expect(cameraAt(clips[0].end, samples, clips, DEFAULT_SETTINGS).zoom).toBe(1);
    expect(generateClips([click(7.9)], 8, 'focus')).toEqual([]);
  });
  it('点完后移开鼠标，镜头仍留在点击区域，也不提前向未来点击移动', () => {
    const samples: PointerSample[] = [click(2, 0.7, 0.35), { time: 2.1, x: 0.1, y: 0.9, kind: 'move' }, click(3.6, 0.3, 0.65)];
    const clips = generateClips(samples, 8, 'focus');
    const beforeNextClick = cameraAt(3.2, samples, clips, DEFAULT_SETTINGS);
    expect(beforeNextClick.x).toBeCloseTo(0.7); expect(beforeNextClick.y).toBeCloseTo(0.35);
    expect(beforeNextClick.cursorX).toBeLessThan(beforeNextClick.x);
    expect(cameraAt(3.6, samples, clips, DEFAULT_SETTINGS).x).toBeCloseTo(0.7);
    expect(cameraAt(4.3, samples, clips, DEFAULT_SETTINGS).x).toBeCloseTo(0.3);
  });
  it('持续打字保持一个镜头，焦点在输入框，不在移开的鼠标位置', () => {
    const samples = [click(1, 0.3, 0.32), typing(1.8), typing(4), typing(6.9), typing(8)];
    const clips = generateClips(samples, 14, 'cinematic');
    expect(clips).toHaveLength(1);
    expect(clips[0].end).toBeCloseTo(8 + MOTION.holdAfterTyping + MOTION.settleDuration);
    const camera = cameraAt(7.6, samples, clips, DEFAULT_SETTINGS);
    expect(camera.zoom).toBeCloseTo(DEFAULT_SETTINGS.zoom);
    expect(camera.x).toBeCloseTo(inputFocus.x); expect(camera.y).toBeCloseTo(inputFocus.y);
    expect(Math.abs(camera.rotateY)).toBeLessThan(1);
    expect(recordedFocus(samples, 8.1)).toEqual({ x: inputFocus.x, y: inputFocus.y });
    expect(cameraAt(12, samples, clips, DEFAULT_SETTINGS).zoom).toBe(1);
  });
  it('通过键盘进入输入框也能开始聚焦，不要求之前发生点击', () => {
    const samples = [typing(2), typing(2.5)]; const clips = generateClips(samples, 8, 'focus');
    expect(clips).toHaveLength(1); expect(clips[0].x).toBe(inputFocus.x);
    expect(cameraAt(3.2, samples, clips, DEFAULT_SETTINGS).x).toBeCloseTo(inputFocus.x);
  });
  it('无法获得文字光标时，输入保活沿用最近操作区域', () => {
    const samples: PointerSample[] = [click(1, 0.4, 0.3), { time: 2, x: 0.9, y: 0.8, kind: 'typing' }, { time: 4, x: 0.1, y: 0.9, kind: 'typing' }];
    const clips = generateClips(samples, 9, 'focus');
    expect(clips).toHaveLength(1);
    expect(cameraAt(4.7, samples, clips, DEFAULT_SETTINGS).x).toBeCloseTo(0.4);
  });
  it('文字光标的小范围移动不会让镜头随着每个字晃动，换行超出舒适区后才平移', () => {
    const caret: PointerSample['focus'] = { ...inputFocus, width: 0.002, height: 0.025, source: 'caret' };
    const samples: PointerSample[] = [typing(1), { ...typing(2), focus: { ...caret, x: 0.38 } }, { ...typing(3), focus: { ...caret, x: 0.4, y: 0.48 } }];
    const clips = generateClips(samples, 8, 'focus');
    expect(cameraAt(2.8, samples, clips, DEFAULT_SETTINGS).x).toBeCloseTo(inputFocus.x);
    const moving = cameraAt(3.3, samples, clips, DEFAULT_SETTINGS);
    expect(moving.y).toBeGreaterThan(inputFocus.y); expect(moving.y).toBeLessThan(0.48);
    expect(cameraAt(3.8, samples, clips, DEFAULT_SETTINGS).y).toBeCloseTo(0.48);
  });
  it('宽输入区域会适当减少放大倍率，保留完整的操作上下文', () => {
    const samples = [typing(1, { ...inputFocus, x: 0.5, width: 0.7 })];
    const clips = generateClips(samples, 6, 'focus', 3);
    expect(cameraAt(2, samples, clips, DEFAULT_SETTINGS).zoom).toBeCloseTo(MOTION.focusRegionCoverage / 0.7);
  });
  it('连续滚动和拖动延长镜头，普通移动仍不会延长停留', () => {
    const samples: PointerSample[] = [click(1), { time: 2.5, x: 0.6, y: 0.3, kind: 'scroll' }, { time: 4.5, x: 0.5, y: 0.5, kind: 'drag' }, { time: 8, x: 0.9, y: 0.8, kind: 'move' }];
    const clips = generateClips(samples, 12, 'focus');
    expect(clips).toHaveLength(1); expect(clips[0].end).toBeCloseTo(4.5 + MOTION.holdAfterDrag + MOTION.settleDuration);
    expect(cameraAt(9, samples, clips, DEFAULT_SETTINGS).zoom).toBe(1);
  });
  it('随机跳转与倒序渲染得到同一个焦点，确保预览和导出一致', () => {
    const samples = [click(1), typing(2), click(4, 0.3, 0.65)]; const clips = generateClips(samples, 8, 'focus');
    const before = cameraAt(4.2, samples, clips, DEFAULT_SETTINGS);
    cameraAt(7, samples, clips, DEFAULT_SETTINGS); cameraAt(0, samples, clips, DEFAULT_SETTINGS);
    expect(cameraAt(4.2, samples, clips, DEFAULT_SETTINGS)).toEqual(before);
  });
});
