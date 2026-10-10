import { FOCUS_SOUND_ASSETS, FOCUS_SOUND_IDS, FOCUS_SOUND_LIMITS, loadFocusSoundBuffer } from '../src/focus-sounds';
import type { FocusSoundId, FocusSoundSettings } from '../shared';
import { focusSoundSettings } from '../shared';
import { t } from '../src/i18n';
import { closeSettingsUI } from './navigation-ui-qa';

export interface FocusSoundAssetReport { protocol: string; count: number; bytes: number; stereo: boolean; peak: number; clippedSamples: number; cached: boolean; cancelled: boolean; }
export interface FocusSoundUIReport { options: number; selected: boolean; keyboard: boolean; switched: boolean; volume: number; auditionStarted: number; auditionStopped: number; pendingCancelled: boolean; busyStopped: boolean; busyDisabled: boolean; persisted: boolean; restored: boolean; }
interface AuditionRecord { id: FocusSoundId; source: AudioBufferSourceNode; stopped: boolean; }
const QA = { sampleRate: 44100, channels: 2, clipping: 0.98, maximumPeak: 0.4, timeout: 30_000, poll: 30, volume: 47, percent: 100, pendingSettle: 100 } as const;

export async function runFocusSoundAssetsQA(): Promise<FocusSoundAssetReport> {
  const context = new AudioContext({ sampleRate: QA.sampleRate });
  let maximum = 0;
  let clippedSamples = 0;
  try {
    for (const id of FOCUS_SOUND_IDS) {
      const sound = FOCUS_SOUND_ASSETS[id];
      const buffer = await loadFocusSoundBuffer(context, id);
      if (buffer.numberOfChannels !== QA.channels || Math.abs(buffer.duration - sound.duration) > FOCUS_SOUND_LIMITS.durationTolerance) throw new Error(`QA_FOCUS_SOUND_DECODE:${id}`);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        for (const value of buffer.getChannelData(channel)) {
          if (!Number.isFinite(value)) throw new Error(`QA_FOCUS_SOUND_NON_FINITE:${id}`);
          maximum = Math.max(maximum, Math.abs(value));
          if (Math.abs(value) >= QA.clipping) clippedSamples++;
        }
      }
      if (await loadFocusSoundBuffer(context, id) !== buffer) throw new Error(`QA_FOCUS_SOUND_CACHE:${id}`);
    }
    if (maximum > QA.maximumPeak || clippedSamples) throw new Error(`QA_FOCUS_SOUND_CLIPPED:${maximum}`);
    const cancelled = new AbortController(); cancelled.abort();
    let cancellationObserved = false;
    try { await loadFocusSoundBuffer(context, FOCUS_SOUND_IDS[0], cancelled.signal); }
    catch (error: unknown) { if (error instanceof DOMException && error.name === 'AbortError') cancellationObserved = true; else throw error; }
    if (!cancellationObserved) throw new Error('QA_FOCUS_SOUND_CANCEL_FAILED');
    return { protocol: location.protocol, count: FOCUS_SOUND_IDS.length, bytes: Object.values(FOCUS_SOUND_ASSETS).reduce((sum, sound) => sum + sound.bytes, 0), stereo: true, peak: maximum, clippedSamples, cached: true, cancelled: true };
  } finally { if (context.state !== 'closed') await context.close(); }
}

async function until<T>(stage: string, read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + QA.timeout;
  while (performance.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    if (document.querySelector('.focus-sound-error')) throw new Error(`QA_FOCUS_SOUND_UI_ERROR:${stage}`);
    await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  }
  throw new Error(`QA_FOCUS_SOUND_UI_TIMEOUT:${stage}`);
}

function control(): HTMLElement {
  const root = document.querySelector<HTMLElement>('.focus-sound-control');
  if (!root) throw new Error('QA_FOCUS_SOUND_UI_MISSING');
  return root;
}

function soundButton(id: FocusSoundId, selector: '.focus-sound-select' | '.focus-sound-preview'): HTMLButtonElement {
  const element = control().querySelector<HTMLButtonElement>(`[data-focus-sound-id="${id}"] ${selector}`);
  if (!element || element.disabled) throw new Error(`QA_FOCUS_SOUND_UI_BUTTON:${id}:${selector}`);
  return element;
}

