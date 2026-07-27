import assert from 'node:assert/strict';

import {
  FORMAT_REPAIR_SOURCE_KINDS,
  buildFormatRepairTurnMeta,
  canCheckLatestFormatRepairTarget,
  resolveLatestFormatRepairTarget,
  tagMessageWithFormatRepairTurn,
} from '../../src/scripts/ui/chat/format-repair-target-utils.js';

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
