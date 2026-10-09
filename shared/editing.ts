import type { EditingTimeline, MediaAssetData, MotionClip, MusicClip, PointerSample, ProjectData, SubtitleClip, VideoSegment } from './types';

export const SOURCE_MEDIA_ID = 'source';
export const SOURCE_SEGMENT_ID = 'source-segment';
export const EDITING_LIMITS = {
  minDuration: 0.01,
  maxDuration: 86400,
  maxTimelineDuration: 604800,
  minSpeed: 0.25,
  maxSpeed: 4,
  minVolume: 0,
  maxVolume: 1,
  maxAssets: 256,
  maxSegments: 2048,
  maxMusic: 512,
  maxSubtitles: 4096,
  maxSubtitleLength: 4000,
  maxIdLength: 128,
  maxNameLength: 200,
  maxDimension: 16384,
  timeTolerance: 0.000001,
} as const;

export interface SegmentRange {
  segment: VideoSegment;
  outputStart: number;
  outputEnd: number;
}

export interface TimelineMapping extends SegmentRange {
  mediaId: string;
  sourceTime: number;
  sourceType: 'demo' | 'video';
  width: number;
  height: number;
  hasAudio: boolean;
  cursorEmbedded: boolean;
  samples: PointerSample[];
  clips: MotionClip[];
}

export type VideoSegmentPatch = Partial<Pick<VideoSegment, 'sourceIn' | 'sourceOut' | 'speed' | 'volume'>>;
export type TimelineSource = Pick<ProjectData, 'duration' | 'editing'>;
type TimeTransform = (time: number) => number;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const durationOf = (segment: VideoSegment): number => (segment.sourceOut - segment.sourceIn) / segment.speed;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function isMediaIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= EDITING_LIMITS.maxIdLength && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) &&
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}

export function parseMediaAssets(value: unknown): MediaAssetData[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > EDITING_LIMITS.maxAssets) throw new Error('INVALID_MEDIA_ASSETS');
  const ids = new Set<string>();
  return value.map((item: unknown): MediaAssetData => {
    if (!isRecord(item) || !isMediaIdentifier(item.id) || item.id === SOURCE_MEDIA_ID || ids.has(item.id) ||
      typeof item.name !== 'string' || item.name.length > EDITING_LIMITS.maxNameLength || (item.kind !== 'audio' && item.kind !== 'video') ||
      typeof item.mimeType !== 'string' || !new RegExp(`^${item.kind}/[A-Za-z0-9.+-]+(?:;[ A-Za-z0-9=.+-]+)?$`).test(item.mimeType) ||
      !inRange(item.duration, EDITING_LIMITS.minDuration, EDITING_LIMITS.maxDuration) ||
      (item.width !== undefined && !inRange(item.width, 1, EDITING_LIMITS.maxDimension)) ||
      (item.height !== undefined && !inRange(item.height, 1, EDITING_LIMITS.maxDimension)) ||
      (item.hasAudio !== undefined && typeof item.hasAudio !== 'boolean')) throw new Error('INVALID_MEDIA_ASSETS');
    ids.add(item.id);
    return {
      id: item.id, name: item.name, kind: item.kind, mimeType: item.mimeType, duration: item.duration,
      ...(item.width !== undefined ? { width: item.width } : {}),
      ...(item.height !== undefined ? { height: item.height } : {}),
      ...(item.hasAudio !== undefined ? { hasAudio: item.hasAudio } : {}),
    };
  });
}

