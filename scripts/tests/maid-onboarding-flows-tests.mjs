import assert from 'node:assert/strict';

import {
  MAID_ONBOARDING_TARGET_SELECTORS,
  ONBOARDING_TASKS,
  getMaidOnboardingFlow,
} from '../../src/scripts/ui/maid-onboarding-flows.js';

{
  const ids = ONBOARDING_TASKS.map(task => task.flowId);
  assert.deepEqual(ids, ['setup-api', 'add-friend', 'first-chat', 'meet-maid']);
  assert.equal(ONBOARDING_TASKS.find(task => task.flowId === 'first-chat')?.requires, 'setup-api');
  ids.forEach(id => assert.ok(getMaidOnboardingFlow(id)?.steps?.length > 1, `${id} should define a flow`));
  console.log('ok - maid onboarding exports the four planned tasks and their dependency');
}

{
  const setup = getMaidOnboardingFlow('setup-api');
  assert.equal(setup.steps.at(-1).target, 'config-save-btn');
  assert.equal(setup.steps.at(-1).canAdvance('config-profile-saved', { profileCount: 1 }), true);
  assert.equal(setup.steps.at(-1).canAdvance('config-profile-saved', { profileCount: 0 }), false);
  assert.equal(setup.steps.at(-1).canAdvance('config-draft-changed', { profileCount: 1 }), false);
  const connectionStep = setup.steps.find(step => step.target === 'config-connection-fields');
  assert.deepEqual(connectionStep.fallback, { kind: 'focus-target', target: 'config-api-key-input' });
  assert.equal(connectionStep.canAdvance('config-credentials-ready', { hasKey: true, hasModel: true }), true);
  assert.equal(connectionStep.canAdvance('config-credentials-ready', { hasKey: true, hasModel: false }), false);
  assert.ok(MAID_ONBOARDING_TARGET_SELECTORS['config-connection-fields'].includes('#config-main-page'));
  assert.ok(MAID_ONBOARDING_TARGET_SELECTORS['config-api-key-input'].includes('#config-apikey'));
  assert.ok(MAID_ONBOARDING_TARGET_SELECTORS['config-save-btn'].includes('#config-save'));
  console.log('ok - setup API flow advances only after a real profile save');
}

{
  const addFriend = getMaidOnboardingFlow('add-friend');
  assert.equal(addFriend.steps.at(-1).canAdvance('friend-added', { sessionId: 'Aria' }), true);
  const firstChat = getMaidOnboardingFlow('first-chat');
  assert.equal(firstChat.steps[1].canAdvance('chat-room-entered', { sessionId: 'Aria' }), true);
  assert.equal(firstChat.steps.at(-1).canAdvance('chat-message-received', { role: 'assistant' }), true);
  const meetMaid = getMaidOnboardingFlow('meet-maid');
  assert.equal(meetMaid.steps.at(-1).canAdvance('agent-center-closed'), true);
  console.log('ok - add-friend, first-chat, and meet-maid flows use completion events');
}
