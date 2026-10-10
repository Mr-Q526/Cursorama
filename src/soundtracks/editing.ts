import type { MediaAsset, Project } from '../../shared';
import { EDITING_LIMITS, ensureEditing, parseEditingTimeline, parseMediaAssets, timelineDuration } from '../../shared';
import { SOUNDTRACK_DEFAULTS } from './tracks';

export interface SoundtrackInsertion { project: Project; clipId: string; }

export function insertSoundtrack(project: Project, asset: MediaAsset, position: number): SoundtrackInsertion {
  if (asset.kind !== 'audio' || !asset.blob.size || !asset.url) throw new Error('INVALID_SOUNDTRACK_ASSET');
  const { blob, url, ...metadata } = asset;
  const validated = parseMediaAssets([metadata])?.[0];
  if (!validated || !blob.size || !url) throw new Error('INVALID_SOUNDTRACK_ASSET');
  const next = ensureEditing(project);
  const duration = timelineDuration(next);
  const start = Math.max(0, Math.min(Number.isFinite(position) ? position : 0, duration - EDITING_LIMITS.minDuration - EDITING_LIMITS.timeTolerance));
  const sourceOut = Math.min(asset.duration, duration - start);
  const clipId = crypto.randomUUID();
  const existing = project.mediaAssets?.find(({ id }) => id === validated.id);
  if (existing && (existing.kind !== validated.kind || existing.mimeType !== validated.mimeType || existing.duration !== validated.duration || existing.name !== validated.name)) throw new Error('DUPLICATE_MEDIA_ASSET');
  next.mediaAssets = existing ? [...project.mediaAssets ?? []] : [...project.mediaAssets ?? [], validated];
  next.media = { ...project.media, [asset.id]: asset };
  next.editing.music.push({ id: clipId, mediaId: asset.id, start, sourceIn: 0, sourceOut, volume: SOUNDTRACK_DEFAULTS.volume });
  parseMediaAssets(next.mediaAssets);
  parseEditingTimeline(next.editing, next.mediaAssets, next.duration);
  return { project: next, clipId };
}
