# Streambert 2.6.1 播放修复版

修复了播放器失败后黑屏且不显示原因、本地影片地址复用、媒体重定向和 HLS 跨域请求问题。保留原有 2K/4K 清晰度功能；实际分辨率仍取决于视频源。

## 本次更新

上一版仍包含已经停止服务的 Videasy / Vidking，因此换源也失败。2.6.1 移除这两个源，接入上游的 Peachify 电影源，并将旧源设置转换为适用于当前内容的源。Peachify 在上游标为“仅电影”，剧集继续使用 VidSrc；动漫仍可使用 AllManga。

播放器使用当前系统的真实 Electron 浏览器标识。遇到明确的验证失败，电影会尝试备用源；若没有可用备用源，会显示错误和重试/浏览器入口。正在进行的人机验证保留在播放器内，由用户完成。浏览器与应用的验证 Cookie 不互通，浏览器通过验证并不保证应用也能通过。

## 安装

1. 完全退出旧版 Streambert。
2. 下载本修复分支的 GitHub Actions → Build & Upload MacOS Artifacts → macos-artifacts。
3. 解压下载包，打开其中的 universal.dmg，将 Streambert.app 拖入“应用程序”并替换旧版。建议先将旧版 app 复制到其他目录作为备份；不要删除应用数据目录。
4. 此为个人构建，没有 Apple Developer ID 签名或公证。如果 macOS 阻止打开，在“系统设置 → 隐私与安全性”中对这个应用选择“仍要打开”。
5. 如果系统报告签名损坏，可在终端执行 `codesign --force --deep --sign - /Applications/Streambert.app` 进行本地临时签名后重试。此命令只修改该应用的签名，不关闭系统安全设置。

收藏、观看记录和 API 配置使用原有的 Streambert 数据目录。升级流程不删除这些数据。

## 不等待安装包，直接运行源码

在 GitHub 修复分支页面选择 Code → Download ZIP，解压。安装 Node.js 24 LTS 后，在终端输入 `bash `（末尾一个空格），把解压目录中的 `Start-macOS.command` 拖入终端，按回车。脚本安装锁文件中的依赖、构建前端并打开修复版，不需要手动修改代码。

## 播放与排查

正常点击播放。视频源请求失败时，会显示具体错误，可点击 `Retry player` 重试，或 `Try another source` 换源。

如果应用界面正常但画面仍黑屏，先完全退出应用，再在终端运行：

```sh
STREAMBERT_DISABLE_GPU=1 /Applications/Streambert.app/Contents/MacOS/Streambert
```

这只对本次启动禁用硬件加速。如果仍无法播放，请记录影片名称、所选 Source、错误文字，以及是否能在浏览器打开同一视频源。

## 已验证与限制

- 22 项自动回归测试通过，包含 2K/4K 设置、旧源转换和验证失败处理。
- Linux 上的真实 Electron 已成功解码本地测试 MP4/HLS 并推进播放时间。
- 完整应用已用模拟嵌套验证失败页测试电影自动换源、所有源失败停止切换，以及剧集重试恢复。
- Apple 芯片和 Intel 应用目录已交叉打包并检查内部依赖。
- GitHub macOS 构建机上的真实 Electron MP4/HLS 播放、电影和剧集换源恢复测试也已通过，通用 DMG 构建成功。
- 你自己的 Mac 上安装后的表现和线上第三方视频源尚未验证。此版本修复的是已确认的代码缺陷，不能保证第三方视频源始终可用。

线上 VidSrc / Peachify 播放未获验证，不能保证这次安装后所有影片能播放。若站点继续拒绝验证或视频源本身不可用，应用无法替站点恢复服务。

开发者验证细节见 [playback-repair.md](playback-repair.md)。
