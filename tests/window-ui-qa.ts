import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { t } from '../src/i18n';

export interface WindowUIReport {
  frameless: boolean;
  dragRegions: boolean;
  maximize: boolean;
  restore: boolean;
  minimize: boolean;
  modalControls: boolean;
  themes: boolean;
  sourceIsolation: boolean;
  close: boolean;
  compactHeader: boolean;
  responsiveHeader: boolean;
}

const WINDOW_QA = { timeout: 8000, poll: 50, paintDelay: 300, headerHeight: 54, widths: [1480, 1080, 800] } as const;

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function waitFor(check: () => Promise<boolean> | boolean, message: string): Promise<void> {
  const deadline = Date.now() + WINDOW_QA.timeout;
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise<void>((resolve) => setTimeout(resolve, WINDOW_QA.poll));
  }
}

export async function runWindowUIQA(window: BrowserWindow, output: string): Promise<WindowUIReport> {
  const evaluate = <T>(source: string): Promise<T> => window.webContents.executeJavaScript(source) as Promise<T>;
  const click = async (selector: string): Promise<void> => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, WINDOW_QA.paintDelay));
  const titleMatches = (label: string): Promise<boolean> => evaluate(`document.querySelector('[data-window-action="maximize"]').getAttribute('aria-label') === ${JSON.stringify(label)}`);
  const content = window.getContentBounds();
  const bounds = window.getBounds();
  assert(bounds.width === content.width && bounds.height === content.height, 'WINDOW_QA_NATIVE_TITLEBAR_PRESENT');
  assert(await evaluate<boolean>(`getComputedStyle(document.querySelector('.app-header')).getPropertyValue('-webkit-app-region') === 'drag' && getComputedStyle(document.querySelector('.header-actions')).getPropertyValue('-webkit-app-region') === 'no-drag' && getComputedStyle(document.querySelector('.window-controls')).getPropertyValue('-webkit-app-region') === 'no-drag'`), 'WINDOW_QA_DRAG_REGIONS_INVALID');
  await click('.settings-dialog .modal-heading .icon-button');
  await waitFor(() => evaluate<boolean>(`!document.querySelector('.settings-dialog')`), 'WINDOW_QA_SETTINGS_NOT_CLOSED');
  for (const width of WINDOW_QA.widths) {
    window.setSize(width, bounds.height); await settle();
    assert(await evaluate<boolean>(`(() => {
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const brand = document.querySelector('.header-brand').getBoundingClientRect();
      const context = document.querySelector('.header-context').getBoundingClientRect();
      const actions = document.querySelector('.header-actions').getBoundingClientRect();
      const controls = document.querySelector('.window-controls').getBoundingClientRect();
      const sidebar = document.querySelector('.library-sidebar').getBoundingClientRect();
      return header.x === 0 && header.width === innerWidth && header.height === ${WINDOW_QA.headerHeight}
        && brand.width === sidebar.width && sidebar.top === header.bottom && context.right <= actions.left
        && actions.right < controls.left && controls.right <= innerWidth
        && Array.from(document.querySelectorAll('.window-control')).every(button => { const box = button.getBoundingClientRect(); return box.top >= 0 && box.bottom <= header.bottom; });
    })()`), `WINDOW_QA_HEADER_LAYOUT_${width}`);
  }
  window.setBounds(bounds); await settle();
  await click('[data-window-action="maximize"]');
  await waitFor(async () => window.isMaximized() && await titleMatches(t.window.restore), 'WINDOW_QA_MAXIMIZE_FAILED');
  await click('[data-window-action="maximize"]');
  await waitFor(async () => !window.isMaximized() && await titleMatches(t.window.maximize), 'WINDOW_QA_RESTORE_FAILED');
  await click('[data-window-action="minimize"]');
  await waitFor(() => window.isMinimized(), 'WINDOW_QA_MINIMIZE_FAILED');
  window.restore();
  await waitFor(() => !window.isMinimized(), 'WINDOW_QA_MINIMIZE_RESTORE_FAILED');
  const themes = ['light', 'dark'] as const;
  for (const theme of themes) {
    await click('[data-action="open-settings"]');
    await waitFor(() => evaluate<boolean>(`Boolean(document.querySelector('.settings-dialog'))`), 'WINDOW_QA_SETTINGS_MISSING');
    await click(`.settings-dialog input[aria-label="${t.appearance[theme]}"]`);
    await waitFor(() => evaluate<boolean>(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`), 'WINDOW_QA_THEME_FAILED');
    assert(await evaluate<boolean>(`!document.querySelector('.window-controls').closest('[inert]') && document.querySelector('.header-actions').inert && (() => { const button = document.querySelector('[data-window-action="minimize"]'); const box = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })()`), 'WINDOW_QA_MODAL_BLOCKS_CONTROLS');
    await click('[data-window-action="maximize"]');
    await waitFor(() => window.isMaximized(), 'WINDOW_QA_MODAL_MAXIMIZE_FAILED');
    await click('[data-window-action="maximize"]');
    await waitFor(() => !window.isMaximized(), 'WINDOW_QA_MODAL_RESTORE_FAILED');
    await click('.settings-dialog .modal-heading .icon-button');
    await settle();
    await writeFile(path.join(output, `titlebar-${theme}.png`), (await window.webContents.capturePage()).toPNG());
  }
  const untrusted = new BrowserWindow({ show: false, webPreferences: { preload: window.webContents.getLastWebPreferences().preload, contextIsolation: true, nodeIntegration: false } });
  try {
    await untrusted.loadURL('data:text/html,<title>Cursorama window QA</title>');
    const rejected = await untrusted.webContents.executeJavaScript(`(async () => { try { await window.desktop.getWindowState(); return false; } catch (error) { return error instanceof Error; } })()`) as boolean;
    assert(rejected, 'WINDOW_QA_UNTRUSTED_SOURCE_ACCEPTED');
  } finally { untrusted.destroy(); }
  const closed = new Promise<void>((resolve) => window.once('closed', resolve));
  await click('[data-window-action="close"]');
  await Promise.race([closed, new Promise<never>((_resolve, reject) => { const timeout = setTimeout(() => reject(new Error('WINDOW_QA_CLOSE_FAILED')), WINDOW_QA.timeout); timeout.unref(); })]);
  return { frameless: true, dragRegions: true, maximize: true, restore: true, minimize: true, modalControls: true, themes: true, sourceIsolation: true, close: true, compactHeader: true, responsiveHeader: true };
}
