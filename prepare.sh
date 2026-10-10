#!/bin/bash
set -euo pipefail
bundle_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo '此运行包需要在 macOS 上使用。'
  exit 1
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo '请先安装 Node.js 24 LTS（https://nodejs.org/），重新打开终端后再运行。'
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<12)){console.error("需要 Node.js >=22.12，推荐 Node.js 24 LTS。");process.exit(1)}'
cd "$bundle_dir"
npm ci --no-audit --no-fund
