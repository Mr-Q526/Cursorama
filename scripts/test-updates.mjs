import { spawn } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entry = path.join(root, '.qa', 'updates-main.cjs');
await build({ entryPoints: ['tests/updates-integration-qa.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: entry, external: ['electron'] });
await new Promise((resolve, reject) => {
  const test = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [entry], { cwd: root, stdio: 'inherit', windowsHide: true });
  test.once('error', reject);
  test.once('exit', (code) => { if (code === 0) resolve(); else reject(new Error(`UPDATE_INTEGRATION_FAILED_${code}`)); });
});
