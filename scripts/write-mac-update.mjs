import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 发布 DMG 后，将同版本清单提交到 main，Mac 更新不依赖 Windows latest 或 GitHub API 配额。
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const name = `Cursorama-${version}-mac-arm64.dmg`;
const file = path.join('release', name);
const hash = createHash('sha256');
for await (const chunk of createReadStream(file)) hash.update(chunk);
const notes = await readFile(`docs/releases/v${version}.md`, 'utf8');
await mkdir('updates', { recursive: true });
await writeFile('updates/mac-arm64.json', `${JSON.stringify({ schema: 1, version, arch: 'arm64', notes, asset: { name, url: `https://github.com/Mr-Q526/Cursorama/releases/download/v${version}/${name}`, size: (await stat(file)).size, digest: `sha256:${hash.digest('hex')}` } }, null, 2)}\n`);
console.log(`已生成 ${version} Mac 更新清单。请先上传同一 DMG，再推送清单。`);
