import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const appSource = read('../../src/scripts/ui/app.js');
const configSource = read('../../src/scripts/ui/config-panel.js');
const sessionSource = read('../../src/scripts/ui/session-panel.js');
const feedbackSource = read('../../src/scripts/ui/session-add-friend-feedback-ui.js');
const agentCenterSource = read('../../src/scripts/ui/agent-center-panel.js');
const agentStatusSource = read('../../src/scripts/ui/agent-center-status-chip.js');

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
assert.match(appSource, /maidOnboardingRuntime\?\.handleCommandInputOpen\?\.\(\{ open, anchorEl: rootEl \}\)/);
assert.match(appSource, /autoFocus: maidOnboardingRuntime\?\.isFirstRunPending\?\.\(\) !== true/);
assert.match(appSource, /getMaidBallElement: \(\) => modeSwitch/);
assert.match(appSource, /const refreshModeSwitchAnchoredUi = \(\) => \{[\s\S]*?maidOnboardingRuntime\?\.getEntryUi\?\.\(\)\?\.refreshPosition\?\.\(\);[\s\S]*?\};/);
assert.match(appSource, /onPositionChange: refreshModeSwitchAnchoredUi/);
assert.match(appSource, /setModeSwitchPos: value => \{[\s\S]*?modeSwitchPos = value;[\s\S]*?refreshModeSwitchAnchoredUi\(\);[\s\S]*?\}/);
assert.match(appSource, /getProfiles: \(\) => window\.appBridge\?\.getConfigProfiles\?\.\(\)/);
assert.match(appSource, /const targetExpected = Boolean\(target \|\| getMaidGuideStepSelectors\(guide, step\)\.length\)/);
assert.match(appSource, /expectsTarget:\s*targetExpected/);
assert.match(appSource, /waitForMaidGuideStepAdvance\(targetExpected[\s\S]*?\(\) => findMaidGuideTarget\(guide, step\)/);
assert.match(appSource, /document\.addEventListener\('click', onTargetClick, true\)/);

assert.match(sessionSource, /onFriendAdded/);
assert.match(sessionSource, /maidGuideTarget = 'add-friend-recommendation'/);
assert.match(sessionSource, /data-maid-guide-target="add-friend-search-input"/);
assert.match(feedbackSource, /maidGuideTarget = 'add-friend-confirm'/);
assert.match(agentCenterSource, /data-maid-guide-target="agent-center-card"/);
assert.match(agentCenterSource, /data-maid-guide-target="agent-center-close"/);
assert.match(agentCenterSource, /data-maid-guide-target="agent-center-detail-close"/);
assert.match(agentStatusSource, /button\.dataset\.maidGuideTarget = 'agent-center-entry'/);

const commandSettingsBlock = appSource.slice(
  appSource.indexOf('onSettings: async () => {'),
  appSource.indexOf('setTimeoutFn:', appSource.indexOf('onSettings: async () => {')),
);
assert.doesNotMatch(commandSettingsBlock, /maid-command-settings|agentCenterPanel\.show|agent-center-opened/);
assert.match(commandSettingsBlock, /maidSettingsPanel\.show/);

const openCommandBlock = appSource.slice(
  appSource.indexOf('const openMaidCommandOrSettings'),
  appSource.indexOf('const maidSelectionMode'),
);
assert.match(openCommandBlock, /maidCommandInputRuntime\?\.open\(\{ autoFocus \}\)/);
assert.doesNotMatch(openCommandBlock, /openMaidApiConfigPanel/);
console.log('ok - app onboarding contract wires real anchors, completion events, offline command access, and spotlight reuse');
