import { segmentRanges, SOURCE_MEDIA_ID } from './editing';
import type { FocusSoundId, FocusSoundSettings, ProjectData, VisualSettings } from './types';

export interface FocusSoundCue { id: string; time: number; }

export const FOCUS_SOUND_IDS: readonly FocusSoundId[] = ['soft-tap', 'air-sweep', 'glass-chime', 'gentle-pop'];
export const DEFAULT_FOCUS_SOUND: FocusSoundSettings = { enabled: true, id: 'soft-tap', volume: 0.32 };
export const FOCUS_SOUND_TIMING = { minimumZoom: 1.01, minimumCueGap: 0.35, seekThreshold: 0.2, clockTolerance: 0.002 } as const;
const cuesCache = new WeakMap<ProjectData, readonly FocusSoundCue[]>();

export function parseFocusSound(value: unknown): FocusSoundSettings | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_FOCUS_SOUND');
  const setting = value as Record<string, unknown>;
  if (typeof setting.enabled !== 'boolean' || typeof setting.id !== 'string' || !(FOCUS_SOUND_IDS as readonly string[]).includes(setting.id) ||
    typeof setting.volume !== 'number' || !Number.isFinite(setting.volume) || setting.volume < 0 || setting.volume > 1) throw new Error('INVALID_FOCUS_SOUND');
  return { enabled: setting.enabled, id: setting.id as FocusSoundId, volume: setting.volume };
}

export function focusSoundSettings(settings: Pick<VisualSettings, 'focusSound'>): FocusSoundSettings {
  return settings.focusSound ?? DEFAULT_FOCUS_SOUND;
}

export function focusSoundCues(project: ProjectData): readonly FocusSoundCue[] {
  const known = cuesCache.get(project);
  if (known) return known;
  const cues: FocusSoundCue[] = [];
  if (project.settings.autoZoom && focusSoundSettings(project.settings).enabled) {
    for (const { segment, outputStart } of segmentRanges(project)) {
      if (segment.mediaId !== SOURCE_MEDIA_ID) continue;
      for (const clip of project.clips) {
        if (!clip.enabled || clip.mode === 'overview' || clip.zoom <= FOCUS_SOUND_TIMING.minimumZoom || clip.start < segment.sourceIn || clip.start >= segment.sourceOut) continue;
        const time = outputStart + (clip.start - segment.sourceIn) / segment.speed;
        if (time < project.trimStart || time >= project.trimEnd) continue;
        cues.push({ id: `${segment.id}:${clip.id}`, time });
      }
    }
  }
  cues.sort((first, second) => first.time - second.time);
  const separated: FocusSoundCue[] = [];
  for (const cue of cues) if (!separated.length || cue.time - separated[separated.length - 1].time >= FOCUS_SOUND_TIMING.minimumCueGap) separated.push(cue);
  cuesCache.set(project, separated);
  return separated;
}
