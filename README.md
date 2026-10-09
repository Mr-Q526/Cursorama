<div align="center">
  <img src="assets/icon.png" width="76" height="76" alt="Cursorama 应用图标">
  <h1>Cursorama</h1>
  <p><strong>光标即导演。</strong></p>
  <p>录下屏幕操作，让镜头自动跟上你的思路。</p>
  <p>
    <img src="https://img.shields.io/badge/Windows-桌面录屏-181818?style=flat-square" alt="Windows 桌面录屏">
    <img src="https://img.shields.io/badge/版本-0.1.3-181818?style=flat-square" alt="版本 0.1.3">
    <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-MIT-181818?style=flat-square" alt="MIT 许可证"></a>
  </p>
  <p>
    <a href="https://github.com/Mr-Q526/Cursorama/releases/latest">下载 Windows 版</a> ·
    <a href="#效果预览">效果预览</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="docs/使用指南.md">使用指南</a> ·
    <a href="https://github.com/Mr-Q526/Cursorama/issues">反馈与建议</a>
  </p>
</div>

Cursorama 是一个面向产品演示、操作教程和功能讲解的开源录屏工具。名字由 **cursor**（光标）与 **panorama**（全景）组合而来：记录一次操作，根据鼠标移动和点击生成缩放、平移与三维透视，再把结果导出为演示视频。

## 效果预览

![自动聚焦、平滑缩放与三维透视的演示](docs/auto-camera.gif)

<div align="center">
  <sub>使用内置演示工程实际导出的 3 秒片段，循环展示自动运镜效果。</sub><br>
  <a href="docs/auto-camera.mp4">查看或下载 720p MP4 演示</a>
</div>

## 从录屏到成片

| 你负责演示 | Cursorama 负责画面 |
| --- | --- |
| 移动鼠标、点击重点 | 自动生成镜头，平滑跟随、缩放并限制取景边界 |
| 选择讲解方式 | 清晰聚焦、电影运镜、空间漫游、全景展示四种风格 |
| 调整镜头细节 | 独立编辑时间、倍率、风格、透视和过渡，焦点沿用录制时的点击位置 |
| 搭配视频外观 | 原创壁纸、黑白灰背景、留白、圆角、毛玻璃边缘、阴影和点击涟漪 |
| 录下画面与声音 | 先确认屏幕或窗口，默认 3 秒倒计时，可选麦克风与系统声音 |
| 随时继续编辑 | 本地自动保存，独立项目库管理工程与历次成片 |
| 保持版本更新 | 启动后自动检查 GitHub Release，设置中手动检查、下载并安装 |
| 导出给观众 | MP4 / WebM，最高 4K，30 / 60 fps，横屏、竖屏或方形 |

预览和导出共用渲染器。采集画面已包含系统鼠标时，保留真实鼠标，避免画面出现第二个光标。

## 黑白两种主题

<table>
  <tr>
    <th width="50%">深色 · 录屏工作室</th>
    <th width="50%">浅色 · 镜头编辑器</th>
  </tr>
  <tr>
    <td><a href="docs/preview-dark.png"><img src="docs/preview-dark.png" alt="深色主题下的录屏工作室"></a></td>
    <td><a href="docs/preview-light.png"><img src="docs/preview-light.png" alt="浅色主题下的镜头编辑器"></a></td>
  </tr>
</table>

主题和存储位置统一放在左下角齿轮设置弹窗中。启动时进入空编辑器；左下角问号按钮可以打开独立运镜演示。

桌面版使用贯通的紧凑顶部栏，品牌、页面路径和操作按区域对齐。拖动顶部空白区域移动窗口，双击最大化／还原，右上角控制最小化和关闭。设置弹窗打开时也能操作窗口。

在「背景 → 毛玻璃边缘」中调整画面与背景交界的柔化强度，设为 0 可关闭。毛玻璃只作用于边缘，画面主体保持清晰，预览与导出一致。

![毛玻璃边缘的设置入口](docs/glass-controls.png)

<details>
<summary>查看设置弹窗与本地项目库</summary>

![集中管理外观、工程目录与导出目录的设置弹窗](docs/settings-dialog.jpg)

![独立的本地项目库页面](docs/library-page.png)

</details>

## 给演示选一张壁纸

![冰蓝绽放、银白流光、暮紫波浪和落日沙丘四款视频背景](docs/wallpapers.png)

四款原创矢量壁纸参考 Windows / macOS 的视觉风格，支持背景模糊、压暗及 4K 输出。也可以选择黑白灰极简背景。**界面主题与成片背景分别设置。**

## 快速开始

