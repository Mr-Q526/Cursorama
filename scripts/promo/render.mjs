/** 通过同一个 JavaScript 渲染器逐帧编码宣传片，并交付视频、配乐和预览页面。 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { build } from 'esbuild';

/** @typedef {{ _electron: { launch: (options: {executablePath: string; args: string[]; env: NodeJS.ProcessEnv; timeout: number}) => Promise<import('playwright').ElectronApplication> } }} PlaywrightRuntime */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = path.join(root, '.qa/promo');
const destination = path.join(root, 'exports/promo');
const runtimeDirectory = process.env.CURSORAMA_NODE_LIBS ?? path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const runtimeRequire = createRequire(path.join(runtimeDirectory, 'runtime.cjs'));
const { _electron } = runtimeRequire('playwright');
const sharp = runtimeRequire('sharp');
const spec = { width: 1920, height: 1080, fps: 30, duration: 48, jpegQuality: 97, thumbnailWidth: 480, timeout: 120_000 };
const outputName = 'Cursorama-宣传片-1080p.mp4';
const previews = [2.5, 4.5, 8.5, 10.5, 13.5, 17, 21.5, 25, 29.5, 33, 37.5, 40.5, 44, 47];
const ffmpeg = path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe');

async function prepareAssets() {
  await mkdir(path.join(workspace, 'assets'), { recursive: true }); await mkdir(destination, { recursive: true });
  const sources = [
    ['assets/icon.png', 'icon.png'], ['.qa/promo/editor.png', 'editor.png'], ['docs/background-library.png', 'background-library.png'],
    ['docs/glass-controls.png', 'glass-controls.png'], ['docs/soundtrack-panel.png', 'soundtrack-panel.png'], ['docs/auto-camera.mp4', 'auto-camera.mp4'],
    ['.qa/promo/demo.mp4', 'demo.mp4'], ['.qa/promo/backgrounds.mp4', 'backgrounds.mp4'], ['.qa/promo/editing.mp4', 'editing.mp4'],
  ];
  for (const [source, name] of sources) {
    if (name.endsWith('.mp4') && name !== 'auto-camera.mp4') {
      const child = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(root, source), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-keyint_min', '15', '-pix_fmt', 'yuv420p', path.join(workspace, 'assets', name)], { windowsHide: true, stdio: 'inherit' });
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`PROMO_ASSET_ENCODER_EXIT_${code}`))); });
    } else await copyFile(path.join(root, source), path.join(workspace, 'assets', name));
  }
  await build({ entryPoints: [path.join(root, 'scripts/promo/index.ts')], outfile: path.join(workspace, 'film.js'), bundle: true, platform: 'browser', format: 'iife', globalName: 'CursoramaFilm', target: 'es2022' });
  await writeFile(path.join(workspace, 'render.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>html,body{margin:0;background:#111310}canvas{display:block}</style><canvas id="film"></canvas><script src="film.js"></script></html>');
}

/** @param {import('playwright').Page} page */
async function contactSheet(page) {
  const tiles = [];
  for (const time of previews) {
    const data = await page.evaluate(async (t) => { await globalThis.CursoramaFilm.renderFrame(t); return globalThis.CursoramaFilm.png(); }, time);
    const file = path.join(workspace, `frame-${String(time).replace('.', '-')}.png`); await writeFile(file, Buffer.from(data, 'base64'));
    const thumb = await sharp(file).resize(spec.thumbnailWidth, spec.thumbnailWidth * spec.height / spec.width).png().toBuffer(); tiles.push(thumb);
  }
  const columns = 4; const tileHeight = spec.thumbnailWidth * spec.height / spec.width; const rows = Math.ceil(tiles.length / columns);
  await sharp({ create: { width: spec.thumbnailWidth * columns, height: tileHeight * rows, channels: 3, background: '#111310' } }).composite(tiles.map((input, index) => ({ input, left: index % columns * spec.thumbnailWidth, top: Math.floor(index / columns) * tileHeight }))).png().toFile(path.join(workspace, 'contact-sheet.png'));
  await copyFile(path.join(workspace, 'frame-44.png'), path.join(destination, 'Cursorama-宣传片封面.png'));
}

