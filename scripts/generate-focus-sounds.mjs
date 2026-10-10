/** 用本项目振荡器与滤波噪声乐谱生成四款短聚焦音效，不依赖 Python 或网络。 */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-focus-sounds-'));
const assets = path.join(root, 'public/focus-sounds');
await mkdir(assets, { recursive: true });
await mkdir(path.join(root, 'src/focus-sounds'), { recursive: true });
try {
  const compiled = path.join(temporary, 'synthesizer.mjs');
  await build({ entryPoints: [path.join(root, 'scripts/focus-sounds/index.ts')], outfile: compiled, bundle: true, platform: 'node', target: 'es2022', format: 'esm' });
  const { FOCUS_CUE_SCORES, FOCUS_CUE_AUDIO, renderFocusCue, focusCueWaveBytes } = await import(pathToFileURL(compiled).href);
  const sounds = {};
  for (const score of FOCUS_CUE_SCORES) {
    const audio = renderFocusCue(score);
    const bytes = focusCueWaveBytes(audio);
    await writeFile(path.join(assets, `${score.id}.wav`), bytes);
    sounds[score.id] = { duration: audio.duration, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    console.info(`已生成聚焦音效 ${score.id}，${audio.duration.toFixed(2)} 秒，${bytes.byteLength} 字节。`);
  }
  const manifest = { version: 1, format: 'wav', sampleRate: FOCUS_CUE_AUDIO.sampleRate, channels: FOCUS_CUE_AUDIO.channels, bitDepth: FOCUS_CUE_AUDIO.bitDepth, sounds };
  await writeFile(path.join(root, 'src/focus-sounds/generated.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
} finally {
  const resolvedTemporary = await realpath(temporary);
  const resolvedTempRoot = await realpath(tmpdir());
  if (path.dirname(resolvedTemporary).toLowerCase() !== resolvedTempRoot.toLowerCase() || !path.basename(resolvedTemporary).startsWith('cursorama-focus-sounds-')) throw new Error('UNSAFE_FOCUS_SOUND_TEMPORARY_PATH');
  await rm(resolvedTemporary, { recursive: true, force: true });
}