export function parseEditingTimeline(value: unknown, assets: MediaAssetData[] | undefined, sourceDuration: number): EditingTimeline | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !Array.isArray(value.segments) || !Array.isArray(value.music) || !Array.isArray(value.subtitles) ||
    value.segments.length === 0 || value.segments.length > EDITING_LIMITS.maxSegments ||
    value.music.length > EDITING_LIMITS.maxMusic || value.subtitles.length > EDITING_LIMITS.maxSubtitles) throw new Error('INVALID_EDITING');
  const media = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  const ids = new Set<string>();
  const identifier = (id: unknown): id is string => {
    if (!isMediaIdentifier(id) || ids.has(id)) return false;
    ids.add(id); return true;
  };
  const segments = value.segments.map((item: unknown): VideoSegment => {
    if (!isRecord(item) || !identifier(item.id) || typeof item.mediaId !== 'string') throw new Error('INVALID_EDITING');
    const asset = media.get(item.mediaId);
    const sourceLimit = item.mediaId === SOURCE_MEDIA_ID ? sourceDuration : asset?.duration;
    if (sourceLimit === undefined || (item.mediaId !== SOURCE_MEDIA_ID && asset?.kind !== 'video') ||
      !inRange(item.sourceIn, 0, sourceLimit) || !inRange(item.sourceOut, 0, sourceLimit) ||
      item.sourceOut - item.sourceIn < EDITING_LIMITS.minDuration || !inRange(item.speed, EDITING_LIMITS.minSpeed, EDITING_LIMITS.maxSpeed) ||
      !inRange(item.volume, EDITING_LIMITS.minVolume, EDITING_LIMITS.maxVolume)) throw new Error('INVALID_EDITING');
    return { id: item.id, mediaId: item.mediaId, sourceIn: item.sourceIn, sourceOut: item.sourceOut, speed: item.speed, volume: item.volume };
  });
  const duration = segments.reduce((sum, segment) => sum + durationOf(segment), 0);
  if (!inRange(duration, EDITING_LIMITS.minDuration, EDITING_LIMITS.maxTimelineDuration)) throw new Error('INVALID_EDITING');
  const music = value.music.map((item: unknown): MusicClip => {
    if (!isRecord(item) || !identifier(item.id) || typeof item.mediaId !== 'string') throw new Error('INVALID_EDITING');
    const asset = media.get(item.mediaId);
    if (asset?.kind !== 'audio' || !inRange(item.start, 0, duration) || !inRange(item.sourceIn, 0, asset.duration) ||
      !inRange(item.sourceOut, 0, asset.duration) || item.sourceOut - item.sourceIn < EDITING_LIMITS.minDuration ||
      item.start + item.sourceOut - item.sourceIn > duration + EDITING_LIMITS.timeTolerance ||
      !inRange(item.volume, EDITING_LIMITS.minVolume, EDITING_LIMITS.maxVolume)) throw new Error('INVALID_EDITING');
    return { id: item.id, mediaId: item.mediaId, start: item.start, sourceIn: item.sourceIn, sourceOut: item.sourceOut, volume: item.volume };
  });
  const subtitles = value.subtitles.map((item: unknown): SubtitleClip => {
    if (!isRecord(item) || !identifier(item.id) || !inRange(item.start, 0, duration) || !inRange(item.end, 0, duration) ||
      item.end - item.start < EDITING_LIMITS.minDuration || typeof item.text !== 'string' ||
      item.text.length > EDITING_LIMITS.maxSubtitleLength) throw new Error('INVALID_EDITING');
    return { id: item.id, start: item.start, end: item.end, text: item.text };
  });
  return { segments, music, subtitles };
}

export function getSegments(project: TimelineSource): VideoSegment[] {
  return project.editing?.segments ?? [{ id: SOURCE_SEGMENT_ID, mediaId: SOURCE_MEDIA_ID, sourceIn: 0, sourceOut: project.duration, speed: 1, volume: 1 }];
}

export function timelineDuration(project: TimelineSource): number {
  return getSegments(project).reduce((sum, segment) => sum + durationOf(segment), 0);
}

export function segmentRanges(project: TimelineSource): SegmentRange[] {
  let outputStart = 0;
  return getSegments(project).map((segment) => {
    const outputEnd = outputStart + durationOf(segment);
    const result = { segment, outputStart, outputEnd };
    outputStart = outputEnd;
    return result;
  });
}

