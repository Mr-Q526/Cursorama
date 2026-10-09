import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared';
import type { ExportRequest, Project } from '../shared';
import { renderExport } from '../src/engine/exporter';

const captured = vi.hoisted(() => ({ bytes: 0, released: false }));
const TIMING = { encoderStartup: 500, videoDuration: 0.25, cancellation: 100 } as const;
const MEDIA = new Uint8Array([1, 2, 3]);
vi.mock('../src/engine/renderer', () => ({ VideoRenderer: class { render = vi.fn(); dispose = vi.fn(); }, canvasDimensions: () => [1280, 720] }));
vi.mock('../src/engine/backgrounds', () => ({ prepareBackground: async () => undefined }));
vi.mock('../src/library', () => ({ hasLocalLibrary: true, exportLibraryVideo: async (request: ExportRequest) => { captured.bytes = request.bytes.byteLength; return { cancelled: false }; } }));

class CaptureVideo extends EventTarget {
  srcObject: unknown = null;
  pause = vi.fn();
  play(): Promise<void> { queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))); return Promise.resolve(); }
}

class DelayedRecorder extends EventTarget {
  static current: DelayedRecorder | null = null;
  static isTypeSupported(): boolean { return true; }
  state: RecordingState = 'inactive';
  ondataavailable: ((event: Pick<BlobEvent, 'data'>) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private started = false;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() { super(); DelayedRecorder.current = this; }
  start(): void {
    this.state = 'recording';
    this.timer = setTimeout(() => { this.ready = true; }, TIMING.encoderStartup);
  }
  frame(): void {
    if (this.ready && !this.started) { this.started = true; queueMicrotask(() => this.dispatchEvent(new Event('start'))); }
  }
  stop(): void {
    clearTimeout(this.timer);
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(this.started ? [MEDIA] : []) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  captured.bytes = 0;
  captured.released = false;
  DelayedRecorder.current = null;
  vi.stubGlobal('MediaRecorder', DelayedRecorder);
  const track = { readyState: 'live', requestFrame: () => DelayedRecorder.current?.frame(), stop: () => { captured.released = true; } };
  vi.stubGlobal('document', { createElement: (tag: string) => {
    if (tag === 'video') return new CaptureVideo();
    if (tag === 'canvas') return { width: 0, height: 0, captureStream: () => ({ getVideoTracks: () => [track], getTracks: () => [track] }) };
    throw new Error('UNEXPECTED_TEST_ELEMENT');
  } });
  vi.stubGlobal('window', {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const project: Project = { schemaVersion: 1, name: '短片导出启动验证', duration: TIMING.videoDuration, width: 1280, height: 720, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS }, trimStart: 0, trimEnd: TIMING.videoDuration, sourceType: 'demo', hasAudio: false, cursorEmbedded: false };

describe('导出编码器启动', () => {
  it('编码器启动时间长于短片时长时，仍等待采集开始再计时，不能导出空视频', async () => {
    const exporting = renderExport(project, { resolution: '720p', format: 'mp4', fps: 30, quality: 'standard' }, () => undefined, new AbortController().signal);
    await vi.runAllTimersAsync();
    await exporting;
    expect(captured.bytes).toBe(MEDIA.byteLength);
  });

  it('编码器启动期间取消会立即释放采集，不调用视频导出', async () => {
    const abort = new AbortController();
    const exporting = renderExport(project, { resolution: '720p', format: 'mp4', fps: 30, quality: 'standard' }, () => undefined, abort.signal);
    const result = expect(exporting).rejects.toMatchObject({ name: 'AbortError' });
    setTimeout(() => abort.abort(), TIMING.cancellation);
    await vi.runAllTimersAsync();
    await result;
    expect(captured.bytes).toBe(0);
    expect(captured.released).toBe(true);
  });
});
