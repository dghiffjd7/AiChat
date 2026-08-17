import assert from 'node:assert/strict';

import {
  GLOBAL_SEMANTIC_PROMPT_ANCHORS,
  GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT,
  GLOBAL_SEMANTIC_PROMPT_LIBRARY_KIND,
  GLOBAL_SEMANTIC_PROMPT_PROTOCOL_PATTERN,
  GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT,
  buildGlobalSemanticPromptInjectionAudit,
  buildGlobalSemanticPromptExtraBlocks,
  detectGlobalSemanticPromptGuard,
  exportGlobalSemanticPromptLibrary,
  importGlobalSemanticPromptLibrary,
  normalizeGlobalSemanticPromptLibrary,
  resolveGlobalSemanticPromptPlan,
  upsertGlobalSemanticPromptBlock,
} from '../../src/scripts/agent/global-semantic-prompt-library.js';
import { TEXT_PROTOCOL_PATTERN } from '../../src/scripts/utils/text-protocol-marker-utils.js';

const makeBlock = (id, patch = {}) => ({
  id,
  name: id,
  enabled: true,
  content: 'Keep character motivations consistent.',
  scope: 'chat',
  anchor: 'semantic_header',
  ...patch,
});

{
  const plan = resolveGlobalSemanticPromptPlan({
    blocks: [
      makeBlock('header'),
      makeBlock('character', { anchor: 'after_character' }),
      makeBlock('history', { anchor: 'before_history' }),
      makeBlock('latest', { anchor: 'before_latest_user' }),
    ],
  });
  const blocks = buildGlobalSemanticPromptExtraBlocks(plan);
  assert.deepEqual(blocks.map(block => block.position), [
    'semantic_header',
    'after_persona',
    'history_before',
    'before_latest_user',
  ]);
  assert.ok(blocks.every(block => block.role === 'system'));
  assert.ok(blocks.every(block => block.preRendered === true));
  console.log('ok - global chat blocks map only to bounded semantic anchors');
}

{
  const normalized = normalizeGlobalSemanticPromptLibrary({
    schemaVersion: 999,
    blocks: [makeBlock('a', { role: 'assistant', order: 8 })],
  });
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.blocks[0].role, 'system');
  assert.equal(normalized.blocks[0].order, 0);
}

{
  assert.strictEqual(
    GLOBAL_SEMANTIC_PROMPT_PROTOCOL_PATTERN,
    TEXT_PROTOCOL_PATTERN,
    'global prompt and structured chat must share one protocol marker pattern',
  );
  assert.equal(detectGlobalSemanticPromptGuard('角色喜欢 JSON 数据').blocked, false);
  assert.equal(detectGlobalSemanticPromptGuard('MiPhone_start\nmsg_start').blocked, true);
  assert.equal(detectGlobalSemanticPromptGuard('必须按照 JSON 格式输出回复').blocked, true);

  const mutation = upsertGlobalSemanticPromptBlock({}, makeBlock('format', {
    content: '必须按照 XML 格式输出回复',
  }), { now: () => 10 });
  assert.equal(mutation.forcedDisabled, true);
  assert.equal(mutation.block.enabled, false);
  assert.equal(mutation.validation.code, 'format_protocol_instruction');
  assert.equal(mutation.library.blocks[0].content, '必须按照 XML 格式输出回复');
}

{
  const oversized = '内容 '.repeat(GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT * 3);
  const mutation = upsertGlobalSemanticPromptBlock({}, makeBlock('oversized', {
    content: oversized,
  }));
  assert.equal(mutation.forcedDisabled, true);
  assert.equal(mutation.block.enabled, false);
  assert.equal(mutation.validation.code, 'block_budget_exceeded');
  assert.equal(mutation.library.blocks[0].content, oversized);
}

{
  let library = normalizeGlobalSemanticPromptLibrary();
  for (let index = 0; index < 4; index += 1) {
    const mutation = upsertGlobalSemanticPromptBlock(library, makeBlock(`budget-${index}`, {
      content: 'a'.repeat(6400),
    }));
    library = mutation.library;
    if (index < 3) assert.equal(mutation.block.enabled, true);
    else {
      assert.equal(mutation.block.enabled, false);
      assert.equal(mutation.validation.code, 'scope_budget_exceeded');
    }
  }
  const total = library.blocks.filter(block => block.enabled).reduce(
    (sum, block) => sum + Math.ceil(block.content.length / 4),
    0,
  );
  assert.ok(total <= GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT);
}

