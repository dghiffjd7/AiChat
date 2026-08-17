import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  FORMAT_REPAIR_SOURCE_KINDS,
  appendMessageWithFormatRepairEnvelopeRegistration,
  buildFormatRepairTurnMeta,
  canCheckLatestFormatRepairTarget,
  resolveLatestFormatRepairTarget,
  tagMessageWithFormatRepairTurn,
  tagProtocolDeliveryItemsWithFormatRepairTurn,
} from '../../src/scripts/ui/chat/format-repair-target-utils.js';
import {
  createRejectedFormatRepairBannerRuntime,
  isRejectedProtocolRawEnvelope,
  resolveRejectedFormatRepairDispatcherAvailability,
} from '../../src/scripts/ui/chat/rejected-format-repair-banner-utils.js';

{
  const envelope = {
    sourceSessionId: 'source-room',
    turnId: 'turn-1',
  };
  assert.deepEqual(resolveRejectedFormatRepairDispatcherAvailability({
    dispatcher: null,
    envelope,
  }), {
    available: false,
    reason: 'protocol_dispatcher_unavailable',
    message: '应用通道已在重启后失效，请先在本聊天室完成一轮对话，或直接重新生成。',
  });
  assert.equal(resolveRejectedFormatRepairDispatcherAvailability({
    dispatcher: {
      sourceSessionId: 'source-room',
      getTurnId: () => 'turn-1',
      processEvent() {},
    },
    envelope,
  }).available, true);
  assert.equal(resolveRejectedFormatRepairDispatcherAvailability({
    dispatcher: {
      sourceSessionId: 'other-room',
      getTurnId: () => 'turn-1',
      processEvent() {},
    },
    envelope,
  }).reason, 'protocol_dispatcher_revision_mismatch');
  console.log('ok - rejected format repair detects missing and stale dispatchers before model work');
}

{
  assert.equal(isRejectedProtocolRawEnvelope({
    text: '<private_chat>',
    turnId: 'turn-rejected',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
    pendingRepair: true,
  }), true);
  assert.equal(isRejectedProtocolRawEnvelope({
    text: '<private_chat>',
    turnId: 'turn-committed',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: ['message-1'],
    pendingRepair: true,
  }), false);
  assert.equal(isRejectedProtocolRawEnvelope({
    text: 'creative raw',
    turnId: 'turn-creative',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.creativeRawOriginal,
    sourceMessageIds: [],
    pendingRepair: true,
  }), false);
  console.log('ok - rejected format banner only accepts uncommitted social raw envelopes');
}

{
  const envelope = {
    text: '<private_chat>broken</private_ch',
    at: 100,
    turnId: 'turn-banner',
    sourceSessionId: 'source-room',
    targetSessionIds: ['target-room'],
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
    pendingRepair: true,
  };
  const nodes = Object.fromEntries([
    'title',
    'status',
    'apply',
    'recheck',
  ].map(name => [name, {
    textContent: '',
    hidden: false,
    disabled: false,
  }]));
  const root = {
    hidden: true,
    dataset: {},
    querySelector: selector => ({
      '[data-format-repair-banner-title]': nodes.title,
      '[data-format-repair-banner-status]': nodes.status,
      '[data-format-repair-banner-action="apply"]': nodes.apply,
      '[data-format-repair-banner-action="recheck"]': nodes.recheck,
    })[selector] || null,
    addEventListener() {},
  };
  const applied = [];
  const runtime = createRejectedFormatRepairBannerRuntime({
    root,
    getEnvelope: sessionId => (sessionId === 'source-room' ? envelope : null),
    onApply: async state => {
      applied.push({ sessionId: state.sessionId, runId: state.runId });
      return { ok: true, applied: true };
    },
  });

  assert.equal(runtime.sync('source-room'), true);
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.status, 'needs_check');
  assert.equal(nodes.apply.disabled, true);
  runtime.markChecking({ sessionId: 'source-room' });
  assert.equal(root.dataset.status, 'checking');
  runtime.updateReview({
    sessionId: 'source-room',
    result: {
      status: 'invalid_format',
      errors: ['本地检查仍缺少闭合标签'],
      summary: '本地检查未通过',
    },
  });
  assert.equal(root.dataset.status, 'check_failed');
  assert.equal(nodes.recheck.disabled, false);
  assert.match(nodes.status.textContent, /本地检查仍缺少闭合标签/);
  runtime.markChecking({ sessionId: 'source-room' });
  runtime.updateReview({
    sessionId: 'source-room',
    runId: 'run-banner',
    result: {
      modelReview: {
        status: 'patch',
        canRepair: true,
        repairSummary: '补齐闭合标签',
        candidateText: '<private_chat>fixed</private_chat>',
        linePatches: [{
          startLine: 1,
          endLine: 1,
          originalLines: ['<private_chat>broken</private_ch'],
          replacementLines: ['<private_chat>fixed</private_chat>'],
        }],
      },
    },
  });
  assert.equal(root.dataset.status, 'candidate_ready');
  assert.equal(nodes.apply.disabled, false);
  assert.match(nodes.status.textContent, /补齐闭合标签/);
  assert.deepEqual(await runtime.applyByRunId('run-banner'), { ok: true, applied: true });
  assert.deepEqual(applied, [{ sessionId: 'source-room', runId: 'run-banner' }]);

  envelope.turnId = 'turn-newer';
  assert.equal(runtime.sync('source-room'), true);
  assert.equal(nodes.apply.disabled, true);
  assert.equal(await runtime.applyByRunId('run-banner'), null);
  runtime.clear('source-room');
  assert.equal(root.hidden, true);
  console.log('ok - rejected format banner tracks checking/candidate state and rejects drifted run actions');
}

