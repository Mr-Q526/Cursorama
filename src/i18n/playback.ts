export interface PlaybackCatalog {
  controls: string;
  seek: string;
  fullscreenFailed: string;
}

export const playbackCatalog: PlaybackCatalog = {
  controls: '播放控制',
  seek: '播放进度',
  fullscreenFailed: '无法切换全屏，请重试。',
};
