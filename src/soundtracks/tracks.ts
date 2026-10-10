import manifest from './generated.json';
import type { Soundtrack, SoundtrackAudioManifest, SoundtrackCategory, SoundtrackId } from './types';

const MUSIC_BASE = `${import.meta.env?.BASE_URL ?? './'}music/`;
const AUDIO_MANIFEST: SoundtrackAudioManifest = manifest;
const CATEGORIES: Record<SoundtrackId, SoundtrackCategory> = {
  'clear-morning': 'piano', 'quiet-current': 'ambient', 'soft-grid': 'electronic',
  'neon-focus': 'electronic', 'cloud-atlas': 'ambient', 'midnight-ink': 'piano',
  'paper-lantern': 'acoustic', 'velvet-cafe': 'jazz', 'silver-screen': 'cinematic', 'pixel-journey': 'retro',
};

export const SOUNDTRACK_IDS = Object.keys(CATEGORIES) as SoundtrackId[];
export const SOUNDTRACK_FILTERS = ['all', 'piano', 'ambient', 'electronic', 'acoustic', 'jazz', 'cinematic', 'retro'] as const;
export const SOUNDTRACKS: readonly Soundtrack[] = SOUNDTRACK_IDS.map((id) => ({
  id, category: CATEGORIES[id], file: `${MUSIC_BASE}${id}.mp3`, ...AUDIO_MANIFEST.tracks[id],
}));
export const SOUNDTRACK_DEFAULTS = { volume: 0.3, auditionVolume: 0.55, fetchTimeout: 15_000, mimeType: 'audio/mpeg' } as const;

export function getSoundtrack(id: SoundtrackId): Soundtrack {
  const track = SOUNDTRACKS.find((item) => item.id === id);
  if (!track) throw new Error('SOUNDTRACK_NOT_FOUND');
  return track;
}