{
  const envelope = {
    text: '<private_chat>broken</private_ch',
    at: 101,
    turnId: 'turn-restarted',
    sourceSessionId: 'source-room',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
    pendingRepair: true,
  };
  const nodes = Object.fromEntries(['title', 'status', 'apply', 'recheck'].map(name => [name, {
    textContent: '',
    disabled: false,
  }]));
  let clickHandler = null;
  let recheckCalls = 0;
  const root = {
    hidden: true,
    dataset: {},
    querySelector: selector => ({
      '[data-format-repair-banner-title]': nodes.title,
      '[data-format-repair-banner-status]': nodes.status,
      '[data-format-repair-banner-action="apply"]': nodes.apply,
      '[data-format-repair-banner-action="recheck"]': nodes.recheck,
    })[selector] || null,
    addEventListener(name, handler) {
      if (name === 'click') clickHandler = handler;
    },
  };
  const runtime = createRejectedFormatRepairBannerRuntime({
    root,
    getEnvelope: () => envelope,
    getRepairAvailability: state => resolveRejectedFormatRepairDispatcherAvailability({
      dispatcher: null,
      envelope: state.envelope,
    }),
    onRecheck: () => { recheckCalls += 1; },
  });
  runtime.sync('source-room');
  assert.equal(root.dataset.status, 'dispatcher_unavailable');
  assert.equal(nodes.apply.disabled, true);
  assert.equal(nodes.recheck.disabled, true);
  assert.match(nodes.status.textContent, /先在本聊天室完成一轮对话/);
  clickHandler({
    target: {
      closest: () => ({ dataset: { formatRepairBannerAction: 'recheck' } }),
    },
    preventDefault() {},
  });
  assert.equal(recheckCalls, 0, 'dispatcher 不可用时不得调用模型检查回调');
  console.log('ok - restarted rejected banner blocks repair work before spending a model call');
}

{
  const envelope = {
    text: '<private_chat>broken</private_ch',
    at: 102,
    turnId: 'turn-guardian-off',
    sourceSessionId: 'source-room',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
    pendingRepair: true,
  };
  const nodes = Object.fromEntries(['title', 'status', 'apply', 'recheck', 'settings'].map(name => [name, {
    textContent: '',
    disabled: false,
    hidden: false,
  }]));
  let clickHandler = null;
  let settingsCalls = 0;
  const root = {
    hidden: true,
    dataset: {},
    querySelector: selector => ({
      '[data-format-repair-banner-title]': nodes.title,
      '[data-format-repair-banner-status]': nodes.status,
      '[data-format-repair-banner-action="apply"]': nodes.apply,
      '[data-format-repair-banner-action="recheck"]': nodes.recheck,
      '[data-format-repair-banner-action="settings"]': nodes.settings,
    })[selector] || null,
    addEventListener(name, handler) {
      if (name === 'click') clickHandler = handler;
    },
  };
  const runtime = createRejectedFormatRepairBannerRuntime({
    root,
    getEnvelope: () => envelope,
    onOpenGuardianSettings: () => { settingsCalls += 1; },
  });
  runtime.sync('source-room');
  assert.equal(nodes.settings.hidden, true);
  runtime.markGuardianUnavailable({
    sessionId: 'source-room',
    reason: 'guardian_disabled',
    message: '格式修复 Agent 尚未开启。',
  });
  assert.equal(root.dataset.status, 'guardian_unavailable');
  assert.equal(nodes.settings.hidden, false);
  assert.match(nodes.status.textContent, /尚未开启/);
  clickHandler({
    target: { closest: () => ({ dataset: { formatRepairBannerAction: 'settings' } }) },
    preventDefault() {},
  });
  assert.equal(settingsCalls, 1);
  console.log('ok - unavailable format guardian exposes an Agent Center deep link');
}

