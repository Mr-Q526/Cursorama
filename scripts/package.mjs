import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stagingParent = path.join(root, '.qa');
const installed = path.join(root, 'release', 'win-unpacked');
await mkdir(stagingParent, { recursive: true });
const staging = await mkdtemp(path.join(stagingParent, 'package-'));

try {
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'), '--win', 'dir', `--config.directories.output=${staging}`], { cwd: root, stdio: 'inherit', windowsHide: true });
    build.once('error', reject);
    build.once('exit', (code) => { if (code === 0) resolve(); else reject(new Error(`PACKAGE_FAILED_${code}`)); });
  });
  await cp(path.join(staging, 'win-unpacked'), installed, { recursive: true });
  console.info(`Windows 程序已更新：${installed}，已有工程、成片与存储配置继续保留。`);
} finally {
  const resolved = await realpath(staging);
  if (path.dirname(resolved) !== await realpath(stagingParent) || !path.basename(resolved).startsWith('package-')) throw new Error('INVALID_PACKAGE_STAGING');
  await rm(resolved, { recursive: true, force: true });
}
