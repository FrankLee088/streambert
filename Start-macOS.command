#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"
if [[ "$(uname -s)" != Darwin ]]; then
  echo '请在 macOS 上运行这个启动脚本。'
  exit 1
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo '请先安装 Node.js 24 LTS：https://nodejs.org/'
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12)){console.error("需要 Node.js >=22.12，推荐 24 LTS。");process.exit(1)}'
npm ci --no-audit --no-fund
npm start
