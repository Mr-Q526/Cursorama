import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stagingParent = path.join(root, '.qa');
const installed = path.join(root, 'release', 'win-unpacked');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const cleanBuild = path.join(root, 'release', 'builds', version, 'win-unpacked');
await mkdir(stagingParent, { recursive: true });
const staging = await mkdtemp(path.join(stagingParent, 'package-'));

try {
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'), '--win', 'nsis', '--x64', '--publish', 'never', `--config.directories.output=${staging}`], { cwd: root, stdio: 'inherit', windowsHide: true });
    build.once('error', reject);
    build.once('exit', (code) => { if (code === 0) resolve(); else reject(new Error(`PACKAGE_FAILED_${code}`)); });
  });
  for (const file of await readdir(staging)) {
    if (file.endsWith('.exe') || file.endsWith('.blockmap') || file === 'latest.yml') await cp(path.join(staging, file), path.join(root, 'release', file));
  }
  await cp(path.join(staging, 'win-unpacked'), cleanBuild, { recursive: true });
  try {
    await mkdir(installed, { recursive: true });
    await cp(path.join(staging, 'win-unpacked', 'Cursorama.exe'), path.join(installed, 'Cursorama.exe'));
    await cp(path.join(staging, 'win-unpacked'), installed, { recursive: true });
    console.info(`本地 Windows 程序已更新：${installed}，已有工程、成片与存储配置继续保留。`);
  }
  catch (error) {
    if (error.code !== 'EPERM' || error.path !== path.join(installed, 'Cursorama.exe')) throw error;
    console.warn('安装包已生成。当前本地程序仍在运行，关闭后重新打包可更新本地解压版。');
  }
  console.info(`Windows Setup 安装包及更新元数据已输出到 ${path.join(root, 'release')}。`);
} finally {
  const resolved = await realpath(staging);
  if (path.dirname(resolved) !== await realpath(stagingParent) || !path.basename(resolved).startsWith('package-')) throw new Error('INVALID_PACKAGE_STAGING');
  await rm(resolved, { recursive: true, force: true });
}
