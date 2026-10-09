import { DotsSixVerticalIcon, NotePencilIcon, PauseIcon, PlayIcon, RecordIcon, StopIcon } from '@phosphor-icons/react';
import type { RecordingCommand, RecordingOverlayState } from '../../shared';
import { formatTime, t } from '../i18n';
import { IconButton } from './Controls';

export interface RecordingDockProps {
  state: RecordingOverlayState;
  onCommand: (command: RecordingCommand) => void;
  onPrompter: () => void;
}

export function RecordingDock({ state, onCommand, onPrompter }: RecordingDockProps) {
  const copy = t.recorderControls;
  return <section className={`recording-dock${state.paused ? ' is-paused' : ''}`} aria-label={copy.title} data-recording-active={state.active}>
    <span className="dock-drag" title={copy.drag}><DotsSixVerticalIcon size={18} /></span><div className="dock-time" title={copy.shortcuts}><RecordIcon size={11} weight="fill" /><div><strong className="recording-clock" aria-label={copy.duration}>{formatTime(state.elapsed)}</strong><span>{state.paused ? copy.paused : copy.recording}</span></div></div>
    <div className="dock-actions"><IconButton icon={state.paused ? PlayIcon : PauseIcon} label={state.paused ? copy.resume : copy.pause} onClick={() => onCommand(state.paused ? 'resume' : 'pause')} disabled={state.pending || !state.active} /><IconButton icon={NotePencilIcon} label={state.prompterVisible ? t.teleprompter.hide : t.teleprompter.show} onClick={onPrompter} active={state.prompterVisible} disabled={!state.active} /><IconButton icon={StopIcon} label={t.recording.stop} onClick={() => onCommand('stop')} disabled={state.pending || !state.active} className="dock-stop" /></div>
  </section>;
}
