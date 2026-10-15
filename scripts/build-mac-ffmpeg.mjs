import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('需要 Apple Silicon Mac。');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, '.qa/mac-ffmpeg');
const prefix = path.join(work, 'prefix');
const jobs = String(Math.min(10, availableParallelism()));
const sources = [
  { file: 'ffmpeg-8.0.1.tar.xz', directory: 'ffmpeg-8.0.1', url: 'https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz', sha256: '05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41' },
  { file: 'x264-b35605a.tar.gz', directory: 'x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55', url: 'https://codeload.github.com/mirror/x264/tar.gz/b35605ace3ddf7c1a5d67a2eb553f034aef41d55', sha256: 'cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9' },
  { file: 'libvpx-1.16.0.tar.gz', directory: 'libvpx-1.16.0', url: 'https://codeload.github.com/webmproject/libvpx/tar.gz/refs/tags/v1.16.0', sha256: '7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c' },
  { file: 'opus-1.6.1.tar.gz', directory: 'opus-1.6.1', url: 'https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz', sha256: '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1' },
];
const env = { ...process.env, MACOSX_DEPLOYMENT_TARGET: '12.0', PKG_CONFIG_PATH: path.join(prefix, 'lib/pkgconfig'), PKG_CONFIG_LIBDIR: path.join(prefix, 'lib/pkgconfig') };
function run(command, args, cwd = work, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let output = '';
    if (capture) child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`${command} failed: ${code}`)));
  });
}
await mkdir(path.join(work, 'archives'), { recursive: true });
await mkdir(path.join(work, 'sources'), { recursive: true });
for (const source of sources) {
  const archive = path.join(work, 'archives', source.file);
  try { await readFile(archive); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await run('curl', ['--fail', '--location', '--retry', '2', '--max-time', '180', source.url, '--output', archive]);
  }
  if (createHash('sha256').update(await readFile(archive)).digest('hex') !== source.sha256) throw new Error(`SOURCE_CHECKSUM_FAILED: ${source.file}`);
  await run('tar', ['-xf', archive, '-C', path.join(work, 'sources')]);
}
const sourcePath = name => path.join(work, 'sources', sources.find(source => source.file.startsWith(name)).directory);
const commands = [];
async function configure(name, args) {
  commands.push({ source: name, args });
  await run('./configure', args, sourcePath(name));
  await run('make', ['-j', jobs], sourcePath(name));
  await run('make', ['install'], sourcePath(name));
}
await configure('x264', [`--prefix=${prefix}`, '--enable-static', '--disable-cli', '--disable-opencl']);
await configure('libvpx', [`--prefix=${prefix}`, '--target=arm64-darwin20-gcc', '--enable-static', '--disable-shared', '--enable-pic', '--disable-examples', '--disable-unit-tests', '--disable-tools', '--disable-docs']);
await configure('opus', [`--prefix=${prefix}`, '--enable-static', '--disable-shared', '--disable-doc', '--disable-extra-programs']);
await configure('ffmpeg', [
  `--prefix=${prefix}`, '--arch=arm64', '--cc=clang', '--enable-gpl', '--enable-version3',
  '--enable-static', '--disable-shared', '--disable-autodetect', '--disable-doc', '--disable-debug', '--disable-ffplay', '--disable-ffprobe', '--disable-everything',
  '--enable-libx264', '--enable-libvpx', '--enable-libopus', '--pkg-config-flags=--static',
  `--extra-cflags=-I${prefix}/include`, `--extra-ldflags=-L${prefix}/lib`, '--enable-zlib',
  '--enable-encoder=libx264,libvpx_vp8,libvpx_vp9,libopus,aac,mjpeg,png,wrapped_avframe,pcm_s16le',
  '--enable-decoder=h264,hevc,vp8,vp9,av1,opus,vorbis,aac,mp3,mp3float,flac,pcm_s16le,pcm_f32le,png,mjpeg',
  '--enable-demuxer=matroska,mov,mp3,wav,ogg,flac,image2,image2pipe,png_pipe',
  '--enable-muxer=mp4,webm,matroska,image2,image2pipe,null,ogg,wav',
  '--enable-parser=h264,hevc,vp8,vp9,av1,opus,vorbis,aac,mpegaudio,png,mjpeg,flac',
  '--enable-protocol=file,pipe', '--enable-filter=aresample,apad,scale,fps,tpad,format,aformat,anull,null,pad', '--enable-swscale', '--enable-swresample',
]);
const output = path.join(root, '.qa/mac-ffmpeg-dist');
await mkdir(output, { recursive: true });
await copyFile(path.join(prefix, 'bin/ffmpeg'), path.join(output, 'ffmpeg'));
await copyFile(path.join(sourcePath('ffmpeg'), 'COPYING.GPLv3'), path.join(output, 'FFmpeg-LICENSE.txt'));
await copyFile(path.join(sourcePath('libvpx'), 'LICENSE'), path.join(output, 'libvpx-LICENSE.txt'));
await copyFile(path.join(sourcePath('opus'), 'COPYING'), path.join(output, 'opus-LICENSE.txt'));
await copyFile(path.join(sourcePath('x264'), 'COPYING'), path.join(output, 'x264-LICENSE.txt'));
const info = await run(path.join(output, 'ffmpeg'), ['-version'], work, true);
if (info.includes('--enable-nonfree')) throw new Error('NONFREE_BUILD_REJECTED');
const linked = await run('otool', ['-L', path.join(output, 'ffmpeg')], work, true);
const dependencies = linked.split('\n').slice(1).join('\n');
if (dependencies.includes('/opt/homebrew') || dependencies.includes(work)) throw new Error('NONPORTABLE_FFMPEG_BUILD');
await writeFile(path.join(output, 'FFmpeg-BUILD-INFO.txt'), `${info}\n${linked}\n${JSON.stringify({ sources, commands }, null, 2)}\n`);
await writeFile(path.join(work, 'build-manifest.json'), JSON.stringify({ sources, commands }, null, 2));
console.info(`可公开分发的静态 FFmpeg 已生成：${output}`);
