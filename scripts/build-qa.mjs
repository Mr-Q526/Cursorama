import { build } from 'esbuild';

await build({ entryPoints: ['tests/renderer-qa.ts'], outfile: '.qa/renderer-test.js', bundle: true, platform: 'browser', target: 'es2022', format: 'iife', globalName: 'cursoramaQA', define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"./"}' } });
