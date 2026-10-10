import type { ProjectData } from './types';

export type FrameDirection = -1 | 1;

export const PLAYBACK_FRAMES = { defaultRate: 30, minimumRate: 1, maximumRate: 240, roundingTolerance: 0.000001 } as const;

export function playbackFrameRate(project: Pick<ProjectData, 'frameRate'>): number {
  const rate = project.frameRate;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= PLAYBACK_FRAMES.minimumRate && rate <= PLAYBACK_FRAMES.maximumRate ? rate : PLAYBACK_FRAMES.defaultRate;
}

export function frameStepTime(time: number, direction: FrameDirection, duration: number, frameRate: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 0;
  const rate = playbackFrameRate({ frameRate });
  const position = Math.max(0, Math.min(duration, time)) * rate;
  const frame = direction > 0 ? Math.floor(position + PLAYBACK_FRAMES.roundingTolerance) + 1 : Math.ceil(position - PLAYBACK_FRAMES.roundingTolerance) - 1;
  return Math.max(0, Math.min(duration, frame / rate));
}
