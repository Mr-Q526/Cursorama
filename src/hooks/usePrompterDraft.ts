import { useEffect, useState } from 'react';
import { RECORDING_CONTROLS } from '../../shared';

export interface PrompterDraft { script: string; enabled: boolean; }
export interface PrompterDraftController extends PrompterDraft {
  setScript: (script: string) => void;
  setEnabled: (enabled: boolean) => void;
}

export function usePrompterDraft(): PrompterDraftController {
  const [draft, setDraft] = useState<PrompterDraft>(() => {
    try { return { script: localStorage.getItem(RECORDING_CONTROLS.scriptStorageKey)?.slice(0, RECORDING_CONTROLS.scriptLimit) ?? '', enabled: localStorage.getItem(RECORDING_CONTROLS.enabledStorageKey) === 'true' }; }
    catch (error) { console.warn('PROMPTER_READ_FAILED', error); return { script: '', enabled: false }; }
  });
  useEffect(() => {
    try { localStorage.setItem(RECORDING_CONTROLS.scriptStorageKey, draft.script); localStorage.setItem(RECORDING_CONTROLS.enabledStorageKey, String(draft.enabled)); }
    catch (error) { console.warn('PROMPTER_SAVE_FAILED', error); }
  }, [draft]);
  return { ...draft, setScript: (script) => setDraft((current) => ({ ...current, script })), setEnabled: (enabled) => setDraft((current) => ({ ...current, enabled })) };
}
