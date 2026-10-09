export interface LibraryCoverSettings { width: number; height: number; quality: number; maximumLength: number; background: string; }

export const LIBRARY_COVER: LibraryCoverSettings = { width: 480, height: 270, quality: 0.78, maximumLength: 256 * 1024, background: '#181818' };
export const COVER_DATA_PREFIX = 'data:image/jpeg;base64,';

export function isLibraryCover(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIBRARY_COVER.maximumLength && value.length > COVER_DATA_PREFIX.length
    && value.startsWith(COVER_DATA_PREFIX) && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(COVER_DATA_PREFIX.length));
}
