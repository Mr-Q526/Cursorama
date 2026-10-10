import type { MusicClip } from '../../shared/types';

export type MusicGainSource = Pick<MusicClip, 'start' | 'sourceIn' | 'sourceOut' | 'volume'>;
export const MUSIC_FADES = { inSeconds: 0.25, outSeconds: 0.6, shortClipRatio: 0.5 } as const;
const FADE_CURVE = { square: 2, midpoint: Math.PI / 2 } as const;

export function musicClipGain(clip: MusicGainSource, time: number): number {
  const duration = clip.sourceOut - clip.sourceIn;
  const elapsed = time - clip.start;
  if (!Number.isFinite(duration) || !Number.isFinite(elapsed) || !Number.isFinite(clip.volume) || duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  const fadeIn = Math.min(MUSIC_FADES.inSeconds, duration * MUSIC_FADES.shortClipRatio);
  const fadeOut = Math.min(MUSIC_FADES.outSeconds, duration * MUSIC_FADES.shortClipRatio);
  const phase = Math.max(0, Math.min(1, elapsed / fadeIn, (duration - elapsed) / fadeOut));
  return Math.max(0, Math.min(1, clip.volume)) * Math.sin(phase * FADE_CURVE.midpoint) ** FADE_CURVE.square;
}
