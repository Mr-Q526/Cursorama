import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureOptions, DesktopBridge, NativePointer, RecordingProgress } from '../shared';
import { createDemoProject, prepareRecording, startRecording } from '../src/engine';

const CAPTURE: CaptureOptions = { sourceId: '', microphone: false, systemAudio: false, fps: 30 };
const SOURCE_SIZE = { width: 3840, height: 2160 } as const;

class CaptureTrack extends EventTarget {
  readyState: MediaStreamTrackState = 'live';
  readonly kind = 'video';
  readonly label = 'Cursorama';
  stop = vi.fn(() => { this.readyState = 'ended'; });
  cursor: 'always' | 'never' | undefined = 'always';
  getSettings = () => ({ ...SOURCE_SIZE, frameRate: 30, cursor: this.cursor });
}

class CaptureStream {
  constructor(private readonly tracks: CaptureTrack[] = []) {}
  getTracks = () => this.tracks;
  getVideoTracks = () => this.tracks;
  getAudioTracks = () => [];
}

class CaptureRecorder extends EventTarget {
  static instances: CaptureRecorder[] = [];
  static isTypeSupported = () => true;
  constructor(readonly stream: CaptureStream, readonly options: MediaRecorderOptions) { super(); CaptureRecorder.instances.push(this); }
  state: RecordingState = 'inactive';
  onstop?: () => void;
  ondataavailable?: (event: { data: Blob }) => void;
  start = () => { this.state = 'recording'; queueMicrotask(() => this.dispatchEvent(new Event('start'))); };
  pause = () => { this.state = 'paused'; };
  resume = () => { this.state = 'recording'; };
  stop = () => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['录制验证']) });
    this.onstop?.();
  };
}

class CapturePreview extends EventTarget {
  videoWidth = SOURCE_SIZE.width;
  videoHeight = SOURCE_SIZE.height;
  play = async () => { queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))); };
  pause = () => undefined;
}

