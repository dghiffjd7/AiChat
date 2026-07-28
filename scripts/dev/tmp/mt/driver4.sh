#!/bin/bash
cd /mnt/d/my/phone/tauri-chat-app
PROMPTS=(
"读取「雷姆」这本世界书里有哪些条目"
"当前会话有哪些变量？"
"帮我看看上一条AI回复的完整原文"
"表情包功能怎么用？"
"打开记忆管理面板"
"当前会话绑定了哪些正则规则？"
"我的用户名称列表有哪些？"
"帮我总结一下当前聊天室最近十条对话在聊什么"
"当前聊天室的格式画像是什么？"
"打开API配置面板"
"「测试花园」最近一条消息说了什么？"
"APP里和图片生成相关的功能有哪些？"
)
LOG=scripts/dev/tmp/mt/results4.jsonl
: > "$LOG"
for i in "${!PROMPTS[@]}"; do
  p="${PROMPTS[$i]}"
  printf '(() => { window.__mtPrompt = %s; return { set: true }; })()' "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$p")" > scripts/dev/tmp/mt/setp.js
  cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt\setp.js" > /dev/null 2>&1
  cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt-run.js" > /dev/null 2>&1
  ok=""
  for t in $(seq 1 50); do
    sleep 5
    out=$(cmd.exe /c "node scripts\dev\app-eval.mjs @scripts\dev\tmp\mt-poll.js" 2>/dev/null)
    if echo "$out" | grep -q '"done": true'; then ok=1; break; fi
  done
  echo "=== PROMPT $((i+1)): $p" >> "$LOG"
  if [ -n "$ok" ]; then echo "$out" >> "$LOG"; else echo '{"timeout": true}' >> "$LOG"; fi
done
echo BATTERY_DONE >> "$LOG"
