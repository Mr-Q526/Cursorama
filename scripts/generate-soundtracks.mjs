/** 重新生成内置配乐及真实波形，临时 WAV 只写入系统临时目录。 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ffmpeg from 'ffmpeg-static';

const GENERATOR = { integratedLoudness: -18, truePeak: -2, loudnessRange: 8, bitrate: '160k', sampleRate: '44100', schemaVersion: 1 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-soundtracks-'));
const assets = path.join(root, 'public', 'music');
await mkdir(assets, { recursive: true });
const executeFfmpeg = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });

try {
  const compiled = path.join(temporary, 'synth.mjs');
  await build({ entryPoints: [path.join(root, 'scripts/soundtracks/index.ts')], outfile: compiled, bundle: true, platform: 'node', target: 'es2022', format: 'esm' });
  const { SCORES, renderScore, waveBytes } = await import(pathToFileURL(compiled).href);
  const entries = {};
  for (const score of SCORES) {
    const { audio, duration, waveform } = renderScore(score);
    const source = path.join(temporary, `${score.id}.wav`);
    const target = path.join(assets, `${score.id}.mp3`);
    await writeFile(source, waveBytes(audio));
    const normalize = `loudnorm=I=${GENERATOR.integratedLoudness}:TP=${GENERATOR.truePeak}:LRA=${GENERATOR.loudnessRange}`;
    executeFfmpeg(['-i', source, '-af', normalize, '-ar', GENERATOR.sampleRate, '-c:a', 'libmp3lame', '-b:a', GENERATOR.bitrate, '-map_metadata', '-1', '-id3v2_version', '0', target]);
    const content = await readFile(target);
    entries[score.id] = { duration: Number(duration.toFixed(6)), bpm: score.bpm, waveform, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    console.info(`已生成配乐 ${score.id}，${duration.toFixed(1)} 秒，${(content.length / 1024).toFixed(0)} KiB。`);
  }
  const manifest = { version: GENERATOR.schemaVersion, format: 'mp3', sampleRate: Number(GENERATOR.sampleRate), channels: 2, generator: 'Cursorama additive synthesis', tracks: entries };
  await writeFile(path.join(root, 'src/soundtracks/generated.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
} finally {
  const resolvedTemporary = await realpath(temporary);
  const resolvedTempRoot = await realpath(tmpdir());
  if (path.dirname(resolvedTemporary).toLowerCase() !== resolvedTempRoot.toLowerCase() || !path.basename(resolvedTemporary).startsWith('cursorama-soundtracks-')) throw new Error('UNSAFE_AUDIO_TEMPORARY_PATH');
  await rm(temporary, { recursive: true, force: true });
}
