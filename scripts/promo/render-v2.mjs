/** 合成第二版宣传片，逐帧输出真实操作素材与确定性的三维动效。 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = path.join(root, '.qa/promo-v2'), destination = path.join(root, 'exports/promo-v2');
const runtime = process.env.CURSORAMA_NODE_LIBS ?? path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const requireRuntime = createRequire(path.join(runtime, 'runtime.cjs'));
const { _electron } = requireRuntime('playwright'), sharp = requireRuntime('sharp');
const spec = { duration: 44, fps: 30, width: 1920, height: 1080, thumbnailWidth: 480, columns: 4, timeout: 120_000, keyframeInterval: 15 };
const ffmpeg = path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe');
const filename = 'Cursorama-宣传片-v2-1080p.mp4';
const designOnly = process.argv.includes('--design-preview'), previewOnly = designOnly || process.argv.includes('--preview');
const previewTimes = designOnly ? [0.7, 1.8, 3.4, 4.7, 6.0, 39.8, 41.5, 43.1] : [0.7, 1.8, 3.4, 4.7, 6.9, 8.8, 11.5, 15, 17, 19.5, 23.5, 26, 28.5, 30.6, 33, 35.9, 37.5, 40, 42, 43.2];

async function assets() {
  await mkdir(path.join(work, 'assets'), { recursive: true }); await mkdir(destination, { recursive: true });
  await copyFile(path.join(root, 'assets/icon.png'), path.join(work, 'assets/icon.png'));
  if (!designOnly) {
    for (const name of ['source-raw', 'result-focus', 'result-cinematic', 'studio-edit']) {
      const child = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(work, `${name}.mp4`), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-g', String(spec.keyframeInterval), '-keyint_min', String(spec.keyframeInterval), '-pix_fmt', 'yuv420p', path.join(work, 'assets', `${name}.mp4`)], { windowsHide: true, stdio: 'inherit' });
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`V2_PREPARE_ENCODER_FAILED:${code}`))); });
    }
    for (const name of ['editor.png', 'export.png']) await copyFile(path.join(work, name), path.join(work, 'assets', name));
  }
  await build({ entryPoints: [path.join(root, 'scripts/promo/v2/index.ts')], outfile: path.join(work, 'film.js'), bundle: true, platform: 'browser', format: 'iife', globalName: 'CursoramaFilmV2', target: 'es2022' });
  await writeFile(path.join(work, 'render.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>html,body{margin:0;background:#0b0c0e}canvas{display:block}</style><canvas id="film"></canvas><script src="film.js"></script></html>');
}

async function contact(page) {
  const images = [], tileHeight = spec.thumbnailWidth * spec.height / spec.width;
  for (const time of previewTimes) {
    const data = await page.evaluate(async (t) => { await globalThis.CursoramaFilmV2.renderFrame(t); return globalThis.CursoramaFilmV2.png(); }, time);
    const file = path.join(work, `frame-${String(time).replace('.', '-')}.png`); await writeFile(file, Buffer.from(data, 'base64'));
    images.push(await sharp(file).resize(spec.thumbnailWidth, tileHeight).png().toBuffer());
  }
  await sharp({ create: { width: spec.thumbnailWidth * spec.columns, height: tileHeight * Math.ceil(images.length / spec.columns), channels: 3, background: '#0b0c0e' } }).composite(images.map((input, index) => ({ input, left: index % spec.columns * spec.thumbnailWidth, top: Math.floor(index / spec.columns) * tileHeight }))).png().toFile(path.join(work, designOnly ? 'design-contact.png' : 'contact-sheet.png'));
  if (!designOnly) await copyFile(path.join(work, 'frame-42.png'), path.join(destination, 'Cursorama-v2-封面.png'));
}

async function encode(page) {
  const total = spec.duration * spec.fps;
  const child = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-thread_queue_size', '64', '-f', 'image2pipe', '-framerate', String(spec.fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', path.join(work, 'soundtrack.wav'), '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', String(spec.duration), '-movflags', '+faststart', path.join(destination, filename)], { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
  const complete = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`V2_ENCODER_FAILED:${code}`))); });
  complete.catch((error) => console.error('V2_ENCODER_FAILED', error)); child.stdin.on('error', (error) => console.error('V2_ENCODER_INPUT_FAILED', error));
  const started = Date.now();
  try {
    for (let index = 0; index < total; index++) {
      if (child.exitCode !== null || child.stdin.destroyed) throw new Error('V2_ENCODER_ENDED_EARLY');
      const data = await page.evaluate(async (t) => { await globalThis.CursoramaFilmV2.renderFrame(t); return globalThis.CursoramaFilmV2.jpeg(); }, index / spec.fps);
      if (!child.stdin.write(Buffer.from(data, 'base64'))) await once(child.stdin, 'drain');
      if (index % (spec.fps * 3) === 0) console.info(`新版渲染 ${index}/${total} 帧；已用 ${Math.round((Date.now() - started) / 1000)} 秒。`);
    }
    child.stdin.end(); await complete;
  } finally { if (!child.stdin.destroyed) child.stdin.end(); if (child.exitCode === null) child.kill(); }
}

async function deliver() {
  await copyFile(path.join(work, 'soundtrack.wav'), path.join(destination, 'Cursorama-v2-原创配乐.wav'));
  const html = await readFile(path.join(root, 'scripts/promo/player-v2.html'), 'utf8'), catalog = await readFile(path.join(root, 'src/i18n/promo-v2.ts'), 'utf8');
  const values = { outputName: filename };
  for (const match of catalog.matchAll(/(\w+): '([^']*)'/g)) values[match[1]] = match[2];
  await writeFile(path.join(destination, '预览.html'), html.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? key));
  const report = JSON.parse(await readFile(path.join(work, 'capture-report.json'), 'utf8'));
  await writeFile(path.join(destination, '制作说明.md'), `# Cursorama 新版宣传片\n\n44 秒，1920 × 1080，30 fps，H.264 / AAC。\n\n## 视觉\n\n黑白与橙红、WebGL 金属光标、逐字弹性遮罩、真实三维透视、快门转场、短曝光拖影与胶片颗粒。预览和导出使用同一确定性渲染器。\n\n## 实际演示\n\n从两个隔离的 Cursorama 窗口采集16秒真实操作，包含设置、主题、输入提词、滚动与项目库。原始录像由 Cursorama 录制器生成；前后对比和成片来自产品自身渲染与导出。演示顺序覆盖源时间0–15.5秒，未使用内置示例或旧宣传素材。采集报告错误数量：${report.errors?.length ?? 0}。\n\n## 配乐\n\n代码原创合成，44秒、120 BPM、D小调现代 breakbeat；实测 −14.9 LUFS，真实峰值 −2.0 dBFS。\n\n## 重新生成\n\n在仓库根目录依次运行 node scripts/promo/capture-v2.mjs、node scripts/promo/music-v2.mjs、node scripts/promo/render-v2.mjs。源文件在 scripts/promo/v2/，文案在 src/i18n/promo-v2.ts。\n`);
}

await assets();
const env = { ...process.env, CURSORAMA_PROMO_RENDER_WORKSPACE: work }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [path.join(root, 'scripts/promo/render-electron.cjs')], env, timeout: spec.timeout });
try {
  const page = await app.firstWindow(); await page.waitForURL('**/render.html'); await page.waitForLoadState('load'); await page.waitForFunction(() => typeof globalThis.CursoramaFilmV2 !== 'undefined'); await page.evaluate((design) => globalThis.CursoramaFilmV2.prepare(design), designOnly);
  await contact(page); if (!previewOnly) { await encode(page); await deliver(); }
  await page.evaluate(() => globalThis.CursoramaFilmV2.dispose()); console.info(previewOnly ? '新版分镜预览已生成。' : `新版宣传片完成：${destination}`);
} finally { await app.close(); }
