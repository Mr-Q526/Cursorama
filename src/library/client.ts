import { LIBRARY_API, LIBRARY_MUTATION_HEADER, projectBytes, readProjectBytes } from '../../shared';
import type { ExportRequest, ExportResult, LibrarySnapshot, ProjectData, StorageSettings, StorageTarget, StoredProject } from '../../shared';

export interface LibraryVideoSource { url: string; revoke: boolean; }
export const hasLocalLibrary = typeof window !== 'undefined' && (Boolean(window.desktop) || import.meta.env?.DEV === true);

async function request(route: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(`${LIBRARY_API}/${route}`, {
    ...options, headers: { ...(options?.method === 'POST' ? { [LIBRARY_MUTATION_HEADER]: '1' } : {}), ...options?.headers },
  });
  if (!response.ok) throw new Error(`LIBRARY_REQUEST_FAILED_${response.status}`);
  return response;
}

export async function listLibrary(): Promise<LibrarySnapshot> {
  if (window.desktop) return window.desktop.listLibrary();
  return await (await request('list')).json() as LibrarySnapshot;
}

export async function configureLibrary(settings: StorageSettings): Promise<LibrarySnapshot> {
  if (window.desktop) return window.desktop.configureLibrary(settings);
  return await (await request('configure', { method: 'POST', body: JSON.stringify(settings), headers: { 'Content-Type': 'application/json' } })).json() as LibrarySnapshot;
}

export async function chooseLibraryDirectory(target: StorageTarget): Promise<string | null> {
  return window.desktop ? window.desktop.chooseLibraryDirectory(target) : null;
}

export async function revealStorageDirectory(target: StorageTarget): Promise<void> {
  if (window.desktop) return window.desktop.revealStorageDirectory(target);
  await request(`directory?target=${encodeURIComponent(target)}`, { method: 'POST' });
}

export async function saveLibraryProject(data: ProjectData, bytes?: ArrayBuffer, projectId?: string): Promise<ExportResult> {
  if (window.desktop) return window.desktop.saveProject(data, bytes, projectId);
  const query = projectId ? `?id=${encodeURIComponent(projectId)}` : '';
  const response = await request(`save${query}`, { method: 'POST', body: projectBytes(data, bytes).buffer as ArrayBuffer, headers: { 'Content-Type': 'application/octet-stream' } });
  return await response.json() as ExportResult;
}

export async function openLibraryProject(projectId: string): Promise<StoredProject> {
  if (window.desktop) return window.desktop.openLibraryProject(projectId);
  return readProjectBytes(new Uint8Array(await (await request(`project/${encodeURIComponent(projectId)}`)).arrayBuffer()));
}

export async function openLibraryVideo(projectId: string, videoId: string, format: 'mp4' | 'webm'): Promise<LibraryVideoSource> {
  if (window.desktop) {
    const bytes = await window.desktop.openLibraryVideo(projectId, videoId);
    return { url: URL.createObjectURL(new Blob([bytes], { type: `video/${format}` })), revoke: true };
  }
  const route = `video/${encodeURIComponent(projectId)}/${encodeURIComponent(videoId)}`;
  await request(route, { method: 'HEAD' });
  return { url: `${LIBRARY_API}/${route}`, revoke: false };
}

export async function getLibraryCover(projectId: string, videoId?: string): Promise<string | null> {
  if (window.desktop) return window.desktop.getLibraryCover(projectId, videoId);
  const query = new URLSearchParams({ id: projectId });
  if (videoId) query.set('video', videoId);
  const value = await (await request(`cover?${query}`)).json() as { cover: string | null };
  return value.cover;
}

export async function exportLibraryVideo(value: ExportRequest): Promise<ExportResult> {
  if (window.desktop) return window.desktop.exportVideo(value);
  const query = new URLSearchParams({ id: value.projectId ?? '', name: value.name, format: value.format, quality: value.quality, duration: String(value.duration), fps: String(value.fps) });
  const response = await request(`export?${query}`, { method: 'POST', body: value.bytes, headers: { 'Content-Type': value.mimeType } });
  return await response.json() as ExportResult;
}

export async function revealLibrary(projectId?: string, videoId?: string): Promise<void> {
  if (window.desktop) return window.desktop.revealLibrary(projectId, videoId);
  const query = new URLSearchParams();
  if (projectId) query.set('id', projectId);
  if (videoId) query.set('video', videoId);
  await request(`reveal?${query}`, { method: 'POST' });
}
