import assert from 'node:assert/strict';

import {
  applyMomentCommentEvents,
  applyMomentSummaryFromRaw,
  buildMomentLifecycleTraceEvent,
  buildMomentCommentContactList,
  buildMomentCommentPromptData,
  buildMomentCommentTaskContext,
  buildMomentPrivateChatMessages,
  buildMomentRecentCommentsText,
  collectMomentCommentContactList,
  createMomentSummaryCompactionRuntime,
  extractMomentReplySegments,
  extractMomentSummaryText,
  patchMomentReplyComments,
  resolveMomentReplyEventTarget,
  resolveMomentReplyTarget,
  resolvePrivateChatTargetSessionIdByName,
  runMomentCommentGeneration,
  runMomentReplyRetry,
  sanitizeThinkingForMomentReply,
} from '../../src/scripts/ui/chat/moments-runtime-utils.js';

{
  const event = buildMomentLifecycleTraceEvent({
    phase: ' comment.start ',
    sessionId: ' contact:1 ',
    momentId: ' m1 ',
    status: ' started ',
    summary: ' started ',
    details: { kept: true, dropped: undefined },
  });
  assert.deepEqual(event, {
    category: 'moments',
    source: 'moments-runtime',
    phase: 'comment.start',
    sessionId: 'contact:1',
    momentId: 'm1',
    status: 'started',
    summary: 'started',
    details: { kept: true },
  });
  console.log('ok - buildMomentLifecycleTraceEvent normalizes lifecycle metadata and drops undefined details');
}

{
  const target = resolveMomentReplyTarget({
    isReplyToComment: true,
    replyTo: { author: '小王' },
    authorName: '发布者',
    originSessionId: 'session:1',
    resolvePrivateChatTargetSessionId: (name) => (name === '小王' ? 'contact:2' : ''),
  });
  assert.deepEqual(target, { name: '小王', sessionId: 'contact:2' });
  console.log('ok - resolveMomentReplyTarget prefers reply author session when replying to a comment');
}

{
  const text = buildMomentRecentCommentsText([
    { author: '甲', content: '你好\n世界', replyToAuthor: '乙' },
    { author: '丙', content: '' },
  ]);
  assert.equal(text, '- author::甲 | reply_to_author::乙 | content::你好<br>世界\n- author::丙');
  console.log('ok - buildMomentRecentCommentsText formats tail comments for prompt injection');
}

{
  const text = buildMomentCommentPromptData({
    authorName: '发布者',
    content: '动态内容',
    time: '10:00',
    userLine: '{{user}}：{{lastUserMessage}}',
    isReplyToComment: true,
    replyTo: { author: '甲', content: '原评论' },
    recentComments: '- author::甲 | content::hi',
    contactList: '- 发布者\n- 甲',
  });
  assert.match(text, /发布者: 发布者/);
  assert.match(text, /reply_to_author: 甲/);
  assert.match(text, /当前评论列表/);
  assert.match(text, /可用联系人名单/);
  console.log('ok - buildMomentCommentPromptData builds constrained moment comment prompt payload');
}

{
  const list = buildMomentCommentContactList(['甲', '乙', '甲', '', '我', 'user'], {
    authorName: '发布者',
    maxItems: 3,
  });
  assert.equal(list, '- 发布者\n- 甲\n- 乙');
  console.log('ok - buildMomentCommentContactList deduplicates and limits candidates');
}

{
  const list = collectMomentCommentContactList({
    listContacts: () => [
      { id: 'u1', name: '我' },
      { id: 'u2', name: '甲' },
      { id: 'u3', name: '乙', isGroup: true },
      { id: 'u4', name: '甲' },
      { id: 'u5', name: '用户' },
      { id: 'u6', name: '丙' },
    ],
  }, {
    authorName: '发布者',
    maxItems: 3,
  });
  assert.equal(list, '- 发布者\n- 甲\n- 丙');
  console.log('ok - collectMomentCommentContactList filters self/group contacts before building prompt list');
}

