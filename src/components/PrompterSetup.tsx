import { NotePencilIcon } from '@phosphor-icons/react';
import { RECORDING_CONTROLS } from '../../shared';
import type { PrompterDraftController } from '../hooks';
import { t } from '../i18n';
import { Toggle } from './Controls';

export interface PrompterSetupProps { draft: PrompterDraftController; disabled: boolean; }

export function PrompterSetup({ draft, disabled }: PrompterSetupProps) {
  const copy = t.teleprompter;
  return <details className="prompter-setup"><summary><NotePencilIcon size={18} />{copy.title}</summary><fieldset disabled={disabled}>
    <Toggle label={copy.enable} description={copy.hint} checked={draft.enabled} onChange={draft.setEnabled} />
    <label className="prompter-script-label">{copy.script}<textarea aria-label={copy.script} placeholder={copy.placeholder} maxLength={RECORDING_CONTROLS.scriptLimit} value={draft.script} onChange={(event) => draft.setScript(event.currentTarget.value)} /></label>
    {window.desktop && <p className="field-hint">{copy.protection}</p>}
  </fieldset></details>;
}
