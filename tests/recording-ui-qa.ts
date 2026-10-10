import { CAPTURE_TIMING, TIME } from '../shared';
import { t } from '../src/i18n';

const UI_QA = { pollInterval: 50, timeout: 18_000, recordDuration: 600, countdownTolerance: 80 } as const;
const PROMPTER_SCRIPT = '向观众介绍操作步骤，说明重点，再开始演示。';
type QueryRoot = Document | HTMLElement;
interface RecordingLocation {
  route: string;
  page?: string;
  projectId?: string;
  projectName?: string;
  projectElement: HTMLElement | null;
  libraryElement: HTMLElement | null;
  previewElement: HTMLVideoElement | null;
  previewSource: string | null;
  libraryQuery?: string;
  libraryFilter?: string;
}
export interface RecordingCancellationReport { pagePreserved: boolean; projectPreserved: boolean; previewPreserved: boolean; sourceNotRequested: boolean; }
let preparedLocation: RecordingLocation | undefined;

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

function recordingLocation(): RecordingLocation {
  const projectElement = document.querySelector<HTMLElement>('.project-bar');
  const previewElement = document.querySelector<HTMLVideoElement>('.export-preview-stage video');
  return {
    route: window.location.hash,
    page: document.querySelector<HTMLElement>('.app-main')?.dataset.page,
    projectId: projectElement?.dataset.projectId,
    projectName: document.querySelector<HTMLInputElement>('.project-name')?.value,
    projectElement,
    libraryElement: document.querySelector<HTMLElement>('.library-page'),
    previewElement,
    previewSource: previewElement?.getAttribute('src') ?? null,
    libraryQuery: document.querySelector<HTMLInputElement>('.library-search input')?.value,
    libraryFilter: document.querySelector<HTMLButtonElement>('.library-tabs [aria-pressed="true"]')?.textContent ?? undefined,
  };
}

function assertLocationPreserved(expected: RecordingLocation): void {
  const current = recordingLocation();
  if (current.route !== expected.route || current.page !== expected.page || current.projectElement !== expected.projectElement || current.libraryElement !== expected.libraryElement || current.previewElement !== expected.previewElement) throw new Error('QA_RECORDING_CHANGED_PAGE');
  if (current.projectId !== expected.projectId || current.projectName !== expected.projectName) throw new Error('QA_RECORDING_CHANGED_PROJECT');
  if (current.previewSource !== expected.previewSource) throw new Error('QA_RECORDING_CHANGED_VIDEO_PREVIEW');
  if (current.libraryQuery !== expected.libraryQuery || current.libraryFilter !== expected.libraryFilter) throw new Error('QA_RECORDING_CHANGED_LIBRARY_FILTER');
}

export async function runRecordingCancellationUI(): Promise<RecordingCancellationReport> {
  if (document.querySelector('[role="dialog"]')) throw new Error('QA_RECORDING_CANCEL_DIALOG_ALREADY_OPEN');
  const location = recordingLocation();
  const instrument = instrumentRecording();
  try {
    const record = document.querySelector<HTMLButtonElement>('.sidebar-record');
    if (!record) throw new Error('QA_RECORDING_CANCEL_LAUNCHER_MISSING');
    await waitUntil(() => !record.disabled ? true : undefined);
    record.click();
    const dialog = await waitUntil(() => document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined);
    await waitUntil(() => document.querySelector<HTMLElement>('.app-main')?.inert ? true : undefined);
    assertLocationPreserved(location);
    if (!document.querySelector<HTMLElement>('.app-main')?.inert || !button(t.recording.start, dialog).disabled) throw new Error('QA_RECORDING_CANCEL_NOT_MODAL');
    button(t.editor.close, dialog).click();
    await waitUntil(() => !document.querySelector('[role="dialog"]') ? true : undefined);
    assertLocationPreserved(location);
    if (instrument.starts.length || instrument.selections() || document.documentElement.dataset.recording === 'true' || document.querySelector('.countdown-overlay')) throw new Error('QA_RECORDING_CANCEL_STARTED_CAPTURE');
    return { pagePreserved: true, projectPreserved: true, previewPreserved: true, sourceNotRequested: true };
  } finally { instrument.restore(); }
}

export async function prepareRecordingUI(sourceId: string) {
  const existing = document.querySelector<HTMLElement>('[role="dialog"]');
  if (existing) { button(t.editor.close, existing).click(); await waitUntil(() => document.querySelector('[role="dialog"]') ? undefined : true); }
  preparedLocation = recordingLocation();
  button(t.editor.newRecording).click();
  const dialog = await waitUntil(() => document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined);
  assertLocationPreserved(preparedLocation);
  const countdown = Array.from(dialog.querySelectorAll<HTMLSelectElement>('select')).find((select) => select.closest('label')?.textContent?.startsWith(t.recording.countdownSetting));
  if (!countdown || Number(countdown.value) !== CAPTURE_TIMING.defaultCountdown || !button(t.recording.start, dialog).disabled) throw new Error('QA_RECORDING_ORDER_FAILED');
  button(t.recording.window, dialog).click();
  const ownSource = await waitUntil(() => dialog.querySelector<HTMLButtonElement>(`.source-option[data-source-id="${CSS.escape(sourceId)}"]`) ?? undefined);
  ownSource.click();
  await waitUntil(() => button(t.recording.confirmSource, dialog).disabled ? undefined : true);
  button(t.recording.confirmSource, dialog).click();
  const video = await waitUntil(() => {
    const preview = dialog.querySelector<HTMLVideoElement>('.capture-ready video');
    return preview && preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !button(t.recording.start, dialog).disabled ? preview : undefined;
  });
  if (document.querySelector('.countdown-overlay') || document.querySelector('.recording-overlay')) throw new Error('QA_PREPARE_STARTED_RECORDING');
  assertLocationPreserved(preparedLocation);
  return { sourceConfirmed: true, defaultCountdown: Number(countdown.value), width: video.videoWidth, height: video.videoHeight, contextPreservedWhilePreparing: true };
}

