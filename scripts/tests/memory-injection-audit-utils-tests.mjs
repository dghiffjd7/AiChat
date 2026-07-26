import assert from 'node:assert/strict';
import {
  buildMemoryPlanAudit,
  buildRequestInjectionAudit,
  formatInjectionAuditText,
} from '../../src/scripts/memory/memory-injection-audit-utils.js';
import {
  renderMemoryInjectionAuditHtml,
} from '../../src/scripts/ui/chat/memory-injection-audit-view-utils.js';

const memoryAudit = buildMemoryPlanAudit({
  localTableText: '【任务】\n- 继续调查',
  localRowCount: 1,
  localTrimmedCount: 2,
  crossScopeSegments: [{
    id: 'memory_group_private',
    label: '群聊成员私聊',
    text: '【成员：甲】\n- 已建立信任',
    rowCount: 1,
  }],
  dataPromptText: '<memories>\n【任务】\n- 继续调查\n【成员：甲】\n- 已建立信任\n</memories>',
  guidePromptText: '<memory_edit_rules>只输出 tableEdit</memory_edit_rules>',
});

assert.equal(memoryAudit.version, 1);
assert.ok(memoryAudit.segments.some(item => item.id === 'memory_local' && item.rowCount === 1));
assert.ok(memoryAudit.segments.some(item => item.id === 'memory_group_private' && item.rowCount === 1));
assert.ok(memoryAudit.segments.some(item => item.id === 'memory_guide'));
assert.ok(memoryAudit.usedTokens > 0);
assert.ok(buildMemoryPlanAudit({ guidePromptText: '纯中文指引' }).usedTokens > 0);

const requestAudit = buildRequestInjectionAudit({
  memoryPlan: { audit: memoryAudit },
  history: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么事？' },
  ],
  worldDebug: {
    budgetTokens: 100,
    usedTokens: 20,
    mergedEntries: [{ entryId: 'a' }],
    trimmedEntries: [{ entryId: 'b' }],
    overflowed: true,
  },
  messages: [
    { role: 'system', content: '系统提示词' },
    { role: 'system', content: '<memories>记忆</memories>' },
    { role: 'user', content: [{ type: 'text', text: '你好' }, { type: 'image_url', image_url: { url: 'x' } }] },
  ],
  budget: {
    inputBudgetTokens: 1000,
    outputReserveTokens: 200,
    safetyReserveTokens: 64,
    fixedReserveTokens: 120,
    allocations: { recent: 400 },
  },
});
requestAudit.coverageLine = {
  coverageRate: 0.75,
  holes: [{ from: 4, to: 5 }],
  protectedMessageCount: 2,
};

assert.equal(requestAudit.inputBudgetTokens, 1000);
assert.ok(requestAudit.segments.some(item => (
  item.id === 'history' && item.messageCount === 2 && item.quotaTokens === 400
)));
assert.ok(requestAudit.segments.some(item => item.id === 'world' && item.trimmedCount === 1));
assert.ok(requestAudit.totalEstimateTokens > 0);
assert.match(formatInjectionAuditText(requestAudit), /本次注入构成|注入总量/);
assert.match(formatInjectionAuditText(requestAudit), /空洞 4-5/);

const html = renderMemoryInjectionAuditHtml(requestAudit);
assert.match(html, /本次注入构成/);
assert.match(html, /群聊成员私聊/);
assert.match(html, /已强制保留 2 条原文消息/);
assert.doesNotMatch(html, /<script>/);

console.log('ok - memory injection audit aggregates memory history world and fixed prompt segments');

// 护栏 3 的具体报警：state 超配额 = 该表没做覆盖式更新，必须在审计里点名
const overQuotaAudit = buildRequestInjectionAudit({
  memoryPlan: null,
  history: [{ role: 'user', content: '正文' }],
  messages: [{ role: 'user', content: '正文' }],
  budget: {
    inputBudgetTokens: 1000,
    allocations: { recent: 400 },
    overQuotaSegments: ['state'],
  },
});
assert.deepEqual(overQuotaAudit.overQuotaSegments, ['state']);
assert.match(formatInjectionAuditText(overQuotaAudit), /常驻状态超出配额.*覆盖式/);
assert.match(renderMemoryInjectionAuditHtml(overQuotaAudit), /常驻状态超出配额/);

const noOverQuotaAudit = buildRequestInjectionAudit({
  history: [],
  messages: [{ role: 'user', content: '正文' }],
  budget: { inputBudgetTokens: 1000 },
});
assert.deepEqual(noOverQuotaAudit.overQuotaSegments, []);
assert.doesNotMatch(formatInjectionAuditText(noOverQuotaAudit), /超出配额/);

console.log('ok - state over-quota guardrail warning is surfaced in audit text and html');
