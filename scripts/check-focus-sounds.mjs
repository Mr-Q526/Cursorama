/** 检查本地 WAV 的真实解码、峰值及首尾包络，输出 JSON 验证记录。 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ffmpeg from 'ffmpeg-static';

const CHECK = { sampleRate: 44100, channels: 2, maxBytes: 2 * 1024 * 1024, minDuration: 0.15, maxDuration: 0.65, durationTolerance: 0.001, peakLimitDb: -8, minRmsDb: -38, edgeDropDb: 6 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-focus-check-'));
try {
  const compiled = path.join(temporary, 'analysis.mjs');
  await build({ entryPoints: [path.join(root, 'scripts/focus-sounds/analysis.ts')], outfile: compiled, bundle: true, platform: 'node', target: 'es2022', format: 'esm' });
  const { analyzeFocusCuePcm } = await import(pathToFileURL(compiled).href);
  const manifest = JSON.parse(await readFile(path.join(root, 'src/focus-sounds/generated.json'), 'utf8'));
  const report = {};
  for (const [id, metadata] of Object.entries(manifest.sounds)) {
    const source = path.join(root, 'public/focus-sounds', `${id}.wav`);
    const bytes = await readFile(source);
    if (bytes.byteLength !== metadata.bytes || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error(`FOCUS_SOUND_INTEGRITY_FAILED:${id}`);
    const result = spawnSync(ffmpeg, ['-v', 'error', '-nostdin', '-i', source, '-f', 'f32le', '-ar', String(CHECK.sampleRate), '-ac', String(CHECK.channels), '-'], { windowsHide: true, maxBuffer: CHECK.maxBytes });
    if (result.status !== 0 || result.error) throw new Error(`FOCUS_SOUND_DECODE_FAILED:${id}`, { cause: result.error ?? result.stderr.toString() });
    const statistics = analyzeFocusCuePcm(result.stdout, CHECK.sampleRate);
    if (statistics.duration < CHECK.minDuration || statistics.duration > CHECK.maxDuration || Math.abs(statistics.duration - metadata.duration) > CHECK.durationTolerance || statistics.peakDb > CHECK.peakLimitDb || statistics.rmsDb < CHECK.minRmsDb || statistics.clippedSamples || statistics.firstEdgeDb > statistics.rmsDb - CHECK.edgeDropDb || statistics.lastEdgeDb > statistics.rmsDb - CHECK.edgeDropDb) throw new Error(`FOCUS_SOUND_QUALITY_FAILED:${id}:${JSON.stringify(statistics)}`);
    report[id] = { ...statistics, bytes: bytes.byteLength, decoded: true };
    console.info(`${id}: ${statistics.duration}s，峰值 ${statistics.peakDb} dBFS，RMS ${statistics.rmsDb} dBFS，首尾 ${statistics.firstEdgeDb} / ${statistics.lastEdgeDb} dBFS，无削波。`);
  }
  await mkdir(path.join(root, '.qa'), { recursive: true });
  await writeFile(path.join(root, '.qa/focus-sound-audio-stats.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
} finally {
  const resolvedTemporary = await realpath(temporary);
  const resolvedTempRoot = await realpath(tmpdir());
  if (path.dirname(resolvedTemporary).toLowerCase() !== resolvedTempRoot.toLowerCase() || !path.basename(resolvedTemporary).startsWith('cursorama-focus-check-')) throw new Error('UNSAFE_FOCUS_SOUND_TEMPORARY_PATH');
  await rm(resolvedTemporary, { recursive: true, force: true });
}
