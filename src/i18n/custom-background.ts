export const customBackgroundCatalog = {
  title: '自定义背景',
  import: '选择背景图片',
  importing: '正在读取图片…',
  replace: '更换图片',
  remove: '移除图片',
  apply: '使用这张图片',
  formats: 'PNG、JPG 或 WebP · 最大 25 MB',
  savedWithProject: '图片随工程保存，移动工程后仍可使用。',
  description: '以图片作为背景，自动铺满画布。',
  tooLarge: '图片超过 25 MB，请选择更小的文件。',
  unsupported: '请使用 PNG、JPG 或 WebP 图片。',
  invalidDimensions: '图片尺寸过大，请使用不超过 16384 像素、6400 万像素的图片。',
  failed: '图片无法读取，请更换图片后重试。',
} as const;

export type CustomBackgroundCatalog = typeof customBackgroundCatalog;
