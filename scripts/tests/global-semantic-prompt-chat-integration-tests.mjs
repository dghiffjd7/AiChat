import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildGlobalSemanticPromptExtraBlocks,
  resolveGlobalSemanticPromptPlan,
} from '../../src/scripts/agent/global-semantic-prompt-library.js';
import {
  assembleLegacyTextRequest,
  assembleProviderFcRequest,
  createChatSemanticSnapshot,
} from '../../src/scripts/ui/chat/chat-semantic-snapshot-utils.js';
import { resolvePrivateChatProviderFcEligibility } from '../../src/scripts/ui/chat/private-chat-provider-fc.js';
import { buildSummaryCompactionContext } from '../../src/scripts/ui/chat/summary-compaction-utils.js';

const bridgeSource = await readFile(
  new URL('../../src/scripts/ui/bridge.js', import.meta.url),
  'utf8',
);
const appSource = await readFile(
  new URL('../../src/scripts/ui/app.js', import.meta.url),
  'utf8',
);

{
  const plan = resolveGlobalSemanticPromptPlan({
    blocks: [{
      id: 'global-chat',
      name: 'Global chat semantics',
      enabled: true,
      content: 'GLOBAL SEMANTIC SNAPSHOT',
      scope: 'chat',
      anchor: 'semantic_header',
    }],
  }, { scope: 'chat' });
  const extraBlocks = buildGlobalSemanticPromptExtraBlocks(plan);
  assert.equal(extraBlocks.length, 1);
  assert.equal(extraBlocks[0].preRendered, true);

  const legacyLayer = 'MiPhone_start\nmsg_start\nmsg_end\nMiPhone_end';
  const created = createChatSemanticSnapshot({
    legacyMessages: [
      { role: 'system', content: extraBlocks[0].content },
      { role: 'system', content: legacyLayer },
      { role: 'user', content: 'hello' },
    ],
    legacyLayers: [{ id: 'phone_format', content: legacyLayer }],
    providerFcTransportMessage: 'Use the structured terminal contract.',
  });
  assert.equal(created.ok, true, created.reason);
  const nativeFc = assembleProviderFcRequest(created.snapshot);
  const jsonTerminal = assembleProviderFcRequest(created.snapshot);
  const legacy = assembleLegacyTextRequest(created.snapshot);
  for (const route of [nativeFc, jsonTerminal, legacy]) {
    assert.equal(route.ok, true);
    assert.equal(
      route.messages.filter(message => String(message.content || '') === 'GLOBAL SEMANTIC SNAPSHOT').length,
      1,
    );
  }
  assert.equal(nativeFc.snapshotFingerprint, jsonTerminal.snapshotFingerprint);
  assert.equal(nativeFc.snapshotFingerprint, legacy.snapshotFingerprint);
  console.log('ok - FC JSON and text assemblies consume one frozen global semantic snapshot');
}

{
  const plan = resolveGlobalSemanticPromptPlan({
    blocks: [{
      id: 'safe-global-chat',
      name: 'Safe global semantics',
      enabled: true,
      content: 'Keep motivations and relationships consistent.',
      scope: 'chat',
      anchor: 'semantic_header',
    }],
  }, { scope: 'chat' });
  const eligibility = resolvePrivateChatProviderFcEligibility({
    enabled: true,
    config: {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com/v1',
    },
    client: { chat() {} },
    messages: [
      { role: 'system', content: plan.injected[0].content },
      { role: 'user', content: 'hello' },
    ],
    context: {
      uiMode: 'chat',
      surface: 'private_chat',
      responseTarget: 'character',
      usesBuiltinFormat: true,
      usesDefaultPreset: true,
      compatibilityModeEnabled: false,
      protocolParserEnabled: true,
      hasUnsupportedSideEffects: false,
      assistantContinuation: false,
      webSearchEnabled: false,
      hasProviderTools: false,
      formatProfileEnabled: false,
    },
    target: {
      sessionId: 'safe-global-session',
      targetName: 'Mia',
      speakerName: 'Mia',
    },
  });
  assert.equal(eligibility.eligible, true, eligibility.reason);
  assert.notEqual(eligibility.reason, 'text_protocol_prompt_present');
  console.log('ok - a safe global semantic block does not change private-chat FC eligibility');
}

{
  assert.match(bridgeSource, /buildGlobalSemanticPromptExtraBlocks\(\s*globalSemanticPromptPlan/);
  assert.match(bridgeSource, /insertExtraPromptAt\(GLOBAL_SEMANTIC_PROMPT_ANCHORS\.semanticHeader\)/);
  assert.match(bridgeSource, /extraSegments:\s*globalPromptAuditSegments/);
  assert.match(bridgeSource, /injectionAudit\.globalPrompt = globalPromptAudit/);
  assert.match(bridgeSource, /block\?\.preRendered === true \? rawContent : processTextMacrosWithPendingFlag/);
  console.log('ok - chat bridge injects pre-rendered global blocks before transport planning and audits them separately');
}

{
  const summaryContext = buildSummaryCompactionContext({ sessionId: 'chat:summary' });
  assert.equal(summaryContext.task.type, 'summary_compaction');
  const excluded = resolveGlobalSemanticPromptPlan({
    blocks: [{
      id: 'chat-only',
      enabled: true,
      content: 'chat only',
      scope: 'chat',
      anchor: 'semantic_header',
    }],
  }, {
    scope: 'chat',
    taskType: summaryContext.task.type,
  });
  assert.equal(excluded.injected.length, 0);
  assert.equal(excluded.skipped[0]?.reason, 'request_scope_excluded');
  console.log('ok - summary compaction is explicitly excluded from global chat prompts');
}

{
  const callbacks = appSource.match(/getGlobalSemanticPromptLibrary:\s*\(\) => agentCenterSettingsStore\.getGlobalSemanticPromptLibrary\(\)/g) || [];
  assert.equal(callbacks.length, 1, 'only the root maid planner receives the global prompt library');
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf('const maidReActPlanner = createMaidModelBackedReActPlanner'),
      appSource.indexOf('const maidImportedCardClassifier = createMaidImportedCardClassifier'),
    ),
    /getGlobalSemanticPromptLibrary/,
  );
  console.log('ok - maid ReAct and internal subrequests do not receive global prompt blocks');
}
