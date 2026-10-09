import type { WallpaperId } from '../../shared';

export const backgroundCatalog = {
  category: '背景类型', wallpapers: '壁纸', neutral: '极简',
  windows: 'Windows 灵感', mac: 'macOS 灵感',
  hint: '柔和曲面、渐变波浪与暖色沙丘，为演示选择合适的氛围。',
  selected: '当前背景', blur: '背景模糊', dim: '背景压暗',
  blurHint: '柔化背景细节，让观众专注于演示。',
  labels: { bloom: '冰蓝绽放', silk: '银白流光', aurora: '暮紫波浪', dunes: '落日沙丘' } satisfies Record<WallpaperId, string>,
  descriptions: { bloom: '立体曲面', silk: '银色丝绸', aurora: '柔和波浪', dunes: '暖色沙丘' } satisfies Record<WallpaperId, string>,
} as const;

export type BackgroundCatalog = typeof backgroundCatalog;
