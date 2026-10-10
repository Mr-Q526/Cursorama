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
const OPTIONS = { verify: '--verify', only: '--only=' };
const requested = process.argv.slice(2);
if (requested.some((option) => option !== OPTIONS.verify && !option.startsWith(OPTIONS.only))) throw new Error('UNKNOWN_SOUNDTRACK_GENERATOR_OPTION');
const selection = requested.filter((option) => option.startsWith(OPTIONS.only));
if (selection.length > 1) throw new Error('DUPLICATE_SOUNDTRACK_SELECTION');
const selectedIds = selection.length ? new Set(selection[0].slice(OPTIONS.only.length).split(',').filter(Boolean)) : undefined;
if (selectedIds?.size === 0) throw new Error('EMPTY_SOUNDTRACK_SELECTION');
const verify = requested.includes(OPTIONS.verify);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'cursorama-soundtracks-'));
const assets = path.join(root, 'public', 'music');
await mkdir(assets, { recursive: true });
const executeFfmpeg = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });

try {
  const compiled = path.join(temporary, 'synth.mjs');
  await build({ entryPoints: [path.join(root, 'scripts/soundtracks/index.ts')], outfile: compiled, bundle: true, platform: 'node', target: 'es2022', format: 'esm' });
  const { SCORES, renderScore, waveBytes } = await import(pathToFileURL(compiled).href);
  if (selectedIds && [...selectedIds].some((id) => !SCORES.some((score) => score.id === id))) throw new Error('UNKNOWN_SOUNDTRACK_SELECTION');
  const previous = selectedIds || verify ? JSON.parse(await readFile(path.join(root, 'src/soundtracks/generated.json'), 'utf8')) : undefined;
  const entries = selectedIds ? { ...previous.tracks } : {};
  const scores = selectedIds ? SCORES.filter((score) => selectedIds.has(score.id)) : SCORES;
  for (const score of scores) {
    const { audio, duration, waveform } = renderScore(score);
    const source = path.join(temporary, `${score.id}.wav`);
    const target = path.join(verify ? temporary : assets, `${score.id}.mp3`);
    await writeFile(source, waveBytes(audio));
    const normalize = `loudnorm=I=${GENERATOR.integratedLoudness}:TP=${GENERATOR.truePeak}:LRA=${GENERATOR.loudnessRange}`;
    executeFfmpeg(['-i', source, '-af', normalize, '-ar', GENERATOR.sampleRate, '-c:a', 'libmp3lame', '-b:a', GENERATOR.bitrate, '-map_metadata', '-1', '-id3v2_version', '0', target]);
    const content = await readFile(target);
    const entry = { duration: Number(duration.toFixed(6)), bpm: score.bpm, waveform, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    if (verify) {
      const bundled = await readFile(path.join(assets, `${score.id}.mp3`));
      const known = previous.tracks[score.id];
      if (!known || !content.equals(bundled) || JSON.stringify(entry) !== JSON.stringify(known)) throw new Error(`SOUNDTRACK_REBUILD_MISMATCH:${score.id}`);
    }
    entries[score.id] = entry;
    console.info(`${verify ? '已验证可复现配乐' : '已生成配乐'} ${score.id}，${duration.toFixed(1)} 秒，${(content.length / 1024).toFixed(0)} KiB。`);
  }
  if (!verify) {
    if (SCORES.some((score) => !entries[score.id])) throw new Error('SOUNDTRACK_MANIFEST_INCOMPLETE');
    const ordered = Object.fromEntries(SCORES.map((score) => [score.id, entries[score.id]]));
    const manifest = { version: GENERATOR.schemaVersion, format: 'mp3', sampleRate: Number(GENERATOR.sampleRate), channels: 2, generator: 'Cursorama additive synthesis', tracks: ordered };
    await writeFile(path.join(root, 'src/soundtracks/generated.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
} finally {
  const resolvedTemporary = await realpath(temporary);
  const resolvedTempRoot = await realpath(tmpdir());
  if (path.dirname(resolvedTemporary).toLowerCase() !== resolvedTempRoot.toLowerCase() || !path.basename(resolvedTemporary).startsWith('cursorama-soundtracks-')) throw new Error('UNSAFE_AUDIO_TEMPORARY_PATH');
  await rm(temporary, { recursive: true, force: true });
}