{
  // 历史遗留信封、普通成功回复与重派成功后的原文都缺少 pendingRepair 标记，不能靠“没有消息 id”反推。
  assert.equal(isRejectedProtocolRawEnvelope({
    text: '<private_chat>历史成功回复</private_chat>',
    turnId: 'legacy-turn',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
  }), false, '未标记待修复的信封不得让成功的聊天室显示未通过横幅');
  assert.equal(isRejectedProtocolRawEnvelope({
    text: '<private_chat>broken</private_ch',
    turnId: 'turn-rejected',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceMessageIds: [],
    pendingRepair: true,
  }), true);
  console.log('ok - repair banner only accepts envelopes flagged pending at the rejecting turn');
}

const createBannerHarness = ({ envelope, ...handlers } = {}) => {
  const nodes = Object.fromEntries(['title', 'status', 'apply', 'recheck', 'settings'].map(name => [name, {
    textContent: '',
    disabled: false,
    hidden: false,
  }]));
  let clickHandler = null;
  const root = {
    hidden: true,
    dataset: {},
    querySelector: selector => ({
      '[data-format-repair-banner-title]': nodes.title,
      '[data-format-repair-banner-status]': nodes.status,
      '[data-format-repair-banner-action="apply"]': nodes.apply,
      '[data-format-repair-banner-action="recheck"]': nodes.recheck,
      '[data-format-repair-banner-action="settings"]': nodes.settings,
    })[selector] || null,
    addEventListener(name, handler) {
      if (name === 'click') clickHandler = handler;
    },
  };
  const runtime = createRejectedFormatRepairBannerRuntime({
    root,
    getEnvelope: sessionId => (sessionId === 'source-room' ? envelope : null),
    ...handlers,
  });
  const click = action => clickHandler?.({
    target: { closest: () => ({ dataset: { formatRepairBannerAction: action } }) },
    preventDefault() {},
  });
  return { nodes, root, runtime, click };
};

const readyCandidateResult = {
  modelReview: {
    status: 'patch',
    canRepair: true,
    repairSummary: '补齐闭合标签',
    candidateText: '<private_chat>fixed</private_chat>',
    linePatches: [{
      startLine: 1,
      endLine: 1,
      originalLines: ['<private_chat>broken</private_ch'],
      replacementLines: ['<private_chat>fixed</private_chat>'],
    }],
  },
};

const buildRejectedEnvelope = (at = 200) => ({
  text: '<private_chat>broken</private_ch',
  at,
  turnId: `turn-${at}`,
  sourceSessionId: 'source-room',
  sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  sourceMessageIds: [],
  pendingRepair: true,
});

{
  const envelope = buildRejectedEnvelope(105);
  let runtime = null;
  let recheckCalls = 0;
  const harness = createBannerHarness({
    envelope,
    onRecheck: async () => {
      recheckCalls += 1;
      runtime.updateReview({
        sessionId: 'source-room',
        runId: 'run-after-config',
        result: readyCandidateResult,
      });
    },
  });
  ({ runtime } = harness);
  runtime.sync('source-room');
  runtime.markGuardianUnavailable({
    sessionId: 'source-room',
    reason: 'guardian_model_unavailable',
    message: '格式修复 Agent 没有可用模型。',
  });
  assert.equal(harness.nodes.settings.hidden, false);
  harness.click('recheck');
  await new Promise(resolve => { setTimeout(resolve, 0); });
  assert.equal(recheckCalls, 1);
  assert.equal(harness.root.dataset.status, 'candidate_ready');
  assert.equal(harness.nodes.settings.hidden, true, '配置完成并重查成功后必须退出不可用状态');
  assert.equal(harness.nodes.apply.disabled, false);
  console.log('ok - guardian unavailable exits through a successful recheck after configuration');
}

{
  const envelope = buildRejectedEnvelope(106);
  let recheckCalls = 0;
  const { nodes, root, runtime, click } = createBannerHarness({
    envelope,
    getRepairAvailability: () => ({
      available: false,
      reason: 'protocol_dispatcher_unavailable',
      message: '应用通道不可用。',
    }),
    onRecheck: () => { recheckCalls += 1; },
  });
  runtime.sync('source-room');
  runtime.markGuardianUnavailable({
    sessionId: 'source-room',
    reason: 'guardian_disabled',
    message: '格式修复 Agent 尚未开启。',
  });
  assert.equal(root.dataset.status, 'guardian_unavailable');
  assert.equal(nodes.settings.hidden, false);
  assert.equal(nodes.recheck.disabled, true, '守卫和应用通道同时不可用时重查按钮必须真实禁用');
  click('recheck');
  assert.equal(recheckCalls, 0);
  console.log('ok - combined guardian and dispatcher unavailability exposes no dead recheck action');
}