{
  const ctx = buildMomentCommentTaskContext({
    userProfile: {
      name: '我',
      description: '设定',
      position: 'p',
      depth: 2,
      role: 'r',
    },
    target: { name: '发布者', sessionId: 'contact:1' },
    authorName: '发布者',
    originSessionId: 'contact:1',
    promptData: 'PROMPT',
    isReplyToComment: true,
    replyTo: { id: 'c1', author: '甲' },
  });
  assert.equal(ctx.user.name, '我');
  assert.equal(ctx.task.type, 'moment_comment');
  assert.equal(ctx.task.replyToCommentId, 'c1');
  assert.equal(ctx.task.replyToAuthor, '甲');
  assert.equal(ctx.character.name, '发布者');
  console.log('ok - buildMomentCommentTaskContext builds task payload with optional reply metadata');
}

{
  const patched = patchMomentReplyComments(
    [
      { author: '甲', content: '回复' },
      { author: '乙', content: '旁观', replyTo: 'x' },
    ],
    {
      isReplyToComment: true,
      replyTo: { id: 'comment:1', author: '甲' },
      targetName: '发布者',
    },
  );
  assert.deepEqual(patched, [
    { author: '甲', content: '回复', replyTo: 'comment:1', replyToAuthor: '甲' },
    { author: '乙', content: '旁观', replyTo: 'x' },
  ]);
  console.log('ok - patchMomentReplyComments injects reply target only for primary replier');
}

{
  const warnings = [];
  const store = {
    get(id) {
      return id === 'm1' ? { id: 'm1' } : null;
    },
    list() {
      return [{ id: 'm1' }];
    },
  };
  const result = resolveMomentReplyEventTarget({
    eventMomentId: 'missing',
    currentMomentId: 'm1',
    momentsStore: store,
    logger: { warn: (...args) => warnings.push(args) },
    incomingCount: 2,
  });
  assert.equal(result.momentId, 'm1');
  assert.equal(result.targetMoment?.id, 'm1');
  assert.equal(warnings.length, 1);
  console.log('ok - resolveMomentReplyEventTarget falls back to current moment before warning hard failure');
}

{
  const contactsStore = {
    getContact(id) {
      if (id === 'contact:1') return { id: 'contact:1', name: '甲' };
      return null;
    },
    listContacts() {
      return [{ id: 'contact:1', name: '甲' }, { id: 'contact:2', name: '乙' }];
    },
  };
  assert.equal(
    resolvePrivateChatTargetSessionIdByName('甲', {
      contactsStore,
      normalizeName: (value) => String(value || '').trim(),
    }),
    'contact:1',
  );
  assert.equal(
    resolvePrivateChatTargetSessionIdByName('missing', {
      contactsStore,
      normalizeName: (value) => String(value || '').trim(),
      fallbackSessionId: 'fallback',
    }),
    'fallback',
  );
  console.log('ok - resolvePrivateChatTargetSessionIdByName resolves display names and supports fallback session ids');
}

{
  const messages = buildMomentPrivateChatMessages(
    [
      { speaker: '我', content: '你好', time: '10:00' },
      { speaker: '发布者', content: '回复', time: '10:01' },
    ],
    {
      getActiveUserName: () => '我',
      normalizeName: (value) => String(value || '').trim(),
      normalizeLooseName: (value) => String(value || '').trim(),
      parseSpecialMessage: (content) => ({ type: 'text', content, meta: {} }),
      userAvatar: 'user.png',
      assistantAvatar: 'assistant.png',
      formatNowTime: () => 'NOW',
    },
  );
  assert.deepEqual(messages, [
    {
      role: 'user',
      message: {
        role: 'user',
        type: 'text',
        content: '你好',
        meta: { generatedByAssistant: true },
        name: '我',
        avatar: 'user.png',
        time: '10:00',
      },
    },
    {
      role: 'assistant',
      message: {
        role: 'assistant',
        type: 'text',
        content: '回复',
        meta: {},
        name: '助手',
        avatar: 'assistant.png',
        time: '10:01',
      },
    },
  ]);
  console.log('ok - buildMomentPrivateChatMessages normalizes private chat payloads for chat store append');
}

{
  assert.equal(
    extractMomentSummaryText('<details><summary>摘要</summary> Hello <b>世界</b> ABC </details>'),
    '世界',
  );
  console.log('ok - extractMomentSummaryText strips html and latin text from summary block');
}

