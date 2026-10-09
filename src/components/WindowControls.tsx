import { useEffect, useState } from 'react';
import { CopySimpleIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react';
import type { DesktopWindowState } from '../../shared';
import { t } from '../i18n';

export type WindowAction = 'minimize' | 'maximize' | 'close';

export function WindowControls() {
  const [state, setState] = useState<DesktopWindowState>({ maximized: false });
  const desktop = window.desktop;
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let receivedState = false;
    const unsubscribe = desktop.onWindowState((next) => { receivedState = true; if (active) setState(next); });
    void desktop.getWindowState().then((next) => { if (active && !receivedState) setState(next); }).catch((error: unknown) => console.error('WINDOW_STATE_FAILED', error));
    return () => { active = false; unsubscribe(); };
  }, [desktop]);
  if (!desktop) return null;
  const action = async (command: WindowAction): Promise<void> => {
    try {
      if (command === 'minimize') await desktop.minimizeWindow();
      else if (command === 'maximize') await desktop.toggleMaximizeWindow();
      else await desktop.closeWindow();
    } catch (error) { console.error('WINDOW_CONTROL_FAILED', command, error); }
  };
  const MaximizeIcon = state.maximized ? CopySimpleIcon : SquareIcon;
  const maximizeLabel = state.maximized ? t.window.restore : t.window.maximize;
  return <div className="window-controls" role="group" aria-label={t.window.controls}>
    <button type="button" className="window-control" data-window-action="minimize" title={t.window.minimize} aria-label={t.window.minimize} onClick={() => void action('minimize')}><MinusIcon size={15} /></button>
    <button type="button" className="window-control" data-window-action="maximize" title={maximizeLabel} aria-label={maximizeLabel} onClick={() => void action('maximize')}><MaximizeIcon size={13} /></button>
    <button type="button" className="window-control window-close" data-window-action="close" title={t.window.close} aria-label={t.window.close} onClick={() => void action('close')}><XIcon size={15} /></button>
  </div>;
}
