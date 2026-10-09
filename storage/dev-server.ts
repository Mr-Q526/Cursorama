import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { APP_PORT, LIBRARY_API, LIBRARY_MUTATION_HEADER, projectBytes, readProjectBytes } from '../shared';
import type { ExportRequest, StorageSettings, StorageTarget } from '../shared';
import { encodeVideo } from './encoder';
import { LocalLibrary } from './library';
import { legacyLibraryRoots } from './locations';

export interface LocalLibraryPluginOptions { root?: string; }
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

async function body(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    length += chunk.length;
    if (length > MAX_UPLOAD_BYTES) throw new Error('LIBRARY_UPLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Uint8Array.from(Buffer.concat(chunks)).buffer;
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function reveal(target: string, directory: boolean): Promise<void> {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' && !directory ? [`/select,${target}`] : [directory ? target : path.dirname(target)];
  await new Promise<void>((resolve, reject) => {
    const explorer = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    explorer.once('error', reject);
    explorer.once('spawn', () => { explorer.unref(); resolve(); });
  });
}

async function streamVideo(request: IncomingMessage, response: ServerResponse, target: string): Promise<void> {
  const info = await stat(target);
  let start = 0;
  let end = info.size - 1;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
  }
  response.writeHead(range ? 206 : 200, {
    'Content-Type': target.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
  });
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(target, { start, end });
  stream.on('error', (error) => response.destroy(error));
  response.once('close', () => stream.destroy());
  stream.pipe(response);
}

export function localLibraryPlugin(options: LocalLibraryPluginOptions = {}): Plugin {
  const library = new LocalLibrary(options.root, { legacyRoots: options.root ? [] : legacyLibraryRoots() });
  return {
    name: 'cursorama-local-library',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(`${LIBRARY_API}/`)) { next(); return; }
        const address = server.httpServer?.address();
        const port = typeof address === 'object' && address ? address.port : APP_PORT;
        const allowedHost = `127.0.0.1:${port}`;
        if (request.headers.host !== allowedHost || (request.headers.origin && request.headers.origin !== `http://${allowedHost}`) || request.headers['sec-fetch-site'] === 'cross-site' || (request.method === 'POST' && request.headers[LIBRARY_MUTATION_HEADER] !== '1')) { json(response, { error: 'LOCAL_REQUEST_REQUIRED' }, 403); return; }
        void (async () => {
          const url = new URL(request.url ?? '', `http://${allowedHost}`);
          const parts = url.pathname.slice(LIBRARY_API.length + 1).split('/');
          if (request.method === 'GET' && parts[0] === 'list') { json(response, await library.list()); return; }
          if (request.method === 'POST' && parts[0] === 'configure') {
            const settings: unknown = JSON.parse(Buffer.from(await body(request)).toString());
            json(response, await library.configure(settings as StorageSettings)); return;
          }
          if (request.method === 'POST' && parts[0] === 'directory') {
            await reveal(await library.storageDirectory(url.searchParams.get('target') as StorageTarget), true);
            json(response, { success: true }); return;
          }
          if (request.method === 'POST' && parts[0] === 'save') {
            const value = readProjectBytes(new Uint8Array(await body(request)));
            json(response, await library.saveProject(value.data, value.bytes, url.searchParams.get('id') ?? undefined)); return;
          }
          if (request.method === 'GET' && parts[0] === 'project' && parts.length === 2) {
            const value = await library.openProject(parts[1]);
            response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
            response.end(projectBytes(value.data, value.bytes)); return;
          }
          if ((request.method === 'GET' || request.method === 'HEAD') && parts[0] === 'video' && parts.length === 3) {
            await streamVideo(request, response, await library.videoPath(parts[1], parts[2])); return;
          }
          if (request.method === 'POST' && parts[0] === 'export') {
            const exportRequest: ExportRequest = {
              bytes: await body(request), mimeType: request.headers['content-type'] ?? 'video/webm',
              projectId: url.searchParams.get('id') ?? undefined, name: url.searchParams.get('name') ?? '',
              format: url.searchParams.get('format') as ExportRequest['format'], quality: url.searchParams.get('quality') as ExportRequest['quality'],
              duration: Number(url.searchParams.get('duration')), fps: Number(url.searchParams.get('fps')) as ExportRequest['fps'],
            };
            const binary = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
            json(response, await library.exportVideo(exportRequest, (target) => encodeVideo(exportRequest, binary, target, () => undefined))); return;
          }
          if (request.method === 'POST' && parts[0] === 'reveal') {
            const id = url.searchParams.get('id') ?? undefined;
            const target = await library.revealPath(id, url.searchParams.get('video') ?? undefined);
            await reveal(target, !id); json(response, { success: true }); return;
          }
          json(response, { error: 'LIBRARY_ROUTE_NOT_FOUND' }, 404);
        })().catch((error: unknown) => {
          console.error('LOCAL_LIBRARY_REQUEST_FAILED', error);
          if (!response.headersSent) json(response, { error: error instanceof Error ? error.message : 'LIBRARY_FAILED' }, 400);
          else response.destroy(error instanceof Error ? error : undefined);
        });
      });
    },
  };
}