从 [GitHub Releases](https://github.com/Mr-Q526/Cursorama/releases/latest) 下载 **Windows x64 Setup 安装包**，运行 `Cursorama-Setup-版本号-x64.exe`，选择安装目录后启动。桌面运行环境和视频编码器已包含在安装包中，安装和后续更新会保留工程、成片及保存位置设置。

**软件更新**：在设置弹窗的「软件更新」中手动检查、下载，下载完成后点击「重启并安装」。默认启动后自动检查，使用期间每 4 小时检查一次；可以关闭自动检查。安装前会保存当前工程，录制和导出期间不执行安装。旧版 `0.1.0` 需先手动安装本版，之后即可使用内置更新。

完整录制与跨应用鼠标追踪请使用 **Windows 桌面版**。也可以从源码运行，需要 Git、**Node.js 22.12 或更新版本**与 npm：

```powershell
git clone https://github.com/Mr-Q526/Cursorama.git
cd Cursorama
npm ci
npm run build
npm start
```

生成本地 Windows 程序：

```powershell
npm run package
```

运行生成的 `release/win-unpacked/Cursorama.exe`，或双击项目根目录的 `启动 Cursorama.cmd`。

仅预览浏览器编辑器：

```powershell
npm run dev
```

打开 [本地预览](http://127.0.0.1:5178)。开发服务支持本地项目库、手动镜头编辑和导出；完整的外部屏幕鼠标追踪在桌面版提供。

## 录一段自己的演示

1. **选来源**：点击「新建录制」，选择屏幕或应用窗口，确认实时预览。
2. **开始演示**：设置声音与倒计时，可在「提词器」中粘贴讲解稿；默认等待 3 秒后开始录制。
3. **整理镜头**：通过悬浮小组件结束录制，返回编辑器，调整运镜风格、时间线和背景。焦点根据录制时的鼠标点击生成。
4. **导出成片**：选择格式、比例与清晰度，工程和视频会保存到本地。

录制开始后，桌面主窗口自动隐藏，屏幕上只留下可拖动的悬浮小组件：查看有效时长、暂停／继续、打开提词器、结束录制。暂停时间不进入成片。按 `Ctrl + Shift + F8` 暂停／继续，按 `Ctrl + Shift + F9` 结束，也可使用托盘菜单。

![录制中的悬浮小组件](docs/floating-dock.png)

提词器支持自动滚动、速度、字号和镜像；暂停录制或收起提词器时停止滚动，讲解稿自动保存在本机。桌面悬浮控件和提词器设置了 Windows 屏幕采集排除。

<details>
<summary>查看提词器与全屏预览</summary>

![可调速度和字号的提词器](docs/teleprompter.png)

![全屏预览底部悬浮播放控制](docs/fullscreen-controls.png)

</details>

编辑预览支持空格播放／暂停、左右方向键跳转，双击画面进入或退出全屏。全屏底部显示进度、播放／暂停、声音和退出按钮，播放时自动淡出，移动鼠标重新显示。圆角在预览和导出中一致，不会露出白色矩形边缘。

默认工程目录为软件目录下的 `projects/`，成片目录为 `exports/`。在设置中可以分别修改位置，已有工程与历史成片仍能在项目库打开。详细操作见 [使用指南](docs/使用指南.md)。

## 开发与贡献

基于 **Electron · React · TypeScript · WebGL · FFmpeg**。录制、运镜、渲染与本地存储各自独立，固定界面文案按模块组织在 `src/i18n/`。

```powershell
npm test          # 单元测试
npm run build     # 类型检查与构建
npm run smoke     # Windows 桌面录制、恢复与导出集成验证
npm run test:recording-controls # 主窗口隐藏、悬浮控件与提词器验证
npm run test:updates # 先生成安装包，再验证下载校验、窗口控制与安装触发
```

项目结构与验证说明见 [使用指南](docs/使用指南.md#开发与验证)，协作约定见 [AGENTS.md](AGENTS.md)。欢迎通过 [Issues](https://github.com/Mr-Q526/Cursorama/issues) 提交问题或建议，通过 Pull Request 贡献改进。

当前为早期版本，重点是屏幕录制、自动运镜与本地编辑导出。摄像头画中画、字幕、自动静音剪辑和云分享尚未提供；长视频处理仍需继续优化。

## 许可与致谢

自有源码采用 [MIT 许可证](LICENSE)。第三方组件许可见 [第三方组件说明](THIRD_PARTY_NOTICES.md)。项目受 [FocuSee](https://focusee.imobie.com/) 的演示录屏体验启发，为独立实现；仓库壁纸为原创素材。
