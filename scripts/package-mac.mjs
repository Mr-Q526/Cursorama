import { execFileSync, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('此打包脚本需要 Apple Silicon Mac，编码器与 Electron 均使用 arm64。');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(root, '.qa/mac-ffmpeg-dist/ffmpeg');
try { await access(binary); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await import('./build-mac-ffmpeg.mjs');
}
const buildInfo = execFileSync(binary, ['-version'], { encoding: 'utf8' });
if (buildInfo.includes('--enable-nonfree') || !buildInfo.includes('--enable-gpl')) throw new Error('拒绝打包未经许可检查的 FFmpeg。');
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'), '--config', 'build/electron-builder.mac.cjs', '--mac', 'dmg', '--arm64', '--publish', 'never'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`MAC_PACKAGE_FAILED_${code}`)));
});
