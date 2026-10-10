# Streambert macOS 本地运行包

此包包含云端修改后的项目源码，包括 2K（1440p）、4K（2160p）清晰度选项。
它不是已构建的 .app 或 DMG。尚未在真实 Mac 上运行验证。

## 运行

1. 在 https://nodejs.org/ 安装 Node.js 24 LTS，安装后重新打开终端。
2. 解压整个 ZIP 到本地目录，保留 Start.command、prepare.sh 和 package.json 的相对位置。
3. 在终端输入 `bash `（末尾一个空格），将 Start.command 拖入终端，再按回车。
4. 脚本按当前 Node.js 的架构安装依赖，构建前端并打开 Electron 应用。使用原生架构的 Node.js 时，Apple 芯片和 Intel Mac 均可按对应架构运行。
5. 在应用中配置自己的 TMDB Read Access Token，或点击 Skip for now。令牌只通过应用界面输入，请勿发送到聊天中。
6. 在 Settings → Appearance → Default playback quality 选择默认清晰度并点击 Save；电影和剧集播放器内也可临时切换。

首次运行需要联网访问 npm 包仓库和 GitHub Electron 发布资源。
每次运行都会执行 npm ci，按已有锁文件重新安装依赖；源码与锁文件不被修改。
实际 2K/4K 播放取决于视频源是否提供对应档位和开放控制接口。

## 在你的 Mac 上生成 DMG

在终端输入 `bash `，将 Build-installer.command 拖入终端，按回车。
脚本会为当前 Node.js 架构构建 DMG，输出到 release 并打开该文件夹。
打开 DMG 后，将 Streambert.app 拖入 Applications。

个人构建没有 Apple 开发者签名或公证；如果 macOS 阻止打开，可在“系统设置 → 隐私与安全性”中允许该本地构建。
云端没有 macOS 构建工具，DMG 生成流程尚未在真实 Mac 上验证。

## 包含的验证

云端 Linux：Vite 构建通过；6 项清晰度适配测试通过；Electron 设置保存/重载、电影播放器切换和跨域子框架控制通过。
在线第三方源和真实 Mac 运行尚未验证。

可在项目根目录中运行 `node --test tests/playerQuality.test.cjs` 重跑适配测试。
