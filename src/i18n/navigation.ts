export const navigationCatalog = {
  label: '主导航', workspace: '录屏工作室', library: '本地项目库', settings: '设置',
  back: '返回编辑器',
} as const;

export type NavigationCatalog = typeof navigationCatalog;
