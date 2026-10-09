import { ArrowCounterClockwiseIcon, ArrowsInSimpleIcon, ArrowsOutSimpleIcon, PauseIcon, PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import type { PlaybackController } from '../hooks';
import { formatPreciseTime, t } from '../i18n';
import { IconButton } from './Controls';

export interface PlaybackControlsProps {
  project: Project;
  playback: PlaybackController;
  fullscreen: boolean;
  onFullscreen: () => void;
  className?: string;
}

const PROGRESS = { percent: 100, step: 0.01 } as const;

export function PlaybackControls({ project, playback, fullscreen, onFullscreen, className = '' }: PlaybackControlsProps) {
  const progress = project.duration > 0 ? Math.min(PROGRESS.percent, playback.time / project.duration * PROGRESS.percent) : 0;
  return <div className={`playback-controls ${className}`} role="group" aria-label={t.playback.controls}>
    <input className="playback-progress" type="range" aria-label={t.playback.seek} min={0} max={project.duration} step={PROGRESS.step} value={playback.time} style={{ background: `linear-gradient(to right, var(--playback-fill) ${progress}%, var(--playback-track) ${progress}%)` }} onChange={(event) => playback.seek(Number(event.currentTarget.value))} />
    <div className="playback-controls-row"><div className="playback-center"><IconButton icon={ArrowCounterClockwiseIcon} label={t.editor.restart} onClick={() => playback.seek(project.trimStart)} size={17} /><IconButton icon={playback.playing ? PauseIcon : PlayIcon} label={playback.playing ? t.editor.pause : t.editor.play} onClick={() => void playback.toggle()} className="play-button" size={18} /><span className="time-display">{formatPreciseTime(playback.time)}<span> / {formatPreciseTime(project.duration)}</span></span></div>
      <div className="playback-right"><IconButton icon={playback.muted ? SpeakerSlashIcon : SpeakerHighIcon} label={playback.muted ? t.editor.unmute : t.editor.mute} onClick={playback.toggleMuted} disabled={!project.hasAudio} size={18} /><IconButton icon={fullscreen ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon} label={fullscreen ? t.editor.exitFullscreen : t.editor.fullscreen} onClick={onFullscreen} size={18} /></div>
    </div>
  </div>;
}
