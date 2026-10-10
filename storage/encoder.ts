import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TIME } from '../shared';
import type { ExportRequest } from '../shared';

export type EncodeProgress = (progress: number) => void;
const QUALITY_CRF = { standard: '23', high: '18' } as const;
const MAX_ERROR_LENGTH = 6000;
const AUDIO_BITRATE = { mp4: '192k', webm: '128k' } as const;
const AUDIO_SYNC_FILTER = 'aresample=async=1:first_pts=0,apad';

export async function encodeVideo(request: ExportRequest, binary: string, target: string, onProgress: EncodeProgress): Promise<void> {
  if (!(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength === 0 || !['mp4', 'webm'].includes(request.format) || !['standard', 'high'].includes(request.quality) || ![30, 60].includes(request.fps) || typeof request.name !== 'string' || !Number.isFinite(request.duration) || request.duration <= 0 || request.duration > 86400) throw new Error('INVALID_EXPORT_REQUEST');
  const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-export-'));
  const input = path.join(temporary, 'rendered.webm');
  const output = path.join(temporary, `final.${request.format}`);
  try {
    await writeFile(input, Buffer.from(request.bytes));
    const formatArgs = request.format === 'mp4'
      ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', QUALITY_CRF[request.quality], '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', AUDIO_BITRATE.mp4, '-movflags', '+faststart']
      : ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '4', '-crf', request.quality === 'high' ? '24' : '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', AUDIO_BITRATE.webm];
    await new Promise<void>((resolve, reject) => {
      const encoder = spawn(binary, ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', `fps=${request.fps},tpad=stop_mode=clone:stop_duration=${request.duration}`, '-af', AUDIO_SYNC_FILTER, ...formatArgs, '-r', request.fps.toString(), '-t', request.duration.toString(), '-progress', 'pipe:1', output], { windowsHide: true });
      let errorLog = '';
      encoder.stderr.on('data', (chunk: Buffer) => { errorLog = (errorLog + chunk.toString()).slice(-MAX_ERROR_LENGTH); });
      encoder.stdout.on('data', (chunk: Buffer) => {
        const match = chunk.toString().match(/out_time_us=(\d+)/);
        if (match) onProgress(Math.min(0.99, Number(match[1]) / (request.duration * TIME.milliseconds * TIME.milliseconds)));
      });
      encoder.once('error', reject);
      encoder.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`VIDEO_ENCODE_FAILED\n${errorLog}`)));
    });
    await copyFile(output, target);
    onProgress(1);
  } finally {
    const temporaryRoot = path.resolve(tmpdir()) + path.sep;
    if (!path.resolve(temporary).startsWith(temporaryRoot) || !path.basename(temporary).startsWith('cursorama-export-')) throw new Error('INVALID_TEMPORARY_PATH');
    await rm(temporary, { recursive: true, force: true });
  }
}
