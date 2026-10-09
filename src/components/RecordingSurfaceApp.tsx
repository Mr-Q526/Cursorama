import { useState } from 'react';
import type { RecordingCommand, RecordingSurface } from '../../shared';
import { useRecordingOverlay, useTheme } from '../hooks';
import { t } from '../i18n';
import { RecordingDock } from './RecordingDock';
import { Teleprompter } from './Teleprompter';

export interface RecordingSurfaceAppProps { surface: RecordingSurface; }

export function RecordingSurfaceApp({ surface }: RecordingSurfaceAppProps) {
  useTheme();
  const { state, failed } = useRecordingOverlay();
  const [actionFailed, setActionFailed] = useState(false);
  const perform = async (operation: (() => Promise<void>) | undefined): Promise<void> => {
    try { await operation?.(); setActionFailed(false); }
    catch (error) { console.error('RECORDING_CONTROL_FAILED', error); setActionFailed(true); }
  };
  const command = (value: RecordingCommand): void => { void perform(() => window.desktop?.requestRecordingCommand(value) ?? Promise.resolve()); };
  return <main className={`recording-surface ${surface}`}>
    {surface === 'recording-dock' ? <RecordingDock state={state} onCommand={command} onPrompter={() => void perform(window.desktop?.togglePrompter)} /> : <Teleprompter script={state.script} recordingPaused={state.paused || state.pending || !state.active || !state.prompterVisible} onClose={() => void perform(window.desktop?.togglePrompter)} />}
    {(failed || actionFailed) && <p className="recording-control-error" role="alert">{t.recorderControls.failed}</p>}
  </main>;
}
