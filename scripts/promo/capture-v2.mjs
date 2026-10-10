/** 编译并运行全新真实操作素材采集，不使用示例工程。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const output = path.join(root, '.qa', 'promo-v2');
await build({ entryPoints: ['scripts/promo/capture-v2-renderer.ts'], outfile: path.join(output, 'renderer.js'), bundle: true, platform: 'browser', target: 'es2022', format: 'iife', globalName: 'cursoramaPromoV2', define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"./"}' } });
await build({ entryPoints: ['scripts/promo/capture-v2-entry.ts'], outfile: path.join(output, 'capture-entry.cjs'), bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'] });
const child = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [path.join(output, 'capture-entry.cjs'), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
child.once('error', (error) => { console.error('真实操作素材采集无法启动。', error); process.exitCode = 1; });
child.once('close', (code) => { process.exitCode = code ?? 1; });
