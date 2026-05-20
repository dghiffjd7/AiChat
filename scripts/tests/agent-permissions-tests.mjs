import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
  evaluateAgentPermission,
  matchesAgentPermissionPattern,
  normalizeAgentPermissionLayer,
} from '../../src/scripts/agent/agent-permissions.js';

{
  assert.equal(matchesAgentPermissionPattern('image.generate', 'image.*'), true);
  assert.equal(matchesAgentPermissionPattern('memory.update_after_chat', 'image.*'), false);
  assert.equal(matchesAgentPermissionPattern('anything', '*'), true);
  assert.equal(normalizeAgentPermissionLayer('role_card'), 'roleCard');
  console.log('ok - agent permission wildcard and layer normalization work');
}

{
  const result = evaluateAgentPermission({
    defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    context: {
      toolName: 'memory.update_after_chat',
      permission: 'storage',
      sessionId: 's1',
    },
    rules: [
      {
        layer: 'session',
        decision: 'deny',
        toolName: 'memory.*',
        permission: 'storage',
        sessionId: 's1',
      },
      {
        layer: 'global',
        decision: 'allow',
        toolName: 'memory.update_after_chat',
        permission: 'storage',
      },
    ],
  });
  assert.equal(result.decision, AGENT_PERMISSION_DECISIONS.allow);
  assert.equal(result.rule.layer, 'global');
  console.log('ok - agent permission higher layer rule wins over lower layer rule');
}

{
  const result = evaluateAgentPermission({
    defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    context: {
      toolName: 'image.generate',
      permission: 'network',
      source: 'media-generation-service',
    },
    rules: [
      {
        layer: 'agent',
        priority: 10,
        decision: 'deny',
        toolName: 'image.*',
        permission: 'network',
      },
      {
        layer: 'agent',
        priority: 10,
        decision: 'allow',
        toolName: 'image.generate',
        permission: 'network',
        source: 'media-*',
      },
    ],
  });
  assert.equal(result.decision, AGENT_PERMISSION_DECISIONS.allow);
  assert.equal(result.rule.toolName, 'image.generate');
  console.log('ok - agent permission later same-layer rule wins when priority ties');
}

{
  const evaluator = createAgentPermissionEvaluator({
    defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
  });
  assert.equal(
    evaluator.evaluateTool({ name: 'noop.tool', permissions: [] }).decision,
    AGENT_PERMISSION_DECISIONS.allow,
  );
  assert.equal(
    evaluator.evaluateTool({ name: 'image.generate', source: 'media', permissions: ['network'] }).decision,
    AGENT_PERMISSION_DECISIONS.ask,
  );
  evaluator.addRule({
    layer: 'global',
    decision: 'allow',
    toolName: 'image.*',
    permission: 'network',
  });
  evaluator.addRule({
    layer: 'global',
    decision: 'deny',
    toolName: 'image.*',
    permission: 'storage',
  });
  assert.equal(
    evaluator.evaluateTool({ name: 'image.generate', source: 'media', permissions: ['network'] }).decision,
    AGENT_PERMISSION_DECISIONS.allow,
  );
  assert.equal(
    evaluator.evaluateTool({ name: 'image.generate', source: 'media', permissions: ['network', 'storage'] }).decision,
    AGENT_PERMISSION_DECISIONS.deny,
  );
  console.log('ok - agent permission evaluator combines tool permission checks conservatively');
}
