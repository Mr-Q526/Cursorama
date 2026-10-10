/** 编译并运行隔离的产品宣传素材采集入口。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entry = path.join(root, '.qa', 'promo', 'capture-entry.cjs');
await build({ entryPoints: ['scripts/promo/capture-entry.ts'], outfile: entry, bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'] });
const child = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [entry], { stdio: 'inherit', windowsHide: true });
child.once('error', (error) => { console.error('宣传素材采集无法启动。', error); process.exitCode = 1; });
child.once('close', (code) => { process.exitCode = code ?? 1; });
