import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { ABOUT_LINKS, type AboutLink, type UpdateState } from '../shared';
import { t } from '../src/i18n';

export interface SettingsUIReport {
  categorized: boolean; keyboardNavigation: boolean; draftPreserved: boolean;
  noticeOpensAbout: boolean; readableNotes: boolean; safeNotes: boolean;
  downloadProgress: boolean; readyToInstall: boolean; retryDownload: boolean;
  manualCheck: boolean; automaticPreference: boolean; fixedFooter: boolean; themes: boolean;
  aboutLinks: boolean; supportCodes: boolean;
}
export interface SettingsUIFixture {
  currentVersion: string;
  notes: string;
  setState: (state: Partial<UpdateState>) => void;
  resourceRequests: () => number;
  openedLinks: () => AboutLink[];
}

const QA = { timeout: 8000, poll: 50, paint: 250, progress: 9, progressed: 86, maximumProgress: 100, sizes: [[1480, 960], [1024, 768], [800, 600]] } as const;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export async function runSettingsUIQA(window: BrowserWindow, output: string, fixture: SettingsUIFixture): Promise<SettingsUIReport> {
  const evaluate = <T>(source: string): Promise<T> => window.webContents.executeJavaScript(source) as Promise<T>;
  const wait = async (source: string | (() => boolean)): Promise<void> => {
    const deadline = Date.now() + QA.timeout;
    while (!(typeof source === 'string' ? await evaluate<boolean>(source) : source())) {
      if (Date.now() > deadline) throw new Error(`QA_SETTINGS_WAIT_FAILED: ${source}`);
      await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
    }
  };
  const click = (selector: string): Promise<void> => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const select = async (page: string): Promise<void> => {
    await click(`[data-settings-page="${page}"]`);
    await wait(`Boolean(document.querySelector('#settings-panel-${page}'))`);
  };
  const capture = async (name: string): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, QA.paint));
    await writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  const setPath = (value: string): Promise<void> => evaluate(`(() => {
    const input = document.querySelector('#storage-projects');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await wait(`Boolean(document.querySelector('.update-notice .text-button'))`);
  await click('.update-notice .text-button');
  await wait(`Boolean(document.querySelector('#settings-panel-about'))`);
  assert(await evaluate<boolean>(`document.querySelectorAll('.settings-navigation [role="tab"]').length === 3 && document.querySelectorAll('.settings-content [role="tabpanel"]').length === 1 && document.querySelector('[data-settings-page="about"]').getAttribute('aria-selected') === 'true' && !document.querySelector('[data-settings-page="updates"]')`), 'QA_SETTINGS_NOT_CATEGORIZED');
  for (const target of Object.keys(ABOUT_LINKS) as AboutLink[]) {
    await click(`[data-about-link="${target}"]`);
    await wait(() => fixture.openedLinks().includes(target));
  }
  assert(!await evaluate<boolean>(`Boolean(document.querySelector('#about-support'))`), 'QA_SUPPORT_EXPANDED_BY_DEFAULT');
  await click('[data-action="show-support"]');
  await wait(`document.querySelectorAll('.support-code img').length === 2 && Array.from(document.querySelectorAll('.support-code img')).every(image => image.complete && image.naturalWidth > 1000)`);
  assert(await evaluate<boolean>(`document.querySelector('[data-action="show-support"]').getAttribute('aria-expanded') === 'true' && document.querySelector('#about-support').contains(document.activeElement) && Array.from(document.querySelectorAll('.support-code img')).every(image => new URL(image.src).protocol === 'file:' && image.alt)`), 'QA_SUPPORT_CODES_NOT_LOCAL_OR_ACCESSIBLE');
  await capture('settings-about-support-dark.png');
  await click(`[aria-label="${t.about.closeSupport}"]`);
  assert(await evaluate<boolean>(`!document.querySelector('#about-support') && document.activeElement?.getAttribute('data-action') === 'show-support'`), 'QA_SUPPORT_FOCUS_NOT_RESTORED');
  assert(await evaluate<boolean>(`!document.querySelector('.update-notes').open`), 'QA_UPDATE_NOTES_EXPANDED_BY_DEFAULT');
  await click('.update-notes summary');
  assert(await evaluate<boolean>(`(() => {
    const notes = document.querySelector('.release-notes');
    return notes.querySelector('h3') && notes.querySelectorAll('li').length === 2 && notes.querySelector('strong') && notes.querySelector('code') && notes.textContent.includes('剪辑与字幕') && !notes.textContent.includes('<p>') && !notes.textContent.includes('&amp;');
  })()`), 'QA_UPDATE_NOTES_NOT_READABLE');
  assert(await evaluate<boolean>(`!document.querySelector('.release-notes img, .release-notes script, .release-notes iframe, .release-notes a, .release-notes [onclick]') && !window.cursoramaNotesExecuted`), 'QA_UPDATE_NOTES_UNSAFE');
  assert(fixture.resourceRequests() === 0, 'QA_UPDATE_NOTES_FETCHED_REMOTE_RESOURCE');
  await evaluate(`document.querySelector('.update-notes').scrollIntoView({block:'end'})`);
  await capture('settings-updates-notes.png');
  await click('.update-notes summary');
  await select('appearance');
  for (const [key, page] of [['ArrowDown', 'storage'], ['ArrowDown', 'about'], ['Home', 'appearance'], ['End', 'about']]) {
    await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(key)}, bubbles:true}))`);
    await wait(`document.activeElement?.getAttribute('data-settings-page') === ${JSON.stringify(page)} && Boolean(document.querySelector('#settings-panel-${page}'))`);
  }
  await select('storage');
  await wait(`Boolean(document.querySelector('#storage-projects').value)`);
  const initialPath = await evaluate<string>(`document.querySelector('#storage-projects').value`);
  const changedPath = path.join(initialPath, 'draft');
  await setPath(changedPath);
  await wait(`Boolean(document.querySelector('.settings-pending-dot'))`);
  await select('about');
  await select('storage');
  assert(await evaluate<boolean>(`document.querySelector('#storage-projects').value === ${JSON.stringify(changedPath)} && !document.querySelector('[data-action="save-storage"]').disabled`), 'QA_SETTINGS_DRAFT_LOST');
  await setPath(initialPath);
  await wait(`!document.querySelector('.settings-pending-dot')`);
  await capture('settings-storage.png');
  for (const theme of ['light', 'dark'] as const) {
    await select('appearance');
    await click(`input[aria-label="${t.appearance[theme]}"]`);
    await wait(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
    await capture(`settings-appearance-${theme}.png`);
    await select('about');
    await capture(`settings-updates-${theme}.png`);
    await click('[data-action="show-support"]');
    await capture(`settings-about-support-${theme}.png`);
    await click(`[aria-label="${t.about.closeSupport}"]`);
  }
  await click('[data-action="download-update"]');
  await wait(`Boolean(document.querySelector('[data-update-status="downloading"]'))`);
  assert(await evaluate<boolean>(`document.querySelector('.update-progress progress').value === ${QA.progress} && !document.querySelector('[data-action="download-update"]') && !document.querySelector('[data-action="check-updates"]')`), 'QA_UPDATE_DOWNLOAD_STATE_INVALID');
  await select('appearance'); await select('about');
  assert(await evaluate<boolean>(`Boolean(document.querySelector('[data-update-status="downloading"]'))`), 'QA_UPDATE_DOWNLOAD_LOST_ON_TAB_SWITCH');
  fixture.setState({ progress: QA.progressed });
  await wait(`document.querySelector('.update-progress progress').value === ${QA.progressed}`);
  await capture('settings-updates-downloading.png');
  fixture.setState({ status: 'downloaded', downloaded: true, progress: QA.maximumProgress, error: null });
  await wait(`Boolean(document.querySelector('[data-update-status="downloaded"]'))`);
  assert(await evaluate<boolean>(`!document.querySelector('[data-action="install-update"]').disabled && !document.querySelector('[data-action="download-update"]') && !document.querySelector('[data-action="check-updates"]')`), 'QA_UPDATE_INSTALL_STATE_INVALID');
  await capture('settings-updates-downloaded.png');
  fixture.setState({ status: 'error', downloaded: false, error: 'download' });
  await wait(`Boolean(document.querySelector('.update-error'))`);
  assert(await evaluate<boolean>(`document.querySelector('[data-action="download-update"]').textContent.includes(${JSON.stringify(t.updates.retryDownload)}) && !document.querySelector('[data-action="download-update"]').disabled && !document.querySelector('[data-action="install-update"]')`), 'QA_UPDATE_RETRY_STATE_INVALID');
  await capture('settings-updates-retry.png');
  fixture.setState({ status: 'current', currentVersion: fixture.currentVersion, latestVersion: null, releaseNotes: '', downloaded: false, error: null });
  await wait(`Boolean(document.querySelector('[data-update-status="current"]'))`);
  await click('[data-action="check-updates"]');
  await wait(`Boolean(document.querySelector('[data-update-status="checking"]'))`);
  assert(await evaluate<boolean>(`document.querySelector('[data-action="check-updates"]').disabled`), 'QA_UPDATE_CHECK_REENTRY_ALLOWED');
  fixture.setState({ status: 'current' });
  await wait(`Boolean(document.querySelector('[data-update-status="current"]'))`);
  await click('[role="switch"]');
  await wait(`document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'false'`);
  assert(await evaluate<boolean>(`document.querySelector('.update-description').textContent === ${JSON.stringify(t.updates.currentManual)}`), 'QA_UPDATE_DISABLED_AUTOMATIC_COPY_WRONG');
  await capture('settings-updates-current.png');
  const bounds = window.getBounds();
  fixture.setState({ status: 'available', latestVersion: fixture.currentVersion, releaseNotes: fixture.notes.repeat(12), error: null });
  await wait(`Boolean(document.querySelector('.update-notes'))`);
  await click('.update-notes summary');
  for (const [width, height] of QA.sizes) {
    window.setSize(width, height);
    await new Promise<void>((resolve) => setTimeout(resolve, QA.paint));
    assert(await evaluate<boolean>(`(() => {
      const dialog = document.querySelector('.settings-dialog');
      const panel = document.querySelector('.settings-page');
      panel.scrollTop = panel.scrollHeight;
      const box = dialog.getBoundingClientRect();
      const footer = document.querySelector('.settings-footer').getBoundingClientRect();
      const content = panel.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && footer.bottom <= box.bottom && footer.top >= content.bottom && dialog.scrollHeight <= dialog.clientHeight && panel.scrollHeight > panel.clientHeight && panel.scrollWidth <= panel.clientWidth;
    })()`), `QA_SETTINGS_LAYOUT_${width}_${height}`);
    await capture(`settings-compact-${width}.png`);
  }
  window.setBounds(bounds);
  fixture.setState({ status: 'current', latestVersion: null, releaseNotes: '', automatic: true });
  await select('appearance');
  await capture('settings-dialog.png');
  return { categorized: true, keyboardNavigation: true, draftPreserved: true, noticeOpensAbout: true, readableNotes: true, safeNotes: true, downloadProgress: true, readyToInstall: true, retryDownload: true, manualCheck: true, automaticPreference: true, fixedFooter: true, themes: true, aboutLinks: true, supportCodes: true };
}
