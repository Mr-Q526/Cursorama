import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowCounterClockwiseIcon, ArrowsOutSimpleIcon, CircleIcon, CursorClickIcon, PauseIcon, PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import { cameraAt, previewDimensions, previewToSource, VideoRenderer, wallpaperRevision } from '../engine';
import type { PlaybackController } from '../hooks';
import { formatPreciseTime, t } from '../i18n';
import { IconButton, Segmented } from './Controls';

export interface PreviewProps {
  project: Project; playback: PlaybackController; original: boolean;
  onOriginal: (value: boolean) => void; onFocus: (x: number, y: number) => void;
}

const PREVIEW_INSET = { horizontal: 44, vertical: 36 } as const;

export function Preview({ project, playback, original, onOriginal, onFocus }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ project, original });
  latest.current = { project, original };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new VideoRenderer(canvas);
    let frame = 0;
    let lastProject: Project | undefined;
    let lastOriginal = false;
    let lastTime = -1;
    let lastWidth = -1;
    let lastHeight = -1;
    let lastReadyState = -1;
    let lastTheme: string | undefined;
    let lastBackgroundRevision = -1;
    const render = (): void => {
      const { project: current, original: showOriginal } = latest.current;
      const time = playback.timeRef.current;
      const readyState = playback.videoRef.current?.readyState ?? 0;
      const theme = document.documentElement.dataset.theme;
      const backgroundRevision = wallpaperRevision(current.settings.background);
      if (current !== lastProject || showOriginal !== lastOriginal || time !== lastTime || canvas.width !== lastWidth || canvas.height !== lastHeight || readyState !== lastReadyState || theme !== lastTheme || backgroundRevision !== lastBackgroundRevision) {
        renderer.render(current, time, playback.videoRef.current, showOriginal);
        lastProject = current; lastOriginal = showOriginal; lastTime = time; lastWidth = canvas.width; lastHeight = canvas.height; lastReadyState = readyState; lastTheme = theme;
        lastBackgroundRevision = backgroundRevision;
      }
      frame = requestAnimationFrame(render);
    };
    render();
    return () => { cancelAnimationFrame(frame); renderer.dispose(); };
  }, [playback.timeRef, playback.videoRef]);

  useEffect(() => {
    const canvas = canvasRef.current; const stage = stageRef.current;
    if (!canvas || !stage) return;
    const updateSize = (): void => {
      const bounds = stage.getBoundingClientRect();
      const fullscreen = document.fullscreenElement === stage;
      const { displayWidth, displayHeight, pixelWidth, pixelHeight } = previewDimensions(latest.current.project.settings.aspect, bounds.width - (fullscreen ? 0 : PREVIEW_INSET.horizontal), bounds.height - (fullscreen ? 0 : PREVIEW_INSET.vertical), window.devicePixelRatio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    };
    const observer = new ResizeObserver(updateSize); observer.observe(stage); updateSize();
    document.addEventListener('fullscreenchange', updateSize);
    window.addEventListener('resize', updateSize);
    return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', updateSize); window.removeEventListener('resize', updateSize); };
  }, [project.settings.aspect]);

  const handleFocus = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (original || document.fullscreenElement) return;
    playback.pause();
    const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect();
    const camera = cameraAt(playback.timeRef.current, project.samples, project.clips, project.settings);
    const point = previewToSource({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, { width: bounds.width, height: bounds.height }, { width: project.width, height: project.height }, camera, project.settings);
    if (point) onFocus(point.x, point.y);
  };

  return <section className="preview-panel" aria-label={t.editor.preview}>
    <div className="preview-toolbar"><Segmented label={t.editor.preview} value={original ? 'original' : 'styled'} onChange={(value) => onOriginal(value === 'original')} options={[{ value: 'styled', label: t.editor.styled }, { value: 'original', label: t.editor.original }]} /><div className="preview-meta"><CircleIcon size={9} weight="fill" /><span>{project.width} × {project.height}</span><span className="meta-separator" />{project.sourceType === 'demo' ? t.editor.demoBadge : t.editor.localOnly}</div></div>
    {project.sourceType === 'demo' && <p className="demo-hint">{t.editor.demoHint}</p>}
    <div className="preview-stage" ref={stageRef}><canvas aria-label={t.editor.focusAt} ref={canvasRef} onPointerDown={handleFocus} /><div className="stage-corners" aria-hidden="true" /><button type="button" className="soft-button fullscreen-exit" onClick={() => void document.exitFullscreen()}>{t.editor.exitFullscreen}</button></div>
    <div className="playback-bar"><div className="preview-hint"><CursorClickIcon size={15} /><span>{t.editor.focusAt}</span></div><div className="playback-center"><IconButton icon={ArrowCounterClockwiseIcon} label={t.editor.restart} onClick={() => playback.seek(project.trimStart)} size={17} /><IconButton icon={playback.playing ? PauseIcon : PlayIcon} label={playback.playing ? t.editor.pause : t.editor.play} onClick={() => void playback.toggle()} className="play-button" size={18} /><span className="time-display">{formatPreciseTime(playback.time)}<span> / {formatPreciseTime(project.duration)}</span></span></div><div className="playback-right"><IconButton icon={playback.muted ? SpeakerSlashIcon : SpeakerHighIcon} label={playback.muted ? t.editor.unmute : t.editor.mute} onClick={playback.toggleMuted} disabled={!project.hasAudio} size={18} /><IconButton icon={ArrowsOutSimpleIcon} label={t.editor.fullscreen} onClick={() => void stageRef.current?.requestFullscreen()} size={18} /></div></div>
  </section>;
}
