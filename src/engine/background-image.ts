import { BACKGROUND_IMAGE_LIMITS, backgroundImageMimeType, validBackgroundImageDimensions } from '../../shared';
import type { BackgroundImageAsset } from '../../shared';

export function loadBackgroundImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = (): void => { clearTimeout(timeout); image.onload = null; image.onerror = null; signal?.removeEventListener('abort', aborted); };
    const aborted = (): void => { cleanup(); image.removeAttribute('src'); reject(new DOMException('BACKGROUND_IMAGE_ABORTED', 'AbortError')); };
    const failed = (): void => { cleanup(); image.removeAttribute('src'); reject(new Error('BACKGROUND_IMAGE_DECODE_FAILED')); };
    const timeout = setTimeout(failed, BACKGROUND_IMAGE_LIMITS.loadTimeout);
    image.onload = () => {
      if (!validBackgroundImageDimensions(image.naturalWidth, image.naturalHeight)) { cleanup(); reject(new Error('BACKGROUND_IMAGE_DIMENSIONS')); return; }
      cleanup(); resolve(image);
    };
    image.onerror = failed;
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    image.src = url;
  });
}

export async function importBackgroundImage(file: File, signal?: AbortSignal): Promise<BackgroundImageAsset> {
  if (file.size === 0) throw new Error('BACKGROUND_IMAGE_EMPTY');
  if (file.size > BACKGROUND_IMAGE_LIMITS.maxBytes) throw new Error('BACKGROUND_IMAGE_TOO_LARGE');
  const mimeType = backgroundImageMimeType(new Uint8Array(await file.slice(0, BACKGROUND_IMAGE_LIMITS.signatureBytes).arrayBuffer()));
  if (!mimeType) throw new Error('BACKGROUND_IMAGE_FORMAT');
  if (signal?.aborted) throw new DOMException('BACKGROUND_IMAGE_ABORTED', 'AbortError');
  const blob = new Blob([file], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadBackgroundImage(url, signal);
    return {
      id: `background-${crypto.randomUUID()}`, name: file.name.slice(0, BACKGROUND_IMAGE_LIMITS.maxNameLength),
      mimeType, width: image.naturalWidth, height: image.naturalHeight, blob, url,
    };
  } catch (error: unknown) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
