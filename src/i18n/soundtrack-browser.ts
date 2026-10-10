export const soundtrackBrowserCatalog = {
  import: '本地导入',
  search: '搜索配乐',
  searchPlaceholder: '搜索曲名、风格…',
  clearSearch: '清空搜索',
  results: '首',
  noResults: '没有匹配的配乐',
  noResultsHint: '试试其他曲名或风格。',
  reset: '显示全部',
  position: '添加位置',
  previewProgress: '试听进度',
  loading: '正在准备试听',
  current: '工程配乐',
  license: '原创器乐 · 可商用 · 离线可用',
} as const;

export type SoundtrackBrowserCatalog = typeof soundtrackBrowserCatalog;
