import { ArrowCounterClockwiseIcon, ArrowsInSimpleIcon, ArrowsOutSimpleIcon, PauseIcon, PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import { focusSoundCues, focusSoundSettings, playbackFrameRate, timelineDuration } from '../../shared';
import type { PlaybackController } from '../hooks';
import { formatFrameTime, t } from '../i18n';
import { IconButton } from './Controls';

export interface PlaybackControlsProps {
  project: Project;
  playback: PlaybackController;
  fullscreen: boolean;
  onFullscreen: () => void;
  className?: string;
}

const PROGRESS = { percent: 100, step: 'any' } as const;

export function PlaybackControls({ project, playback, fullscreen, onFullscreen, className = '' }: PlaybackControlsProps) {
  const duration = timelineDuration(project);
  const frameRate = playbackFrameRate(project);
  const hasAudio = project.hasAudio || Boolean(project.editing?.music.length) || Boolean(project.mediaAssets?.some((asset) => asset.hasAudio)) || (focusSoundCues(project).length > 0 && focusSoundSettings(project.settings).volume > 0);
  const progress = duration > 0 ? Math.min(PROGRESS.percent, playback.time / duration * PROGRESS.percent) : 0;
  return <div className={`playback-controls ${className}`} role="group" aria-label={t.playback.controls}>
    <input className="playback-progress" type="range" aria-label={t.playback.seek} min={0} max={duration} step={PROGRESS.step} value={playback.time} style={{ background: `linear-gradient(to right, var(--playback-fill) ${progress}%, var(--playback-track) ${progress}%)` }} onChange={(event) => playback.seek(Number(event.currentTarget.value))} onKeyDown={(event) => { if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); playback.stepFrame(event.code === 'ArrowLeft' ? -1 : 1); } }} />
    <div className="playback-controls-row"><div className="playback-center"><IconButton icon={ArrowCounterClockwiseIcon} label={t.editor.restart} onClick={() => playback.seek(project.trimStart)} size={17} /><IconButton icon={playback.playing ? PauseIcon : PlayIcon} label={playback.playing ? t.editor.pause : t.editor.play} onClick={() => void playback.toggle()} className="play-button" size={18} /><span className="time-display" title={t.playback.frameHint}>{formatFrameTime(playback.time, frameRate)}<span> / {formatFrameTime(duration, frameRate)}</span></span></div>
      <div className="playback-right"><IconButton icon={playback.muted ? SpeakerSlashIcon : SpeakerHighIcon} label={playback.muted ? t.editor.unmute : t.editor.mute} onClick={playback.toggleMuted} disabled={!hasAudio} size={18} /><IconButton icon={fullscreen ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon} label={fullscreen ? t.editor.exitFullscreen : t.editor.fullscreen} onClick={() => void onFullscreen()} size={18} /></div>
    </div>
  </div>;
}
