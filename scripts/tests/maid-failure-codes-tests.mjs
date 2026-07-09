import assert from 'node:assert/strict';

import {
  MAID_FAILURE_CODES,
  classifyMaidRunFailure,
  classifyMaidToolFailure,
} from '../../src/scripts/agent/maid-failure-codes.js';

{
  assert.equal(
    classifyMaidToolFailure({ errorCode: 'agent_tool_args_invalid', message: 'Agent tool arguments invalid' }),
    MAID_FAILURE_CODES.invalidArgs,
  );
  assert.equal(
    classifyMaidToolFailure({ errorCode: 'agent_tool_not_found' }),
    MAID_FAILURE_CODES.toolUnavailable,
  );
  assert.equal(
    classifyMaidToolFailure({ errorCode: 'agent_tool_denied' }),
    MAID_FAILURE_CODES.permissionDenied,
  );
  assert.equal(
    classifyMaidToolFailure({ errorCode: 'agent_tool_safety_confirmation_required' }),
    MAID_FAILURE_CODES.safetyDenied,
  );
  console.log('ok - 工具错误码映射到失败分类');
}

{
  assert.equal(
    classifyMaidToolFailure({ message: 'args.content is required; args.sessionName is not allowed' }),
    MAID_FAILURE_CODES.invalidArgs,
  );
  assert.equal(
    classifyMaidToolFailure({ message: '世界书「测试」不存在' }),
    MAID_FAILURE_CODES.targetNotFound,
  );
  assert.equal(
    classifyMaidToolFailure({ result: { ok: false, skipped: true, reason: 'destructive_operation_cancelled' } }),
    MAID_FAILURE_CODES.safetyDenied,
  );
  assert.equal(
    classifyMaidToolFailure({ message: '完全未知的错误' }),
    MAID_FAILURE_CODES.unknown,
  );
  console.log('ok - 错误消息模式兜底分类');
}

{
  assert.equal(classifyMaidRunFailure({ ok: true }), '');
  assert.equal(
    classifyMaidRunFailure({ ok: false, reason: 'repeated_tool_failure' }),
    MAID_FAILURE_CODES.repeatedToolFailure,
  );
  assert.equal(
    classifyMaidRunFailure({ ok: false, reason: 'max_steps_reached' }),
    MAID_FAILURE_CODES.maxStepsReached,
  );
  assert.equal(
    classifyMaidRunFailure({ ok: false, reason: 'invalid_model_react_decision' }),
    MAID_FAILURE_CODES.modelInvalidDecision,
  );
  console.log('ok - run 级 reason 优先分类');
}

{
  const verificationFailedRun = {
    ok: false,
    reason: '读回不符',
    steps: [
      { status: 'succeeded', toolName: 'worldbook.update_entries' },
      {
        status: 'failed',
        toolName: 'worldbook.read',
        errorMessage: 'entry missing',
        metadata: { verificationFor: 'worldbook.update_entries' },
      },
    ],
  };
  assert.equal(classifyMaidRunFailure(verificationFailedRun), MAID_FAILURE_CODES.verificationFailed);

  const stepFailureRun = {
    ok: false,
    reason: 'chat.send_message failed',
    steps: [
      {
        status: 'failed',
        toolName: 'chat.send_message',
        failureCode: MAID_FAILURE_CODES.invalidArgs,
      },
    ],
  };
  assert.equal(classifyMaidRunFailure(stepFailureRun), MAID_FAILURE_CODES.invalidArgs);
  console.log('ok - run 级分类回落到最后失败步骤');
}

console.log('maid-failure-codes-tests passed');

{
  // 用户中止类失败识别（不与 safetyDenied 混淆）
  assert.equal(classifyMaidToolFailure({ message: '用户点击了中止，生成已停止' }), 'user_aborted');
  assert.equal(classifyMaidToolFailure({ message: 'generation stopped by user' }), 'user_aborted');
  assert.equal(classifyMaidToolFailure({ result: { cancelled: true, reason: 'user_declined' } }), 'user_aborted');
  assert.equal(classifyMaidToolFailure({ message: 'user_aborted' }), 'user_aborted');
  assert.equal(classifyMaidToolFailure({ message: '危险操作未确认' }), 'safety_denied');
  console.log('ok - user_aborted 失败分类');
}
