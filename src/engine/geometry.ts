import { MOTION } from '../../shared';
import type { CameraState, VisualSettings } from '../../shared';
import { clamp } from './motion';

export interface FrameGeometry { width: number; height: number; }
export interface SourcePoint { x: number; y: number; }

export function frameGeometry(outputWidth: number, outputHeight: number, sourceWidth: number, sourceHeight: number, padding: number): FrameGeometry {
  const inset = padding / 100;
  const width = Math.min(outputWidth * (1 - 2 * inset), outputHeight * (1 - 2 * inset) * sourceWidth / sourceHeight);
  return { width, height: width * sourceHeight / sourceWidth };
}

export function previewToSource(point: SourcePoint, output: FrameGeometry, source: FrameGeometry, camera: CameraState, settings: VisualSettings): SourcePoint | null {
  const frame = frameGeometry(output.width, output.height, source.width, source.height, settings.padding);
  const aspect = output.width / output.height;
  const normalizedX = (point.x / output.width * 2 - 1) * aspect;
  const normalizedY = 1 - point.y / output.height * 2;
  const rotationX = camera.rotateX * MOTION.degreesToRadians;
  const rotationY = camera.rotateY * MOTION.degreesToRadians;
  const cx = Math.cos(rotationX); const sx = Math.sin(rotationX);
  const cy = Math.cos(rotationY); const sy = Math.sin(rotationY);
  const p = MOTION.perspective;
  const a = cy - normalizedX * sy * cx / p;
  const b = normalizedX * sx / p;
  const c = sy * sx - normalizedY * sy * cx / p;
  const d = cx + normalizedY * sx / p;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.00001) return null;
  const localX = (normalizedX * d - b * normalizedY) / determinant;
  const localY = (a * normalizedY - normalizedX * c) / determinant;
  const u = (localX / (frame.width / output.height) + 1) / 2;
  const v = (1 - localY / (frame.height / output.height)) / 2;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const cropSize = 1 / camera.zoom;
  const cropX = clamp(camera.x - cropSize / 2, 0, 1 - cropSize);
  const cropY = clamp(camera.y - cropSize / 2, 0, 1 - cropSize);
  return { x: cropX + u * cropSize, y: cropY + v * cropSize };
}
