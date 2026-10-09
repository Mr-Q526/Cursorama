import type { LibraryProject } from '../shared';
import { t } from '../src/i18n';

export interface LibraryUIReport { projectId: string; name: string; projectPath: string; videoId: string; videoPath: string; automaticSave: boolean; videoWidth: number; videoHeight: number; }
const UI_QA = { pollInterval: 50, timeout: 30_000, projectName: '本地项目库恢复验证', resolution: '720p' } as const;

async function waitUntil<T>(read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + UI_QA.timeout;
  while (performance.now() < deadline) {
    const result = await read(); if (result !== undefined) return result;
    await new Promise<void>((resolve) => setTimeout(resolve, UI_QA.pollInterval));
  }
  throw new Error(`QA_LIBRARY_UI_TIMEOUT: ${document.querySelector('.save-status')?.textContent}; ${document.querySelector('.toast')?.textContent}; ${document.querySelector('[role="dialog"]')?.textContent?.slice(-400)}`);
}

function button(label: string, root: Document | HTMLElement = document): HTMLButtonElement {
  const result = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
  if (!result || result.disabled) throw new Error(`QA_LIBRARY_BUTTON_UNAVAILABLE: ${label}`);
  return result;
}

export async function runLibraryUIQA(): Promise<LibraryUIReport> {
  const desktop = window.desktop;
  if (!desktop) throw new Error('QA_LIBRARY_DESKTOP_REQUIRED');
  const current = document.querySelector<HTMLElement>('.project-bar');
  const id = current?.dataset.projectId;
  const input = document.querySelector<HTMLInputElement>('.project-name');
  if (!id || !input) throw new Error('QA_RECORDING_NOT_AUTOSAVED');
  const recorded = await desktop.openLibraryProject(id);
  if (!recorded.bytes?.byteLength || recorded.data.sourceType !== 'video') throw new Error('QA_RECORDING_NOT_PERSISTED');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('QA_INPUT_SETTER_MISSING');
  setter.call(input, UI_QA.projectName); input.dispatchEvent(new Event('input', { bubbles: true }));
  button(t.editor.background).click();
  await waitUntil(() => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.getAttribute('aria-label') === t.background.labels.bloom));
  button(t.background.labels.bloom).click();
  const saved = await waitUntil(async () => {
    const project = (await desktop.listLibrary()).projects.find((item) => item.id === id);
    if (project?.name !== UI_QA.projectName || document.querySelector('.save-status')?.textContent !== t.library.saved) return undefined;
    return (await desktop.openLibraryProject(id)).data.settings.background === 'bloom' ? project : undefined;
  });
  button(t.editor.exportVideo).click();
  const dialog = await waitUntil(() => document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined);
  const resolution = Array.from(dialog.querySelectorAll<HTMLSelectElement>('select')).find((item) => item.closest('label')?.textContent?.startsWith(t.export.resolution));
  if (!resolution) throw new Error('QA_EXPORT_RESOLUTION_MISSING');
  resolution.value = UI_QA.resolution; resolution.dispatchEvent(new Event('change', { bubbles: true }));
  button(t.export.export, dialog).click();
  await waitUntil(() => {
    const error = document.querySelector('.error-message');
    if (error) throw new Error(`QA_LIBRARY_EXPORT_FAILED: ${error.textContent}`);
    return document.querySelector('.export-success') ? true : undefined;
  });
  const exported = (await desktop.listLibrary()).projects.find((item) => item.id === id);
  const video = exported?.videos[0];
  if (!video || video.format !== 'mp4') throw new Error('QA_EXPORT_NOT_IN_LIBRARY');
  button(t.export.close, dialog).click();
  button(t.navigation.library).click();
  await waitUntil(() => document.querySelector('.library-page') ? true : undefined);
  const item = await waitUntil(() => document.querySelector<HTMLButtonElement>(`[data-video-id="${video.id}"]`) ?? undefined);
  item.click();
  const preview = await waitUntil(() => {
    const value = document.querySelector<HTMLVideoElement>('.export-preview-stage video');
    return value && value.readyState >= HTMLMediaElement.HAVE_METADATA ? value : undefined;
  });
  if (!preview.videoWidth || !preview.videoHeight || !Number.isFinite(preview.duration)) throw new Error('QA_LIBRARY_VIDEO_UNPLAYABLE');
  const report: LibraryUIReport = { projectId: id, name: UI_QA.projectName, projectPath: saved.path, videoId: video.id, videoPath: video.path, automaticSave: true, videoWidth: preview.videoWidth, videoHeight: preview.videoHeight };
  button(t.library.closeVideo).click();
  const demo = document.querySelector<HTMLButtonElement>('[data-action="open-demo"]');
  if (!demo || demo.disabled) throw new Error('QA_DEMO_HELP_MISSING');
  demo.click();
  await waitUntil(() => document.querySelector('[data-action="close-demo"]') ? true : undefined);
  button(t.navigation.library).click();
  await waitUntil(() => document.querySelector('.library-page') ? true : undefined);
  const projectButton = document.querySelector<HTMLButtonElement>(`[data-project-id="${id}"]`);
  if (!projectButton) throw new Error('QA_LIBRARY_PROJECT_NOT_LISTED');
  projectButton.click();
  await waitUntil(() => document.querySelector<HTMLInputElement>('.project-name')?.value === UI_QA.projectName && !document.querySelector('.processing-overlay') ? true : undefined);
  const restored = await desktop.openLibraryProject(id);
  if (restored.bytes?.byteLength !== recorded.bytes.byteLength || restored.data.width !== recorded.data.width) throw new Error('QA_LIBRARY_RESTORE_CHANGED_SOURCE');
  if (restored.data.settings.background !== 'bloom') throw new Error('QA_LIBRARY_RESTORE_LOST_WALLPAPER');
  return report;
}

export async function restoreLibraryUIQA(id: string): Promise<LibraryProject> {
  const desktop = window.desktop;
  if (!desktop || !document.querySelector('.empty-workspace') || document.querySelector('.preview-stage canvas')) throw new Error('QA_DEFAULT_DEMO_VISIBLE');
  button(t.navigation.library).click();
  const projectButton = await waitUntil(() => document.querySelector<HTMLButtonElement>(`.library-page [data-project-id="${id}"]`) ?? undefined);
  projectButton.click();
  await waitUntil(() => document.querySelector<HTMLInputElement>('.project-name')?.value === UI_QA.projectName && !document.querySelector('.processing-overlay') ? true : undefined);
  const project = (await desktop.listLibrary()).projects.find((item) => item.id === id);
  if (!project || !project.videos.length) throw new Error('QA_LIBRARY_RESTART_LOST_FILES');
  return project;
}
