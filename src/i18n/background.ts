import type { WallpaperId } from '../../shared';

export const backgroundCatalog = {
  category: '背景类型', wallpapers: '壁纸', neutral: '极简',
  windows: 'Windows 灵感', mac: 'macOS 灵感', minimal: '极简光影', all: '全部背景',
  more: '更多背景', libraryTitle: '为演示挑选背景',
  librarySubtitle: '曲面、风景与光影。点击壁纸即可应用到当前项目。',
  browseCategory: '浏览背景分类', libraryPreview: '背景预览',
  originalArtwork: '原创壁纸 · 支持 4K 导出', applied: '已应用到当前项目',
  neutralDescription: '简洁的中性色渐变，衬托演示内容。',
  done: '完成',
  hint: '更多背景中提供原创曲面、风景和极简光影壁纸。',
  selected: '当前背景', blur: '背景模糊', dim: '背景压暗',
  blurHint: '柔化背景细节，让观众专注于演示。',
  labels: { bloom: '冰蓝绽放', silk: '银白流光', aurora: '暮紫波浪', dunes: '落日沙丘', cobalt: '钴蓝折带', prism: '晨光棱镜', coast: '海岸晨雾', sunrise: '玫瑰日出', pearl: '珍珠光环', slate: '石墨层叠', mist: '雾白拱廊', midnight: '午夜微光' } satisfies Record<WallpaperId, string>,
  descriptions: { bloom: '立体曲面', silk: '银色丝绸', aurora: '柔和波浪', dunes: '暖色沙丘', cobalt: '深蓝缎带与冷光', prism: '轻盈玻璃与柔彩', coast: '蓝灰海面与细沙', sunrise: '暖粉天光与远山', pearl: '银白环面与柔影', slate: '深灰叠层与银光', mist: '柔白建筑与弧线', midnight: '墨色夜幕与微光' } satisfies Record<WallpaperId, string>,
} as const;

export type BackgroundCatalog = typeof backgroundCatalog;
