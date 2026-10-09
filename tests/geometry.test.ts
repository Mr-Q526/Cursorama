import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MOTION } from '../shared';
import type { CameraState } from '../shared';
import { frameGeometry, previewToSource } from '../src/engine/geometry';

const camera: CameraState = { zoom: 2, x: 0.7, y: 0.3, rotateX: 10, rotateY: 18, cursorX: 0.5, cursorY: 0.5, clickAge: Infinity };
const output = { width: 1280, height: 720 };
const source = { width: 1600, height: 1000 };

describe('预览焦点映射', () => {
  it('点击放大画面中心时保留源视频中的焦点', () => {
    const point = previewToSource({ x: 640, y: 360 }, output, source, camera, DEFAULT_SETTINGS);
    expect(point?.x).toBeCloseTo(0.7); expect(point?.y).toBeCloseTo(0.3);
  });
  it('逆向恢复经过三维透视后的像素位置', () => {
    const frame = frameGeometry(output.width, output.height, source.width, source.height, DEFAULT_SETTINGS.padding);
    const u = 0.7; const v = 0.2;
    const x = (2 * u - 1) * frame.width / output.height;
    const y = (1 - 2 * v) * frame.height / output.height;
    const rx = camera.rotateX * MOTION.degreesToRadians; const ry = camera.rotateY * MOTION.degreesToRadians;
    const rotatedX = x * Math.cos(ry);
    const rotatedY = y * Math.cos(rx) + x * Math.sin(ry) * Math.sin(rx);
    const z = y * Math.sin(rx) - x * Math.sin(ry) * Math.cos(rx);
    const w = 1 - z / MOTION.perspective;
    const click = { x: (rotatedX / (output.width / output.height) / w + 1) * output.width / 2, y: (1 - rotatedY / w) * output.height / 2 };
    const restored = previewToSource(click, output, source, camera, DEFAULT_SETTINGS);
    expect(restored?.x).toBeCloseTo(0.45 + u / 2);
    expect(restored?.y).toBeCloseTo(0.05 + v / 2);
  });
  it('背景上的点击不会创建越界焦点', () => {
    expect(previewToSource({ x: 0, y: 0 }, output, source, { ...camera, zoom: 1, rotateX: 0, rotateY: 0 }, DEFAULT_SETTINGS)).toBeNull();
  });
});
