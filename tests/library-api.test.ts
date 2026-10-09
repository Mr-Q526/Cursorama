import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { DEFAULT_SETTINGS, LIBRARY_API, LIBRARY_MUTATION_HEADER, projectBytes, readProjectBytes } from '../shared';
import type { ExportResult, LibrarySnapshot, ProjectData } from '../shared';
import { localLibraryPlugin } from '../storage/dev-server';

const metadata: ProjectData = { schemaVersion: 1, name: '本地服务验证', duration: 3, width: 1920, height: 1080, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: 3, sourceType: 'video', hasAudio: false, cursorEmbedded: true };
const media = Uint8Array.from([10, 20, 30, 40]).buffer;
let temporary = '';
let server: ViteDevServer;
let base = '';

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-api-test-'));
  server = await createServer({ configFile: false, root: temporary, plugins: [localLibraryPlugin({ root: path.join(temporary, 'library') })], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true }, logLevel: 'silent' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_UNAVAILABLE');
  base = `http://127.0.0.1:${address.port}${LIBRARY_API}`;
});
afterAll(async () => {
  await server?.close();
  if (!path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(temporary).startsWith('cursorama-api-test-')) throw new Error('INVALID_TEST_DIRECTORY');
  await rm(temporary, { recursive: true, force: true });
});

describe('浏览器本地存储接口', () => {
  it('浏览器保存的工程确实落盘，并且可以完整读取', async () => {
    const response = await fetch(`${base}/save`, { method: 'POST', headers: { [LIBRARY_MUTATION_HEADER]: '1' }, body: projectBytes(metadata, media).buffer as ArrayBuffer });
    expect(response.status).toBe(200);
    const result = await response.json() as ExportResult;
    const downloaded = await fetch(`${base}/project/${result.projectId}`);
    const restored = readProjectBytes(new Uint8Array(await downloaded.arrayBuffer()));
    expect(restored.data).toEqual(metadata);
    expect(new Uint8Array(restored.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(media));
    const snapshot = await (await fetch(`${base}/list`)).json() as LibrarySnapshot;
    expect(snapshot.projects[0].id).toBe(result.projectId);
    expect(snapshot.projects[0].path).toBe(result.path);
  });

  it('成片支持浏览器分段读取和拖动进度，拒绝无效范围', async () => {
    const snapshot = await (await fetch(`${base}/list`)).json() as LibrarySnapshot;
    const project = snapshot.projects[0];
    const directory = path.join(path.dirname(project.path), 'exports');
    await mkdir(directory);
    const id = randomUUID();
    await writeFile(path.join(directory, `${id}.mp4`), new Uint8Array(media));
    const response = await fetch(`${base}/video/${project.id}/${id}`, { headers: { Range: 'bytes=1-2' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-2/4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([20, 30]));
    expect((await fetch(`${base}/video/${project.id}/${id}`, { headers: { Range: 'bytes=9-' } })).status).toBe(416);
    const head = await fetch(`${base}/video/${project.id}/${id}`, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe('4');
  });

  it('拒绝来自其他网页的写入以及缺少本地请求标记的写入', async () => {
    const payload = projectBytes(metadata, media).buffer as ArrayBuffer;
    expect((await fetch(`${base}/save`, { method: 'POST', body: payload })).status).toBe(403);
    expect((await fetch(`${base}/save`, { method: 'POST', body: payload, headers: { [LIBRARY_MUTATION_HEADER]: '1', Origin: 'https://outside.example' } })).status).toBe(403);
    expect((await fetch(`${base}/list`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    expect((await (await fetch(`${base}/list`)).json() as LibrarySnapshot).projects).toHaveLength(1);
  });

  it('浏览器设置真实修改工程位置，并拒绝跨站或无效目录配置', async () => {
    const settings = { projectDirectory: path.join(temporary, 'browser-projects'), exportDirectory: path.join(temporary, 'browser-exports') };
    const headers = { [LIBRARY_MUTATION_HEADER]: '1', 'Content-Type': 'application/json' };
    expect((await fetch(`${base}/configure`, { method: 'POST', body: JSON.stringify(settings) })).status).toBe(403);
    expect((await fetch(`${base}/configure`, { method: 'POST', headers: { ...headers, Origin: 'https://outside.example' }, body: JSON.stringify(settings) })).status).toBe(403);
    const response = await fetch(`${base}/configure`, { method: 'POST', headers, body: JSON.stringify(settings) });
    expect(response.status).toBe(200);
    expect((await response.json() as LibrarySnapshot).storage).toEqual(settings);
    const saved = await (await fetch(`${base}/save`, { method: 'POST', headers, body: projectBytes(metadata, media).buffer as ArrayBuffer })).json() as ExportResult;
    expect(path.dirname(path.dirname(saved.path ?? ''))).toBe(settings.projectDirectory);
    expect((await fetch(`${base}/configure`, { method: 'POST', headers, body: JSON.stringify({ ...settings, exportDirectory: 'relative' }) })).status).toBe(400);
    expect((await (await fetch(`${base}/list`)).json() as LibrarySnapshot).storage).toEqual(settings);
  });
});
