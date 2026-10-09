import { resolveTimeline, SOURCE_MEDIA_ID, TIME } from '../../shared';
import type { MediaAsset, Project, TimelineMapping } from '../../shared';

export type MediaOutput = 'preview' | 'export';
interface MediaPlayer { element: HTMLMediaElement; source?: MediaElementAudioSourceNode; gain?: GainNode; playing: boolean; pending: boolean; }
const MEDIA_TIMING = { timeout: 15_000, drift: 0.16, seekEpsilon: 0.004, minimumDuration: 0.2, maximumDuration: 86_400 } as const;
const musicPlayerId = (id: string): string => `music:${id}`;

export function releaseMedia(element: HTMLMediaElement): void {
  element.pause(); element.removeAttribute('src'); element.load();
}

export async function loadTimelineMedia(url: string, kind: 'video' | 'audio', signal?: AbortSignal): Promise<HTMLMediaElement> {
  const element = document.createElement(kind);
  element.preload = 'auto';
  if (element instanceof HTMLVideoElement) element.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => { clearTimeout(timeout); element.removeEventListener('loadeddata', ready); element.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); };
      const ready = (): void => { cleanup(); resolve(); };
      const failed = (): void => { cleanup(); reject(new Error('MEDIA_LOAD_FAILED')); };
      const aborted = (): void => { cleanup(); reject(new DOMException('MEDIA_LOAD_CANCELLED', 'AbortError')); };
      const timeout = setTimeout(failed, MEDIA_TIMING.timeout);
      element.addEventListener('loadeddata', ready, { once: true }); element.addEventListener('error', failed, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      element.src = url; element.load();
    });
    return element;
  } catch (error) { releaseMedia(element); throw error; }
}

async function finiteMediaDuration(element: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(element.duration)) return element.duration;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timeout); element.removeEventListener('durationchange', changed); element.removeEventListener('seeked', changed); };
    const changed = (): void => { if (Number.isFinite(element.duration)) { cleanup(); resolve(); } };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('MEDIA_DURATION_FAILED')); }, TIME.seekTimeout);
    element.addEventListener('durationchange', changed); element.addEventListener('seeked', changed);
    element.currentTime = Number.MAX_SAFE_INTEGER;
  });
  return element.duration;
}

export async function importMediaFile(file: File, kind: 'video' | 'audio'): Promise<MediaAsset> {
  const url = URL.createObjectURL(file);
  let element: HTMLMediaElement | undefined;
  try {
    element = await loadTimelineMedia(url, kind);
    const duration = await finiteMediaDuration(element);
    if (duration < MEDIA_TIMING.minimumDuration || duration > MEDIA_TIMING.maximumDuration) throw new Error('MEDIA_DURATION_FAILED');
    const video = element instanceof HTMLVideoElement ? element : undefined;
    return { id: crypto.randomUUID(), name: file.name, kind, mimeType: file.type || `${kind}/${kind === 'audio' ? 'mpeg' : 'mp4'}`, duration, width: video?.videoWidth, height: video?.videoHeight, hasAudio: true, url, blob: file };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { if (element) releaseMedia(element); }
}

function seekElement(element: HTMLMediaElement, time: number, signal?: AbortSignal): Promise<void> {
  if (Math.abs(element.currentTime - time) <= MEDIA_TIMING.seekEpsilon && !element.seeking) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timeout); element.removeEventListener('seeked', ready); element.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); };
    const ready = (): void => { cleanup(); resolve(); };
    const failed = (): void => { cleanup(); reject(new Error('MEDIA_SEEK_FAILED')); };
    const aborted = (): void => { cleanup(); reject(new DOMException('MEDIA_SEEK_CANCELLED', 'AbortError')); };
    const timeout = setTimeout(failed, TIME.seekTimeout);
    element.addEventListener('seeked', ready, { once: true }); element.addEventListener('error', failed, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    element.currentTime = Math.max(0, Math.min(time, Number.isFinite(element.duration) ? Math.max(0, element.duration - MEDIA_TIMING.seekEpsilon) : time));
  });
}

export class TimelineMediaController {
  private readonly players = new Map<string, MediaPlayer>();
  private audio?: AudioContext;
  private destination?: MediaStreamAudioDestinationNode;
  private activeSegment?: string;
  private disposed = false;
  private active?: HTMLVideoElement;

  private constructor(private readonly output: MediaOutput) {}

  static async create(project: Project, output: MediaOutput, signal?: AbortSignal): Promise<TimelineMediaController> {
    const controller = new TimelineMediaController(output);
    try {
      if (project.sourceType === 'video' && project.videoUrl) await controller.add(SOURCE_MEDIA_ID, project.videoUrl, 'video', signal);
      for (const asset of Object.values(project.media ?? {})) if (asset.kind === 'video') await controller.add(asset.id, asset.url, asset.kind, signal);
      for (const music of project.editing?.music ?? []) {
        const asset = project.media?.[music.mediaId];
        if (!asset) throw new Error('MISSING_MEDIA_ASSET');
        await controller.add(musicPlayerId(music.id), asset.url, 'audio', signal);
      }
      return controller;
    } catch (error) { await controller.dispose(); throw error; }
  }

