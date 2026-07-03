import assert from 'node:assert/strict';

import { buildMaidRunResumePrompt } from '../../src/scripts/ui/maid-run-resume-utils.js';

{
  const prompt = buildMaidRunResumePrompt({
    id: 'run-42',
    status: 'failed',
    summary: '已达到本轮执行预算。',
    metadata: {
      goal: '整理世界书',
      maidStatus: 'interrupted',
      reactStoppedReason: 'max_steps_reached',
      continueHint: [
        '用户原始目标：整理世界书',
        '上一轮最后完成工具：worldbook.read',
        '下一步建议工具：worldbook.update_entries',
      ].join('\n'),
    },
  });
  assert.match(prompt, /继续这条已中断的女仆任务/);
  assert.match(prompt, /runId: run-42/);
  assert.match(prompt, /目标：整理世界书/);
  assert.match(prompt, /原因：max_steps_reached/);
  assert.match(prompt, /继续提示：/);
  assert.match(prompt, /下一步建议工具：worldbook\.update_entries/);
  console.log('ok - maid run resume prompt includes selected run continueHint');
}

{
  const prompt = buildMaidRunResumePrompt({
    id: 'run-empty',
    status: 'failed',
    summary: '模型没有返回有效 ReAct 决策。',
  });
  assert.match(prompt, /runId: run-empty/);
  assert.match(prompt, /目标：模型没有返回有效 ReAct 决策。/);
  assert.match(prompt, /请基于这条 run 的历史继续执行/);
  console.log('ok - maid run resume prompt falls back to run summary');
}

console.log('maid-run-resume-utils-tests passed');