{
  assert.equal(
    sanitizeThinkingForMomentReply('<thinking>x</thinking>正文'),
    '正文',
  );
  assert.equal(
    extractMomentReplySegments('a moment_reply_start 1 moment_reply_end b moment_reply_start 2 moment_reply_end'),
    'moment_reply_start 1 moment_reply_end\nmoment_reply_start 2 moment_reply_end',
  );
  console.log('ok - moment reply retry helpers strip thinking and extract tagged segments');
}

{
  const calls = [];
  const updated = [];
  const summary = await applyMomentSummaryFromRaw('<details><summary>摘要</summary> 人物关系 </details>', {
    addSummary: async (value) => calls.push(['add', value]),
    runCompaction: async () => calls.push(['compact']),
    notifyUpdated: async () => updated.push('updated'),
  });
  assert.equal(summary, '人物关系');
  assert.deepEqual(calls, [
    ['add', '人物关系'],
    ['compact'],
  ]);
  assert.deepEqual(updated, ['updated']);
  console.log('ok - applyMomentSummaryFromRaw persists summary and triggers follow-up notifications');
}

{
  const parsed = [];
  const ok = await runMomentReplyRetry('<thinking>xx</thinking>a moment_reply_start hi moment_reply_end', {
    parseText: async (text) => {
      parsed.push(text);
      return text.includes('moment_reply_start');
    },
    logger: { debug: () => {} },
  });
  assert.equal(ok, true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0], 'a moment_reply_start hi moment_reply_end');
  console.log('ok - runMomentReplyRetry retries with stripped thinking before extracting tagged reply segments');
}

{
  const pushed = [];
  const saved = [];
  async function* streamSource() {
    yield { content: 'first' };
    yield { content: 'second' };
  }
  const result = await runMomentCommentGeneration('评论', { task: 1 }, {
    stream: true,
    generate: async () => streamSource(),
    createParser: () => ({
      push(text) {
        pushed.push(text);
        return [{ text }];
      },
    }),
    normalizeChunk: (chunk) => chunk,
    applyEvents: (events) => ({ touchedMoments: events.some((event) => event.text === 'second') }),
    saveRaw: async (raw) => saved.push(raw),
  });
  assert.equal(result.fullRaw, 'firstsecond');
  assert.equal(result.sawMomentReply, true);
  assert.deepEqual(pushed, ['first', 'second']);
  assert.deepEqual(saved, ['firstsecond']);
  console.log('ok - runMomentCommentGeneration streams chunks through parser and saves aggregated raw reply');
}

{
  const parsed = [];
  let retried = false;
  const result = await runMomentCommentGeneration('评论', { task: 1 }, {
    stream: false,
    generate: async () => 'RAW',
    createParser: () => ({
      push(text) {
        parsed.push(text);
        return [{ text }];
      },
    }),
    normalizeChunk: (chunk) => chunk,
    applyEvents: (events) => ({ touchedMoments: events.some((event) => event.text === 'RETRY') }),
    retryUnhandledReply: async (raw, parseText) => {
      retried = raw === 'RAW';
      return parseText('RETRY');
    },
  });
  assert.equal(result.fullRaw, 'RAW');
  assert.equal(result.sawMomentReply, true);
  assert.equal(retried, true);
  assert.deepEqual(parsed, ['RAW', 'RETRY']);
  console.log('ok - runMomentCommentGeneration retries with a fresh parser when initial parse misses moment replies');
}

