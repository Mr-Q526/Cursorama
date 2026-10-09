import { MOTION, PRESETS, TIME } from '../../shared';
import type { CameraState, EffectMode, MotionClip, PointerSample, VisualSettings } from '../../shared';

export const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
export const lerp = (start: number, end: number, progress: number): number => start + (end - start) * progress;
export const smoothstep = (progress: number): number => {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
};

function sampleIndex(samples: readonly PointerSample[], time: number): number {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (samples[midpoint].time <= time) low = midpoint;
    else high = midpoint - 1;
  }
  return low;
}

export function samplePointer(samples: readonly PointerSample[], time: number): PointerSample {
  if (samples.length === 0) return { time, x: 0.5, y: 0.5, kind: 'move' };
  const index = sampleIndex(samples, time);
  const previous = samples[index];
  const next = samples[Math.min(index + 1, samples.length - 1)];
  const distance = next.time - previous.time;
  const progress = distance > 0 ? clamp((time - previous.time) / distance, 0, 1) : 0;
  return { time, x: lerp(previous.x, next.x, progress), y: lerp(previous.y, next.y, progress), kind: 'move' };
}

export function recordedFocus(samples: readonly PointerSample[], time: number): Pick<PointerSample, 'x' | 'y'> {
  for (let index = samples.length ? sampleIndex(samples, time) : -1; index >= 0; index--) {
    const sample = samples[index];
    if (sample.kind === 'click' && sample.time <= time) return { x: sample.x, y: sample.y };
  }
  return { x: 0.5, y: 0.5 };
}

export function smoothPointer(samples: readonly PointerSample[], time: number): PointerSample {
  const sampleCount = 6;
  let x = 0;
  let y = 0;
  let weightTotal = 0;
  for (let index = 0; index < sampleCount; index++) {
    const weight = sampleCount - index;
    const sample = samplePointer(samples, time - index * MOTION.smoothingWindow / sampleCount);
    x += sample.x * weight;
    y += sample.y * weight;
    weightTotal += weight;
  }
  return { time, x: x / weightTotal, y: y / weightTotal, kind: 'move' };
}

export function generateClips(samples: readonly PointerSample[], duration: number, mode: EffectMode, zoom?: number): MotionClip[] {
  const clicks = samples.filter((sample) => sample.kind === 'click');
  const clips: MotionClip[] = [];
  for (const click of clicks) {
    const previous = clips.at(-1);
    if (previous && click.time - (previous.end - MOTION.holdAfterClick) < MOTION.mergeGap) {
      previous.end = Math.min(duration, click.time + MOTION.holdAfterClick);
      continue;
    }
    const start = Math.max(0, click.time - MOTION.leadIn);
    const end = Math.min(duration, click.time + MOTION.holdAfterClick);
    if (end - start < TIME.minimumDuration) continue;
    clips.push({
      id: `auto-${clips.length}-${click.time.toFixed(3)}`, start, end,
      x: click.x, y: click.y, zoom: zoom ?? PRESETS[mode].zoom,
      mode, enabled: true, manual: false,
    });
  }
  return clips;
}

export function cameraAt(time: number, samples: readonly PointerSample[], clips: readonly MotionClip[], settings: VisualSettings): CameraState {
  const cursor = smoothPointer(samples, time - MOTION.cursorLag);
  const focusPointer = smoothPointer(samples, time);
  let lastClickTime = -Infinity;
  for (let index = samples.length ? sampleIndex(samples, time) : -1; index >= 0; index--) {
    if (samples[index].kind === 'click' && samples[index].time <= time) {
      lastClickTime = samples[index].time;
      break;
    }
  }
  let zoom = 1;
  let x = 0.5;
  let y = 0.5;
  let rotateX = 0;
  let rotateY = 0;
  let clipId: string | undefined;
  for (const clip of clips) {
    if (!clip.enabled || time < clip.start || time > clip.end) continue;
    const transition = Math.min(settings.easing, (clip.end - clip.start) / 2);
    const weight = Math.min(smoothstep((time - clip.start) / transition), smoothstep((clip.end - time) / transition));
    const effectiveMode = clip.mode;
    const targetZoom = effectiveMode === 'overview' || !settings.autoZoom ? 1 : clip.zoom;
    const clipZoom = lerp(1, targetZoom, weight);
    const target = settings.followCursor && !clip.manual ? focusPointer : clip;
    const minimum = 0.5 / clipZoom;
    const maximum = 1 - minimum;
    const nextX = lerp(0.5, clamp(target.x, minimum, maximum), weight);
    const nextY = lerp(0.5, clamp(target.y, minimum, maximum), weight);
    if (clipZoom >= zoom) { zoom = clipZoom; x = nextX; y = nextY; clipId = clip.id; }
    if (effectiveMode === 'cinematic' || effectiveMode === 'orbit') {
      const tilt = settings.tilt * (effectiveMode === 'orbit' ? 1.2 : 1);
      rotateY = (target.x - 0.5) * 2 * tilt * weight;
      rotateX = (0.5 - target.y) * tilt * weight;
      clipId = clip.id;
    }
  }
  return { zoom, x, y, rotateX, rotateY, cursorX: cursor.x, cursorY: cursor.y, clickAge: time - lastClickTime, clipId };
}
