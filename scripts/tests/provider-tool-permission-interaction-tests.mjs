import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_PERMISSION_INTERACTION_MODES,
  buildProviderToolPermissionInteraction,
  buildProviderToolPermissionStrategySummary,
  normalizeProviderToolPermissionInteraction,
} from '../../src/scripts/agent/provider-tool-permission-interaction.js';

{
  const interaction = buildProviderToolPermissionInteraction({}, {
    sessionId: 's1',
    sessionGate: { enabled: true, sessionId: 's1' },
    source: 'bridge.generateStream',
  });

  assert.equal(interaction.mode, PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.deferredMessagePart);
  assert.equal(interaction.presentation, 'message_part');
  assert.equal(interaction.promptModal, false);
  assert.equal(interaction.silentPrompt, false);
  assert.equal(interaction.sessionGateEnabled, true);
  assert.equal(interaction.defaultAction, 'deny');
  assert.deepEqual(interaction.allowedActions, ['allow_once', 'deny', 'remember_allow']);
  assert.equal(interaction.reason.includes('stream callbacks must not open modal prompts'), true);
  console.log('ok - provider tool permission interaction defaults to deferred message part');
}

{
  const interaction = buildProviderToolPermissionInteraction({}, {
    promptPermission: true,
    sessionId: 's2',
  });
  const summary = buildProviderToolPermissionStrategySummary(interaction);

  assert.equal(interaction.mode, PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.modalPrompt);
  assert.equal(interaction.presentation, 'modal');
  assert.equal(interaction.promptModal, true);
  assert.equal(summary.mode, 'modal_prompt');
  assert.equal(summary.promptModal, true);
  console.log('ok - provider tool permission interaction allows modal only when explicitly requested');
}

{
  const interaction = normalizeProviderToolPermissionInteraction({
    mode: 'unknown',
    allowedActions: ['deny'],
    defaultAction: 'allow_once',
  }, {
    sessionId: 's3',
  });

  assert.equal(interaction.mode, PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.deferredMessagePart);
  assert.deepEqual(interaction.allowedActions, ['deny']);
  assert.equal(interaction.defaultAction, 'deny');
  assert.equal(interaction.sessionId, 's3');
  console.log('ok - normalizeProviderToolPermissionInteraction fails closed on invalid mode/action');
}