{
  const events = [];
  const trace = [];
  const store = {
    summaries: [{ text: '旧1', at: 1 }, { text: '旧2', at: 2 }, { text: '新3', at: 3 }],
    raw: '',
    compacted: null,
    getSummaries() { return this.summaries; },
    setSummaries(next) { this.summaries = next; },
    getCompactedSummary() { return { text: '已有大总结' }; },
    setCompactedSummaryRaw(raw) { this.raw = raw; },
    setCompactedSummary(text, meta) { this.compacted = { text, meta }; },
  };
  const runtime = createMomentSummaryCompactionRuntime({
    momentSummaryStore: store,
    getIsConfigured: () => true,
    buildMessages: () => ['built'],
    backgroundChat: async () => '<summary>【关键事件】\n• 事件: 描述</summary>',
    getActiveUserProfile: () => ({ name: '我' }),
    buildContext: ({ sessionId, characterName }) => ({ sessionId, characterName }),
    requestCompactionRaw: async ({ items, compactedText, context }) => {
      events.push({ items, compactedText, context });
      return '<summary>【关键事件】\n• 事件: 描述</summary>';
    },
    parseCompactionResult: (raw) => ({ text: '【关键事件】\n• 事件: 描述', valid: raw.includes('<summary>') }),
    normalizeItems: (items) => items,
    shouldCompact: ({ items }) => items.length >= 3,
    dispatchUpdated: () => events.push({ updated: true }),
    recordTraceEvent: event => trace.push(event),
    setTimeoutFn: (fn) => { Promise.resolve().then(fn); return 1; },
    delayMs: 0,
  });
  const ok = await runtime();
  assert.equal(ok, true);
  assert.equal(store.raw.includes('<summary>'), true);
  assert.equal(store.compacted?.text, '【关键事件】\n• 事件: 描述');
  assert.deepEqual(store.summaries, [{ text: '旧2', at: 2 }, { text: '新3', at: 3 }]);
  assert.equal(events[0].compactedText, '已有大总结');
  assert.deepEqual(events[0].context, { sessionId: 'moment_summary_global', characterName: '动态' });
  assert.deepEqual(events[1], { updated: true });
  assert.deepEqual(
    trace.map(event => [event.phase, event.status, event.details.itemCount]),
    [
      ['summary.compaction.start', 'started', 3],
      ['summary.compaction.finish', 'success', 3],
    ],
  );
  console.log('ok - createMomentSummaryCompactionRuntime compacts summaries and keeps recent snapshots');
}

{
  const appended = [];
  const momentComments = [];
  let rendered = 0;
  let refreshed = 0;
  const result = applyMomentCommentEvents(
    [
      { type: 'moments', moments: [{ id: 'm2', views: 1, likes: 1 }] },
      { type: 'moment_reply', momentId: 'm1', comments: [{ author: '甲', content: '回复' }] },
      { type: 'private_chat', otherName: '小王', messages: [{ speaker: '小王', content: '私聊' }] },
    ],
    {
      currentMomentId: 'm1',
      originSessionId: 'contact:1',
      engagementCount: 5,
      momentsStore: {
        get(id) { return id === 'm1' ? { id: 'm1' } : null; },
        list() { return [{ id: 'm1' }]; },
      },
      normalizeInitialMomentStats: (stats) => ({ views: stats.views + 1, likes: stats.likes + 1 }),
      normalizeMomentRecord: (moment) => moment,
      normalizeMomentComments: (comments) => comments,
      addMoments: (list) => appended.push({ kind: 'moments', list }),
      addMomentComments: (momentId, comments) => {
        momentComments.push({ momentId, comments });
        return { id: momentId };
      },
      isReplyToComment: true,
      replyTo: { id: 'c1', author: '甲' },
      targetName: '发布者',
      resolvePrivateChatTargetSessionId: (name) => (name === '小王' ? 'contact:2' : ''),
      buildPrivateChatMessages: (messages) => messages.map(() => ({
        role: 'assistant',
        message: { role: 'assistant', type: 'text', content: '私聊' },
      })),
      appendPrivateChatMessage: (message, sid) => {
        appended.push({ kind: 'chat', sid, message });
        return { ...message, id: 'msg1' };
      },
      autoMarkReadIfActive: () => {},
      bumpMomentEngagement: () => {},
      onTouchedChats: () => { refreshed += 1; },
      onTouchedMoments: () => { rendered += 1; },
    },
  );
  assert.equal(result.touchedChats, true);
  assert.equal(result.touchedMoments, true);
  assert.equal(rendered, 1);
  assert.equal(refreshed, 1);
  assert.equal(appended[0].kind, 'moments');
  assert.equal(momentComments[0].momentId, 'm1');
  assert.equal(appended[1].sid, 'contact:2');
  console.log('ok - applyMomentCommentEvents dispatches moment, reply, and private chat mutations');
}
