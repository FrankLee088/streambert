#!/bin/bash
set -euo pipefail
bundle_dir="$(cd "$(dirname "$0")" && pwd)"
source "$bundle_dir/prepare.sh"
npm start