{
  const envelope = buildRejectedEnvelope(201);
  const applied = [];
  const { root, runtime } = createBannerHarness({
    envelope,
    onApply: async () => {
      applied.push('apply');
      return { applied: true };
    },
  });
  runtime.sync('source-room');
  assert.equal(runtime.dismiss('source-room'), true);
  assert.equal(root.hidden, true, '关闭后横幅必须隐藏');
  // 关闭只影响 UI：异步复查结果仍要落到状态里，否则 Agent Center 兜底找不到候选。
  runtime.updateReview({ sessionId: 'source-room', runId: 'run-dismissed', result: readyCandidateResult });
  assert.equal(root.hidden, true, '复查结果不得让已关闭的横幅自行弹回');
  assert.deepEqual(await runtime.applyByRunId('run-dismissed'), { applied: true });
  assert.deepEqual(applied, ['apply'], 'Agent Center 应用必须在关闭横幅后仍然可用');
  assert.equal(root.hidden, false, '显式应用等于撤销关闭，用户要能看到进度');
  console.log('ok - dismissed rejected banner still records review results and honors Agent Center apply');
}

{
  const envelope = buildRejectedEnvelope(202);
  let inFlight = 0;
  let peak = 0;
  let release = null;
  const { runtime } = createBannerHarness({
    envelope,
    onApply: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => { release = resolve; });
      inFlight -= 1;
      return { applied: true };
    },
  });
  runtime.sync('source-room');
  runtime.updateReview({ sessionId: 'source-room', runId: 'run-concurrent', result: readyCandidateResult });
  assert.equal(runtime.hasRunCandidate('run-concurrent'), true);
  const first = runtime.applyByRunId('run-concurrent');
  const second = runtime.applyByRunId('run-concurrent');
  assert.equal(await second, null, '应用进行中不得再开一次补丁审阅');
  release?.();
  assert.deepEqual(await first, { applied: true });
  assert.equal(peak, 1, '同一候选任何时刻只能有一个应用流程');
  console.log('ok - rejected banner apply is single-flight across banner and Agent Center');
}

{
  const envelopes = new Map();
  const runtime = createRejectedFormatRepairBannerRuntime({
    getEnvelope: sessionId => envelopes.get(sessionId) || null,
  });
  for (let index = 0; index < 51; index += 1) {
    const sessionId = `room-${index}`;
    envelopes.set(sessionId, {
      ...buildRejectedEnvelope(300 + index),
      sourceSessionId: sessionId,
    });
    runtime.sync(sessionId);
    runtime.updateReview({ sessionId, runId: `run-${index}`, result: readyCandidateResult });
  }
  assert.equal(runtime.hasRunCandidate('run-0'), false, '超过上限后应淘汰最旧候选');
  assert.equal(runtime.hasRunCandidate('run-50'), true, '最新候选必须保留');
  console.log('ok - rejected banner caps tracked cross-session candidates');
}

{
  let envelope = buildRejectedEnvelope(400);
  const { root, runtime } = createBannerHarness({
    envelope,
    getEnvelope: sessionId => (sessionId === 'source-room' ? envelope : null),
  });
  runtime.sync('source-room');
  runtime.dismiss('source-room');
  for (let index = 1; index <= 55; index += 1) {
    envelope = buildRejectedEnvelope(400 + index);
    runtime.sync('source-room');
    runtime.dismiss('source-room');
  }
  envelope = buildRejectedEnvelope(400);
  runtime.sync('source-room');
  assert.equal(root.hidden, false, '同房间被替换的历史 dismissed key 必须释放');
  console.log('ok - rejected banner releases dismissed keys from replaced envelopes');
}

{
  const envelopes = new Map();
  let releaseApply = null;
  const runtime = createRejectedFormatRepairBannerRuntime({
    getEnvelope: sessionId => envelopes.get(sessionId) || null,
    onApply: async () => new Promise(resolve => { releaseApply = resolve; }),
  });
  envelopes.set('applying-room', {
    ...buildRejectedEnvelope(500),
    sourceSessionId: 'applying-room',
  });
  runtime.sync('applying-room');
  runtime.updateReview({ sessionId: 'applying-room', runId: 'run-applying', result: readyCandidateResult });
  const applying = runtime.applyByRunId('run-applying');
  for (let index = 0; index < 55; index += 1) {
    const sessionId = `overflow-room-${index}`;
    envelopes.set(sessionId, {
      ...buildRejectedEnvelope(501 + index),
      sourceSessionId: sessionId,
    });
    runtime.sync(sessionId);
    runtime.updateReview({ sessionId, runId: `run-overflow-${index}`, result: readyCandidateResult });
  }
  assert.equal(runtime.hasRunCandidate('run-applying'), true, '应用中的候选不得被容量淘汰');
  releaseApply?.({ applied: true });
  assert.deepEqual(await applying, { applied: true });
  console.log('ok - rejected banner eviction preserves an in-flight apply');
}

