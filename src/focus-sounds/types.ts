import type { FocusSoundId } from '../../shared';

export interface FocusSoundAsset {
  id: FocusSoundId;
  file: string;
  duration: number;
  bytes: number;
  sha256: string;
}

export interface FocusSoundManifest {
  version: number;
  format: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  sounds: Record<FocusSoundId, Omit<FocusSoundAsset, 'id' | 'file'>>;
}
