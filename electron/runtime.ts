import path from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';

export function ffmpegPath(): string {
  const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const macBinary = path.join(app.getAppPath(), '.qa/mac-ffmpeg-dist/ffmpeg');
  if (!app.isPackaged && process.platform === 'darwin' && existsSync(macBinary)) return macBinary;
  return app.isPackaged
    ? path.join(process.resourcesPath, binary)
    : path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', binary);
}
