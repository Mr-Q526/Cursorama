export const editingCatalog = {
  tab: '剪辑', title: '视频编辑', hint: '分割、裁剪和调整速度，添加音乐与字幕。',
  split: '在播放头分割', delete: '删除所选', insertVideo: '插入视频', insertMusic: '插入音乐', addSubtitle: '添加字幕',
  tools: '添加到当前播放位置', videoTrack: '视频', musicTrack: '音乐', subtitleTrack: '字幕',
  segment: '视频片段', selectedSegment: '片段设置', selectedMusic: '音乐设置', selectedSubtitle: '字幕设置',
  sourceIn: '素材入点（秒）', sourceOut: '素材出点（秒）', speed: '播放速度', volume: '音量',
  start: '开始时间（秒）', end: '结束时间（秒）', text: '字幕文字', subtitlePlaceholder: '输入字幕内容',
  defaultSubtitle: '在这里编辑字幕', segmentHint: '入点和出点裁掉所选片段的头尾，其他片段自动接续。',
  musicHint: '音乐从开始时间播放，入点和出点控制使用的素材区间。',
  subtitleHint: '字幕会显示在画面底部，预览与导出保持一致。',
  selectHint: '点击时间轴上的视频、音乐或字幕，编辑所选内容。',
  lastSegment: '至少保留一个视频片段；可修改它的入点和出点。',
  tracksHint: '点击片段选中 · 播放头处可分割 · Delete 删除所选',
  importFailed: '素材无法读取，请选择支持的视频或音频文件。', imported: '素材已插入当前播放位置',
  editFailed: '这项编辑无法应用，请检查片段的时间范围。',
  importing: '正在读取素材…', noMusic: '点击插入音乐，添加本地音频', noSubtitle: '点击添加字幕，输入文字',
  originalAudio: '原声音量', outputDuration: '编辑后时长',
} as const;

export type EditingCatalog = typeof editingCatalog;
