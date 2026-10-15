const { build } = require('../package.json');

module.exports = {
  ...build,
  extends: null,
  artifactName: 'Cursorama-${version}-mac-${arch}.${ext}',
  extraResources: [
    { from: 'dist-electron/native/capture-helper', to: 'native/capture-helper' },
    { from: 'assets/icon.png', to: 'icon.png' },
    { from: '.qa/mac-ffmpeg-dist/ffmpeg', to: 'ffmpeg' },
    { from: '.qa/mac-ffmpeg-dist', to: 'third-party', filter: ['*.txt'] },
    { from: 'third-party/WebM-Duration-LICENSE.txt', to: 'third-party/WebM-Duration-LICENSE.txt' },
    { from: 'LICENSE', to: 'LICENSE' },
    { from: 'docs/macOS使用说明.md', to: '使用说明.md' },
  ],
  extraFiles: [],
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }],
    category: 'public.app-category.video',
    minimumSystemVersion: '13.0',
    icon: 'assets/icon.png',
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
    binaries: ['Contents/Resources/ffmpeg', 'Contents/Resources/native/capture-helper'],
    extendInfo: {
      NSMicrophoneUsageDescription: 'Cursorama 使用麦克风录制你的讲解声音。',
      NSAudioCaptureUsageDescription: 'Cursorama 使用系统音频录制应用播放的声音。',
    },
  },
  dmg: {
    title: 'Cursorama',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
};
