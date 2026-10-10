#!/bin/bash
set -euo pipefail
bundle_dir="$(cd "$(dirname "$0")" && pwd)"
source "$bundle_dir/prepare.sh"
architecture="$(node -p 'process.arch')"
case "$architecture" in arm64|x64) ;; *) echo "不支持此架构：$architecture"; exit 1;; esac
export CSC_IDENTITY_AUTO_DISCOVERY=false
ELECTRON_DIST=1 npx --no-install vite build
npx --no-install electron-builder --mac dmg "--$architecture" --publish never -c.mac.identity=null -c.directories.output=release
echo "安装包生成位置：$bundle_dir/release"
open "$bundle_dir/release"
