export const studioCatalog = {
  tools: '编辑工具', pointerTrack: '显示鼠标轨迹',
  panel: { edit: '视频剪辑', motion: '自动运镜', cursor: '光标效果', background: '视频背景', canvas: '画布设置', audio: '音频与配乐' },
  audio: '配乐',
} as const;

export type StudioCatalog = typeof studioCatalog;