{
  let macroCalls = 0;
  const library = normalizeGlobalSemanticPromptLibrary({
    blocks: [
      makeBlock('header', { content: '{{user}}/{{char}}/{{isodate}}' }),
      makeBlock('history', { anchor: 'before_history', content: 'history semantic' }),
      makeBlock('maid', { scope: 'maid', content: 'maid only' }),
    ],
  });
  const plan = resolveGlobalSemanticPromptPlan(library, {
    scope: 'chat',
    user: 'Alice',
    char: 'Mia',
    now: new Date('2026-08-16T03:04:05'),
    renderMacros: (content, context) => {
      macroCalls += 1;
      return content
        .replace('{{user}}', context.user)
        .replace('{{char}}', context.char)
        .replace('{{isodate}}', '2026-08-16');
    },
  });
  assert.equal(plan.injected.length, 2);
  assert.equal(plan.macroExecutionCount, 2);
  assert.equal(macroCalls, 2);
  assert.equal(plan.byAnchor.semantic_header[0].content, 'Alice/Mia/2026-08-16');
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.injected[0]), true);
}

{
  const library = normalizeGlobalSemanticPromptLibrary({
    blocks: [makeBlock('macro-protocol', { content: 'Remember {{user}}' })],
  });
  const plan = resolveGlobalSemanticPromptPlan(library, {
    scope: 'chat',
    user: 'MiPhone_start',
    renderMacros: (content, context) => content.replace('{{user}}', context.user),
  });
  assert.equal(plan.macroExecutionCount, 1);
  assert.equal(plan.injected.length, 0);
  assert.equal(plan.skipped[0]?.reason, 'format_protocol_instruction');
  assert.equal(plan.skipped[0]?.estimatedTokens > 0, true);
  console.log('ok - macro-rendered protocol markers are guarded before global block injection');
}

{
  const library = normalizeGlobalSemanticPromptLibrary({
    blocks: [
      makeBlock('header'),
      makeBlock('after', { anchor: GLOBAL_SEMANTIC_PROMPT_ANCHORS.afterCharacter }),
      makeBlock('unsafe', { content: '<tableEdit>do it</tableEdit>' }),
    ],
  });
  const plan = resolveGlobalSemanticPromptPlan(library, {
    scope: 'chat',
    hasCustomChatPreset: true,
  });
  assert.deepEqual(plan.injected.map(block => block.id), ['header']);
  assert.equal(plan.skipped.find(block => block.id === 'after')?.reason, 'custom_chat_preset_anchor_skipped');
  assert.equal(plan.skipped.find(block => block.id === 'unsafe')?.reason, 'format_protocol_instruction');
}

{
  const library = normalizeGlobalSemanticPromptLibrary({
    blocks: [makeBlock('chat'), makeBlock('maid', { scope: 'maid' })],
  });
  assert.equal(resolveGlobalSemanticPromptPlan(library, { scope: 'chat', uiMode: 'rp' }).injected.length, 0);
  assert.equal(resolveGlobalSemanticPromptPlan(library, { scope: 'chat', taskType: 'summary' }).injected.length, 0);
  assert.deepEqual(
    resolveGlobalSemanticPromptPlan(library, { scope: 'maid', rootPlanner: true }).injected.map(block => block.id),
    ['maid'],
  );
  assert.equal(resolveGlobalSemanticPromptPlan(library, { scope: 'maid', rootPlanner: false }).injected.length, 0);
}

{
  const source = normalizeGlobalSemanticPromptLibrary({ blocks: [makeBlock('a')] });
  const exported = exportGlobalSemanticPromptLibrary(source, { now: () => Date.UTC(2026, 7, 16) });
  assert.equal(exported.kind, GLOBAL_SEMANTIC_PROMPT_LIBRARY_KIND);
  const imported = importGlobalSemanticPromptLibrary(exported, { now: () => 20 });
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.library.blocks.map(block => block.id), ['a']);
  assert.equal(importGlobalSemanticPromptLibrary({ ...exported, schemaVersion: 2 }).ok, false);
}

{
  const plan = resolveGlobalSemanticPromptPlan({ blocks: [makeBlock('audit')] });
  const audit = buildGlobalSemanticPromptInjectionAudit(plan);
  assert.equal(audit.segmentId, 'global_prompt_library');
  assert.equal(audit.messageCount, 1);
  assert.equal(audit.injected[0].name, 'audit');
}

console.log('global semantic prompt library tests passed');
