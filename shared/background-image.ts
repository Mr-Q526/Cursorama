import { isMediaIdentifier, SOURCE_MEDIA_ID } from './editing';
import type { BackgroundImageAsset, BackgroundImageData, BackgroundImageMimeType } from './types';

export const BACKGROUND_IMAGE_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxDimension: 16384,
  maxPixels: 64 * 1024 * 1024,
  maxNameLength: 200,
  loadTimeout: 15_000,
  signatureBytes: 12,
} as const;

export const BACKGROUND_IMAGE_MIME_TYPES: readonly BackgroundImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp'];
export const BACKGROUND_IMAGE_ACCEPT = BACKGROUND_IMAGE_MIME_TYPES.join(',');

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const JPEG_SIGNATURE = [255, 216, 255] as const;
const WEBP_HEADER = 'RIFF';
const WEBP_FORMAT = 'WEBP';

export function backgroundImageMimeType(bytes: Uint8Array): BackgroundImageMimeType | undefined {
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return 'image/png';
  if (JPEG_SIGNATURE.every((value, index) => bytes[index] === value)) return 'image/jpeg';
  if (bytes.length >= BACKGROUND_IMAGE_LIMITS.signatureBytes && new TextDecoder().decode(bytes.subarray(0, WEBP_HEADER.length)) === WEBP_HEADER &&
    new TextDecoder().decode(bytes.subarray(BACKGROUND_IMAGE_LIMITS.signatureBytes - WEBP_FORMAT.length, BACKGROUND_IMAGE_LIMITS.signatureBytes)) === WEBP_FORMAT) return 'image/webp';
  return undefined;
}

export function validBackgroundImageDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= BACKGROUND_IMAGE_LIMITS.maxDimension && height <= BACKGROUND_IMAGE_LIMITS.maxDimension && width * height <= BACKGROUND_IMAGE_LIMITS.maxPixels;
}

export function parseBackgroundImage(value: unknown): BackgroundImageData | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_BACKGROUND_IMAGE');
  const image = value as Record<string, unknown>;
  if (!isMediaIdentifier(image.id) || image.id === SOURCE_MEDIA_ID || typeof image.name !== 'string' || image.name.length > BACKGROUND_IMAGE_LIMITS.maxNameLength ||
    typeof image.mimeType !== 'string' || !(BACKGROUND_IMAGE_MIME_TYPES as readonly string[]).includes(image.mimeType) ||
    typeof image.width !== 'number' || typeof image.height !== 'number' || !validBackgroundImageDimensions(image.width, image.height)) throw new Error('INVALID_BACKGROUND_IMAGE');
  return { id: image.id, name: image.name, mimeType: image.mimeType as BackgroundImageMimeType, width: image.width, height: image.height };
}

export function backgroundImageMetadata(image: BackgroundImageAsset): BackgroundImageData {
  return { id: image.id, name: image.name, mimeType: image.mimeType, width: image.width, height: image.height };
}

export function validateBackgroundImagePayload(image: BackgroundImageData, bytes: Uint8Array): void {
  if (bytes.byteLength === 0 || bytes.byteLength > BACKGROUND_IMAGE_LIMITS.maxBytes || backgroundImageMimeType(bytes) !== image.mimeType) throw new Error('INVALID_BACKGROUND_IMAGE_PAYLOAD');
}