export async function cancelCountdownUI() {
  const preview = document.querySelector<HTMLVideoElement>('.capture-ready video');
  const stream = preview?.srcObject;
  if (!(stream instanceof MediaStream)) throw new Error('QA_SOURCE_NOT_READY');
  const location = preparedLocation;
  if (!location) throw new Error('QA_RECORDING_PREPARATION_CONTEXT_MISSING');
  const track = stream.getVideoTracks()[0];
  const instrument = instrumentRecording();
  try {
    button(t.recording.start, document.querySelector<HTMLElement>('[role="dialog"]') ?? document).click();
    await waitUntil(() => document.querySelector('.countdown-overlay strong')?.textContent === String(CAPTURE_TIMING.defaultCountdown) ? true : undefined);
    assertLocationPreserved(location);
    if (instrument.starts.length) throw new Error('QA_COUNTDOWN_RECORDED');
    button(t.recording.cancelCountdown).click();
    await waitUntil(() => !document.querySelector('.countdown-overlay') && !document.querySelector('.capture-ready') ? true : undefined);
    if (track.readyState !== 'ended' || instrument.starts.length || instrument.selections()) throw new Error('QA_COUNTDOWN_CANCEL_LEAK');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('QA_COUNTDOWN_CANCEL_DIALOG_MISSING');
    await waitUntil(() => !button(t.editor.close, dialog).disabled ? true : undefined);
    button(t.editor.close, dialog).click();
    await waitUntil(() => !document.querySelector('[role="dialog"]') ? true : undefined);
    assertLocationPreserved(location);
    preparedLocation = undefined;
    return { cancelledBeforeRecording: true, sourceReleased: true, countdownCancelPreservesPage: true, countdownCancelPreservesProject: true };
  } finally { instrument.restore(); }
}

export async function startCountdownUI() {
  const location = preparedLocation;
  if (!location) throw new Error('QA_RECORDING_PREPARATION_CONTEXT_MISSING');
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const setup = dialog?.querySelector<HTMLDetailsElement>('.prompter-setup');
  const script = setup?.querySelector<HTMLTextAreaElement>('textarea');
  const enable = setup?.querySelector<HTMLButtonElement>('[role="switch"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setup || !script || !enable || !setter) throw new Error('QA_PROMPTER_SETUP_MISSING');
  setup.open = true;
  setter.call(script, PROMPTER_SCRIPT); script.dispatchEvent(new Event('input', { bubbles: true }));
  if (enable.getAttribute('aria-checked') !== 'true') enable.click();
  await waitUntil(() => script.value === PROMPTER_SCRIPT && enable.getAttribute('aria-checked') === 'true' ? true : undefined);
  const instrument = instrumentRecording();
  const clickedAt = performance.now();
  try {
    button(t.recording.start, document.querySelector<HTMLElement>('[role="dialog"]') ?? document).click();
    await waitUntil(() => document.querySelector('.countdown-overlay strong')?.textContent === String(CAPTURE_TIMING.defaultCountdown) ? true : undefined);
    assertLocationPreserved(location);
    if (instrument.starts.length) throw new Error('QA_COUNTDOWN_RECORDED');
    await waitUntil(() => document.documentElement.dataset.recording === 'true' ? true : undefined);
    const delay = (instrument.starts[0] ?? 0) - clickedAt;
    if (instrument.starts.length !== 1 || delay < CAPTURE_TIMING.defaultCountdown * TIME.milliseconds - UI_QA.countdownTolerance || instrument.selections()) throw new Error('QA_RECORDING_START_SEQUENCE_FAILED');
    await new Promise<void>((resolve) => setTimeout(resolve, UI_QA.recordDuration));
    const state = await window.desktop?.getRecordingOverlay();
    if (!state?.prompterVisible || state.script !== PROMPTER_SCRIPT) throw new Error('QA_PROMPTER_SETUP_NOT_APPLIED');
    const displayedTime = state ? Math.floor(state.elapsed) : 0;
    await window.desktop?.requestRecordingCommand('stop');
    await waitUntil(() => !document.querySelector('.processing-overlay') && document.documentElement.dataset.recording !== 'true' ? true : undefined);
    if (document.querySelector<HTMLInputElement>('.project-name')?.value !== t.editor.recordingName || displayedTime !== 0) throw new Error('QA_COUNTDOWN_INCLUDED_IN_RECORDING');
    if (window.location.hash !== '#/workspace' || !document.querySelector('.app-main[data-page="workspace"] .project-bar') || document.querySelector('.export-preview')) throw new Error('QA_RECORDING_FINISHED_OUTSIDE_EDITOR');
    preparedLocation = undefined;
    return { countdownMilliseconds: Math.round(delay), sourceReselections: instrument.selections(), countdownExcludedFromRecording: true, prompterConfigured: true, recordingFinishedInEditor: true };
  } finally { instrument.restore(); }
}
