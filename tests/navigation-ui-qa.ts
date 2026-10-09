import type { AppPage, AppTheme } from '../src/hooks';
import { t } from '../src/i18n';

export interface NavigationUIReport {
  independentLibrary: boolean;
  centralizedSettings: boolean;
  workspacePreserved: boolean;
  footerRemoved: boolean;
  lightTheme: boolean;
  darkTheme: boolean;
  modalSettings: boolean;
  compactDemo: boolean;
  workspaceCreationRemoved: boolean;
  configurableStorage: boolean;
  headerActionsRemoved: boolean;
  sidebarToolsAligned: boolean;
}

const UI_TIMING = { timeout: 10_000, poll: 50 } as const;

async function waitUntil(read: () => boolean): Promise<void> {
  const deadline = performance.now() + UI_TIMING.timeout;
  while (performance.now() < deadline) {
    if (read()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, UI_TIMING.poll));
  }
  throw new Error('QA_NAVIGATION_TIMEOUT');
}

function navigate(page: AppPage): void {
  const control = document.querySelector<HTMLButtonElement>(`.library-sidebar [data-page="${page}"]`);
  if (!control || control.disabled) throw new Error(`QA_NAVIGATION_UNAVAILABLE: ${page}`);
  control.click();
}

export async function navigatePageUI(page: AppPage): Promise<void> {
  navigate(page);
  await waitUntil(() => Boolean(document.querySelector(`.app-main[data-page="${page}"]`)));
}

export async function openSettingsUI(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('[data-action="open-settings"]');
  if (!button || button.disabled) throw new Error('QA_SETTINGS_BUTTON_UNAVAILABLE');
  button.focus();
  button.click();
  await waitUntil(() => Boolean(document.querySelector('.settings-dialog')));
  await waitUntil(() => Boolean(document.querySelector<HTMLInputElement>('#storage-projects')?.value));
}

export async function closeSettingsUI(): Promise<void> {
  const dialog = document.querySelector('.settings-dialog');
  const close = dialog?.querySelector<HTMLButtonElement>(`[aria-label="${t.editor.close}"]`);
  if (!close) throw new Error('QA_SETTINGS_CLOSE_MISSING');
  close.click();
  await waitUntil(() => !document.querySelector('.settings-dialog'));
}

