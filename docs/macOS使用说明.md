# Cursorama macOS 试用版

此版本适用于 macOS 13 或更新版本的 Apple Silicon（arm64）Mac，使用临时签名，未经过 Apple 开发者签名或公证。打开 DMG 后，将 Cursorama 拖入 Applications，再从应用程序目录启动。如被系统阻止，请在“系统设置 → 隐私与安全性”中允许打开。

首次录制需在“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中允许 Cursorama，按系统提示重新启动应用。麦克风权限在启用讲解录音时请求。

支持编辑、工程保存与 MP4 / WebM 导出。macOS 支持鼠标移动、点击、拖动和滚动轨迹，以及点击效果和基于轨迹的自动运镜；首次使用需在“系统设置 → 隐私与安全性 → 输入监控”中允许 Cursorama，授权后重启应用。开发模式下权限对应 Electron。尚不支持 Windows 版的输入焦点识别。窗口列表会包含其他桌面空间中的全屏窗口。录制整个屏幕时，录制悬浮控件与提词器可能进入画面，建议选择目标应用窗口。快捷键使用 Command + Shift + F8 暂停/继续、Command + Shift + F9 结束；部分键盘需要同时按 Fn。

默认工程、成片及配置保存到 `~/Library/Application Support/Cursorama/`，可在设置中更换保存目录。Mac 桌面正式版支持自动检查、在线下载与 SHA-256 校验更新。下载完成后点击“打开安装包”，先退出 Cursorama，再将新版拖入 Applications 替换并重新启动。工程与设置保留。当前临时签名版本需要手动完成替换安装。

重新生成安装包：需要 Xcode Command Line Tools、Node.js 22.12 或更新版本和 pkg-config（可通过 Homebrew 的 pkgconf 提供）。在 Apple Silicon Mac 的项目目录中运行 `npm ci`，然后运行 `npm run package:mac`。首次打包会运行 `scripts/build-mac-ffmpeg.mjs`，下载并校验 FFmpeg、x264、libvpx 和 Opus 的固定版本源码，编译静态编码器。输出为 `release/Cursorama-版本号-mac-arm64.dmg`。

Mac 包使用从源码构建的 FFmpeg 8.0.1（GPL-3.0-or-later），未启用 nonfree，静态链接 x264、libvpx 和 Opus。实际许可与构建信息位于应用包 `Contents/Resources/third-party/`，对应源码归档与构建脚本随 GitHub Release 提供。自有代码沿用项目 MIT 许可；Electron/Chromium 与 WebM 时长修复组件沿用各自许可。

发布 Mac 更新：打包后运行 `node scripts/write-mac-update.mjs` 生成独立的 `updates/mac-arm64.json`（版本说明来自 `docs/releases/v版本号.md`）。先将对应 DMG 上传到同名 GitHub Release，再将清单推送到 main。不要重打包或覆盖已公布的同版本安装包，否则 SHA-256 校验会拒绝安装。Mac 更新不依赖 Windows Release 的 latest 标记。
