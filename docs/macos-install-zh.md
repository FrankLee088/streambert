# Streambert 播放修复版

修复了播放器失败后黑屏且不显示原因、本地影片地址复用、媒体重定向和 HLS 跨域请求问题。保留原有 2K/4K 清晰度功能；实际分辨率仍取决于视频源。

## 安装

1. 完全退出旧版 Streambert。
2. 下载本修复分支的 GitHub Actions → Build & Upload MacOS Artifacts → macos-artifacts。
3. 解压下载包，打开其中的 universal.dmg，将 Streambert.app 拖入“应用程序”并替换旧版。建议先将旧版 app 复制到其他目录作为备份；不要删除应用数据目录。
4. 此为个人构建，没有 Apple Developer ID 签名或公证。如果 macOS 阻止打开，在“系统设置 → 隐私与安全性”中对这个应用选择“仍要打开”。
5. 如果系统报告签名损坏，可在终端执行 `codesign --force --deep --sign - /Applications/Streambert.app` 进行本地临时签名后重试。此命令只修改该应用的签名，不关闭系统安全设置。

收藏、观看记录和 API 配置使用原有的 Streambert 数据目录。升级脚本不会删除这些数据；不要把真实 API 令牌发送到聊天或提交到仓库。

## 播放与排查

正常点击播放。视频源请求失败时，会显示具体错误，可点击 `Retry player` 重试，或 `Try another source` 换源。

如果应用界面正常但画面仍黑屏，先完全退出应用，再在终端运行：

```sh
STREAMBERT_DISABLE_GPU=1 /Applications/Streambert.app/Contents/MacOS/Streambert
```

这只对本次启动禁用硬件加速。如果仍无法播放，请记录影片名称、所选 Source、错误文字，以及是否能在浏览器打开同一视频源。

## 已验证与限制

- 16 项自动回归测试通过，包含 2K/4K 设置。
- Linux 上的真实 Electron 已成功解码本地测试 MP4/HLS 并推进播放时间。
- 完整应用中的电影、剧集页面已验证从模拟视频源故障切换恢复画面。
- Apple 芯片和 Intel 应用目录已交叉打包并检查内部依赖。
- 真实 Mac 运行和线上第三方视频源尚未验证。此版本修复的是已确认的代码缺陷，不能保证第三方视频源始终可用。

开发者验证细节见 [playback-repair.md](playback-repair.md)。