export function resolveTimeline(project: ProjectData, time: number): TimelineMapping {
  const ranges = segmentRanges(project);
  const target = clamp(Number.isFinite(time) ? time : 0, 0, timelineDuration(project));
  const range = ranges.find(({ outputEnd }) => target < outputEnd) ?? ranges[ranges.length - 1];
  if (!range) throw new Error('EMPTY_TIMELINE');
  const sourceTime = clamp(range.segment.sourceIn + (target - range.outputStart) * range.segment.speed, range.segment.sourceIn, range.segment.sourceOut);
  if (range.segment.mediaId === SOURCE_MEDIA_ID) return {
    ...range, mediaId: SOURCE_MEDIA_ID, sourceTime, sourceType: project.sourceType,
    width: project.width, height: project.height, hasAudio: project.hasAudio, cursorEmbedded: project.cursorEmbedded ?? project.sourceType === 'video',
    samples: project.samples, clips: project.clips,
  };
  const asset = project.mediaAssets?.find(({ id }) => id === range.segment.mediaId);
  if (!asset || asset.kind !== 'video') throw new Error('MISSING_MEDIA_ASSET');
  return {
    ...range, mediaId: asset.id, sourceTime, sourceType: 'video', width: asset.width ?? project.width, height: asset.height ?? project.height,
    hasAudio: asset.hasAudio ?? true, cursorEmbedded: true, samples: [], clips: [],
  };
}

export function ensureEditing<T extends ProjectData>(project: T): T & { editing: EditingTimeline } {
  return {
    ...project,
    editing: {
      segments: getSegments(project).map((segment) => ({ ...segment })),
      music: project.editing?.music.map((clip) => ({ ...clip })) ?? [],
      subtitles: project.editing?.subtitles.map((clip) => ({ ...clip })) ?? [],
    },
  };
}

function freshId(prefix: string, used: Set<string>): string {
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index++;
  const id = `${prefix}-${index}`;
  used.add(id); return id;
}

function timelineIds(editing: EditingTimeline): Set<string> {
  return new Set([...editing.segments, ...editing.music, ...editing.subtitles].map(({ id }) => id));
}

function checkTrackLimits(editing: EditingTimeline): void {
  if (editing.music.length > EDITING_LIMITS.maxMusic) throw new Error('TOO_MANY_MUSIC_CLIPS');
  if (editing.subtitles.length > EDITING_LIMITS.maxSubtitles) throw new Error('TOO_MANY_SUBTITLES');
}

function transformedTrim(project: ProjectData, duration: number, startMap: TimeTransform, endMap: TimeTransform = startMap): Pick<ProjectData, 'trimStart' | 'trimEnd'> {
  const trimStart = clamp(startMap(project.trimStart), 0, duration);
  const trimEnd = clamp(endMap(project.trimEnd), 0, duration);
  return trimEnd - trimStart >= EDITING_LIMITS.minDuration ? { trimStart, trimEnd } : { trimStart: 0, trimEnd: duration };
}

function mapSubtitles(subtitles: SubtitleClip[], transform: TimeTransform): SubtitleClip[] {
  return subtitles.map((clip) => ({ ...clip, start: transform(clip.start), end: transform(clip.end) }))
    .filter(({ start, end }) => end - start >= EDITING_LIMITS.minDuration);
}

function cutMusic(clip: MusicClip, start: number, end: number, id: string): MusicClip | null {
  const clippedStart = Math.max(start, clip.start);
  const clippedEnd = Math.min(end, clip.start + clip.sourceOut - clip.sourceIn);
  if (clippedEnd - clippedStart < EDITING_LIMITS.minDuration) return null;
  return { ...clip, id, start: clippedStart, sourceIn: clip.sourceIn + clippedStart - clip.start, sourceOut: clip.sourceIn + clippedEnd - clip.start };
}

export function splitSegment<T extends ProjectData>(project: T, id: string, time: number): T {
  const range = segmentRanges(project).find(({ segment }) => segment.id === id);
  if (!range || !Number.isFinite(time)) return project;
  const point = range.segment.sourceIn + (time - range.outputStart) * range.segment.speed;
  if (point - range.segment.sourceIn < EDITING_LIMITS.minDuration || range.segment.sourceOut - point < EDITING_LIMITS.minDuration) return project;
  const next = ensureEditing(project);
  if (next.editing.segments.length >= EDITING_LIMITS.maxSegments) throw new Error('TOO_MANY_SEGMENTS');
  const index = next.editing.segments.findIndex((segment) => segment.id === id);
  next.editing.segments.splice(index, 1, { ...range.segment, sourceOut: point }, { ...range.segment, id: freshId('segment', timelineIds(next.editing)), sourceIn: point });
  return next;
}

