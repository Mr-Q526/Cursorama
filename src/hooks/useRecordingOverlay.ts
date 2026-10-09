import { useEffect, useState } from 'react';
import { initialRecordingOverlay, type RecordingOverlayState } from '../../shared';

export interface RecordingOverlayController { state: RecordingOverlayState; failed: boolean; }

export function useRecordingOverlay(): RecordingOverlayController {
  const [state, setState] = useState<RecordingOverlayState>(initialRecordingOverlay);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    let active = true;
    let received = false;
    const unsubscribe = desktop.onRecordingOverlay((next) => { received = true; if (active) { setState(next); setFailed(false); } });
    void desktop.getRecordingOverlay().then((next) => { if (active && !received) setState(next); }).catch((error: unknown) => { console.error('RECORDING_OVERLAY_FAILED', error); if (active) setFailed(true); });
    return () => { active = false; unsubscribe(); };
  }, []);
  return { state, failed };
}
