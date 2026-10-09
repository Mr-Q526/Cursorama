import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { IPC, type DesktopWindowState } from '../shared';
import { desktopCatalog } from './catalog';

export function registerWindowControls(window: BrowserWindow): void {
  const trustedWindow = (event: IpcMainInvokeEvent): BrowserWindow => {
    if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error(desktopCatalog.invalidRequest);
    }
    return window;
  };
  const state = (): DesktopWindowState => ({ maximized: window.isMaximized() });
  const publish = (): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.windowState, state());
  };
  ipcMain.handle(IPC.windowGet, (event) => { trustedWindow(event); return state(); });
  ipcMain.handle(IPC.windowMinimize, (event) => { trustedWindow(event).minimize(); });
  ipcMain.handle(IPC.windowMaximize, (event) => {
    const target = trustedWindow(event);
    if (target.isMaximized()) target.unmaximize(); else target.maximize();
    return state();
  });
  ipcMain.handle(IPC.windowClose, (event) => { trustedWindow(event).close(); });
  window.on('maximize', publish);
  window.on('unmaximize', publish);
  window.once('closed', () => {
    for (const channel of [IPC.windowGet, IPC.windowMinimize, IPC.windowMaximize, IPC.windowClose]) ipcMain.removeHandler(channel);
  });
}
