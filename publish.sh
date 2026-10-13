#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "$SCRIPT_DIR/douyu-monitor" ]; then
  cd "$SCRIPT_DIR/douyu-monitor"
elif [ -f "$SCRIPT_DIR/scripts/publish.mjs" ]; then
  cd "$SCRIPT_DIR"
else
  echo "❌ [错误] 找不到 douyu-monitor 源码工程目录！"
  exit 1
fi

echo ""
echo "======================================================"
echo "🛠️  监控室 · 一键提交与发布助手 (Shell)"
echo "======================================================"
echo ""

node scripts/publish.mjs "$@"
