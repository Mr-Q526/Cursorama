export const timelineAudioCatalog = {
  visualHint: '波形 · 音量',
  loading: '正在生成波形',
  unavailable: '波形不可用',
  budget: '长音频仅显示音量曲线',
  describe: (name: string, volume: number): string => `${name} · 音量 ${Math.round(volume * 100)}% · 曲线包含自动淡入淡出`,
} as const;

export type TimelineAudioCatalog = typeof timelineAudioCatalog;
