import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

if (process.platform === 'darwin') {
  await mkdir('dist-electron/native', { recursive: true });
  execFileSync('xcrun', ['swiftc', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos12.3`, '-O', '-swift-version', '5', 'native/macos/capture-helper.swift', '-o', 'dist-electron/native/capture-helper'], { stdio: 'inherit' });
}
