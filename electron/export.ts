import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { IPC, PROJECT_EXTENSION, readProjectBytes } from '../shared';
import type { ExportRequest, ExportResult, StoredProject } from '../shared';
import { encodeVideo } from '../storage/encoder';
import { desktopCatalog } from './catalog';

export async function exportVideo(window: BrowserWindow, request: ExportRequest, target: string): Promise<ExportResult> {
  const binary = app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg.exe') : path.join(app.getAppPath(), 'node_modules/ffmpeg-static/ffmpeg.exe');
  await encodeVideo(request, binary, target, (progress) => {
    if (!window.isDestroyed()) window.webContents.send(IPC.encodeProgress, progress);
  });
  return { cancelled: false, path: target };
}

export async function openProject(window: BrowserWindow): Promise<StoredProject | null> {
  const result = await dialog.showOpenDialog(window, {
    title: desktopCatalog.openProjectTitle,
    filters: [{ name: desktopCatalog.projectType, extensions: [PROJECT_EXTENSION] }], properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readProjectBytes(await readFile(result.filePaths[0]));
}
