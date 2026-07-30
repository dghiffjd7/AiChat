import assert from 'node:assert/strict';

import { buildMaidRunResumePrompt } from '../../src/scripts/ui/maid-run-resume-utils.js';
import {
  buildMaidRunContinuationPromptBlock,
  buildMaidRunContinuationSnapshot,
  extractMaidResumeRunId,
} from '../../src/scripts/agent/maid-run-continuation.js';

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

{
  const snapshot = buildMaidRunContinuationSnapshot({
    run: {
      id: 'run-sensitive',
      kind: 'maid_assistant',
      metadata: {
        goal: '建立角色卡、世界书与聊天室',
        todos: [
          { id: 'todo-done', content: '创建角色卡', status: 'completed' },
          { id: 'todo-pending', content: '建立群聊', status: 'pending' },
        ],
      },
      steps: [
        {
          id: 'step-create',
          status: 'succeeded',
          summary: 'created persona',
          input: {
            toolName: 'persona.create',
            args: {
              name: '总武高',
              description: 'x'.repeat(4000),
              apiKey: 'never-persist-me',
            },
          },
          output: {
            toolName: 'persona.create',
            status: 'succeeded',
            result: {
              ok: true,
              personaId: 'persona-oregairu',
              name: '总武高',
              avatar: 'data:image/png;base64,SECRET',
            },
          },
        },
        {
          id: 'step-verify',
          status: 'succeeded',
          summary: 'read persona',
          input: {
            toolName: 'app.read_resource',
            args: { resource: 'persona', id: 'persona-oregairu' },
          },
          output: {
            toolName: 'app.read_resource',
            status: 'succeeded',
            result: { ok: true, id: 'persona-oregairu', name: '总武高' },
          },
          metadata: { verificationFor: 'persona.create' },
        },
      ],
    },
    result: {
      ok: false,
      continuable: true,
      reason: 'max_steps_reached',
      pendingPlan: {
        toolName: 'group.create',
        args: { name: '侍奉部', members: ['雪乃', '结衣'] },
      },
    },
    visualSpecLedger: {
      version: 'maid-visual-spec-v1',
      specs: {
        yukino: {
          id: 'visual-yukino',
          subject: '雪之下雪乃',
          appearance: 'long black hair',
          outfit: 'school uniform',
          style: 'anime',
        },
      },
    },
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.version, 'maid-run-continuation-v1');
  assert.equal(snapshot.sourceRunId, 'run-sensitive');
  assert.equal(snapshot.goal, '建立角色卡、世界书与聊天室');
  assert.equal(snapshot.successfulSteps[0].toolName, 'persona.create');
  assert.equal(snapshot.successfulSteps[0].verification, 'readback');
  assert.ok(snapshot.successfulSteps[0].resourceRefs.some(ref => ref.id === 'persona-oregairu'));
  assert.equal(snapshot.remainingTodos.length, 1);
  assert.equal(snapshot.pendingPlan.toolName, 'group.create');
  assert.equal(snapshot.visualSpecLedger.specs.yukino.subject, '雪之下雪乃');
  assert.doesNotMatch(serialized, /never-persist-me|data:image|SECRET|x{200}/);
  assert.ok(serialized.length < 16_000, `续作快照必须有界，实际 ${serialized.length}`);
  const block = buildMaidRunContinuationPromptBlock(snapshot);
  assert.match(block, /<maid_run_continuation version="maid-run-continuation-v1">/);
  assert.match(block, /persona-oregairu/);
  console.log('ok - maid run continuation snapshot keeps stable facts without secrets or large payloads');
}

{
  const prompt = buildMaidRunResumePrompt({
    id: 'run-resume-id',
    metadata: { goal: '继续建立群聊', continuable: true },
  });
  assert.equal(extractMaidResumeRunId(prompt), 'run-resume-id');
  assert.equal(extractMaidResumeRunId('请查看 runId: run-resume-id'), '');
  console.log('ok - maid run resume id is accepted only from the structured resume prompt');
}

console.log('maid-run-resume-utils-tests passed');
