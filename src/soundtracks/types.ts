export type SoundtrackId = 'clear-morning' | 'quiet-current' | 'soft-grid' | 'neon-focus' | 'cloud-atlas' | 'midnight-ink' | 'paper-lantern' | 'velvet-cafe' | 'silver-screen' | 'pixel-journey';
export type SoundtrackCategory = 'piano' | 'ambient' | 'electronic' | 'acoustic' | 'jazz' | 'cinematic' | 'retro';
export type SoundtrackFilter = 'all' | SoundtrackCategory;

export interface Soundtrack {
  id: SoundtrackId;
  category: SoundtrackCategory;
  duration: number;
  bpm: number;
  file: string;
  waveform: readonly number[];
  bytes: number;
  sha256: string;
}

export interface SoundtrackAudioManifest {
  version: number;
  format: string;
  sampleRate: number;
  channels: number;
  generator: string;
  tracks: Record<SoundtrackId, Omit<Soundtrack, 'id' | 'category' | 'file'>>;
}
