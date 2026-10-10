/** 检查打包 MP3 的真实解码与响度，不播放或改写用户音频设备。 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ffmpeg from 'ffmpeg-static';

const CHECK = { maxBytes: 64 * 1024 * 1024, sampleRate: 44100, peakLimit: -0.5, minRms: -32, maxRms: -14, edgeDropDb: 9, silenceRatio: 0.1 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-audio-check-'));
try {
  const compiled = path.join(temporary, 'analysis.mjs');
  await build({ entryPoints: [path.join(root, 'scripts/soundtracks/analysis.ts')], outfile: compiled, bundle: true, platform: 'node', target: 'es2022', format: 'esm' });
  const { analyzePcm } = await import(pathToFileURL(compiled).href);
  const manifest = JSON.parse(await readFile(path.join(root, 'src/soundtracks/generated.json'), 'utf8'));
  const report = {};
  for (const [id, track] of Object.entries(manifest.tracks)) {
    const source = path.join(root, 'public/music', `${id}.mp3`);
    const decoded = spawnSync(ffmpeg, ['-v', 'error', '-nostdin', '-i', source, '-f', 'f32le', '-ar', String(CHECK.sampleRate), '-ac', '2', '-'], { windowsHide: true, maxBuffer: CHECK.maxBytes });
    if (decoded.status !== 0 || decoded.error) throw new Error(`AUDIO_DECODE_FAILED: ${id}`, { cause: decoded.error ?? decoded.stderr.toString() });
    const stats = analyzePcm(decoded.stdout, CHECK.sampleRate);
    const loudness = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', source, '-af', 'loudnorm=I=-18:TP=-2:LRA=8:print_format=json', '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8', maxBuffer: CHECK.maxBytes });
    if (loudness.status !== 0 || loudness.error) throw new Error(`AUDIO_LOUDNESS_FAILED: ${id}`, { cause: loudness.error ?? loudness.stderr });
    const loudnessMatch = loudness.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
    const measured = loudnessMatch ? JSON.parse(loudnessMatch[0]) : {};
    report[id] = { ...stats, integratedLufs: Number(measured.input_i), truePeakDb: Number(measured.input_tp), bytes: track.bytes };
    if (stats.clippedSamples || stats.peakDb >= CHECK.peakLimit || stats.rmsDb < CHECK.minRms || stats.rmsDb > CHECK.maxRms || stats.introDb > stats.bodyDb - CHECK.edgeDropDb || stats.outroDb > stats.bodyDb - CHECK.edgeDropDb || stats.silentWindowRatio > CHECK.silenceRatio) throw new Error(`AUDIO_QUALITY_CHECK_FAILED: ${id}: ${JSON.stringify(stats)}`);
    console.info(`${id}: ${stats.duration}s，RMS ${stats.rmsDb} dBFS，峰值 ${stats.peakDb} dBFS，响度 ${measured.input_i} LUFS，淡入 ${stats.introDb} / 淡出 ${stats.outroDb} dBFS。`);
  }
  await mkdir(path.join(root, '.qa'), { recursive: true });
  await writeFile(path.join(root, '.qa/soundtrack-audio-stats.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
} finally {
  const resolvedTemporary = await realpath(temporary);
  const resolvedTempRoot = await realpath(tmpdir());
  if (path.dirname(resolvedTemporary).toLowerCase() !== resolvedTempRoot.toLowerCase() || !path.basename(resolvedTemporary).startsWith('cursorama-audio-check-')) throw new Error('UNSAFE_AUDIO_TEMPORARY_PATH');
  await rm(temporary, { recursive: true, force: true });
}
