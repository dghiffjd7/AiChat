#!/bin/bash
cd /mnt/d/my/phone/tauri-chat-app
PROMPTS=(
"当前用的是哪个预设？"
"看看当前会话的表格记忆里记了什么"
"我现在有哪些角色卡？"
"现在的连线配置用的哪个服务商和模型？"
"当前会话有哪些变量？"
"当前会话绑定了哪些正则规则？"
"帮我看看上一条AI回复的完整原文"
"我的用户名称列表有哪些？"
"帮我看看当前聊天室的会话配置摘要"
"「测试花园」最近一条消息说了什么？"
)
LOG=scripts/dev/tmp/mt/results5.jsonl
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
