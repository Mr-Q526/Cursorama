import { ASPECTS, BACKGROUNDS, BACKGROUND_LIMITS, DEFAULT_SETTINGS, FRAME_LIMITS, PRESETS } from './constants';
import type { MotionClip, PointerSample, ProjectData } from './types';

export const PROJECT_MAGIC = 'CURSOR01';
export const PROJECT_HEADER_SIZE = 12;
export const MAX_PROJECT_HEADER = 64 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number): value is number => finite(value) && value >= min && value <= max;

function isPointer(value: unknown): value is PointerSample {
  if (!isRecord(value)) return false;
  return inRange(value.time, 0, Number.MAX_SAFE_INTEGER) && inRange(value.x, 0, 1) && inRange(value.y, 0, 1) && (value.kind === 'move' || value.kind === 'click');
}

function isClip(value: unknown): value is MotionClip {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && finite(value.start) && finite(value.end) && value.end > value.start &&
    inRange(value.x, 0, 1) && inRange(value.y, 0, 1) && inRange(value.zoom, 1, 4) &&
    typeof value.mode === 'string' && value.mode in PRESETS && typeof value.enabled === 'boolean' && typeof value.manual === 'boolean';
}

export function parseProject(value: unknown): ProjectData {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.name !== 'string' || !inRange(value.duration, 0.01, 86400) ||
    !inRange(value.width, 1, 16384) || !inRange(value.height, 1, 16384) || !Array.isArray(value.samples) || !value.samples.every(isPointer) ||
    !Array.isArray(value.clips) || !value.clips.every(isClip) || !isRecord(value.settings) ||
    !inRange(value.trimStart, 0, value.duration) || !inRange(value.trimEnd, 0, value.duration) || value.trimEnd <= value.trimStart ||
    (value.sourceType !== 'demo' && value.sourceType !== 'video')) throw new Error('INVALID_PROJECT');
  const settings = value.settings;
  if (value.cursorEmbedded !== undefined && typeof value.cursorEmbedded !== 'boolean') throw new Error('INVALID_CURSOR_SOURCE');
  if (typeof settings.mode !== 'string' || !(settings.mode in PRESETS) || typeof settings.background !== 'string' || !(settings.background in BACKGROUNDS) ||
    typeof settings.aspect !== 'string' || !(settings.aspect in ASPECTS) || !['arrow', 'dot', 'none'].includes(String(settings.cursor))) throw new Error('INVALID_SETTINGS');
  const numericSettings: ReadonlyArray<readonly [string, number, number]> = [
    ['zoom', 1, 4], ['tilt', 0, 35], ['easing', 0.1, 2], ['padding', 0, 30], ['radius', 0, 60], ['shadow', 0, 100], ['cursorSize', 10, 80],
  ];
  for (const [key, min, max] of numericSettings) if (!inRange(settings[key], min, max)) throw new Error('INVALID_SETTINGS');
  if (settings.backgroundBlur !== undefined && !inRange(settings.backgroundBlur, 0, BACKGROUND_LIMITS.blur)) throw new Error('INVALID_SETTINGS');
  if (settings.backgroundDim !== undefined && !inRange(settings.backgroundDim, 0, BACKGROUND_LIMITS.dim)) throw new Error('INVALID_SETTINGS');
  if (settings.edgeGlass !== undefined && !inRange(settings.edgeGlass, 0, FRAME_LIMITS.edgeGlass)) throw new Error('INVALID_SETTINGS');
  for (const key of ['autoZoom', 'followCursor', 'clickEffect', 'spotlight']) if (typeof settings[key] !== 'boolean') throw new Error('INVALID_SETTINGS');
  for (let index = 1; index < value.samples.length; index++) if (value.samples[index].time < value.samples[index - 1].time) throw new Error('UNSORTED_SAMPLES');
  return {
    schemaVersion: 1, name: value.name.slice(0, 200), duration: value.duration,
    width: value.width, height: value.height, samples: value.samples, clips: value.clips,
    settings: { ...DEFAULT_SETTINGS, ...settings, edgeGlass: settings.edgeGlass ?? DEFAULT_SETTINGS.edgeGlass } as ProjectData['settings'],
    trimStart: value.trimStart, trimEnd: value.trimEnd,
    sourceType: value.sourceType, hasAudio: value.hasAudio === true,
    cursorEmbedded: value.cursorEmbedded ?? value.sourceType === 'video',
  };
}

export function projectBytes(data: ProjectData, video?: ArrayBuffer): Uint8Array {
  const metadata = new TextEncoder().encode(JSON.stringify(data));
  const payload = video ? new Uint8Array(video) : new Uint8Array();
  const result = new Uint8Array(PROJECT_HEADER_SIZE + metadata.length + payload.length);
  result.set(new TextEncoder().encode(PROJECT_MAGIC));
  new DataView(result.buffer).setUint32(PROJECT_MAGIC.length, metadata.length, true);
  result.set(metadata, PROJECT_HEADER_SIZE); result.set(payload, PROJECT_HEADER_SIZE + metadata.length);
  return result;
}

export function readProjectBytes(bytes: Uint8Array): { data: ProjectData; bytes?: ArrayBuffer } {
  if (bytes.length < PROJECT_HEADER_SIZE || new TextDecoder().decode(bytes.subarray(0, PROJECT_MAGIC.length)) !== PROJECT_MAGIC) throw new Error('INVALID_PROJECT');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(PROJECT_MAGIC.length, true);
  if (length > MAX_PROJECT_HEADER || length + PROJECT_HEADER_SIZE > bytes.length) throw new Error('INVALID_PROJECT');
  const metadata: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(PROJECT_HEADER_SIZE, PROJECT_HEADER_SIZE + length))) as unknown;
  const data = parseProject(metadata);
  const payload = Uint8Array.from(bytes.subarray(PROJECT_HEADER_SIZE + length));
  if (data.sourceType === 'video' && payload.length === 0) throw new Error('MISSING_VIDEO');
  return { data, bytes: payload.length ? payload.buffer as ArrayBuffer : undefined };
}