export function deleteSegment<T extends ProjectData>(project: T, id: string): T {
  const range = segmentRanges(project).find(({ segment }) => segment.id === id);
  if (!range) return project;
  if (getSegments(project).length === 1) throw new Error('LAST_VIDEO_SEGMENT');
  const next = ensureEditing(project);
  const removedDuration = range.outputEnd - range.outputStart;
  const shift: TimeTransform = (time) => time <= range.outputStart ? time : time >= range.outputEnd ? time - removedDuration : range.outputStart;
  next.editing.segments = next.editing.segments.filter((segment) => segment.id !== id);
  next.editing.subtitles = mapSubtitles(next.editing.subtitles, shift);
  const used = timelineIds(next.editing);
  next.editing.music = next.editing.music.flatMap((clip) => {
    const before = cutMusic(clip, 0, range.outputStart, clip.id);
    const after = cutMusic(clip, range.outputEnd, timelineDuration(project), before ? freshId('music', used) : clip.id);
    return [...(before ? [before] : []), ...(after ? [{ ...after, start: shift(after.start) }] : [])];
  });
  checkTrackLimits(next.editing);
  return { ...next, ...transformedTrim(project, timelineDuration(next), shift) };
}

export function updateSegment<T extends ProjectData>(project: T, id: string, patch: VideoSegmentPatch): T {
  const range = segmentRanges(project).find(({ segment }) => segment.id === id);
  if (!range) return project;
  const segment = { ...range.segment, ...patch };
  const sourceLimit = segment.mediaId === SOURCE_MEDIA_ID ? project.duration : project.mediaAssets?.find(({ id: mediaId }) => mediaId === segment.mediaId)?.duration;
  if (sourceLimit === undefined || !inRange(segment.sourceIn, 0, sourceLimit) || !inRange(segment.sourceOut, 0, sourceLimit) ||
    segment.sourceOut - segment.sourceIn < EDITING_LIMITS.minDuration || !inRange(segment.speed, EDITING_LIMITS.minSpeed, EDITING_LIMITS.maxSpeed) ||
    !inRange(segment.volume, EDITING_LIMITS.minVolume, EDITING_LIMITS.maxVolume)) throw new Error('INVALID_SEGMENT');
  const next = ensureEditing(project);
  next.editing.segments = next.editing.segments.map((current) => current.id === id ? segment : current);
  const duration = timelineDuration(next);
  if (duration < EDITING_LIMITS.minDuration || duration > EDITING_LIMITS.maxTimelineDuration) throw new Error('INVALID_TIMELINE_DURATION');
  const oldDuration = range.outputEnd - range.outputStart;
  const newDuration = durationOf(segment);
  if (Math.abs(newDuration - oldDuration) < EDITING_LIMITS.timeTolerance &&
    segment.sourceIn === range.segment.sourceIn && segment.sourceOut === range.segment.sourceOut && segment.speed === range.segment.speed) return next;
  const shift: TimeTransform = (time) => {
    if (time <= range.outputStart) return time;
    if (time >= range.outputEnd) return time + newDuration - oldDuration;
    const sourceTime = range.segment.sourceIn + (time - range.outputStart) * range.segment.speed;
    return clamp(range.outputStart + (sourceTime - segment.sourceIn) / segment.speed, range.outputStart, range.outputStart + newDuration);
  };
  next.editing.subtitles = mapSubtitles(next.editing.subtitles, shift);
  const used = timelineIds(next.editing);
  const retainedStart = clamp(range.outputStart + (segment.sourceIn - range.segment.sourceIn) / range.segment.speed, range.outputStart, range.outputEnd);
  const retainedEnd = clamp(range.outputStart + (segment.sourceOut - range.segment.sourceIn) / range.segment.speed, range.outputStart, range.outputEnd);
  next.editing.music = next.editing.music.flatMap((clip) => {
    const windows = [[0, range.outputStart], [retainedStart, retainedEnd], [range.outputEnd, timelineDuration(project)]];
    const pieces: MusicClip[] = [];
    for (const [windowStart, windowEnd] of windows) {
      const piece = cutMusic(clip, windowStart, windowEnd, pieces.length ? freshId('music', used) : clip.id);
      if (!piece) continue;
      const start = shift(piece.start);
      const end = Math.min(shift(piece.start + piece.sourceOut - piece.sourceIn), duration);
      const length = Math.min(end - start, piece.sourceOut - piece.sourceIn);
      if (length >= EDITING_LIMITS.minDuration) pieces.push({ ...piece, start, sourceOut: piece.sourceIn + length });
    }
    return pieces;
  });
  checkTrackLimits(next.editing);
  return { ...next, ...transformedTrim(project, duration, (time) => time === 0 ? 0 : shift(time), (time) => time === timelineDuration(project) ? duration : shift(time)) };
}

