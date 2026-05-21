import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import {
  PROVIDER_TOOL_PERMISSION_ACTIONS,
  applyProviderToolPermissionAction,
  buildProviderToolPermissionPromptMessage,
  buildProviderToolPermissionRule,
  normalizeProviderToolPermissionAction,
} from '../../src/scripts/agent/provider-tool-permission-actions.js';

const request = {
  toolName: 'contact_profile.list',
  permissions: ['storage'],
  riskLevel: 'low',
  argsPreview: { limit: 2 },
  checks: [
    {
      context: {
        toolName: 'contact_profile.list',
        permission: 'storage',
        source: 'contact-profile-store',
        sessionId: 's1',
      },
    },
  ],
};

{
  assert.equal(
    normalizeProviderToolPermissionAction('allow'),
    PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
  );
  assert.equal(
    normalizeProviderToolPermissionAction('remember_rule'),
    PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow,
  );
  assert.equal(
    normalizeProviderToolPermissionAction('unknown'),
    PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
  );
  console.log('ok - provider tool permission actions normalize UI choices');
}

{
  const message = buildProviderToolPermissionPromptMessage(request);
  assert.equal(message.includes('contact_profile.list'), true);
  assert.equal(message.includes('storage'), true);
  assert.equal(message.includes('limit'), true);
  console.log('ok - provider tool permission prompt message summarizes request');
}

{
  const result = applyProviderToolPermissionAction(PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce, request);
  assert.equal(result.decision, AGENT_PERMISSION_DECISIONS.allow);
  assert.equal(result.rule, undefined);
  console.log('ok - provider tool permission allow once does not persist a rule');
}

{
  const result = applyProviderToolPermissionAction(PROVIDER_TOOL_PERMISSION_ACTIONS.deny, request);
  assert.equal(result.decision, AGENT_PERMISSION_DECISIONS.deny);
  console.log('ok - provider tool permission deny returns a deny decision');
}

{
  const evaluator = createAgentPermissionEvaluator({
    defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
  });
  const result = applyProviderToolPermissionAction(PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow, request, {
    permissionEvaluator: evaluator,
    sessionId: 's1',
  });
  assert.equal(result.decision, AGENT_PERMISSION_DECISIONS.allow);
  assert.equal(result.rule.layer, 'session');
  assert.equal(result.rule.toolName, 'contact_profile.list');
  assert.equal(result.rule.permission, 'storage');
  assert.equal(
    evaluator.evaluateTool(
      { name: 'contact_profile.list', source: 'contact-profile-store', permissions: ['storage'] },
      { sessionId: 's1' },
    ).decision,
    AGENT_PERMISSION_DECISIONS.allow,
  );
  assert.equal(
    evaluator.evaluateTool(
      { name: 'contact_profile.list', source: 'contact-profile-store', permissions: ['storage'] },
      { sessionId: 'other' },
    ).decision,
    AGENT_PERMISSION_DECISIONS.ask,
  );
  console.log('ok - provider tool permission remember allow writes a session-scoped evaluator rule');
}

{
  const rule = buildProviderToolPermissionRule({
    toolName: 'multi.permission',
    permissions: ['storage', 'network'],
  }, { sessionId: 's2' });
  assert.equal(rule.permission, '*');
  assert.equal(rule.sessionId, 's2');
  console.log('ok - provider tool permission rule falls back to wildcard for multi-permission requests');
}
