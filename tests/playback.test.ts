import { describe, expect, it } from 'vitest';
import { frameStepTime, playbackFrameRate, PLAYBACK_FRAMES } from '../shared';
import { formatFrameTime } from '../src/i18n';

const FRAME_QA = { duration: 10, start: 2, rates: [30, 60, 29.97], tolerance: 10 } as const;

describe('时间轴逐帧定位', () => {
  it.each(FRAME_QA.rates)('%s 帧工程每次只移动一帧', (rate) => {
    const start = Math.round(FRAME_QA.start * rate) / rate;
    const next = frameStepTime(start, 1, FRAME_QA.duration, rate);
    expect(next - start).toBeCloseTo(1 / rate, FRAME_QA.tolerance);
    expect(frameStepTime(next, -1, FRAME_QA.duration, rate)).toBeCloseTo(start, FRAME_QA.tolerance);
  });

  it('拖动到帧间位置后，移动到邻近的真实帧网格', () => {
    expect(frameStepTime(2.015, 1, FRAME_QA.duration, 30)).toBeCloseTo(61 / 30);
    expect(frameStepTime(2.015, -1, FRAME_QA.duration, 30)).toBe(2);
  });

  it('重复定位不会因浮点误差跳过或重复一帧', () => {
    let time = 0;
    for (let index = 0; index < 180; index++) time = frameStepTime(time, 1, FRAME_QA.duration, 60);
    expect(time).toBe(3);
    for (let index = 0; index < 180; index++) time = frameStepTime(time, -1, FRAME_QA.duration, 60);
    expect(time).toBe(0);
  });

  it('录制边界处不越界', () => {
    expect(frameStepTime(0, -1, FRAME_QA.duration, 60)).toBe(0);
    expect(frameStepTime(FRAME_QA.duration, 1, FRAME_QA.duration, 60)).toBe(FRAME_QA.duration);
    expect(frameStepTime(0.1, 1, 0.11, 30)).toBe(0.11);
  });

  it('旧工程或无效帧率使用 30 帧时间轴', () => {
    expect(playbackFrameRate({})).toBe(PLAYBACK_FRAMES.defaultRate);
    for (const frameRate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(playbackFrameRate({ frameRate })).toBe(PLAYBACK_FRAMES.defaultRate);
    expect(playbackFrameRate({ frameRate: 60 })).toBe(60);
  });

  it('时间显示可区分相邻帧，换秒与进位时保持准确', () => {
    expect(formatFrameTime(2, 30)).toBe('00:02:00');
    expect(formatFrameTime(61 / 30, 30)).toBe('00:02:01');
    expect(formatFrameTime(62 / 30, 30)).toBe('00:02:02');
    expect(formatFrameTime(1799 / 30, 30)).toBe('00:59:29');
    expect(formatFrameTime(60, 30)).toBe('01:00:00');
  });
});