{
  const envelope = buildRejectedEnvelope(203);
  const { nodes, root, runtime, click } = createBannerHarness({
    envelope,
    onApply: async () => { throw new Error('补丁审阅打开失败'); },
    onRecheck: async () => { throw new Error('检查 Agent 崩溃'); },
  });
  runtime.sync('source-room');
  runtime.updateReview({ sessionId: 'source-room', runId: 'run-throw', result: readyCandidateResult });
  const applyResult = await runtime.applyByRunId('run-throw');
  assert.equal(applyResult?.applied, false);
  assert.equal(root.dataset.status, 'candidate_ready', 'onApply 抛错后状态不得永久停在 applying');
  assert.equal(nodes.apply.disabled, false, '异常后必须能重试应用');
  assert.match(nodes.status.textContent, /补丁审阅打开失败/);

  click('recheck');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(root.dataset.status, 'check_failed', 'onRecheck 抛错后状态不得永久停在 checking');
  assert.equal(nodes.recheck.disabled, false, '异常后必须能重新检查');
  assert.match(nodes.status.textContent, /检查 Agent 崩溃/);
  console.log('ok - rejected banner callback failures restore a retryable state instead of stranding');
}

{
  const envelope = buildRejectedEnvelope(204);
  const { root, runtime } = createBannerHarness({ envelope });
  runtime.sync('source-room');
  runtime.markChecking({ sessionId: 'source-room' });
  assert.equal(root.dataset.status, 'checking');
  // 模型返回 no_change 时不会发出可展示部件，settleChecking 是唯一的收口点。
  runtime.settleChecking({ sessionId: 'source-room', result: { status: 'ready', summary: '模型认为无需修改' } });
  assert.equal(root.dataset.status, 'check_failed', 'no_change 复查必须退出检查中状态');
  runtime.updateReview({ sessionId: 'source-room', runId: 'run-settled', result: readyCandidateResult });
  runtime.settleChecking({ sessionId: 'source-room', result: { status: 'ready' } });
  assert.equal(root.dataset.status, 'candidate_ready', 'settleChecking 不得覆盖已就绪的候选');
  console.log('ok - rejected banner settles a queued model review without clobbering a ready candidate');
}

{
  const turnMeta = buildFormatRepairTurnMeta({
    turnId: 'turn-2',
    sourceSessionId: 'source-session',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  });
  const first = tagMessageWithFormatRepairTurn({
    id: 'bubble-1',
    role: 'assistant',
    content: '第一颗气泡',
  }, turnMeta);
  const second = tagMessageWithFormatRepairTurn({
    id: 'bubble-2',
    role: 'assistant',
    content: '第二颗气泡',
  }, turnMeta);
  const envelope = {
    text: 'MiPhone_start\r\n完整整轮原文\r\nMiPhone_end',
    turnId: 'turn-2',
    sourceSessionId: 'source-session',
    sourceMessageIds: ['bubble-1', 'bubble-2'],
    truncated: false,
  };
  const target = await resolveLatestFormatRepairTarget({
    message: first,
    sessionId: 'contact-session',
    uiMode: 'chat',
    getMessages: () => [first, second],
    getLastRawResponseEnvelope: sid => (sid === 'source-session' ? envelope : null),
  });

  assert.equal(target.ok, true);
  assert.equal(target.sourceKind, FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw);
  assert.equal(target.sourceText, envelope.text);
  assert.deepEqual(target.sourceMessageIds, ['bubble-1', 'bubble-2']);
  assert.equal(target.sourceText.includes('第一颗气泡'), false);
  assert.equal(canCheckLatestFormatRepairTarget({
    message: second,
    sessionId: 'contact-session',
    uiMode: 'chat',
    getMessages: () => [first, second],
    getLastRawResponseEnvelope: () => envelope,
  }), true);
  console.log('ok - format repair target resolves every bubble in the latest social turn to full raw');
}

