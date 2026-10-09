export const updatesCatalog = {
  title: '软件更新', description: '从 GitHub Release 获取新版本。',
  currentVersion: '当前版本', check: '检查更新', download: '下载更新', retryDownload: '重新下载', install: '重启并安装',
  automatic: '自动检查更新', automaticHint: '启动后检查，使用期间每 4 小时再检查一次。',
  releasePage: '查看版本发布页', releaseNotes: '新版说明', view: '查看更新',
  later: '稍后再说', completed: '下载已完成',
  available: (version: string): string => `发现新版本 ${version}`,
  downloaded: (version: string): string => `${version} 已下载，可以安装`,
  progress: (percent: number): string => `正在下载 ${Math.round(percent)}%`,
  installHint: '安装前会保存当前工程，然后关闭软件并运行安装程序。',
  status: {
    unsupported: '在 Windows 桌面正式版中可以检测、下载和安装更新。',
    idle: '点击检查，查看是否有新版本。', checking: '正在检查新版本…', current: '当前已是最新版本。',
    available: '有新版本可下载。', downloading: '正在下载更新…', downloaded: '更新已下载完成。',
    installing: '正在保存并准备安装，软件将重新启动…', error: '更新尚未完成，可以重试。',
  },
  error: {
    check: '暂时无法连接更新服务，请稍后重试。', download: '下载未完成，请重试。',
    install: '安装程序未能启动，请重试或到发布页下载安装包。',
    settings: '自动更新设置未能保存，请检查软件目录是否可写。',
    busy: '请先结束录制或导出，再安装更新。',
  },
  requestFailed: '更新操作未能完成，请重试。',
} as const;
export type UpdatesCatalog = typeof updatesCatalog;
