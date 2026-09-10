#!/bin/sh
# 测试入口：node 语法自检（check.mjs）+ headless Chrome 跑 runner.html 全量用例。
# runner 的 iframe 用 file:// 加载同目录 fixture，必须 --allow-file-access-from-files，否则报 cross-origin。
# 用法：sh test/run.sh  （或 CHROME=/path/to/chrome sh test/run.sh）
set -e
cd "$(dirname "$0")/.."

node test/check.mjs

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium" google-chrome chromium; do
    if [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "未找到 Chrome，可用 CHROME=/path/to/chrome 指定"; exit 1; }

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files \
  --virtual-time-budget=20000 --dump-dom "file://$PWD/test/runner.html" >"$OUT" 2>/dev/null

# 通过标记：document.title = runner-done:allpass（任一用例失败或 runner 异常则为其它值）
if ! grep -q 'runner-done:allpass' "$OUT"; then
  grep -o 'runner-done:[^"<]*\|RUNNER ERROR: [^<]*' "$OUT" | head -5
  exit 1
fi
grep -o 'PASS [0-9]* / FAIL [0-9]*' "$OUT" | head -1
echo "runner: 全部通过"