function installCapture() {
  const track = new CaptureTrack();
  const getDisplayMedia = vi.fn(async (_options: DisplayMediaStreamOptions) => new CaptureStream([track]));
  CaptureRecorder.instances = [];
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('MediaStream', CaptureStream);
  vi.stubGlobal('MediaRecorder', CaptureRecorder);
  vi.stubGlobal('document', { createElement: () => new CapturePreview() });
  return { track, getDisplayMedia };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function recordImmediately() {
  return startRecording(await prepareRecording(CAPTURE), 0, () => undefined, () => undefined, new AbortController().signal);
}

describe('录制清晰度与光标回归', () => {
  it('按来源的原始像素采集，不固定缩小到 1440p', async () => {
    const capture = installCapture();
    const active = await recordImmediately();
    const options = capture.getDisplayMedia.mock.calls[0]?.[0] as DisplayMediaStreamOptions | undefined;
    expect(options?.video).not.toHaveProperty('width');
    expect(options?.video).not.toHaveProperty('height');
    const project = await active.stop();
    expect([project.width, project.height]).toEqual([SOURCE_SIZE.width, SOURCE_SIZE.height]);
    expect(project.frameRate).toBe(CAPTURE.fps);
    URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('来源含系统鼠标时不再叠加另一只鼠标', async () => {
    installCapture();
    const active = await recordImmediately();
    const project = await active.stop();
    expect(project.settings.cursor).toBe('none');
    URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('60 帧录制保留采集帧率，重新打开后用于逐帧定位', async () => {
    const capture = installCapture();
    vi.spyOn(capture.track, 'getSettings').mockReturnValue({ ...SOURCE_SIZE, frameRate: 60, cursor: 'always' });
    const active = await startRecording(await prepareRecording({ ...CAPTURE, fps: 60 }), 0, () => undefined, () => undefined, new AbortController().signal);
    const project = await active.stop();
    expect(project.frameRate).toBe(60);
    URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('默认内置演示不显示模拟鼠标', () => {
    expect(createDemoProject().settings.cursor).toBe('none');
  });

  it('4K 录制使用随像素与帧率增加的码率', async () => {
    installCapture();
    const active = await recordImmediately();
    expect(CaptureRecorder.instances[0]?.options.videoBitsPerSecond).toBeGreaterThan(40_000_000);
    const project = await active.stop(); URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('来源不能报告鼠标是否内嵌时，也不叠加光标', async () => {
    const capture = installCapture(); capture.track.cursor = undefined;
    const active = await recordImmediately();
    const project = await active.stop();
    expect(project.cursorEmbedded).toBe(true);
    expect(project.settings.cursor).toBe('none');
    URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('采集接口先报告占位尺寸时，以首帧实际尺寸为准', async () => {
    const capture = installCapture();
    vi.spyOn(capture.track, 'getSettings').mockReturnValue({ width: 1920, height: 1080, frameRate: 30, cursor: 'always' });
    const prepared = await prepareRecording(CAPTURE);
    expect([prepared.source.width, prepared.source.height]).toEqual([SOURCE_SIZE.width, SOURCE_SIZE.height]);
    const active = await startRecording(prepared, 0, () => undefined, () => undefined, new AbortController().signal);
    const project = await active.stop();
    expect([project.width, project.height]).toEqual([SOURCE_SIZE.width, SOURCE_SIZE.height]);
    URL.revokeObjectURL(project.videoUrl ?? '');
  });
});

describe('选择来源、倒计时与取消', () => {
  it('编码器真正就绪后才返回录制会话并开始计时', async () => {
    vi.useFakeTimers(); installCapture();
    class DeferredRecorder extends CaptureRecorder { override start = () => { this.state = 'recording'; }; }
    vi.stubGlobal('MediaRecorder', DeferredRecorder);
    let ready = false; const pending = recordImmediately().then((active) => { ready = true; return active; });
    await vi.waitFor(() => expect(CaptureRecorder.instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(5000); expect(ready).toBe(false);
    CaptureRecorder.instances[0].dispatchEvent(new Event('start'));
    const active = await pending; expect(active.elapsed).toBe(0);
    await vi.advanceTimersByTimeAsync(1000); const project = await active.stop();
    expect(project.duration).toBeCloseTo(1); URL.revokeObjectURL(project.videoUrl ?? '');
  });
  it('编码器等待期间取消会释放来源和录制器', async () => {
    vi.useFakeTimers(); const capture = installCapture();
    class DeferredRecorder extends CaptureRecorder { override start = () => { this.state = 'recording'; }; }
    vi.stubGlobal('MediaRecorder', DeferredRecorder);
    const prepared = await prepareRecording(CAPTURE); const abort = new AbortController();
    const pending = startRecording(prepared, 0, () => undefined, () => undefined, abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(CaptureRecorder.instances).toHaveLength(1)); abort.abort(); await rejected;
    expect(capture.track.readyState).toBe('ended'); expect(CaptureRecorder.instances[0].state).toBe('inactive');
  });
  it('录制器没有输出画面时拒绝创建空工程，同时释放资源', async () => {
    const capture = installCapture(); const active = await recordImmediately();
    const recorder = CaptureRecorder.instances[0];
    recorder.stop = () => { recorder.state = 'inactive'; recorder.onstop?.(); };
    await expect(active.stop()).rejects.toThrow('RECORDING_EMPTY');
    expect(capture.track.readyState).toBe('ended');
  });
  it('暂停会停止计时与录制，继续后排除暂停时长并对齐鼠标轨迹', async () => {
    vi.useFakeTimers(); installCapture();
    let pointer: ((sample: NativePointer) => void) | undefined;
    const bridge = {
      selectSource: vi.fn(async () => undefined), startPointer: vi.fn(async () => undefined), stopPointer: vi.fn(async () => undefined),
      recordingState: vi.fn(async () => undefined), syncRecordingProgress: vi.fn(async (_progress: RecordingProgress) => undefined),
      onPointer: (callback: (sample: NativePointer) => void) => { pointer = callback; return () => { pointer = undefined; }; },
    };
    vi.stubGlobal('window', { desktop: bridge });
    const active = await recordImmediately();
    const sample = (): void => pointer?.({ timestamp: Date.now(), x: 0.5, y: 0.5, kind: 'click', inside: true });
    await vi.advanceTimersByTimeAsync(1000); sample();
    active.pause(); active.pause();
    expect(active.paused).toBe(true); expect(CaptureRecorder.instances[0].state).toBe('paused');
    await vi.advanceTimersByTimeAsync(5000); sample();
    expect(active.elapsed).toBeCloseTo(1);
    const delayedPointer: NativePointer = { timestamp: Date.now() - 1000, x: 0.1, y: 0.2, kind: 'click', inside: true };
    active.resume(); active.resume();
    pointer?.(delayedPointer);
    await vi.advanceTimersByTimeAsync(1000); sample();
    const project = await active.stop();
    expect(project.duration).toBeCloseTo(2);
    expect(project.samples.map((event) => event.time)).toEqual([1, 2]);
    expect(bridge.syncRecordingProgress).toHaveBeenCalledWith({ elapsed: 1, paused: true });
    const progressCount = bridge.syncRecordingProgress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(bridge.syncRecordingProgress.mock.calls).toHaveLength(progressCount);
    URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('暂停状态结束录制也会保存有效片段并释放采集资源', async () => {
    vi.useFakeTimers(); const capture = installCapture();
    const active = await recordImmediately();
    await vi.advanceTimersByTimeAsync(750); active.pause();
    await vi.advanceTimersByTimeAsync(5000);
    const project = await active.stop();
    expect(project.duration).toBeCloseTo(0.75);
    expect(capture.track.readyState).toBe('ended');
    expect(CaptureRecorder.instances[0].state).toBe('inactive');
    URL.revokeObjectURL(project.videoUrl ?? '');
  });
  it('输入焦点与鼠标位置分开保存，暂停中的输入不会延长镜头', async () => {
    vi.useFakeTimers(); installCapture();
    let emit: (sample: NativePointer) => void = () => undefined;
    const bridge = {
      selectSource: vi.fn(async () => undefined), startPointer: vi.fn(async () => undefined), stopPointer: vi.fn(async () => undefined), recordingState: vi.fn(async () => undefined),
      onPointer: (callback: (sample: NativePointer) => void) => { emit = callback; return () => undefined; },
    };
    vi.stubGlobal('window', { desktop: bridge });
    const active = await recordImmediately();
    const focus = { x: 0.35, y: 0.3, width: 0.3, height: 0.04, source: 'control' } as const;
    const input = (): void => emit({ timestamp: Date.now(), x: 0.8, y: 0.75, inside: true, kind: 'typing', focus });
    await vi.advanceTimersByTimeAsync(1000); input(); active.pause();
    await vi.advanceTimersByTimeAsync(5000); input(); active.resume();
    await vi.advanceTimersByTimeAsync(1000); input(); await vi.advanceTimersByTimeAsync(1000);
    const project = await active.stop();
    expect(project.samples).toEqual([1, 2].map((time) => ({ time, x: 0.8, y: 0.75, kind: 'typing', focus })));
    expect(project.clips).toHaveLength(1); expect(project.clips[0]).toMatchObject({ x: focus.x, y: focus.y });
    expect(bridge.stopPointer).toHaveBeenCalledOnce(); URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('准备来源期间不启动录像，3 秒倒计时结束后才启动', async () => {
    vi.useFakeTimers(); installCapture();
    const prepared = await prepareRecording(CAPTURE);
    expect(CaptureRecorder.instances).toHaveLength(0);
    const ticks: Array<number | null> = [];
    const pending = startRecording(prepared, 3, (tick) => ticks.push(tick), () => undefined, new AbortController().signal);
    expect(ticks).toEqual([3]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(CaptureRecorder.instances).toHaveLength(0);
    expect(ticks).toEqual([3, 2, 1]);
    await vi.advanceTimersByTimeAsync(1000);
    const active = await pending;
    expect(CaptureRecorder.instances[0]?.state).toBe('recording');
    expect(ticks).toEqual([3, 2, 1, null]);
    const project = await active.stop(); URL.revokeObjectURL(project.videoUrl ?? '');
  });

  it('取消倒计时会释放来源，并且不会留下录像', async () => {
    vi.useFakeTimers(); const capture = installCapture();
    const prepared = await prepareRecording(CAPTURE);
    const abort = new AbortController();
    const pending = startRecording(prepared, 5, () => undefined, () => undefined, abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000); abort.abort(); await rejected;
    expect(capture.track.stop).toHaveBeenCalledTimes(1);
    expect(CaptureRecorder.instances).toHaveLength(0);
    await prepared.cancel();
    expect(capture.track.stop).toHaveBeenCalledTimes(1);
  });

  it('倒计时期间来源结束会立即取消', async () => {
    vi.useFakeTimers(); const capture = installCapture();
    const prepared = await prepareRecording(CAPTURE);
    const pending = startRecording(prepared, 10, () => undefined, () => undefined, new AbortController().signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    capture.track.readyState = 'ended'; capture.track.dispatchEvent(new Event('ended'));
    await rejected;
    expect(CaptureRecorder.instances).toHaveLength(0);
    expect(capture.track.stop).toHaveBeenCalledTimes(1);
  });

  it('确认来源后关闭准备页面会释放媒体流', async () => {
    const capture = installCapture(); const prepared = await prepareRecording(CAPTURE);
    await prepared.cancel();
    expect(prepared.sourceEnded.aborted).toBe(true);
    expect(capture.track.stop).toHaveBeenCalledTimes(1);
    expect(CaptureRecorder.instances).toHaveLength(0);
  });

  it('等待麦克风授权时来源结束，迟到的麦克风流也必须释放', async () => {
    const capture = installCapture(); const microphoneTrack = new CaptureTrack();
    let resolveMicrophone: (stream: CaptureStream) => void = () => { throw new Error('MICROPHONE_NOT_REQUESTED'); };
    const microphone = new Promise<CaptureStream>((resolve) => { resolveMicrophone = resolve; });
    const getUserMedia = vi.fn(() => microphone);
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: capture.getDisplayMedia, getUserMedia } });
    const pending = prepareRecording({ ...CAPTURE, microphone: true });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    capture.track.readyState = 'ended'; capture.track.dispatchEvent(new Event('ended'));
    resolveMicrophone(new CaptureStream([microphoneTrack])); await rejected;
    expect(microphoneTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('桌面轨迹在准备与倒计时期间不计入录像，明确隐藏原生鼠标后只绘制轨迹光标', async () => {
    vi.useFakeTimers(); const capture = installCapture(); capture.track.cursor = 'never';
    let emit: (sample: NativePointer) => void = () => undefined;
    const unsubscribe = vi.fn();
    const bridge: Pick<DesktopBridge, 'selectSource' | 'onPointer' | 'startPointer' | 'stopPointer' | 'recordingState'> = {
      selectSource: vi.fn(async () => undefined),
      onPointer: (callback) => { emit = callback; return unsubscribe; },
      startPointer: vi.fn(async () => undefined), stopPointer: vi.fn(async () => undefined), recordingState: vi.fn(async () => undefined),
    };
    vi.stubGlobal('window', { desktop: bridge });
    const prepared = await prepareRecording(CAPTURE);
    expect(bridge.recordingState).not.toHaveBeenCalled();
    emit({ x: 0.2, y: 0.2, timestamp: Date.now(), kind: 'click', inside: true });
    const pending = startRecording(prepared, 3, () => undefined, () => undefined, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    emit({ x: 0.5, y: 0.5, timestamp: Date.now(), kind: 'click', inside: true });
    await vi.advanceTimersByTimeAsync(2000);
    const active = await pending;
    await vi.advanceTimersByTimeAsync(16);
    emit({ x: 0.8, y: 0.8, timestamp: Date.now(), kind: 'move', inside: true });
    const project = await active.stop();
    expect(project.samples).toHaveLength(2);
    expect(project.samples[0]).toMatchObject({ time: 0, kind: 'move' });
    expect(project.samples[1]).toMatchObject({ kind: 'move', x: 0.8 });
    expect(project.cursorEmbedded).toBe(false);
    expect(project.settings.cursor).toBe('arrow');
    expect(bridge.stopPointer).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    URL.revokeObjectURL(project.videoUrl ?? '');
  });
});
