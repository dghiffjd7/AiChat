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
  const queueWrapperStart = appSource.indexOf('const enqueueFormatRepairProtocolMessages');
  const queueWrapperEnd = appSource.indexOf('let sendTraceStarted', queueWrapperStart);
  const queueWrapperSource = queueWrapperStart >= 0 && queueWrapperEnd > queueWrapperStart
    ? appSource.slice(queueWrapperStart, queueWrapperEnd)
    : '';

  assert.match(
    queueWrapperSource,
    /tagProtocolDeliveryItemsWithFormatRepairTurn\(\s*queueItems,\s*getFormatRepairTurnMeta\(\)\s*\)/,
  );
  assert.match(
    queueWrapperSource,
    /appendMessage:\s*\(message,\s*targetSessionId\)\s*=>\s*appendFormatRepairTurnMessage\(/,
  );
  assert.equal(
    (appSource.match(/enqueueMessages:\s*enqueueFormatRepairProtocolMessages/g) || []).length,
    2,
  );
  assert.match(
    appSource,
    /appendMessage:\s*typeof effects\.appendMessage === 'function'\s*\?\s*effects\.appendMessage\s*:\s*appendPersistedProtocolDeliveryMessage/,
  );
  assert.match(
    appSource,
    /const appendPersistedProtocolDeliveryMessage[\s\S]*appendMessageWithFormatRepairEnvelopeRegistration/,
  );
  assert.equal(
    (appSource.match(/appendPersistedProtocolDeliveryMessage/g) || []).length,
    3,
  );
  console.log('ok - app protocol queues persist and append through the format-repair turn wrapper');
}
