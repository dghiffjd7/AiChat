import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const appSource = read('../../src/scripts/ui/app.js');
const configSource = read('../../src/scripts/ui/config-panel.js');
const sessionSource = read('../../src/scripts/ui/session-panel.js');
const feedbackSource = read('../../src/scripts/ui/session-add-friend-feedback-ui.js');
const agentCenterSource = read('../../src/scripts/ui/agent-center-panel.js');

for (const target of [
  'config-connection-fields',
  'config-provider-select',
  'config-api-key-input',
  'config-model-select',
  'config-save-btn',
]) {
  assert.match(configSource, new RegExp(`data-maid-guide-target=["']${target}["']`));
}
assert.match(appSource, /document\.body\?\.dataset\?\.maidSpotlight === 'on'/);
assert.match(appSource, /maidGuideEmit\(window, 'config-profile-saved'/);
assert.match(appSource, /maidGuideEmit\(window, 'chat-message-sent'/);
assert.match(appSource, /maidGuideEmit\(window, 'chat-message-received'/);
assert.match(appSource, /maidGuideEmit\(window, 'chat-room-entered'/);
assert.match(appSource, /registerGuideStartFlowTools/);
assert.match(appSource, /maidOnboardingRuntime\?\.getSpotlight\?\.\(\)/);
assert.match(appSource, /getProfiles: \(\) => window\.appBridge\?\.getConfigProfiles\?\.\(\)/);

assert.match(sessionSource, /onFriendAdded/);
assert.match(sessionSource, /maidGuideTarget = 'add-friend-recommendation'/);
assert.match(sessionSource, /data-maid-guide-target="add-friend-search-input"/);
assert.match(feedbackSource, /maidGuideTarget = 'add-friend-confirm'/);
assert.match(agentCenterSource, /data-maid-guide-target="agent-center-card"/);
assert.match(agentCenterSource, /data-maid-guide-target="agent-center-close"/);

const openCommandBlock = appSource.slice(
  appSource.indexOf('const openMaidCommandOrSettings'),
  appSource.indexOf('const maidSelectionMode'),
);
assert.match(openCommandBlock, /maidCommandInputRuntime\?\.open\(\)/);
assert.doesNotMatch(openCommandBlock, /openMaidApiConfigPanel/);
console.log('ok - app onboarding contract wires real anchors, completion events, offline command access, and spotlight reuse');
