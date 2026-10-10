import type { MediaAsset } from '../../shared';
import { importMediaFile } from '../engine/timeline-media';
import { soundtracksCatalog } from '../i18n/soundtracks';
import { getSoundtrack, SOUNDTRACK_DEFAULTS } from './tracks';
import type { Soundtrack } from './types';

export type SoundtrackAssetLoader = (track: Soundtrack, signal?: AbortSignal) => Promise<MediaAsset>;

export async function loadSoundtrackAsset(track: Soundtrack, signal?: AbortSignal): Promise<MediaAsset> {
  const bundled = getSoundtrack(track.id);
  const controller = new AbortController();
  const cancelled = (): void => { controller.abort(); };
  const timeout = setTimeout(cancelled, SOUNDTRACK_DEFAULTS.fetchTimeout);
  signal?.addEventListener('abort', cancelled, { once: true });
  try {
    if (signal?.aborted) throw new DOMException('SOUNDTRACK_CANCELLED', 'AbortError');
    const response = await fetch(bundled.file, { signal: controller.signal });
    if (!response.ok) throw new Error('SOUNDTRACK_LOAD_FAILED');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== bundled.bytes) throw new Error('SOUNDTRACK_INCOMPLETE');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
    if (hash !== bundled.sha256) throw new Error('SOUNDTRACK_INTEGRITY_FAILED');
    const title = soundtracksCatalog.tracks[bundled.id].title;
    const asset = await importMediaFile(new File([bytes], `${title}.mp3`, { type: SOUNDTRACK_DEFAULTS.mimeType }), 'audio');
    if (controller.signal.aborted) { URL.revokeObjectURL(asset.url); throw new DOMException('SOUNDTRACK_CANCELLED', 'AbortError'); }
    return asset;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelled);
  }
}
