import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared';
import type { CaptureOptions, DesktopBridge, ExportRequest, NativePointer, ProjectData } from '../shared';

export const bridge: DesktopBridge = {
  platform: process.platform,
  getWindowState: () => ipcRenderer.invoke(IPC.windowGet),
  minimizeWindow: () => ipcRenderer.invoke(IPC.windowMinimize),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC.windowMaximize),
  closeWindow: () => ipcRenderer.invoke(IPC.windowClose),
  onWindowState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<DesktopBridge['getWindowState']>>): void => callback(state);
    ipcRenderer.on(IPC.windowState, handler); return () => ipcRenderer.removeListener(IPC.windowState, handler);
  },
  getUpdateState: () => ipcRenderer.invoke(IPC.updateGet),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  setAutomaticUpdates: (enabled) => ipcRenderer.invoke(IPC.updateAutomatic, enabled),
  openUpdatePage: () => ipcRenderer.invoke(IPC.updatePage),
  onUpdateState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<DesktopBridge['getUpdateState']>>): void => callback(state);
    ipcRenderer.on(IPC.updateState, handler); return () => ipcRenderer.removeListener(IPC.updateState, handler);
  },
  listSources: () => ipcRenderer.invoke(IPC.sources),
  selectSource: (options: CaptureOptions) => ipcRenderer.invoke(IPC.select, options),
  startPointer: (sourceId: string) => ipcRenderer.invoke(IPC.pointerStart, sourceId),
  stopPointer: () => ipcRenderer.invoke(IPC.pointerStop),
  recordingState: (active: boolean) => ipcRenderer.invoke(IPC.recording, active),
  onPointer: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, sample: NativePointer): void => callback(sample);
    ipcRenderer.on(IPC.pointer, handler); return () => ipcRenderer.removeListener(IPC.pointer, handler);
  },
  onStopRecording: (callback) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC.recordingStop, handler); return () => ipcRenderer.removeListener(IPC.recordingStop, handler);
  },
  exportVideo: (request: ExportRequest) => ipcRenderer.invoke(IPC.export, request),
  saveProject: (data: ProjectData, bytes?: ArrayBuffer, projectId?: string) => ipcRenderer.invoke(IPC.projectSave, data, bytes, projectId),
  openProject: () => ipcRenderer.invoke(IPC.projectOpen),
  listLibrary: () => ipcRenderer.invoke(IPC.libraryList),
  configureLibrary: (settings) => ipcRenderer.invoke(IPC.libraryConfigure, settings),
  chooseLibraryDirectory: (target) => ipcRenderer.invoke(IPC.libraryChoose, target),
  revealStorageDirectory: (target) => ipcRenderer.invoke(IPC.libraryRevealDirectory, target),
  openLibraryProject: (projectId) => ipcRenderer.invoke(IPC.libraryProject, projectId),
  openLibraryVideo: (projectId, videoId) => ipcRenderer.invoke(IPC.libraryVideo, projectId, videoId),
  revealLibrary: (projectId, videoId) => ipcRenderer.invoke(IPC.libraryReveal, projectId, videoId),
  revealFile: (path: string) => ipcRenderer.invoke(IPC.reveal, path),
  onEncodeProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number): void => callback(progress);
    ipcRenderer.on(IPC.encodeProgress, handler); return () => ipcRenderer.removeListener(IPC.encodeProgress, handler);
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
