import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../shared';
import { TIME } from '../../shared';
import { clamp } from '../engine/motion';

export function usePlayback(project: Project | null) {
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const timeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(false);
  const boundsRef = useRef({ start: project?.trimStart ?? 0, end: project?.trimEnd ?? 0 });
  boundsRef.current = { start: project?.trimStart ?? 0, end: project?.trimEnd ?? 0 };

  useEffect(() => {
    setPlaying(false); playingRef.current = false; timeRef.current = 0; setTimeState(0);
    if (!project?.videoUrl) { videoRef.current = null; return; }
    const video = document.createElement('video');
    video.src = project.videoUrl; video.preload = 'auto'; video.playsInline = true;
    videoRef.current = video; video.load();
    return () => { video.pause(); video.removeAttribute('src'); video.load(); videoRef.current = null; };
  }, [project?.videoUrl, project?.sourceType]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, project?.videoUrl]);

  const seek = useCallback((next: number) => {
    const value = clamp(next, 0, project?.duration ?? 0);
    timeRef.current = value; setTimeState(value);
    const video = videoRef.current;
    if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) video.currentTime = value;
  }, [project?.duration]);

  const pause = useCallback(() => { playingRef.current = false; setPlaying(false); videoRef.current?.pause(); }, []);

  const toggle = useCallback(async () => {
    if (boundsRef.current.end === 0) return;
    if (playingRef.current) { pause(); return; }
    if (timeRef.current >= boundsRef.current.end - 0.02 || timeRef.current < boundsRef.current.start) seek(boundsRef.current.start);
    try {
      if (videoRef.current) await videoRef.current.play();
      playingRef.current = true; setPlaying(true);
    } catch (error) { console.error('PREVIEW_PLAY_FAILED', error); pause(); }
  }, [pause, seek]);

  useEffect(() => {
    let frame = 0;
    let lastFrame = performance.now();
    let lastUI = 0;
    const tick = (now: number): void => {
      if (playingRef.current) {
        timeRef.current = videoRef.current ? videoRef.current.currentTime : timeRef.current + (now - lastFrame) / TIME.milliseconds;
        if (timeRef.current >= boundsRef.current.end || videoRef.current?.ended) {
          timeRef.current = boundsRef.current.end; pause(); setTimeState(timeRef.current);
        } else if (now - lastUI > TIME.uiInterval) { setTimeState(timeRef.current); lastUI = now; }
      }
      lastFrame = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pause]);

  return { time, timeRef, videoRef, playing, muted, seek, pause, toggle, toggleMuted: () => setMuted((current) => !current) };
}

export type PlaybackController = ReturnType<typeof usePlayback>;
