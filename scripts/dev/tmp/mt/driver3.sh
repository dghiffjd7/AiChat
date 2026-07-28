#!/bin/bash
cd /mnt/d/my/phone/tauri-chat-app
PROMPTS=(
"帮我看看世界书列表"
"「测试花园」这个聊天室绑定了哪些世界书？"
"帮我打开正则规则面板"
"我现在有哪些角色卡？"
"打开 Agent Center 看看"
"最近的女仆任务运行记录有几条成功几条失败？"
"看看当前会话的表格记忆里记了什么"
"当前用的是哪个预设？"
"看看动态页最近有什么动态"
"APP里怎么导出聊天记录？告诉我操作路径就行"
"帮我看看当前聊天室的会话配置摘要"
"现在的连线配置用的哪个服务商和模型？"
)
LOG=scripts/dev/tmp/mt/results3.jsonl
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
