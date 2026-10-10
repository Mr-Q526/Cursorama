import { MOTION, PRESETS, TIME } from '../../shared';
import type { CameraState, EffectMode, MotionClip, PointerKind, PointerSample, VisualSettings } from '../../shared';

export const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
export const lerp = (start: number, end: number, progress: number): number => start + (end - start) * progress;
export const smoothstep = (progress: number): number => {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
};

function sampleIndex(samples: readonly { time: number }[], time: number): number {
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
  const frames = focusFrames(samples);
  const frame = frames.length ? frames[sampleIndex(frames, time)] : undefined;
  if (frame && frame.time <= time) return { x: frame.x, y: frame.y };
  return { x: 0.5, y: 0.5 };
}

export function smoothPointer(samples: readonly PointerSample[], time: number): PointerSample {
  const sampleCount = MOTION.pointerSmoothingSamples;
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

interface FocusState { x: number; y: number; zoomLimit: number; tiltFactor: number; }
interface FocusFrame extends FocusState { time: number; kind: Exclude<PointerKind, 'move'>; from: FocusState; }
const focusCache = new WeakMap<readonly PointerSample[], readonly FocusFrame[]>();
const ACTIVITY_HOLD: Record<Exclude<PointerKind, 'move'>, number> = {
  click: MOTION.holdAfterClick, typing: MOTION.holdAfterTyping,
  scroll: MOTION.holdAfterScroll, drag: MOTION.holdAfterDrag,
};

function interpolateFocus(frame: FocusFrame, time: number, from: FocusState = frame.from): FocusState {
  const weight = smoothstep((time - frame.time) / MOTION.focusPan);
  return {
    x: lerp(from.x, frame.x, weight), y: lerp(from.y, frame.y, weight),
    zoomLimit: lerp(from.zoomLimit, frame.zoomLimit, weight),
    tiltFactor: lerp(from.tiltFactor, frame.tiltFactor, weight),
  };
}

function focusFrames(samples: readonly PointerSample[]): readonly FocusFrame[] {
  const cached = focusCache.get(samples);
  if (cached) return cached;
  const frames: FocusFrame[] = [];
  for (const sample of samples) {
    if (sample.kind === 'move') continue;
    const previous = frames.at(-1);
    const position = sample.focus ?? (sample.kind === 'typing' && previous ? previous : sample);
    let x = position.x; let y = position.y;
    if (previous && sample.kind === previous.kind && sample.kind !== 'click' && Math.hypot(x - previous.x, y - previous.y) < MOTION.focusDeadZone) {
      x = previous.x; y = previous.y;
    }
    const extent = Math.max(sample.focus?.width ?? 0, sample.focus?.height ?? 0);
    const target: FocusState = {
      x, y, zoomLimit: extent > 0 ? clamp(MOTION.focusRegionCoverage / extent, 1, MOTION.maximumZoom) : MOTION.maximumZoom,
      tiltFactor: sample.kind === 'typing' ? MOTION.typingTilt : 1,
    };
    frames.push({ ...target, time: sample.time, kind: sample.kind, from: previous ? interpolateFocus(previous, sample.time) : target });
  }
  focusCache.set(samples, frames);
  return frames;
}

function automaticFocus(samples: readonly PointerSample[], time: number, clip: MotionClip): FocusState {
  const fallback: FocusState = { x: clip.x, y: clip.y, zoomLimit: MOTION.maximumZoom, tiltFactor: 1 };
  const frames = focusFrames(samples);
  if (!frames.length) return fallback;
  const index = sampleIndex(frames, time);
  const frame = frames[index];
  if (frame.time > time || frame.time < clip.start) return fallback;
  const previous = frames[index - 1];
  return interpolateFocus(frame, time, !previous || previous.time < clip.start ? fallback : frame.from);
}

export function generateClips(samples: readonly PointerSample[], duration: number, mode: EffectMode, zoom?: number): MotionClip[] {
  const clips: MotionClip[] = [];
  for (const sample of samples) {
    if (sample.kind === 'move' || sample.time > duration) continue;
    const end = Math.min(duration, sample.time + ACTIVITY_HOLD[sample.kind] + MOTION.settleDuration);
    const previous = clips.at(-1);
    if (previous && sample.time <= previous.end + MOTION.mergeGap) {
      previous.end = Math.max(previous.end, end);
      continue;
    }
    const start = Math.max(0, sample.time - MOTION.leadIn);
    if (end - start < TIME.minimumDuration) continue;
    const target = recordedFocus(samples, sample.time);
    clips.push({
      id: `auto-${clips.length}-${sample.time.toFixed(3)}`, start, end,
      x: target.x, y: target.y, zoom: zoom ?? PRESETS[mode].zoom,
      mode, enabled: true, manual: false,
    });
  }
  return clips;
}

export function cameraAt(time: number, samples: readonly PointerSample[], clips: readonly MotionClip[], settings: VisualSettings): CameraState {
  const cursor = smoothPointer(samples, time - MOTION.cursorLag);
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
    const halfDuration = (clip.end - clip.start) / 2;
    const enter = Math.min(settings.easing * MOTION.zoomInRatio, halfDuration);
    const leave = Math.min(Math.max(settings.easing, MOTION.settleDuration), halfDuration);
    const weight = Math.min(smoothstep((time - clip.start) / enter), smoothstep((clip.end - time) / leave));
    const effectiveMode = clip.mode;
    const target = settings.followCursor && !clip.manual ? automaticFocus(samples, time, clip) : { ...clip, zoomLimit: MOTION.maximumZoom, tiltFactor: 1 };
    const targetZoom = effectiveMode === 'overview' || !settings.autoZoom ? 1 : Math.min(clip.zoom, target.zoomLimit);
    const clipZoom = lerp(1, targetZoom, weight);
    const minimum = 0.5 / clipZoom;
    const maximum = 1 - minimum;
    const nextX = lerp(0.5, clamp(target.x, minimum, maximum), weight);
    const nextY = lerp(0.5, clamp(target.y, minimum, maximum), weight);
    if (clipZoom >= zoom) { zoom = clipZoom; x = nextX; y = nextY; clipId = clip.id; }
    if (effectiveMode === 'cinematic' || effectiveMode === 'orbit') {
      const tilt = settings.tilt * (effectiveMode === 'orbit' ? 1.2 : 1) * target.tiltFactor;
      rotateY = (target.x - 0.5) * 2 * tilt * weight;
      rotateX = (0.5 - target.y) * tilt * weight;
      clipId = clip.id;
    }
  }
  return { zoom, x, y, rotateX, rotateY, cursorX: cursor.x, cursorY: cursor.y, clickAge: time - lastClickTime, clipId };
}
