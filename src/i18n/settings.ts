export const settingsCatalog = {
  title: '偏好设置', description: '统一管理界面外观和本地存储。',
  appearance: '外观', appearanceHint: '选择适合当前环境的界面主题。',
  lightHint: '明亮、简洁的白色界面', darkHint: '专注、柔和的黑色界面',
  themeHint: '主题选择会自动保存，视频背景可在编辑器中单独调整。',
  storage: '本地存储', storageHint: '默认保存在软件目录下，也可以分别设置工程和成片的位置。',
  projectDirectory: '工程保存位置', exportDirectory: '视频导出位置', locationLoading: '正在读取存储位置',
  locationFailed: '暂时无法读取存储位置，请重试。',
  storageNote: '修改位置用于新工程和之后的导出。已有工程继续在原位置保存，历史文件仍可在项目库中打开。',
  chooseDirectory: '选择目录', openDirectory: '打开目录', resetDirectories: '恢复默认位置',
  saveDirectories: '保存位置', savingDirectories: '正在保存', savedDirectories: '存储位置已保存',
  saveFailed: '保存失败，请检查目录是否有效、可写。原有存储设置保持不变。',
  chooseFailed: '无法选择目录，请重试或直接输入完整路径。',
  directoryPlaceholder: '输入完整的本地目录路径', close: '完成',
  help: '帮助', helpHint: '了解录制、自动运镜和导出的使用方法。',
} as const;

export type SettingsCatalog = typeof settingsCatalog;
