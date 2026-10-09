import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION, initialUpdateState, type UpdateState } from '../../shared';

export interface UpdateControls {
  state: UpdateState;
  requestFailed: boolean;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  automatic: (enabled: boolean) => Promise<void>;
}

export function useUpdates(): UpdateControls {
  const [state, setState] = useState<UpdateState>(() => initialUpdateState(APP_VERSION, false));
  const [requestFailed, setRequestFailed] = useState(false);
  const accept = useCallback((next: UpdateState): void => {
    setState((current) => next.revision >= current.revision ? next : current);
    setRequestFailed(false);
  }, []);
  const perform = useCallback(async (request: (() => Promise<UpdateState>) | undefined): Promise<void> => {
    if (!request) return;
    try { accept(await request()); }
    catch (error) { console.error('UPDATE_BRIDGE_FAILED', error); setRequestFailed(true); }
  }, [accept]);
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    let active = true;
    const unsubscribe = desktop.onUpdateState((next) => { if (active) accept(next); });
    void desktop.getUpdateState().then((next) => { if (active) accept(next); }).catch((error: unknown) => { console.error('UPDATE_STATE_READ_FAILED', error); if (active) setRequestFailed(true); });
    return () => { active = false; unsubscribe(); };
  }, [accept]);
  return {
    state, requestFailed,
    check: () => perform(window.desktop?.checkForUpdates),
    download: () => perform(window.desktop?.downloadUpdate),
    install: () => perform(window.desktop?.installUpdate),
    automatic: (enabled) => { const desktop = window.desktop; return perform(desktop ? () => desktop.setAutomaticUpdates(enabled) : undefined); },
  };
}
