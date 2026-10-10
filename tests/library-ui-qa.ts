import type { LibraryProject } from '../shared';
import { t } from '../src/i18n';
import { runRecordingCancellationUI } from './recording-ui-qa';

export interface LibraryUIReport { projectId: string; name: string; projectPath: string; videoId: string; videoPath: string; automaticSave: boolean; videoWidth: number; videoHeight: number; projectCover: boolean; videoCover: boolean; previewReturnsToLibrary: boolean; previewOpensProject: boolean; recordingCancelPreservesPreview: boolean; librarySearchPreserved: boolean; previewHistoryRestored: boolean; }
const UI_QA = { pollInterval: 50, timeout: 30_000, projectName: '本地项目库恢复验证', resolution: '720p', glassStrength: 73 } as const;

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
  const glass = document.querySelector<HTMLInputElement>(`input[aria-label="${t.frame.edgeGlass}"]`);
  if (!glass) throw new Error('QA_GLASS_SETTING_MISSING');
  setter.call(glass, String(UI_QA.glassStrength)); glass.dispatchEvent(new Event('input', { bubbles: true }));
  const saved = await waitUntil(async () => {
    const project = (await desktop.listLibrary()).projects.find((item) => item.id === id);
    if (project?.name !== UI_QA.projectName || document.querySelector('.save-status')?.textContent !== t.library.saved) return undefined;
    const settings = (await desktop.openLibraryProject(id)).data.settings;
    return settings.background === 'bloom' && settings.edgeGlass === UI_QA.glassStrength ? project : undefined;
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
  await waitUntil(() => {
    const cover = document.querySelector<HTMLImageElement>(`[data-project-id="${id}"] .library-cover img`);
    return cover?.complete && cover.naturalWidth > 0 ? true : undefined;
  });
  const videoTab = document.querySelectorAll<HTMLButtonElement>('.library-tabs button')[1];
  if (!videoTab) throw new Error('QA_LIBRARY_VIDEO_FILTER_MISSING');
  videoTab.click();
  const search = document.querySelector<HTMLInputElement>('.library-search input');
  if (!search) throw new Error('QA_LIBRARY_SEARCH_MISSING');
  setter.call(search, UI_QA.projectName); search.dispatchEvent(new Event('input', { bubbles: true }));
  await waitUntil(() => {
    const cover = document.querySelector<HTMLImageElement>(`.library-card-open[data-video-id="${video.id}"] .library-cover img`);
    return cover?.complete && cover.naturalWidth > 0 ? true : undefined;
  });
  const item = await waitUntil(() => document.querySelector<HTMLButtonElement>(`[data-video-id="${video.id}"]`) ?? undefined);
  item.click();
  const preview = await waitUntil(() => {
    const value = document.querySelector<HTMLVideoElement>('.export-preview-stage video');
    return value && value.readyState >= HTMLMediaElement.HAVE_METADATA ? value : undefined;
  });
  if (!preview.videoWidth || !preview.videoHeight || !Number.isFinite(preview.duration)) throw new Error('QA_LIBRARY_VIDEO_UNPLAYABLE');
  const report: LibraryUIReport = { projectId: id, name: UI_QA.projectName, projectPath: saved.path, videoId: video.id, videoPath: video.path, automaticSave: true, videoWidth: preview.videoWidth, videoHeight: preview.videoHeight, projectCover: true, videoCover: true, previewReturnsToLibrary: true, previewOpensProject: true, recordingCancelPreservesPreview: true, librarySearchPreserved: true, previewHistoryRestored: true };
  if (!document.querySelector('.app-main[data-page="preview"] .export-preview') || document.querySelector('.project-bar, .preview-stage canvas')) throw new Error('QA_LIBRARY_PREVIEW_NOT_INDEPENDENT');
  await runRecordingCancellationUI();
  button(t.navigation.editor, document.querySelector<HTMLElement>('.export-preview') ?? document).click();
  await waitUntil(() => document.querySelector<HTMLElement>('.app-main[data-page="workspace"] .project-bar')?.dataset.projectId === id && document.querySelector<HTMLInputElement>('.project-name')?.value === UI_QA.projectName && !document.querySelector('.processing-overlay, .export-preview') ? true : undefined);
  button(t.navigation.library).click();
  await waitUntil(() => document.querySelector('.library-page') ? true : undefined);
  const retainedVideoTab = document.querySelectorAll<HTMLButtonElement>('.library-tabs button')[1];
  if (retainedVideoTab?.getAttribute('aria-pressed') !== 'true' || document.querySelector<HTMLInputElement>('.library-search input')?.value !== UI_QA.projectName) throw new Error('QA_LIBRARY_VIDEO_FILTER_NOT_PRESERVED');
  const reopenedVideo = await waitUntil(() => document.querySelector<HTMLButtonElement>(`.library-card-open[data-video-id="${video.id}"]`) ?? undefined);
  reopenedVideo.click();
  await waitUntil(() => document.querySelector('.app-main[data-page="preview"] .export-preview-stage video') && !document.querySelector('.processing-overlay') ? true : undefined);
  button(t.library.closeVideo).click();
  await waitUntil(() => document.querySelector('.app-main[data-page="library"] .library-page') && !document.querySelector('.export-preview, .project-bar, .preview-stage canvas') ? true : undefined);
  if (window.location.hash !== '#/library' || document.querySelectorAll<HTMLButtonElement>('.library-tabs button')[1]?.getAttribute('aria-pressed') !== 'true' || document.querySelector<HTMLInputElement>('.library-search input')?.value !== UI_QA.projectName) throw new Error('QA_LIBRARY_PREVIEW_RETURN_LOST_CONTEXT');
  window.history.back();
  const historyPreview = await waitUntil(() => {
    const restored = document.querySelector<HTMLVideoElement>('.app-main[data-page="preview"] .export-preview-stage video');
    return window.location.hash === '#/preview' && restored && restored.readyState >= HTMLMediaElement.HAVE_METADATA && !document.querySelector('.processing-overlay') ? restored : undefined;
  });
  if (document.querySelector('.export-preview-heading h1')?.textContent !== video.name || document.querySelector('.export-preview-path')?.textContent !== video.path || document.querySelector('.project-bar, .preview-stage canvas')) throw new Error('QA_LIBRARY_HISTORY_RESTORED_WRONG_VIDEO');
  if (historyPreview.error || historyPreview.videoWidth !== report.videoWidth || historyPreview.videoHeight !== report.videoHeight || !Number.isFinite(historyPreview.duration) || historyPreview.duration <= 0 || !historyPreview.controls) throw new Error('QA_LIBRARY_HISTORY_VIDEO_UNPLAYABLE');
  window.history.forward();
  await waitUntil(() => document.querySelector('.app-main[data-page="library"] .library-page') && !document.querySelector('.export-preview, .project-bar, .preview-stage canvas') ? true : undefined);
  if (window.location.hash !== '#/library' || document.querySelectorAll<HTMLButtonElement>('.library-tabs button')[1]?.getAttribute('aria-pressed') !== 'true' || document.querySelector<HTMLInputElement>('.library-search input')?.value !== UI_QA.projectName || !document.querySelector<HTMLButtonElement>(`.library-card-open[data-video-id="${video.id}"]`)) throw new Error('QA_LIBRARY_HISTORY_FORWARD_LOST_CONTEXT');
  const projectTab = document.querySelector<HTMLButtonElement>('.library-tabs button');
  if (!projectTab) throw new Error('QA_LIBRARY_PROJECT_FILTER_MISSING');
  projectTab.click();
  await waitUntil(() => document.querySelector<HTMLButtonElement>(`.library-card-open[data-project-id="${id}"]`) ?? undefined);
  const projectSearch = document.querySelector<HTMLInputElement>('.library-search input');
  if (!projectSearch) throw new Error('QA_LIBRARY_SEARCH_MISSING');
  setter.call(projectSearch, ''); projectSearch.dispatchEvent(new Event('input', { bubbles: true }));
  await waitUntil(() => projectSearch.value === '' ? true : undefined);
  const demo = document.querySelector<HTMLButtonElement>('[data-action="open-demo"]');
  if (!demo || demo.disabled) throw new Error('QA_DEMO_HELP_MISSING');
  demo.click();
  await waitUntil(() => document.querySelector('[data-action="close-demo"]') ? true : undefined);
  button(t.navigation.library).click();
  await waitUntil(() => document.querySelector('.library-page') ? true : undefined);
  const projects = document.querySelector<HTMLButtonElement>('.library-tabs button');
  if (!projects) throw new Error('QA_LIBRARY_PROJECT_FILTER_MISSING');
  projects.click();
  const projectButton = await waitUntil(() => document.querySelector<HTMLButtonElement>(`.library-card-open[data-project-id="${id}"]`) ?? undefined);
  if (!projectButton) throw new Error('QA_LIBRARY_PROJECT_NOT_LISTED');
  projectButton.click();
  await waitUntil(() => document.querySelector<HTMLInputElement>('.project-name')?.value === UI_QA.projectName && document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId === id && !document.querySelector('.processing-overlay') ? true : undefined);
  const restored = await desktop.openLibraryProject(id);
  if (restored.bytes?.byteLength !== recorded.bytes.byteLength || restored.data.width !== recorded.data.width) throw new Error('QA_LIBRARY_RESTORE_CHANGED_SOURCE');
  if (restored.data.settings.background !== 'bloom') throw new Error('QA_LIBRARY_RESTORE_LOST_WALLPAPER');
  if (restored.data.settings.edgeGlass !== UI_QA.glassStrength) throw new Error('QA_LIBRARY_RESTORE_LOST_GLASS');
  return report;
}

export async function restoreLibraryUIQA(id: string): Promise<LibraryProject> {
  const desktop = window.desktop;
  if (!desktop) throw new Error('QA_LIBRARY_DESKTOP_REQUIRED');
  await waitUntil(() => document.querySelector('.app-main[data-page="library"] .library-page') && !document.querySelector('.preview-stage canvas, .project-bar, .export-preview') ? true : undefined);
  if (window.location.hash !== '#/library') throw new Error('QA_DEFAULT_LIBRARY_ROUTE_MISSING');
  const projects = document.querySelector<HTMLButtonElement>('.library-tabs button');
  if (!projects) throw new Error('QA_LIBRARY_PROJECT_FILTER_MISSING');
  projects.click();
  const projectButton = await waitUntil(() => document.querySelector<HTMLButtonElement>(`.library-page [data-project-id="${id}"]`) ?? undefined);
  projectButton.click();
  await waitUntil(() => document.querySelector<HTMLInputElement>('.project-name')?.value === UI_QA.projectName && !document.querySelector('.processing-overlay') ? true : undefined);
  const project = (await desktop.listLibrary()).projects.find((item) => item.id === id);
  if (!project || !project.videos.length) throw new Error('QA_LIBRARY_RESTART_LOST_FILES');
  return project;
}
