export const libraryCatalog = {
  title: '本地项目库', projects: '工程', videos: '成片', allProjects: '所有工程',
  pageTitle: '你的演示，都在这里', pageDescription: '继续编辑已保存的工程，或查看每一次导出的成片。',
  name: '名称', duration: '时长', updated: '最近更新', created: '导出时间',
  output: '导出成片', fileSize: '文件大小', format: '格式',
  emptyTitle: '开始你的第一段演示', emptyDescription: '先选择要录制的屏幕或窗口。录制结束后，原始视频、鼠标轨迹和编辑设置会一起保存到本地。',
  emptyLibrary: '还没有工程', emptyLibraryHint: '录制或导入后会出现在这里',
  noVideos: '还没有导出的成片', search: '搜索工程和成片', searchEmpty: '没有匹配的内容',
  openExternal: '从文件打开工程', import: '导入素材',
  openDemo: '查看运镜演示', demoDescription: '单独体验缩放和三维镜头',
  closeDemo: '退出演示', closeVideo: '返回工程', videoPreview: '成片预览',
  videoDescription: '这里播放的是已保存到本地的最终视频。',
  location: '存储位置', openDirectory: '打开项目库目录', reveal: '打开所在文件夹',
  autoSave: '工程自动保存', saving: '正在保存', saved: '已存入项目库',
  loading: '正在读取项目库', loadFailed: '项目库读取失败，请检查本地目录后重试。',
  projectFailed: '无法打开工程，文件可能已被移动或损坏。',
  videoFailed: '无法播放成片，请检查文件是否完整。',
  saveFailed: '自动保存失败，工程仍保留在当前编辑器，请点击保存重试。',
  folderFailed: '无法打开目录，请通过下方路径在文件管理器中打开。',
  unavailable: '部分工程无法读取，请检查项目库中的文件。',
  retry: '重试', refresh: '刷新项目库', latest: '最新成片',
  browserUnavailable: '请在桌面版或本地开发服务中使用项目库。',
  localHint: '全部内容保存在本机', unsavedDemo: '演示可单独保存为工程',
  exportSaved: '工程与成片已保存到本地项目库',
} as const;

export type LibraryCatalog = typeof libraryCatalog;

export const formatLibraryDate = (value: string): string => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
export const formatFileSize = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
export const formatVideoCount = (count: number): string => `${count} 个成片`;
