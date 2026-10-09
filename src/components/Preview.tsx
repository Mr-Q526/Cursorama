import { useEffect, useRef, useState } from 'react';
import { CircleIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import { isProjectFrameReady, previewDimensions, projectPreviewRevision, VideoRenderer, wallpaperRevision } from '../engine';
import type { PlaybackController } from '../hooks';
import { t } from '../i18n';
import { Segmented } from './Controls';
import { PlaybackControls } from './PlaybackControls';

export interface PreviewProps {
  project: Project; playback: PlaybackController; original: boolean;
  onOriginal: (value: boolean) => void;
}

const PREVIEW_INSET = { horizontal: 44, vertical: 36 } as const;
const CONTROLS_HIDE_DELAY = 2400;

export function Preview({ project, playback, original, onOriginal }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    let lastVideoTime = -1;
    let lastSeeking = false;
    let lastVideo: HTMLVideoElement | null = null;
    let lastTheme: string | undefined;
    let lastBackgroundRevision = -1;
    const render = (): void => {
      const { project: current, original: showOriginal } = latest.current;
      const time = playback.timeRef.current;
      const readyState = playback.videoRef.current?.readyState ?? 0;
      const videoTime = playback.videoRef.current?.currentTime ?? -1;
      const seeking = playback.videoRef.current?.seeking ?? false;
      const theme = document.documentElement.dataset.theme;
      const backgroundRevision = wallpaperRevision(current.settings.background);
      if (current !== lastProject || showOriginal !== lastOriginal || time !== lastTime || videoTime !== lastVideoTime || seeking !== lastSeeking || playback.videoRef.current !== lastVideo || canvas.width !== lastWidth || canvas.height !== lastHeight || readyState !== lastReadyState || theme !== lastTheme || backgroundRevision !== lastBackgroundRevision) {
        renderer.render(current, time, playback.videoRef.current, showOriginal);
        if (isProjectFrameReady(current, time, playback.videoRef.current)) canvas.dataset.projectRevision = projectPreviewRevision(current);
        else delete canvas.dataset.projectRevision;
        lastProject = current; lastOriginal = showOriginal; lastTime = time; lastWidth = canvas.width; lastHeight = canvas.height; lastReadyState = readyState; lastTheme = theme;
        lastBackgroundRevision = backgroundRevision;
        lastVideoTime = videoTime;
        lastSeeking = seeking; lastVideo = playback.videoRef.current;
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
  const showControls = (): void => {
    setControlsVisible(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  };
  useEffect(() => {
    const changed = (): void => { setFullscreen(document.fullscreenElement === stageRef.current); showControls(); };
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, []);
  const toggleFullscreen = async (): Promise<void> => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stageRef.current?.requestFullscreen(); }
    catch (error) { console.error('PREVIEW_FULLSCREEN_FAILED', error); }
  };

  return <section className="preview-panel" aria-label={t.editor.preview}>
    <div className="preview-toolbar"><Segmented label={t.editor.preview} value={original ? 'original' : 'styled'} onChange={(value) => onOriginal(value === 'original')} options={[{ value: 'styled', label: t.editor.styled }, { value: 'original', label: t.editor.original }]} /><div className="preview-meta"><CircleIcon size={9} weight="fill" /><span>{project.width} × {project.height}</span><span className="meta-separator" />{project.sourceType === 'demo' ? t.editor.demoBadge : t.editor.localOnly}</div></div>
    {project.sourceType === 'demo' && <p className="demo-hint">{t.editor.demoHint}</p>}
    <div className="preview-stage" ref={stageRef} data-controls-visible={controlsVisible || !playback.playing} onPointerMove={showControls} onFocusCapture={showControls}><canvas aria-label={t.editor.preview} ref={canvasRef} onDoubleClick={() => void toggleFullscreen()} /><div className="stage-corners" aria-hidden="true" />{fullscreen && <PlaybackControls project={project} playback={playback} fullscreen onFullscreen={() => void toggleFullscreen()} className="fullscreen-playback" />}</div>
    {!fullscreen && <PlaybackControls project={project} playback={playback} fullscreen={false} onFullscreen={() => void toggleFullscreen()} className="playback-bar" />}
  </section>;
}
