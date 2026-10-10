export const focusSoundsCatalog = {
  title: '聚焦音效',
  enabled: '开启聚焦音效',
  hint: '镜头进入聚焦时轻响一次，持续输入时不重复播放。',
  selection: '选择聚焦声音',
  preview: '试听',
  stop: '停止试听',
  loading: '正在准备试听…',
  volume: '提示音音量',
  coexist: '配乐持续播放，提示音只点缀镜头的变化。',
  disabled: '已关闭，演示仅保留原声与配乐。',
  disabledSummary: '已关闭',
  failed: '音效无法试听，请稍后重试。',
  durationUnit: '秒',
  sounds: {
    'soft-tap': { title: '柔和轻点', description: '低调温暖，适合操作讲解' },
    'air-sweep': { title: '空气轻扫', description: '柔和掠过，适合镜头推进' },
    'glass-chime': { title: '玻璃轻响', description: '清澈短音，适合关键步骤' },
    'gentle-pop': { title: '轻弹', description: '轻盈圆润，适合轻快演示' },
  },
} as const;

export type FocusSoundsCatalog = typeof focusSoundsCatalog;