export function insertVideoSegment<T extends ProjectData>(project: T, asset: MediaAssetData, outputTime: number): T {
  if (asset.kind !== 'video') throw new Error('INVALID_VIDEO_ASSET');
  const validated = parseMediaAssets([asset])?.[0];
  if (!validated) throw new Error('INVALID_VIDEO_ASSET');
  const position = clamp(Number.isFinite(outputTime) ? outputTime : 0, 0, timelineDuration(project));
  const range = segmentRanges(project).find(({ outputStart, outputEnd }) => position > outputStart && position < outputEnd);
  let next = ensureEditing(range ? splitSegment(project, range.segment.id, position) : project);
  const ranges = segmentRanges(next);
  let index = ranges.findIndex(({ outputStart }) => outputStart >= position - EDITING_LIMITS.timeTolerance);
  if (index < 0) index = ranges.length;
  if (range && getSegments(next).length === getSegments(project).length) index = position - range.outputStart < range.outputEnd - position ? ranges.findIndex(({ segment }) => segment.id === range.segment.id) : ranges.findIndex(({ segment }) => segment.id === range.segment.id) + 1;
  const used = timelineIds(next.editing);
  next.editing.segments.splice(index, 0, { id: freshId('segment', used), mediaId: validated.id, sourceIn: 0, sourceOut: validated.duration, speed: 1, volume: 1 });
  if (next.editing.segments.length > EDITING_LIMITS.maxSegments) throw new Error('TOO_MANY_SEGMENTS');
  const assets = project.mediaAssets ?? [];
  const existing = assets.find(({ id }) => id === validated.id);
  if (existing && (existing.kind !== validated.kind || existing.mimeType !== validated.mimeType || existing.duration !== validated.duration ||
    existing.width !== validated.width || existing.height !== validated.height || existing.hasAudio !== validated.hasAudio)) throw new Error('DUPLICATE_MEDIA_ASSET');
  if (!existing && assets.length >= EDITING_LIMITS.maxAssets) throw new Error('TOO_MANY_MEDIA_ASSETS');
  next = { ...next, mediaAssets: existing ? [...assets] : [...assets, validated] };
  const duration = timelineDuration(next);
  if (duration > EDITING_LIMITS.maxTimelineDuration) throw new Error('TIMELINE_TOO_LONG');
  const insertedAt = segmentRanges(next)[index].outputStart;
  const shift: TimeTransform = (time) => time >= insertedAt ? time + validated.duration : time;
  next.editing.subtitles = next.editing.subtitles.flatMap((clip) => {
    if (clip.start < insertedAt && clip.end > insertedAt) return [
      { ...clip, end: insertedAt }, { ...clip, id: freshId('subtitle', used), start: insertedAt + validated.duration, end: clip.end + validated.duration },
    ].filter(({ start, end }) => end - start >= EDITING_LIMITS.minDuration);
    return [{ ...clip, start: shift(clip.start), end: clip.end > insertedAt ? shift(clip.end) : clip.end }];
  });
  next.editing.music = next.editing.music.flatMap((clip) => {
    const before = cutMusic(clip, 0, insertedAt, clip.id);
    const after = cutMusic(clip, insertedAt, timelineDuration(project), before ? freshId('music', used) : clip.id);
    return [...(before ? [before] : []), ...(after ? [{ ...after, start: shift(after.start) }] : [])];
  });
  checkTrackLimits(next.editing);
  return { ...next, ...transformedTrim(project, duration, (time) => time > insertedAt ? shift(time) : time, shift) };
}
