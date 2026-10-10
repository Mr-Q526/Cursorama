export const navigationCatalog = {
  label: '主导航', editor: '编辑工程', library: '本地项目库', settings: '设置',
  back: '返回项目库', preview: '成片预览',
} as const;

export type NavigationCatalog = typeof navigationCatalog;
