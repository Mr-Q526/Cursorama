/** 仅在本机提供宣传片预览，支持视频按区间读取和拖动播放。 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = path.resolve(PROJECT_ROOT, process.argv[2] ?? 'exports/promo');
const HTTP = { host: '127.0.0.1', port: 5189, ok: 200, partial: 206, missing: 404, invalid: 416, headerLimit: 10_000 };
const MIME = new Map([['.html', 'text/html; charset=utf-8'], ['.mp4', 'video/mp4'], ['.png', 'image/png'], ['.wav', 'audio/wav'], ['.md', 'text/plain; charset=utf-8']]);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${HTTP.host}:${HTTP.port}`).pathname);
    const file = path.resolve(ROOT, pathname === '/' ? '预览.html' : `.${pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(HTTP.missing); response.end(); return; }
    const metadata = await stat(file);
    if (!metadata.isFile()) { response.writeHead(HTTP.missing); response.end(); return; }
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), metadata.size - 1) : metadata.size - 1;
    if (start >= metadata.size || start > end) { response.writeHead(HTTP.invalid, { 'Content-Range': `bytes */${metadata.size}` }); response.end(); return; }
    const headers = { 'Content-Type': MIME.get(path.extname(file)) ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${metadata.size}` } : {}) };
    response.writeHead(range ? HTTP.partial : HTTP.ok, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file, { start, end }); stream.on('error', (error) => { console.error('PROMO_PREVIEW_STREAM_FAILED', error); response.destroy(); }); stream.pipe(response);
  } catch (error) { console.error('PROMO_PREVIEW_REQUEST_FAILED', error); if (!response.headersSent) response.writeHead(HTTP.missing); response.end(); }
});
server.listen(HTTP.port, HTTP.host, () => console.info(`宣传片预览：http://${HTTP.host}:${HTTP.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
