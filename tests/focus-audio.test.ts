import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOCUS_SOUND, DEFAULT_SETTINGS, focusSoundCues, focusSoundSettings, parseFocusSound, parseProject, projectBytes, readProjectBytes, SOURCE_MEDIA_ID } from '../shared';
import type { MotionClip, Project, VideoSegment } from '../shared';
import { FocusAudioPlayer } from '../src/engine/focus-audio';
import type { FocusAudioBufferLoader } from '../src/engine/focus-audio';
import { generateClips } from '../src/engine/motion';

const QA = { duration: 10, soundDuration: 0.6, clock: 20, cue: 1, volume: 0.4 } as const;
const shot = (id: string, start: number, patch: Partial<MotionClip> = {}): MotionClip => ({ id, start, end: start + 1, x: 0.5, y: 0.4, zoom: 2, mode: 'focus', enabled: true, manual: false, ...patch });
const base: Project = { schemaVersion: 1, name: '聚焦音效验证', duration: QA.duration, width: 1920, height: 1080, sourceType: 'demo', hasAudio: false, samples: [], clips: [shot('click', QA.cue)], trimStart: 0, trimEnd: QA.duration, settings: { ...DEFAULT_SETTINGS, focusSound: { ...DEFAULT_FOCUS_SOUND, volume: QA.volume } } };
const segment = (id: string, sourceIn: number, sourceOut: number, speed = 1, mediaId = SOURCE_MEDIA_ID): VideoSegment => ({ id, mediaId, sourceIn, sourceOut, speed, volume: 1 });
const withSegments = (segments: VideoSegment[], clips = base.clips): Project => ({ ...base, clips, editing: { segments, music: [], subtitles: [] } });

describe('聚焦音效与镜头时间映射', () => {
  it('连续输入和邻近点击合并成一段聚焦，只触发进入音效', () => {
    const samples: Project['samples'] = [{ time: 1, x: 0.3, y: 0.4, kind: 'click' }, { time: 1.2, x: 0.3, y: 0.4, kind: 'typing' }, { time: 2, x: 0.3, y: 0.4, kind: 'typing' }, { time: 3, x: 0.3, y: 0.4, kind: 'typing' }];
    const clips = generateClips(samples, QA.duration, 'focus', 2);
    expect(clips).toHaveLength(1);
    expect(focusSoundCues({ ...base, samples, clips }).map(({ time }) => time)).toEqual([clips[0].start]);
  });

  it('按视频倍速与插入素材映射源镜头，外部素材不会触发原录制的音效', () => {
    const project = withSegments([segment('first', 0, 4, 2), segment('external', 0, 2, 1, 'other'), segment('last', 4, 10, 0.5)], [shot('first-click', 1), shot('last-click', 5)]);
    expect(focusSoundCues(project).map(({ time }) => time)).toEqual([0.5, 6]);
  });

  it('分割保留一次触发，删除片段同步删掉对应音效并移动后续触发点', () => {
    const clips = [shot('first', 1), shot('last', 3)];
    expect(focusSoundCues(withSegments([segment('a', 0, 2), segment('b', 2, 10)], clips)).map(({ time }) => time)).toEqual([1, 3]);
    expect(focusSoundCues(withSegments([segment('b', 2, 10)], clips)).map(({ time }) => time)).toEqual([1]);
  });

  it('裁剪区间只保留真正进入的镜头，片段中间开始不会伪造进入音效', () => {
    const project = { ...base, clips: [shot('before', 0.5), shot('inside', 2), shot('end', 4)], trimStart: 1, trimEnd: 4 };
    expect(focusSoundCues(project).map(({ id, time }) => [id, time])).toEqual([['source-segment:inside', 2]]);
    expect(focusSoundCues(withSegments([segment('trimmed', 1.2, 10)]))).toEqual([]);
  });

  it('关闭运镜、关闭音效或禁用全景镜头时不会触发', () => {
    expect(focusSoundCues({ ...base, settings: { ...base.settings, autoZoom: false } })).toEqual([]);
    expect(focusSoundCues({ ...base, settings: { ...base.settings, focusSound: { ...DEFAULT_FOCUS_SOUND, enabled: false } } })).toEqual([]);
    expect(focusSoundCues({ ...base, clips: [shot('off', 1, { enabled: false }), shot('overview', 3, { mode: 'overview' }), shot('no-zoom', 5, { zoom: 1 })] })).toEqual([]);
  });

  it('重复使用素材各自触发，密集重叠镜头去重，缓存不会污染新工程', () => {
    const project = withSegments([segment('a', 0, 4), segment('b', 0, 4)], [shot('one', 1), shot('near', 1.1)]);
    const cues = focusSoundCues(project);
    expect(cues.map(({ time }) => time)).toEqual([1, 5]);
    expect(focusSoundCues(project)).toBe(cues);
    expect(focusSoundCues({ ...project, clips: [] })).toEqual([]);
  });

  it('保存音效开关、样式和音量，旧工程仍能按默认设置播放', () => {
    const focusSound = { enabled: false, id: 'glass-chime', volume: 0.7 } as const;
    const data = readProjectBytes(projectBytes({ ...base, settings: { ...base.settings, focusSound } })).data;
    expect(data.settings.focusSound).toEqual(focusSound);
    const old = parseProject({ ...base, settings: { ...base.settings, focusSound: undefined } });
    expect(focusSoundSettings(old.settings)).toEqual(DEFAULT_FOCUS_SOUND);
    expect(parseFocusSound(undefined)).toBeUndefined();
  });

  it('拒绝损坏或越界的音效设置', () => {
    for (const focusSound of [null, [], { ...DEFAULT_FOCUS_SOUND, enabled: 'true' }, { ...DEFAULT_FOCUS_SOUND, id: 'missing' }, ...[-1, 2, Number.NaN, '0.5'].map((volume) => ({ ...DEFAULT_FOCUS_SOUND, volume }))]) {
      expect(() => parseProject({ ...base, settings: { ...base.settings, focusSound } })).toThrow('INVALID_FOCUS_SOUND');
    }
  });
});

