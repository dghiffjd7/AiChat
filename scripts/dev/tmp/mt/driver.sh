#!/bin/bash
cd /mnt/d/my/phone/tauri-chat-app
PROMPTS=(
"帮我看看会话列表，一共有几个聊天室？"
"你现在在哪个页面？"
"帮我记个待办：第一步测试会话工具，第二步测试搜索工具，第三步汇报结果"
"当前任务进度怎么样了？"
"帮我创建一个叫「女仆测试房间」的聊天室"
"打开「女仆测试房间」这个聊天室"
"看看当前界面上有什么内容"
"APP里有什么和世界书有关的功能？"
"网上搜一张白猫的图片给我"
"把待办里前两项标记为完成"
)
LOG=scripts/dev/tmp/mt/results.jsonl
: > "$LOG"
for i in "${!PROMPTS[@]}"; do
  p="${PROMPTS[$i]}"
  printf '(() => { window.__mtPrompt = %s; return { set: true }; })()' "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$p")" > scripts/dev/tmp/mt/setp.js
  cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt\setp.js" > /dev/null 2>&1
  cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt-run.js" > /dev/null 2>&1
  ok=""
  for t in $(seq 1 40); do
    sleep 5
    out=$(cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt-poll.js" 2>/dev/null)
    if echo "$out" | grep -q '"done": true'; then ok=1; break; fi
  done
  echo "=== PROMPT $((i+1)): $p" >> "$LOG"
  if [ -n "$ok" ]; then echo "$out" >> "$LOG"; else echo '{"timeout": true}' >> "$LOG"; fi
done
echo BATTERY_DONE >> "$LOG"
