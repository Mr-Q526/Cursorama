import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../shared';
import { timelineDuration, TIME } from '../../shared';
import { clamp } from '../engine/motion';
import { TimelineMediaController } from '../engine/timeline-media';

const PLAYBACK_END_EPSILON = 0.02;

export function usePlayback(project: Project | null) {
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const timeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(false);
  const mutedRef = useRef(muted);
  const projectRef = useRef(project);
  const mediaRef = useRef<TimelineMediaController | null>(null);
  const readyRef = useRef<Promise<TimelineMediaController> | null>(null);
  const boundsRef = useRef({ start: 0, end: 0 });
  projectRef.current = project; mutedRef.current = muted;
  boundsRef.current = { start: project?.trimStart ?? 0, end: project ? Math.min(project.trimEnd, timelineDuration(project)) : 0 };
  const mediaSignature = Object.values(project?.media ?? {}).map((asset) => `${asset.id}:${asset.url}`).join('|');
  const musicSignature = (project?.editing?.music ?? []).map((clip) => `${clip.id}:${clip.mediaId}`).join('|');

  useEffect(() => {
    const abort = new AbortController();
    const current = projectRef.current;
    playingRef.current = false; setPlaying(false);
    videoRef.current = null;
    if (!current) { timeRef.current = 0; setTimeState(0); readyRef.current = null; return; }
    const pending = TimelineMediaController.create(current, 'preview', abort.signal);
    readyRef.current = pending;
    void pending.then((media) => {
      if (abort.signal.aborted) { void media.dispose().catch((error: unknown) => console.error('PREVIEW_MEDIA_RELEASE_FAILED', error)); return; }
      mediaRef.current = media;
      const latest = projectRef.current;
      if (latest) { media.sync(latest, timeRef.current, false, mutedRef.current); videoRef.current = media.video; }
    }).catch((error: unknown) => { if (!abort.signal.aborted) console.error('PREVIEW_MEDIA_LOAD_FAILED', error); });
    return () => {
      abort.abort();
      const media = mediaRef.current; mediaRef.current = null;
      if (media) void media.dispose().catch((error: unknown) => console.error('PREVIEW_MEDIA_RELEASE_FAILED', error));
      videoRef.current = null;
    };
  }, [project?.videoUrl, project?.sourceType, mediaSignature, musicSignature]);

  const seek = useCallback((next: number): void => {
    const current = projectRef.current;
    const value = clamp(next, 0, current ? timelineDuration(current) : 0);
    timeRef.current = value; setTimeState(value);
    if (current && mediaRef.current) { mediaRef.current.sync(current, value, playingRef.current, mutedRef.current); videoRef.current = mediaRef.current.video; }
  }, []);

  const pause = useCallback((): void => { playingRef.current = false; setPlaying(false); mediaRef.current?.pause(); }, []);

  useEffect(() => { pause(); seek(0); }, [project?.videoUrl, project?.sourceType, pause, seek]);
  useEffect(() => { if (project) seek(Math.min(timeRef.current, timelineDuration(project))); }, [project?.editing, project?.trimStart, project?.trimEnd, seek]);

  const toggle = useCallback(async (): Promise<void> => {
    if (boundsRef.current.end === 0) return;
    if (playingRef.current) { pause(); return; }
    if (timeRef.current >= boundsRef.current.end - PLAYBACK_END_EPSILON || timeRef.current < boundsRef.current.start) seek(boundsRef.current.start);
    try {
      const media = await readyRef.current;
      const current = projectRef.current;
      if (!current || !media) return;
      await media.prepareAudio(current);
      await media.seek(current, timeRef.current);
      playingRef.current = true; setPlaying(true);
      media.sync(current, timeRef.current, true, mutedRef.current); videoRef.current = media.video;
    } catch (error) { console.error('PREVIEW_PLAY_FAILED', error); pause(); }
  }, [pause, seek]);

  useEffect(() => {
    let frame = 0;
    let lastFrame = performance.now();
    let lastUI = 0;
    const tick = (now: number): void => {
      if (playingRef.current) {
        timeRef.current += (now - lastFrame) / TIME.milliseconds;
        if (timeRef.current >= boundsRef.current.end) {
          timeRef.current = boundsRef.current.end; pause(); setTimeState(timeRef.current);
        } else if (now - lastUI > TIME.uiInterval) { setTimeState(timeRef.current); lastUI = now; }
      }
      const current = projectRef.current;
      if (current && mediaRef.current) { mediaRef.current.sync(current, timeRef.current, playingRef.current, mutedRef.current); videoRef.current = mediaRef.current.video; }
      lastFrame = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pause]);

  return { time, timeRef, videoRef, playing, muted, seek, pause, toggle, toggleMuted: () => setMuted((current) => !current) };
}

export type PlaybackController = ReturnType<typeof usePlayback>;