function toggleButton(): HTMLButtonElement {
  const element = control().querySelector<HTMLButtonElement>('[role="switch"]');
  if (!element || element.disabled) throw new Error('QA_FOCUS_SOUND_UI_TOGGLE');
  return element;
}

function currentSetting(): FocusSoundSettings {
  const id = FOCUS_SOUND_IDS.find((candidate) => soundButton(candidate, '.focus-sound-select').getAttribute('aria-checked') === 'true');
  const volume = control().querySelector<HTMLInputElement>('input[type="range"]');
  if (!id || !volume) throw new Error('QA_FOCUS_SOUND_UI_SETTING');
  return { id, enabled: toggleButton().getAttribute('aria-checked') === 'true', volume: Number(volume.value) / QA.percent };
}

function setVolume(value: number): void {
  const slider = control().querySelector<HTMLInputElement>('input[type="range"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!slider || !setter) throw new Error('QA_FOCUS_SOUND_UI_SLIDER');
  setter.call(slider, String(value));
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function sameSetting(left: FocusSoundSettings, right: FocusSoundSettings): boolean {
  return left.id === right.id && left.enabled === right.enabled && Math.abs(left.volume - right.volume) < Number.EPSILON;
}

async function persisted(expected: FocusSoundSettings): Promise<void> {
  await until('saved-settings', async () => {
    const id = document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId;
    if (!id || !window.desktop || document.querySelector('.save-status')?.textContent !== t.library.saved) return undefined;
    const stored = await window.desktop.openLibraryProject(id);
    return sameSetting(focusSoundSettings(stored.data.settings), expected) ? true : undefined;
  });
}

async function restore(setting: FocusSoundSettings): Promise<void> {
  soundButton(setting.id, '.focus-sound-select').click();
  await until('restore-selection', () => currentSetting().id === setting.id ? true : undefined);
  if (currentSetting().enabled !== setting.enabled) {
    toggleButton().click();
    await until('restore-switch', () => currentSetting().enabled === setting.enabled ? true : undefined);
  }
  setVolume(setting.volume * QA.percent);
  await until('restore-volume', () => sameSetting(currentSetting(), setting) ? true : undefined);
  await persisted(setting);
}

export async function runFocusSoundUIQA(): Promise<FocusSoundUIReport> {
  if (!window.desktop) throw new Error('QA_FOCUS_SOUND_UI_DESKTOP_REQUIRED');
  const launcher = document.querySelector<HTMLButtonElement>('[data-action="open-audio"]');
  if (!launcher || launcher.disabled) throw new Error('QA_FOCUS_SOUND_UI_ENTRY');
  const originalTab = Array.from(document.querySelectorAll<HTMLButtonElement>('.inspector-tabs [role="tab"]')).find((element) => element.getAttribute('aria-selected') === 'true');
  launcher.click();
  await until('open-panel', () => document.querySelector('.focus-sound-control') ? true : undefined);
  const section = control();
  if (section instanceof HTMLDetailsElement) section.open = true;
  const original = currentSetting();
  const records: AuditionRecord[] = [];
  const nativeStart = AudioBufferSourceNode.prototype.start;
  const nativeStop = AudioBufferSourceNode.prototype.stop;
  let afterStart: (() => void) | undefined;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>): void {
    Reflect.apply(nativeStart, this, args);
    const id = FOCUS_SOUND_IDS.find((candidate) => this.buffer && Math.abs(this.buffer.duration - FOCUS_SOUND_ASSETS[candidate].duration) <= FOCUS_SOUND_LIMITS.durationTolerance);
    if (!id) return;
    records.push({ id, source: this, stopped: false });
    const started = afterStart;
    if (started) queueMicrotask(started);
  };
  AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['stop']>): void {
    Reflect.apply(nativeStop, this, args);
    for (const record of records) if (record.source === this) record.stopped = true;
  };
  try {
    const options = control().querySelectorAll('[role="radio"]').length;
    if (options !== FOCUS_SOUND_IDS.length) throw new Error('QA_FOCUS_SOUND_UI_OPTIONS');
    for (const id of FOCUS_SOUND_IDS) {
      soundButton(id, '.focus-sound-select').click();
      await until(`select-${id}`, () => currentSetting().id === id ? true : undefined);
      if (soundButton(id, '.focus-sound-select').tabIndex !== 0 || control().querySelectorAll('[role="radio"][tabindex="0"]').length !== 1) throw new Error('QA_FOCUS_SOUND_UI_TABINDEX');
    }
    soundButton(FOCUS_SOUND_IDS[0], '.focus-sound-select').click();
    await until('keyboard-initial', () => currentSetting().id === FOCUS_SOUND_IDS[0] ? true : undefined);
    soundButton(FOCUS_SOUND_IDS[0], '.focus-sound-select').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await until('keyboard-selection', () => currentSetting().id === FOCUS_SOUND_IDS[1] ? true : undefined);
    if (document.activeElement !== soundButton(FOCUS_SOUND_IDS[1], '.focus-sound-select')) throw new Error('QA_FOCUS_SOUND_UI_KEYBOARD_FOCUS');
    const beforeToggle = currentSetting().enabled;
    toggleButton().click();
    await until('toggle-once', () => currentSetting().enabled === !beforeToggle ? true : undefined);
    toggleButton().click();
    await until('toggle-twice', () => currentSetting().enabled === beforeToggle ? true : undefined);
    setVolume(QA.volume);
    await until('change-volume', () => currentSetting().volume === QA.volume / QA.percent ? true : undefined);
    await persisted(currentSetting());
    for (const id of FOCUS_SOUND_IDS) {
      afterStart = () => soundButton(id, '.focus-sound-preview').click();
      const count = records.length;
      soundButton(id, '.focus-sound-preview').click();
      await until(`audition-${id}`, () => records.length === count + 1 && records[count].id === id && records[count].stopped ? true : undefined);
      await until(`audition-ui-${id}`, () => !control().querySelector('.playing, .focus-sound-loading') ? true : undefined);
    }
    afterStart = undefined;
    const played = records.length;
    soundButton(FOCUS_SOUND_IDS[0], '.focus-sound-preview').click();
    soundButton(FOCUS_SOUND_IDS[0], '.focus-sound-preview').click();
    await new Promise<void>((resolve) => setTimeout(resolve, QA.pendingSettle));
    if (records.length !== played || control().querySelector('.playing, .focus-sound-loading')) throw new Error('QA_FOCUS_SOUND_UI_PENDING_CANCEL');
    const settings = document.querySelector<HTMLButtonElement>('[data-action="open-settings"]');
    if (!settings || settings.disabled) throw new Error('QA_FOCUS_SOUND_UI_SETTINGS');
    afterStart = () => settings.click();
    soundButton('glass-chime', '.focus-sound-preview').click();
    await until('busy-stop', () => records.length === played + 1 && records[played].stopped && document.querySelector('.settings-dialog') ? true : undefined);
    if (Array.from(control().querySelectorAll<HTMLButtonElement>('.focus-sound-preview')).some((button) => !button.disabled)) throw new Error('QA_FOCUS_SOUND_UI_BUSY_ENABLED');
    await closeSettingsUI();
    await until('busy-resume', () => Array.from(control().querySelectorAll<HTMLButtonElement>('.focus-sound-preview')).every((button) => !button.disabled) ? true : undefined);
    return { options, selected: true, keyboard: true, switched: true, volume: QA.volume / QA.percent, auditionStarted: records.length, auditionStopped: records.filter((record) => record.stopped).length, pendingCancelled: true, busyStopped: true, busyDisabled: true, persisted: true, restored: true };
  } finally {
    AudioBufferSourceNode.prototype.start = nativeStart;
    AudioBufferSourceNode.prototype.stop = nativeStop;
    if (document.querySelector('.settings-dialog')) await closeSettingsUI();
    await restore(original);
    originalTab?.click();
  }
}