function audioFixture() {
  const gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const makeSource = () => ({ buffer: null as AudioBuffer | null, connect: vi.fn(), disconnect: vi.fn(), stop: vi.fn(), start: vi.fn(), onended: null as (() => void) | null });
  const sources: ReturnType<typeof makeSource>[] = [];
  const audio = { currentTime: QA.clock, createGain: () => gain, createBufferSource: () => { const source = makeSource(); sources.push(source); return source; } } as unknown as AudioContext;
  const buffer = { duration: QA.soundDuration } as AudioBuffer;
  const loader = vi.fn<FocusAudioBufferLoader>(async () => buffer);
  const player = new FocusAudioPlayer(audio, {} as AudioNode, loader);
  return { player, gain, sources, loader, audio, buffer };
}

describe('聚焦音效播放与资源清理', () => {
  it('只有进入音效时间才启动，同一镜头每帧同步不会重复播放', async () => {
    const { player, sources } = audioFixture();
    await player.prepare(base);
    player.sync(base, 0.99, true, false);
    expect(sources).toHaveLength(0);
    player.sync(base, 1.02, true, false);
    expect(sources[0].start).toHaveBeenCalledWith(QA.clock, expect.closeTo(0.02));
    player.sync(base, 1.05, true, false);
    sources[0].onended?.();
    player.sync(base, 1.1, true, false);
    expect(sources).toHaveLength(1);
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    player.dispose();
  });

  it('暂停和逐帧定位不发声，恢复播放从声音当前位置继续', async () => {
    const { player, sources } = audioFixture();
    await player.prepare(base);
    player.sync(base, 1.05, false, false);
    expect(sources).toHaveLength(0);
    player.sync(base, 1.05, true, false);
    player.pause();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    player.sync(base, 1.1, true, false);
    expect(sources[1].start).toHaveBeenCalledWith(QA.clock, expect.closeTo(0.1));
    player.dispose();
  });

  it('随机拖动和回放重新定位，音效区间外不会补播遗漏声音', async () => {
    const { player, sources } = audioFixture();
    await player.prepare(base);
    player.sync(base, 3, true, false);
    expect(sources).toHaveLength(0);
    player.sync(base, 1.05, true, false);
    player.sync(base, 3, true, false);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    player.sync(base, 1.05, true, false);
    expect(sources).toHaveLength(2);
    player.dispose();
  });

  it('调整背景和音量不会重复触发相同镜头的音效', async () => {
    const { player, sources, gain } = audioFixture();
    await player.prepare(base);
    player.sync(base, 1, true, false);
    const updated: Project = { ...base, settings: { ...base.settings, radius: 30, focusSound: { ...DEFAULT_FOCUS_SOUND, volume: 0.2 } } };
    player.sync(updated, 1.1, true, false);
    expect(sources).toHaveLength(1);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, QA.clock, expect.any(Number));
    player.dispose();
  });

  it('静音与独立音量只改变聚焦增益，音量为零时释放活动音效', async () => {
    const { player, gain, sources } = audioFixture();
    await player.prepare(base);
    player.sync(base, 1, true, true);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, QA.clock, expect.any(Number));
    player.sync(base, 1.1, true, false);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(QA.volume, QA.clock, expect.any(Number));
    player.sync({ ...base, settings: { ...base.settings, focusSound: { ...DEFAULT_FOCUS_SOUND, volume: 0 } } }, 1.1, true, false);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    player.dispose();
  });

  it('同款声音复用解码资源，切换款式清理当前节点并加载新资源', async () => {
    const { player, sources, loader } = audioFixture();
    await player.prepare(base); await player.prepare(base);
    expect(loader).toHaveBeenCalledOnce();
    player.sync(base, 1.05, true, false);
    const updated = { ...base, settings: { ...base.settings, focusSound: { ...DEFAULT_FOCUS_SOUND, id: 'air-sweep' as const } } };
    await player.prepare(updated);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(loader.mock.calls[1][1]).toBe('air-sweep');
    player.dispose();
  });

  it('取消或卸载中止加载，迟到的解码结果不能重建播放资源', async () => {
    const { player, loader, buffer, gain, sources } = audioFixture();
    let finish: (value: AudioBuffer) => void = () => undefined;
    loader.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const abort = new AbortController();
    const preparing = player.prepare(base, abort.signal);
    const result = expect(preparing).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort(); player.dispose(); finish(buffer);
    await result;
    expect(loader.mock.calls[0][2]?.aborted).toBe(true);
    expect(gain.disconnect).toHaveBeenCalledOnce();
    player.sync(base, 1, true, false);
    expect(sources).toHaveLength(0);
    await expect(player.prepare(base)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