  private async add(id: string, url: string, kind: 'video' | 'audio', signal?: AbortSignal): Promise<void> {
    const element = await loadTimelineMedia(url, kind, signal);
    this.players.set(id, { element, playing: false, pending: false });
  }

  get video(): HTMLVideoElement | null { return this.active ?? null; }
  get audioStream(): MediaStream | undefined { return this.destination?.stream; }

  async prepareAudio(project: Project): Promise<void> {
    if (!this.audio && (project.hasAudio || (project.editing?.music.length ?? 0) > 0 || project.mediaAssets?.some((asset) => asset.hasAudio))) {
      this.audio = new AudioContext();
      if (this.output === 'export') this.destination = this.audio.createMediaStreamDestination();
      const destination = this.destination ?? this.audio.destination;
      for (const player of this.players.values()) {
        player.source = this.audio.createMediaElementSource(player.element); player.gain = this.audio.createGain();
        player.element.volume = 1; player.element.muted = false;
        player.gain.gain.value = 0; player.source.connect(player.gain); player.gain.connect(destination);
      }
    }
    if (this.audio?.state === 'suspended') await this.audio.resume();
  }

  private setPlayer(player: MediaPlayer, time: number, rate: number, volume: number, playing: boolean, forceSeek: boolean): void {
    player.element.playbackRate = rate;
    if (player.gain) player.gain.gain.value = volume;
    else { player.element.muted = volume === 0; player.element.volume = volume; }
    const drift = Math.abs(player.element.currentTime - time);
    if ((forceSeek && drift > MEDIA_TIMING.seekEpsilon) || drift > MEDIA_TIMING.drift) player.element.currentTime = Math.max(0, time);
    if (playing && !player.pending && (!player.playing || player.element.paused || player.element.ended)) {
      player.playing = true; player.pending = true;
      void player.element.play().then(() => { player.pending = false; }).catch((error: unknown) => { player.playing = false; player.pending = false; if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) console.error('TIMELINE_MEDIA_PLAY_FAILED', error); });
    } else if (!playing && player.playing) { player.element.pause(); player.playing = false; }
  }

  sync(project: Project, time: number, playing: boolean, muted: boolean): TimelineMapping {
    const mapping = resolveTimeline(project, time);
    const changed = this.activeSegment !== mapping.segment.id;
    this.activeSegment = mapping.segment.id;
    this.active = undefined;
    const activeIds = new Set<string>();
    const video = this.players.get(mapping.mediaId);
    if (video && video.element instanceof HTMLVideoElement) {
      this.active = video.element; activeIds.add(mapping.mediaId);
      this.setPlayer(video, mapping.sourceTime, mapping.segment.speed, muted || !mapping.hasAudio ? 0 : mapping.segment.volume, playing, changed || !playing);
    }
    for (const music of project.editing?.music ?? []) {
      const end = music.start + music.sourceOut - music.sourceIn;
      if (time < music.start || time >= end) continue;
      const id = musicPlayerId(music.id);
      const player = this.players.get(id); if (!player) continue;
      activeIds.add(id);
      this.setPlayer(player, music.sourceIn + time - music.start, 1, muted ? 0 : music.volume, playing, !playing);
    }
    for (const [id, player] of this.players) if (!activeIds.has(id)) { player.element.pause(); player.playing = false; if (player.gain) player.gain.gain.value = 0; }
    return mapping;
  }

  async seek(project: Project, time: number, signal?: AbortSignal): Promise<void> {
    this.pause();
    const mapping = this.sync(project, time, false, false);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const operations: Promise<void>[] = [];
    const video = this.players.get(mapping.mediaId);
    if (video) operations.push(seekElement(video.element, mapping.sourceTime, signal));
    for (const music of project.editing?.music ?? []) {
      const player = this.players.get(musicPlayerId(music.id));
      if (player && time >= music.start && time < music.start + music.sourceOut - music.sourceIn) operations.push(seekElement(player.element, music.sourceIn + time - music.start, signal));
    }
    await Promise.all(operations);
  }

  pause(): void { for (const player of this.players.values()) { player.element.pause(); player.playing = false; } }

  async dispose(): Promise<void> {
    this.disposed = true; this.pause();
    for (const player of this.players.values()) { player.source?.disconnect(); player.gain?.disconnect(); releaseMedia(player.element); }
    this.players.clear(); this.active = undefined;
    if (this.audio && this.audio.state !== 'closed') await this.audio.close();
  }
}
