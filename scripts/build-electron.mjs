import { build } from 'esbuild';

await build({
  entryPoints: ['electron/main.ts'], bundle: true, platform: 'node',
  target: 'node22', format: 'esm', outdir: 'dist-electron',
  external: ['electron'],
});
await build({
  entryPoints: ['electron/preload.ts'], bundle: true, platform: 'node',
  target: 'node22', format: 'cjs', outfile: 'dist-electron/preload.cjs',
  external: ['electron'],
});
