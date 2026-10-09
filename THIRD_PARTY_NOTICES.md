# 第三方组件说明

Cursorama 自有源码采用 MIT 许可证。下列第三方组件的许可独立适用，源码许可不替代第三方许可。

| 组件 | 用途 | 许可与说明 |
| --- | --- | --- |
| Electron | Windows 桌面运行时 | MIT；发行目录同时包含 Electron 和 Chromium 的许可文件 |
| React、React DOM | 编辑器界面 | MIT |
| Phosphor Icons | 图标及应用标识中的光圈图形 | MIT |
| FFmpeg 静态程序 | MP4 编码和 WebM 封装 | 本次附带的 6.1.1 构建启用 GPL 与 version3，适用 GPL-3.0-or-later |

FFmpeg 作为独立子进程运行。其许可证副本放在发行目录的 `resources/third-party/FFmpeg-LICENSE.txt`。此次二进制由 `ffmpeg-static` 提供，程序版本输出标明构建来源为 gyan.dev。分发修改后的二进制时，应同时满足相应许可证的源代码提供等要求。

- [FFmpeg 源码与下载](https://ffmpeg.org/download.html)
- [Gyan Windows 构建](https://www.gyan.dev/ffmpeg/builds/)
- [ffmpeg-static 源码](https://github.com/eugeneware/ffmpeg-static)
- [Electron 许可证](https://github.com/electron/electron/blob/main/LICENSE)
- [React 许可证](https://github.com/facebook/react/blob/main/LICENSE)
- [Phosphor Icons 许可证](https://github.com/phosphor-icons/react/blob/master/LICENSE)

此文件记录所使用组件及许可证信息。
