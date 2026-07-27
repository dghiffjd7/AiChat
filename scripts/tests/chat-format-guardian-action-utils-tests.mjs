import assert from 'node:assert/strict';

import {
  buildChatFormatGuardianApplyRepairPayload,
  buildChatFormatGuardianRetryPlan,
} from '../../src/scripts/ui/chat/chat-format-guardian-action-utils.js';

{
  const payload = buildChatFormatGuardianApplyRepairPayload({
    actionMeta: {
      repairCandidate: {
        kind: 'fill_missing_time',
        summary: '补齐缺失时间',
        reviewWarning: '正文疑似严重截断，可考虑重新生成',
        replacementText: ' 菲伦--今晚别一个人走。--22:12 ',
        protocolVersion: 'format_patch.v1',
        baseRevision: 'format-run:1',
        sourceSnapshot: '原文',
        sourceKind: 'social_turn_raw',
        sourceSessionId: 'source',
        targetSessionId: 'target',
        turnId: 'turn-1',
        sourceMessageIds: ['m1', 'm2'],
        formatTarget: 'private_chat',
        formatSourceIds: ['phoneShell', 'privateChat'],
        linePatches: [{ startLine: 1, endLine: 1 }],
      },
    },
    part: {
      metadata: {
        repairCandidate: {
          kind: 'fallback',
          replacementText: 'ignored',
        },
      },
    },
  });
  assert.deepEqual(payload, {
    text: ' 菲伦--今晚别一个人走。--22:12 ',
    regexEditMode: false,
    source: 'chat_format_guardian',
    repairKind: 'fill_missing_time',
    repairSummary: '补齐缺失时间',
    reviewWarning: '正文疑似严重截断，可考虑重新生成',
    protocolVersion: 'format_patch.v1',
    baseRevision: 'format-run:1',
    sourceSnapshot: '原文',
    sourceKind: 'social_turn_raw',
    sourceSessionId: 'source',
    targetSessionId: 'target',
    turnId: 'turn-1',
    sourceMessageIds: ['m1', 'm2'],
    formatTarget: 'private_chat',
    formatSourceIds: ['phoneShell', 'privateChat'],
    linePatches: [{ startLine: 1, endLine: 1 }],
  });
  console.log('ok - chat format guardian apply repair payload prefers action metadata');
}

{
  const payload = buildChatFormatGuardianApplyRepairPayload({
    part: {
      metadata: {
        repairCandidate: {
          kind: 'fill_missing_time',
          replacementText: '系统消息--菲伦加入了群聊--22:12',
        },
      },
    },
  });
  assert.equal(payload.text, '系统消息--菲伦加入了群聊--22:12');
  assert.equal(payload.repairKind, 'fill_missing_time');
  assert.equal(payload.repairSummary, '');
  assert.equal(payload.reviewWarning, '');
  assert.equal(payload.sourceSnapshot, '');
  assert.deepEqual(payload.sourceMessageIds, []);
  assert.equal(payload.formatTarget, '');
  assert.deepEqual(payload.formatSourceIds, []);
  assert.equal(buildChatFormatGuardianApplyRepairPayload({ part: { metadata: {} } }), null);
  console.log('ok - chat format guardian apply repair payload falls back to part metadata');
}

{
  const message = { id: 'm1', role: 'assistant' };
  const plan = buildChatFormatGuardianRetryPlan({
    uiMode: 'rp',
    canSwipeRegen: true,
    message,
    part: { summary: '1 warning' },
  });
  assert.equal(plan.kind, 'swipe_regen');
  assert.deepEqual(plan.payload, {
    msgId: 'm1',
    message,
    source: 'chat_format_guardian',
  });
  console.log('ok - chat format guardian retry plan uses RP swipe regeneration when available');
}

{
  const message = { id: 'm2', role: 'assistant' };
  const plan = buildChatFormatGuardianRetryPlan({
    uiMode: 'chat',
    canSwipeRegen: true,
    message,
    part: { summary: '2 warnings' },
  });
  assert.deepEqual(plan, {
    kind: 'regenerate',
    action: 'regenerate',
    message,
    payload: {
      source: 'chat_format_guardian',
      reason: '2 warnings',
    },
  });
  const rpWithoutHandler = buildChatFormatGuardianRetryPlan({
    uiMode: 'rp',
    canSwipeRegen: false,
    message,
    part: { summary: 'fallback' },
  });
  assert.equal(rpWithoutHandler.kind, 'regenerate');
  console.log('ok - chat format guardian retry plan falls back to existing regenerate');
}
