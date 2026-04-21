#!/usr/bin/env bash
# 在任意目录启动 Xnova开发者模式

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec npx --prefix "$SCRIPT_DIR" tsx --tsconfig "$SCRIPT_DIR/tsconfig.json" "$SCRIPT_DIR/bin/ccli.ts" "$@"
