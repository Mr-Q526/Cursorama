import { CAPTURE_TIMING, TIME } from '../shared';
import { t } from '../src/i18n';

const UI_QA = { pollInterval: 50, timeout: 18_000, recordDuration: 600, countdownTolerance: 80 } as const;
type QueryRoot = Document | HTMLElement;

function button(label: string, root: QueryRoot = document): HTMLButtonElement {
  const result = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
  if (!result) throw new Error(`QA_BUTTON_MISSING: ${label}`);
  return result;
}

async function waitUntil<T>(read: () => T | undefined): Promise<T> {
  const deadline = performance.now() + UI_QA.timeout;
  while (performance.now() < deadline) {
    const result = read(); if (result !== undefined) return result;
    await new Promise<void>((resolve) => setTimeout(resolve, UI_QA.pollInterval));
  }
  throw new Error('QA_UI_TIMEOUT');
}

function instrumentRecording() {
  const starts: number[] = [];
  let sourceSelections = 0;
  const originalStart = MediaRecorder.prototype.start;
  const originalCapture = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  MediaRecorder.prototype.start = function (this: MediaRecorder, timeslice?: number): void {
    starts.push(performance.now()); originalStart.call(this, timeslice);
  };
  navigator.mediaDevices.getDisplayMedia = async (options) => { sourceSelections++; return originalCapture(options); };
  return {
    starts, selections: () => sourceSelections,
    restore: () => { MediaRecorder.prototype.start = originalStart; navigator.mediaDevices.getDisplayMedia = originalCapture; },
  };
}

export async function prepareRecordingUI() {
  const existing = document.querySelector<HTMLElement>('[role="dialog"]');
  if (existing) { button(t.editor.close, existing).click(); await waitUntil(() => document.querySelector('[role="dialog"]') ? undefined : true); }
  button(t.editor.newRecording).click();
  const dialog = await waitUntil(() => document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined);
  const countdown = Array.from(dialog.querySelectorAll<HTMLSelectElement>('select')).find((select) => select.closest('label')?.textContent?.startsWith(t.recording.countdownSetting));
  if (!countdown || Number(countdown.value) !== CAPTURE_TIMING.defaultCountdown || !button(t.recording.start, dialog).disabled) throw new Error('QA_RECORDING_ORDER_FAILED');
  button(t.recording.window, dialog).click();
  const ownSource = await waitUntil(() => Array.from(dialog.querySelectorAll<HTMLButtonElement>('.source-option')).find((item) => item.querySelector('img')?.alt === t.editor.appName));
  ownSource.click();
  await waitUntil(() => button(t.recording.confirmSource, dialog).disabled ? undefined : true);
  button(t.recording.confirmSource, dialog).click();
  const video = await waitUntil(() => {
    const preview = dialog.querySelector<HTMLVideoElement>('.capture-ready video');
    return preview && preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !button(t.recording.start, dialog).disabled ? preview : undefined;
  });
  if (document.querySelector('.countdown-overlay') || document.querySelector('.recording-overlay')) throw new Error('QA_PREPARE_STARTED_RECORDING');
  return { sourceConfirmed: true, defaultCountdown: Number(countdown.value), width: video.videoWidth, height: video.videoHeight };
}

export async function cancelCountdownUI() {
  const preview = document.querySelector<HTMLVideoElement>('.capture-ready video');
  const stream = preview?.srcObject;
  if (!(stream instanceof MediaStream)) throw new Error('QA_SOURCE_NOT_READY');
  const track = stream.getVideoTracks()[0];
  const instrument = instrumentRecording();
  try {
    button(t.recording.start, document.querySelector<HTMLElement>('[role="dialog"]') ?? document).click();
    await waitUntil(() => document.querySelector('.countdown-overlay strong')?.textContent === String(CAPTURE_TIMING.defaultCountdown) ? true : undefined);
    if (instrument.starts.length) throw new Error('QA_COUNTDOWN_RECORDED');
    button(t.recording.cancelCountdown).click();
    await waitUntil(() => !document.querySelector('.countdown-overlay') && !document.querySelector('.capture-ready') ? true : undefined);
    if (track.readyState !== 'ended' || instrument.starts.length || instrument.selections()) throw new Error('QA_COUNTDOWN_CANCEL_LEAK');
    return { cancelledBeforeRecording: true, sourceReleased: true };
  } finally { instrument.restore(); }
}

export async function startCountdownUI() {
  const instrument = instrumentRecording();
  const clickedAt = performance.now();
  try {
    button(t.recording.start, document.querySelector<HTMLElement>('[role="dialog"]') ?? document).click();
    await waitUntil(() => document.querySelector('.countdown-overlay strong')?.textContent === String(CAPTURE_TIMING.defaultCountdown) ? true : undefined);
    if (instrument.starts.length) throw new Error('QA_COUNTDOWN_RECORDED');
    await waitUntil(() => document.querySelector('.recording-overlay') ? true : undefined);
    const delay = (instrument.starts[0] ?? 0) - clickedAt;
    if (instrument.starts.length !== 1 || delay < CAPTURE_TIMING.defaultCountdown * TIME.milliseconds - UI_QA.countdownTolerance || instrument.selections()) throw new Error('QA_RECORDING_START_SEQUENCE_FAILED');
    await new Promise<void>((resolve) => setTimeout(resolve, UI_QA.recordDuration));
    const displayedTime = document.querySelector('.recording-clock')?.textContent;
    button(t.recording.stop).click();
    await waitUntil(() => !document.querySelector('.processing-overlay') && !document.querySelector('.recording-overlay') ? true : undefined);
    if (document.querySelector<HTMLInputElement>('.project-name')?.value !== t.editor.recordingName || displayedTime !== '00:00') throw new Error('QA_COUNTDOWN_INCLUDED_IN_RECORDING');
    return { countdownMilliseconds: Math.round(delay), sourceReselections: instrument.selections(), countdownExcludedFromRecording: true };
  } finally { instrument.restore(); }
}