async function editStorage(projectDirectory: string, exportDirectory: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('QA_INPUT_SETTER_MISSING');
  for (const [target, value] of [['projects', projectDirectory], ['exports', exportDirectory]]) {
    const control = document.querySelector<HTMLInputElement>(`#storage-${target}`);
    if (!control) throw new Error('QA_SETTINGS_PATH_MISSING');
    setter.call(control, value); control.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await waitUntil(() => document.querySelector<HTMLButtonElement>('[data-action="save-storage"]')?.disabled === false);
  document.querySelector<HTMLButtonElement>('[data-action="save-storage"]')?.click();
  await waitUntil(() => Boolean(document.querySelector('.settings-saved')));
  const storage = (await window.desktop?.listLibrary())?.storage;
  if (storage?.projectDirectory !== projectDirectory || storage.exportDirectory !== exportDirectory) throw new Error('QA_STORAGE_NOT_PERSISTED');
}

export async function setThemeUI(theme: AppTheme): Promise<void> {
  await openSettingsUI();
  const control = document.querySelector<HTMLInputElement>(`input[aria-label="${t.appearance[theme]}"]`);
  if (!control) throw new Error('QA_SETTINGS_THEME_MISSING');
  control.click();
  await waitUntil(() => document.documentElement.dataset.theme === theme && control.checked);
  await closeSettingsUI();
  navigate('workspace');
  await waitUntil(() => Boolean(document.querySelector('.preview-stage canvas')));
}

export async function runNavigationUIQA(): Promise<NavigationUIReport> {
  const sourceName = document.querySelector<HTMLInputElement>('.project-name')?.value;
  if (!sourceName || document.querySelector('.app-footer') || document.querySelector('.app-header [aria-label="浅色主题"]')) throw new Error('QA_WORKSPACE_CHROME_INVALID');
  if (Array.from(document.querySelectorAll('.app-header button')).some((button) => button.textContent?.includes(t.editor.newRecording) || button.textContent?.includes(t.editor.exportVideo))) throw new Error('QA_HEADER_ACTIONS_REMAIN');
  const settingsBox = document.querySelector('[data-action="open-settings"]')?.getBoundingClientRect();
  const helpBox = document.querySelector('[data-action="open-demo"]')?.getBoundingClientRect();
  if (!settingsBox || !helpBox || settingsBox.right >= helpBox.left || settingsBox.top !== helpBox.top || settingsBox.height !== helpBox.height) throw new Error('QA_SIDEBAR_TOOLS_NOT_ALIGNED');
  navigate('library');
  await waitUntil(() => Boolean(document.querySelector('.library-page')));
  const sidebar = document.querySelector('.library-sidebar');
  if (!sidebar || sidebar.querySelector('.library-tabs, .library-item, .library-search, .library-location') || document.querySelector('.preview-stage canvas')) throw new Error('QA_LIBRARY_NOT_INDEPENDENT');
  const route = window.location.hash;
  await openSettingsUI();
  const library = await window.desktop?.listLibrary();
  if (!library || document.querySelector<HTMLInputElement>('#storage-projects')?.value !== library.storage.projectDirectory || document.querySelector<HTMLInputElement>('#storage-exports')?.value !== library.storage.exportDirectory || document.querySelectorAll(`[aria-label="${t.appearance.light}"]`).length !== 1 || document.querySelectorAll(`[aria-label="${t.appearance.dark}"]`).length !== 1) throw new Error('QA_SETTINGS_NOT_CENTRALIZED');
  if (window.location.hash !== route || !document.querySelector('.library-page') || !document.querySelector<HTMLElement>('.app-main')?.inert) throw new Error('QA_SETTINGS_NOT_MODAL');
  const separator = library.root.includes('\\') ? '\\' : '/';
  const projects = `${library.root}${separator}custom-projects`;
  const exports = `${library.root}${separator}custom-exports`;
  await editStorage(projects, exports);
  await closeSettingsUI();
  await openSettingsUI();
  if (document.querySelector<HTMLInputElement>('#storage-projects')?.value !== projects) throw new Error('QA_STORAGE_DIALOG_FORGOT_PATH');
  await editStorage(library.storage.projectDirectory, library.storage.exportDirectory);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitUntil(() => !document.querySelector('.settings-dialog'));
  if (document.querySelector<HTMLElement>('.app-main')?.inert || document.activeElement !== document.querySelector('[data-action="open-settings"]')) throw new Error('QA_SETTINGS_FOCUS_NOT_RESTORED');
  const demo = document.querySelector<HTMLButtonElement>('[data-action="open-demo"]');
  if (!demo || demo.textContent?.trim() || !demo.getAttribute('aria-label') || demo.getBoundingClientRect().width > 45) throw new Error('QA_DEMO_NOT_COMPACT');
  if (Array.from(sidebar.querySelectorAll('button')).some((button) => button.textContent?.includes('新建工作区'))) throw new Error('QA_NEW_WORKSPACE_REMAINS');
  navigate('workspace');
  await waitUntil(() => document.querySelector<HTMLInputElement>('.project-name')?.value === sourceName && Boolean(document.querySelector('.preview-stage canvas')));
  return { independentLibrary: true, centralizedSettings: true, workspacePreserved: true, footerRemoved: true, lightTheme: document.documentElement.dataset.theme === 'light', darkTheme: document.documentElement.dataset.theme === 'dark', modalSettings: true, compactDemo: true, workspaceCreationRemoved: true, configurableStorage: true, headerActionsRemoved: true, sidebarToolsAligned: true };
}
