import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { app, nativeImage, type DesktopCapturerSource } from 'electron';

const execute = promisify(execFile);

export function macCaptureHelper(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'native', 'capture-helper')
    : path.join(path.dirname(fileURLToPath(import.meta.url)), 'native', 'capture-helper');
}

export async function macWindowSources(includeOwn: boolean, previewIds: readonly string[] = []): Promise<DesktopCapturerSource[]> {
  const { stdout } = await execute(macCaptureHelper(), ['list', ...previewIds], { timeout: 12_000, maxBuffer: 4 * 1024 * 1024 });
  const entries: unknown = JSON.parse(stdout);
  if (!Array.isArray(entries)) throw new Error('INVALID_MAC_WINDOW_LIST');
  return entries.flatMap((entry: unknown): DesktopCapturerSource[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.id !== 'string' || !/^window:\d+:0$/.test(value.id) || typeof value.name !== 'string' || (!includeOwn && value.pid === process.pid)) return [];
    const decode = (image: unknown): Electron.NativeImage => typeof image === 'string' && image.startsWith('data:image/png;base64,')
      ? nativeImage.createFromDataURL(image) : nativeImage.createEmpty();
    return [{ id: value.id, name: value.name, display_id: '', thumbnail: decode(value.thumbnail), appIcon: decode(value.appIcon) }];
  });
}