{
  const oldTurn = buildFormatRepairTurnMeta({
    turnId: 'turn-old',
    sourceSessionId: 'source-session',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  });
  const oldMessage = tagMessageWithFormatRepairTurn({
    id: 'old-bubble',
    role: 'assistant',
    content: '旧气泡',
  }, oldTurn);
  const result = await resolveLatestFormatRepairTarget({
    message: oldMessage,
    sessionId: 'contact-session',
    uiMode: 'chat',
    getMessages: () => [oldMessage],
    getLastRawResponseEnvelope: () => ({
      text: '最新整轮原文',
      turnId: 'turn-latest',
      sourceSessionId: 'source-session',
      sourceMessageIds: ['latest-bubble'],
      truncated: false,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_latest_turn');
  console.log('ok - format repair target rejects a historical social turn');
}

{
  const turnMeta = buildFormatRepairTurnMeta({
    turnId: 'turn-truncated',
    sourceSessionId: 'source-session',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  });
  const message = tagMessageWithFormatRepairTurn({
    id: 'bubble-truncated',
    role: 'assistant',
    content: '展示文本',
  }, turnMeta);
  const result = await resolveLatestFormatRepairTarget({
    message,
    sessionId: 'contact-session',
    uiMode: 'chat',
    getMessages: () => [message],
    getLastRawResponseEnvelope: () => ({
      text: '只剩尾部',
      turnId: 'turn-truncated',
      sourceSessionId: 'source-session',
      sourceMessageIds: ['bubble-truncated'],
      truncated: true,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'source_truncated');
  console.log('ok - format repair target refuses a truncated social raw response');
}

{
  const older = {
    id: 'creative-old',
    role: 'assistant',
    rawOriginal: '旧创意原文',
  };
  const latest = {
    id: 'creative-latest',
    role: 'assistant',
    rawOriginalRef: { sessionId: 'rp:test', messageId: 'creative-latest' },
  };
  const messages = [older, { id: 'user-2', role: 'user', content: '继续' }, latest];
  const loaded = [];
  const result = await resolveLatestFormatRepairTarget({
    message: latest,
    sessionId: 'rp:test',
    uiMode: 'rp',
    getMessages: () => messages,
    loadRawOriginal: async (message, sessionId) => {
      loaded.push([message.id, sessionId]);
      return '  完整创意原文\r\n保留末尾  ';
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceKind, FORMAT_REPAIR_SOURCE_KINDS.creativeRawOriginal);
  assert.equal(result.sourceText, '  完整创意原文\r\n保留末尾  ');
  assert.deepEqual(loaded, [['creative-latest', 'rp:test']]);
  assert.equal(canCheckLatestFormatRepairTarget({
    message: older,
    sessionId: 'rp:test',
    uiMode: 'rp',
    getMessages: () => messages,
  }), false);
  console.log('ok - format repair target lazy-loads only the latest creative rawOriginal');
}

{
  const latest = {
    id: 'creative-empty',
    role: 'assistant',
    content: '渲染后正文不能作为原文',
  };
  const result = await resolveLatestFormatRepairTarget({
    message: latest,
    sessionId: 'rp:test',
    uiMode: 'rp',
    getMessages: () => [latest],
    loadRawOriginal: async () => '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'source_unavailable');
  console.log('ok - format repair target never falls back to rendered creative content');
}

{
  const callback = () => {};
  const input = [{
    message: { id: 'queued-bubble', role: 'assistant', content: '排队回复' },
    delivery: { kind: 'private', targetSessionId: 'contact-session' },
    callback,
  }];
  const turnMeta = buildFormatRepairTurnMeta({
    turnId: 'turn-queued',
    sourceSessionId: 'source-session',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  });
  const tagged = tagProtocolDeliveryItemsWithFormatRepairTurn(input, turnMeta);

  assert.notEqual(tagged, input);
  assert.notEqual(tagged[0], input[0]);
  assert.equal(tagged[0].callback, callback);
  assert.equal(tagged[0].message.meta.formatRepairTurn.turnId, 'turn-queued');
  assert.equal(tagged[0].message.meta.formatRepairTurn.sourceSessionId, 'source-session');
  assert.equal(input[0].message.meta, undefined);
  console.log('ok - queued protocol messages retain format-repair turn metadata before persistence');
}

{
  const turnMeta = buildFormatRepairTurnMeta({
    turnId: 'turn-recovered',
    sourceSessionId: 'source-session',
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  });
  const message = tagMessageWithFormatRepairTurn({
    id: 'recovered-bubble',
    role: 'assistant',
    content: '恢复投递',
  }, turnMeta);
  const appended = [];
  const registered = [];
  const saved = appendMessageWithFormatRepairEnvelopeRegistration({
    message,
    targetSessionId: 'contact-session',
    appendMessage: (value, sessionId) => {
      appended.push([value.id, sessionId]);
      return value;
    },
    registerSourceMessage: value => {
      registered.push(value);
      return true;
    },
  });

  assert.equal(saved, message);
  assert.deepEqual(appended, [['recovered-bubble', 'contact-session']]);
  assert.deepEqual(registered, [{
    sourceSessionId: 'source-session',
    targetSessionId: 'contact-session',
    turnId: 'turn-recovered',
    messageId: 'recovered-bubble',
  }]);
  console.log('ok - recovered queued messages rebuild format-repair envelope membership');
}

{
  const message = {
    id: 'legacy-single',
    role: 'assistant',
    timestamp: 1_000,
    rawOriginal: '  完整旧回复\n保留空白  ',
    content: '显示后的旧回复',
  };
  const result = await resolveLatestFormatRepairTarget({
    message,
    sessionId: 'legacy-session',
    uiMode: 'chat',
    getMessages: () => [{ id: 'user-1', role: 'user' }, message],
    getLastRawResponseEnvelope: () => ({
      text: '  完整旧回复\n保留空白  ',
      at: 1_050,
      turnId: '',
      sourceSessionId: 'legacy-session',
      targetSessionIds: [],
      sourceMessageIds: [],
      truncated: false,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceText, message.rawOriginal);
  assert.equal(result.turnId, 'legacy:legacy-session:1050:legacy-single');
  assert.deepEqual(result.sourceMessageIds, ['legacy-single']);
  assert.deepEqual(result.targetSessionIds, ['legacy-session']);
  console.log('ok - exact single-message rawOriginal safely restores a legacy social turn');
}

{
  const first = {
    id: 'legacy-first',
    role: 'assistant',
    timestamp: 1_000,
    rawOriginal: '第一颗气泡',
  };
  const second = {
    id: 'legacy-second',
    role: 'assistant',
    timestamp: 1_001,
    rawOriginal: '第二颗气泡',
  };
  const result = await resolveLatestFormatRepairTarget({
    message: second,
    sessionId: 'legacy-session',
    uiMode: 'chat',
    getMessages: () => [first, second],
    getLastRawResponseEnvelope: () => ({
      text: 'wrapper\n第一颗气泡\n第二颗气泡\nwrapper-end',
      at: 1_050,
      turnId: '',
      sourceSessionId: 'legacy-session',
      targetSessionIds: [],
      sourceMessageIds: [],
      truncated: false,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'legacy_turn_ambiguous');
  console.log('ok - legacy multi-bubble raw is rejected when full turn membership is unknown');
}

{
  const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  const transactionStart = appSource.indexOf('const runTransactionalProtocolResponse');
  const transactionEnd = appSource.indexOf('const syncProtocolCheckpoints', transactionStart);
  const transactionSource = transactionStart >= 0 && transactionEnd > transactionStart
    ? appSource.slice(transactionStart, transactionEnd)
    : '';
  const backlogStart = appSource.indexOf('const flushProtocolDeliveryBacklog');
  const backlogEnd = appSource.indexOf('const pendingFloatRuntime', backlogStart);
  const backlogSource = backlogStart >= 0 && backlogEnd > backlogStart
    ? appSource.slice(backlogStart, backlogEnd)
    : '';

  assert.match(
    transactionSource,
    /runProtocolResponseTransaction\(\{/,
  );
  assert.match(
    transactionSource,
    /beginTransaction:\s*\(\)\s*=>\s*lastProtocolRetryDispatcher\?\.beginMessageCapture/,
  );
  assert.match(
    transactionSource,
    /formatRepairTurnSourceMessages\.push\(\{\s*messageId,\s*targetSessionId\s*\}\)/,
  );
  assert.match(
    transactionSource,
    /setFormatRepairLastRawResponse\(raw,\s*sessionId\)/,
  );
  assert.match(
    transactionSource,
    /runProtocolCommittedFunctionalEffects\(\{[\s\S]*capturedMessages:\s*protocolState\?\.capturedMessages/,
  );
  assert.match(
    transactionSource,
    /scheduleProtocolDeliveryQueue\(batch\.items,[\s\S]*alreadyPersisted:\s*true/,
  );
  assert.match(
    transactionSource,
    /if\s*\(animateDelivery\)\s*\{[\s\S]*scheduleProtocolDeliveryQueue\(batch\.items/,
  );
  assert.doesNotMatch(transactionSource, /generationOwnsProtocolDelivery/);
  assert.doesNotMatch(
    transactionSource,
    /animateDelivery\s*&&\s*batch\.items\.length/,
  );
  assert.doesNotMatch(transactionSource, /await queue\.promise/);
  assert.doesNotMatch(transactionSource, /await scheduleProtocolDeliveryQueue/);
  assert.match(appSource, /await fastForwardProtocolDeliveryQueues\(sessionId\)/);
  assert.match(appSource, /onGenerationStarted:\s*generationId\s*=>\s*generationAbortGuard\.bindGeneration\(generationId\)/);
  assert.match(
    appSource,
    /onAssistantDelivered:\s*\(\)\s*=>\s*\{[\s\S]*generationAbortGuard\.disarm\(\);[\s\S]*disarmAbort\?\.\(\)/,
  );
  assert.match(appSource, /completionOutcome\s*===\s*'assistant_delivered'[\s\S]*generationAbortGuard\.disarm\(\)/);
  const generationCreateIndex = appSource.indexOf('activeGeneration = createActiveGenerationRecord');
  const preGenerationAbortIndex = appSource.lastIndexOf('throwIfSendAborted();', generationCreateIndex);
  assert.ok(generationCreateIndex > 0, '发送链应创建 generation record');
  assert.ok(
    preGenerationAbortIndex > 0 && preGenerationAbortIndex < generationCreateIndex,
    'generation 创建前必须复验工具 abort signal，避免超时后迟发',
  );
  assert.match(
    appSource,
    /appendMessage:\s*typeof effects\.appendMessage === 'function'\s*\?\s*effects\.appendMessage\s*:\s*appendPersistedProtocolDeliveryMessage/,
  );
  assert.match(
    appSource,
    /const appendPersistedProtocolDeliveryMessage[\s\S]*appendMessageWithFormatRepairEnvelopeRegistration/,
  );
  assert.match(
    appSource,
    /collectMaidAssistantMessageRefs\(\{[\s\S]*trackedMessageRefs:\s*formatRepairTurnSourceMessages/,
  );
  assert.equal(
    (appSource.match(/appendPersistedProtocolDeliveryMessage/g) || []).length,
    3,
  );
  assert.doesNotMatch(
    backlogSource,
    /deferProtocolAfterReceiveEffects|deferProtocolUiMessages/,
  );
  console.log('ok - app protocol transactions register committed bubbles and persisted queues retain repair envelopes');
}

{
  const [indexSource, cssSource, appSource] = await Promise.all([
    readFile(new URL('../../src/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/assets/css/format-repair-banner.css', import.meta.url), 'utf8'),
    readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(indexSource, /id="rejected-format-repair-banner"/);
  assert.match(indexSource, /data-format-repair-banner-action="view"/);
  assert.match(indexSource, /data-format-repair-banner-action="apply"/);
  assert.match(indexSource, /data-format-repair-banner-action="recheck"/);
  assert.match(indexSource, /data-format-repair-banner-action="regenerate"/);
  assert.match(indexSource, /data-format-repair-banner-action="settings"/);
  assert.match(cssSource, /body\[data-theme-mode='dark'\] \.format-repair-banner/);
  assert.match(cssSource, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(cssSource, /backdrop-filter/);
  assert.match(appSource, /createRejectedFormatRepairBannerRuntime\(\{/);
  assert.match(appSource, /getRepairAvailability:[\s\S]*resolveRejectedFormatRepairDispatcherAvailability/);
  const localReviewBranch = appSource.slice(
    appSource.indexOf('if (!modelReviewQueued)'),
    appSource.indexOf('return {', appSource.indexOf('if (!modelReviewQueued)')),
  );
  assert.match(localReviewBranch, /rejectedFormatRepairBannerRuntime\?\.updateReview/, '仅本地检查完成也必须退出 checking 状态');
  assert.match(appSource, /protocol_dispatcher_revision_mismatch/);
  assert.match(appSource, /markGuardianUnavailable/);
  assert.match(appSource, /agentId:\s*AGENT_FEATURE_IDS\.replyCheck/);
  const guardianSettingsDeepLink = appSource.slice(
    appSource.indexOf('onOpenGuardianSettings: () =>'),
    appSource.indexOf('onRegenerate:', appSource.indexOf('onOpenGuardianSettings: () =>')),
  );
  assert.match(guardianSettingsDeepLink, /agentId:\s*AGENT_FEATURE_IDS\.replyCheck/);
  assert.match(guardianSettingsDeepLink, /configure:\s*true/);
  assert.match(guardianSettingsDeepLink, /aboveGuide:\s*maidOnboardingRuntime\?\.isActive\?\.\(\)\s*===\s*true/);
  assert.match(appSource, /applyAgentFormatRepairRun/);
  const manualGuardianOptionsBlock = appSource.slice(
    appSource.indexOf('const buildManualChatFormatGuardianOptions'),
    appSource.indexOf('// 格式修复进行中的会话'),
  );
  assert.match(manualGuardianOptionsBlock, /featureState\.modelMode \|\| 'none'/);
  assert.doesNotMatch(manualGuardianOptionsBlock, /follow_current/);
  const unavailableGuardBlock = appSource.slice(
    appSource.indexOf('const runChatFormatGuardianProtocolParseFailureRepair'),
    appSource.indexOf('let settleCompletion', appSource.indexOf('const runChatFormatGuardianProtocolParseFailureRepair')),
  );
  assert.match(
    unavailableGuardBlock,
    /modelMode === 'none'\s*\|\|/,
    '未选择格式修复模型时必须留在 guardian_unavailable，而不是落回通用检查失败',
  );
  assert.equal(
    (unavailableGuardBlock.match(/if \(manualTrigger\) window\.toastr\?\.warning\?\./g) || []).length,
    2,
    '用户手动重查守卫未启用或模型不可用时必须得到可见反馈',
  );
  // 待修复标记只能打在协议驳回现场，否则历史会话与成功回复都会误显示横幅。
  const rejectionBranch = appSource.slice(
    appSource.indexOf("if (protocolState?.handled !== true) {"),
    appSource.indexOf('runChatFormatGuardianProtocolParseFailureRepair(raw, {'),
  );
  assert.match(rejectionBranch, /chatStore\.markLastRawResponsePendingRepair\(\{/);
  assert.match(rejectionBranch, /turnId: formatRepairTurnId,/);
  assert.equal(
    (appSource.match(/markLastRawResponsePendingRepair\(\{/g) || []).length,
    1,
    '待修复标记只允许有协议驳回这一个写入点',
  );
  console.log('ok - rejected format repair banner is wired with themed, revision-safe actions');
}
