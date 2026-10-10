import type { FocusSoundId } from '../../shared';
import { FOCUS_SOUND_IDS } from '../../shared/focus-sound';
import manifest from './generated.json';
import type { FocusSoundAsset, FocusSoundManifest } from './types';

export type FocusSoundLoader = (context: BaseAudioContext, id: FocusSoundId, signal?: AbortSignal) => Promise<AudioBuffer>;
const SOURCE_BASE = `${import.meta.env?.BASE_URL ?? './'}focus-sounds/`;
const AUDIO_MANIFEST: FocusSoundManifest = manifest;
const buffers = new WeakMap<BaseAudioContext, Map<FocusSoundId, AudioBuffer>>();

export { FOCUS_SOUND_IDS } from '../../shared/focus-sound';
export const FOCUS_SOUND_LIMITS = { fetchTimeout: 15_000, durationTolerance: 0.015, minimumDuration: 0.15, maximumDuration: 0.65, maximumBytes: 256 * 1024 } as const;
export const FOCUS_SOUND_ASSETS: Readonly<Record<FocusSoundId, FocusSoundAsset>> = Object.fromEntries(FOCUS_SOUND_IDS.map((id) => [id, { id, file: `${SOURCE_BASE}${id}.wav`, ...AUDIO_MANIFEST.sounds[id] }])) as Record<FocusSoundId, FocusSoundAsset>;

export function getFocusSoundAsset(id: FocusSoundId): FocusSoundAsset {
  const sound = FOCUS_SOUND_ASSETS[id];
  if (!sound) throw new Error('FOCUS_SOUND_NOT_FOUND');
  return sound;
}

async function fetchSoundBytes(id: FocusSoundId, signal: AbortSignal): Promise<ArrayBuffer> {
  const sound = getFocusSoundAsset(id);
  const response = await fetch(sound.file, { signal });
  if (!response.ok) throw new Error('FOCUS_SOUND_LOAD_FAILED');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== sound.bytes || bytes.byteLength > FOCUS_SOUND_LIMITS.maximumBytes) throw new Error('FOCUS_SOUND_INCOMPLETE');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== sound.sha256) throw new Error('FOCUS_SOUND_INTEGRITY_FAILED');
  return bytes;
}

export async function loadFocusSoundBuffer(context: BaseAudioContext, id: FocusSoundId, signal?: AbortSignal): Promise<AudioBuffer> {
  if (signal?.aborted) throw new DOMException('FOCUS_SOUND_CANCELLED', 'AbortError');
  if (context.state === 'closed') throw new Error('FOCUS_SOUND_CONTEXT_CLOSED');
  const known = buffers.get(context)?.get(id);
  if (known) return known;
  const controller = new AbortController();
  const cancelled = (): void => { controller.abort(); };
  const timeout = setTimeout(cancelled, FOCUS_SOUND_LIMITS.fetchTimeout);
  signal?.addEventListener('abort', cancelled, { once: true });
  let rejectCancelled: () => void = () => undefined;
  const cancellation = new Promise<never>((_, reject) => { rejectCancelled = (): void => { reject(new DOMException('FOCUS_SOUND_CANCELLED', 'AbortError')); }; });
  controller.signal.addEventListener('abort', rejectCancelled, { once: true });
  try {
    const decode = async (): Promise<AudioBuffer> => {
      const bytes = await fetchSoundBytes(id, controller.signal);
      if (controller.signal.aborted) throw new DOMException('FOCUS_SOUND_CANCELLED', 'AbortError');
      return context.decodeAudioData(bytes);
    };
    const decoded = await Promise.race([decode(), cancellation]);
    if (controller.signal.aborted) throw new DOMException('FOCUS_SOUND_CANCELLED', 'AbortError');
    const asset = getFocusSoundAsset(id);
    if (Math.abs(decoded.duration - asset.duration) > FOCUS_SOUND_LIMITS.durationTolerance || decoded.duration < FOCUS_SOUND_LIMITS.minimumDuration || decoded.duration > FOCUS_SOUND_LIMITS.maximumDuration || decoded.numberOfChannels < 1) throw new Error('FOCUS_SOUND_DECODE_FAILED');
    const cache = buffers.get(context) ?? new Map<FocusSoundId, AudioBuffer>();
    cache.set(id, decoded); buffers.set(context, cache);
    return decoded;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelled);
    controller.signal.removeEventListener('abort', rejectCancelled);
  }
}
