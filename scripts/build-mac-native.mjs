import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

if (process.platform === 'darwin') {
  await mkdir('dist-electron/native', { recursive: true });
  execFileSync('xcrun', ['swiftc', '-O', '-swift-version', '5', 'native/macos/capture-helper.swift', '-o', 'dist-electron/native/capture-helper'], { stdio: 'inherit' });
}