/** @param {import('playwright').Page} page */
async function encode(page) {
  const frames = spec.duration * spec.fps;
  const output = path.join(destination, outputName);
  const child = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-thread_queue_size', '64', '-f', 'image2pipe', '-framerate', String(spec.fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', path.join(workspace, 'soundtrack.wav'), '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-t', String(spec.duration), output], { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
  const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`PROMO_ENCODER_EXIT_${code}`))); });
  completion.catch((error) => console.error('PROMO_ENCODER_FAILED', error));
  child.stdin.on('error', (error) => console.error('PROMO_ENCODER_INPUT_FAILED', error));
  const start = Date.now();
  try {
    for (let frame = 0; frame < frames; frame++) {
      if (child.exitCode !== null || child.stdin.destroyed) throw new Error('PROMO_ENCODER_STOPPED');
      const data = await page.evaluate(async (t) => { await globalThis.CursoramaFilm.renderFrame(t); return globalThis.CursoramaFilm.jpeg(); }, frame / spec.fps);
      if (!child.stdin.write(Buffer.from(data, 'base64'))) await once(child.stdin, 'drain');
      if (frame % (spec.fps * 4) === 0) console.info(`宣传片渲染 ${frame}/${frames} 帧；已用 ${Math.round((Date.now() - start) / 1000)} 秒。`);
    }
    child.stdin.end(); await completion;
  } finally {
    if (!child.stdin.destroyed) child.stdin.end();
    if (child.exitCode === null) child.kill();
  }
}

async function deliver() {
  await copyFile(path.join(workspace, 'soundtrack.wav'), path.join(destination, 'Cursorama-原创配乐.wav'));
  const html = await readFile(path.join(root, 'scripts/promo/player.html'), 'utf8');
  const code = await readFile(path.join(root, 'src/i18n/promo.ts'), 'utf8');
  /** @type {Record<string,string>} */
  const values = { outputName };
  for (const match of code.matchAll(/(\w+): '([^']*)'/g)) values[match[1]] = match[2];
  await writeFile(path.join(destination, '预览.html'), html.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? key));
  await writeFile(path.join(destination, '制作说明.md'), `# Cursorama 宣传片\n\n48 秒，1920 × 1080，30 fps。画面由 JavaScript Canvas 逐帧渲染，使用真实 Cursorama 界面操作录像；配乐由代码原创合成。\n\n视频：${outputName}\n\n配乐：Cursorama-原创配乐.wav\n\n预览：预览.html\n\n## 分镜\n\n- 0–6 秒：光标与镜头的概念开场。\n- 6–12 秒：品牌与真实编辑器揭晓。\n- 12–20 秒：点击、输入与滚动驱动自动聚焦。\n- 20–28 秒：平滑缩放与三维透视的成片效果。\n- 28–36 秒：壁纸切换与画面风格。\n- 36–42 秒：加入配乐、字幕和导出设置。\n- 42–48 秒：品牌收束和开源项目入口。\n\n## 重新生成\n\n源文件位于 scripts/promo/。先运行 node scripts/promo/capture.mjs 生成真实界面素材，再运行 node scripts/promo/music.mjs 和 node scripts/promo/render.mjs。素材和渲染中间文件位于 .qa/promo/，成品位于 exports/promo/。\n\n本片呈现的界面素材与操作均来自 Cursorama 自身；未录制其他应用或用户工程。\n`);
}

await prepareAssets();
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [path.join(root, 'scripts/promo/render-electron.cjs')], env, timeout: spec.timeout });
try {
  const page = await application.firstWindow(); await page.waitForFunction(() => typeof globalThis.CursoramaFilm !== 'undefined');
  await page.evaluate(() => globalThis.CursoramaFilm.prepare()); await contactSheet(page);
  if (!process.argv.includes('--preview')) { await encode(page); await deliver(); }
  console.info(process.argv.includes('--preview') ? '宣传片分镜预览已生成。' : `宣传片已保存到 ${destination}`);
} finally { await application.close(); }
