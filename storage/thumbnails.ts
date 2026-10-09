import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COVER_DATA_PREFIX, isLibraryCover, LIBRARY_COVER } from '../shared';

export interface ThumbnailSource { path?: string; bytes?: ArrayBuffer; time: number; }

const THUMBNAIL = { timeout: 15_000, errorLength: 1000, jpegQuality: '3', prefix: 'cursorama-cover-', sourceName: 'source-video', minimumBytes: 100 } as const;

export async function generateLibraryThumbnail(binary: string, source: ThumbnailSource): Promise<string> {
  if (!source.path && !source.bytes?.byteLength) throw new Error('COVER_SOURCE_MISSING');
  if (source.path && source.bytes) throw new Error('AMBIGUOUS_COVER_SOURCE');
  const temporary = source.path ? undefined : await mkdtemp(path.join(tmpdir(), THUMBNAIL.prefix));
  const input = source.path ?? path.join(temporary ?? '', THUMBNAIL.sourceName);
  try {
    if (source.bytes) await writeFile(input, new Uint8Array(source.bytes));
    const encode = (time: number): Promise<Buffer> => new Promise<Buffer>((resolve, reject) => {
      const seek = Number.isFinite(time) && time > 0 ? ['-ss', time.toString()] : [];
      const encoder = spawn(binary, ['-hide_banner', '-loglevel', 'error', ...seek, '-i', input, '-an', '-sn', '-vf', `scale=${LIBRARY_COVER.width}:${LIBRARY_COVER.height}:force_original_aspect_ratio=decrease,pad=${LIBRARY_COVER.width}:${LIBRARY_COVER.height}:(ow-iw)/2:(oh-ih)/2:color=${LIBRARY_COVER.background.replace('#', '0x')}`, '-frames:v', '1', '-threads', '1', '-q:v', THUMBNAIL.jpegQuality, '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], { windowsHide: true });
      const chunks: Buffer[] = [];
      let length = 0;
      let log = '';
      const timeout = setTimeout(() => { encoder.kill(); reject(new Error('COVER_GENERATION_TIMEOUT')); }, THUMBNAIL.timeout);
      encoder.stdout.on('data', (chunk: Buffer) => { length += chunk.length; if (length > LIBRARY_COVER.maximumLength) { encoder.kill(); reject(new Error('COVER_TOO_LARGE')); } else chunks.push(chunk); });
      encoder.stderr.on('data', (chunk: Buffer) => { log = (log + chunk.toString()).slice(-THUMBNAIL.errorLength); });
      encoder.once('error', (error) => { clearTimeout(timeout); reject(error); });
      encoder.once('close', (code) => { clearTimeout(timeout); if (code === 0 && length >= THUMBNAIL.minimumBytes) resolve(Buffer.concat(chunks)); else reject(new Error(`COVER_GENERATION_FAILED: ${log}`)); });
    });
    let bytes: Buffer;
    try { bytes = await encode(source.time); }
    catch (error) {
      if (!(source.time > 0) || !(error instanceof Error) || !error.message.startsWith('COVER_GENERATION_FAILED')) throw error;
      bytes = await encode(0);
    }
    const cover = COVER_DATA_PREFIX + bytes.toString('base64');
    if (!isLibraryCover(cover)) throw new Error('INVALID_GENERATED_COVER');
    return cover;
  } finally {
    if (temporary) {
      const actual = await realpath(temporary);
      if (path.dirname(actual) !== await realpath(tmpdir()) || !path.basename(actual).startsWith(THUMBNAIL.prefix)) throw new Error('INVALID_COVER_TEMPORARY_PATH');
      await rm(actual, { recursive: true, force: true });
    }
  }
}
