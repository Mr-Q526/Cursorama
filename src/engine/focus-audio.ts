import { focusSoundCues, focusSoundSettings, FOCUS_SOUND_TIMING } from '../../shared';
import type { FocusSoundCue, FocusSoundId, Project } from '../../shared';
import { loadFocusSoundBuffer } from '../focus-sounds';

export type FocusAudioBufferLoader = (context: BaseAudioContext, id: FocusSoundId, signal?: AbortSignal) => Promise<AudioBuffer>;

const FOCUS_AUDIO = { gainRamp: 0.01 } as const;

export class FocusAudioPlayer {
  private readonly gain: GainNode;
  private readonly sources = new Map<string, AudioBufferSourceNode>();
  private readonly played = new Set<string>();
  private controller?: AbortController;
  private buffer?: AudioBuffer;
  private bufferId?: FocusSoundId;
  private lastTime?: number;
  private cues?: readonly FocusSoundCue[];
  private disposed = false;

  constructor(private readonly audio: AudioContext, destination: AudioNode, private readonly loadBuffer: FocusAudioBufferLoader = loadFocusSoundBuffer) {
    this.gain = audio.createGain(); this.gain.gain.value = 0; this.gain.connect(destination);
  }

  async prepare(project: Project, signal?: AbortSignal): Promise<void> {
    if (this.disposed || signal?.aborted) throw new DOMException('FOCUS_AUDIO_CANCELLED', 'AbortError');
    const setting = focusSoundSettings(project.settings);
    if (!setting.enabled || !focusSoundCues(project).length) { this.pause(); return; }
    if (this.buffer && this.bufferId === setting.id) return;
    this.controller?.abort(); this.pause();
    const controller = new AbortController(); this.controller = controller;
    const cancelled = (): void => controller.abort();
    signal?.addEventListener('abort', cancelled, { once: true });
    try {
      const buffer = await this.loadBuffer(this.audio, setting.id, controller.signal);
      if (this.disposed || controller.signal.aborted) throw new DOMException('FOCUS_AUDIO_CANCELLED', 'AbortError');
      this.buffer = buffer; this.bufferId = setting.id;
    } finally { signal?.removeEventListener('abort', cancelled); }
  }

  sync(project: Project, time: number, playing: boolean, muted: boolean): void {
    if (this.disposed) return;
    const setting = focusSoundSettings(project.settings);
    const cues = focusSoundCues(project);
    const jumped = this.lastTime !== undefined && (time < this.lastTime - FOCUS_SOUND_TIMING.clockTolerance || time - this.lastTime > FOCUS_SOUND_TIMING.seekThreshold);
    const changed = cues !== this.cues && (!this.cues || cues.length !== this.cues.length || cues.some((cue, index) => cue.id !== this.cues?.[index].id || cue.time !== this.cues?.[index].time));
    if (changed || jumped) this.pause();
    this.cues = cues; this.lastTime = time;
    if (!playing || !setting.enabled || !this.buffer || this.bufferId !== setting.id || setting.volume <= 0) { this.pause(); return; }
    this.gain.gain.setTargetAtTime(muted ? 0 : setting.volume, this.audio.currentTime, FOCUS_AUDIO.gainRamp);
    for (const cue of cues) {
      const offset = time - cue.time;
      if (offset < 0 || offset >= this.buffer.duration || this.played.has(cue.id)) continue;
      const source = this.audio.createBufferSource(); source.buffer = this.buffer;
      source.connect(this.gain); this.played.add(cue.id); this.sources.set(cue.id, source);
      source.onended = () => { source.disconnect(); if (this.sources.get(cue.id) === source) this.sources.delete(cue.id); };
      source.start(this.audio.currentTime, offset);
    }
  }

  pause(): void {
    for (const source of this.sources.values()) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear(); this.played.clear();
  }

  dispose(): void { this.disposed = true; this.controller?.abort(); this.pause(); this.gain.disconnect(); this.buffer = undefined; }
}
