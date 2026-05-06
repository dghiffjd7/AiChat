import assert from 'node:assert/strict';

import {
  buildSummaryCompactionContext,
  buildSummaryCompactionPayload,
  buildSummaryCompactionPrompt,
  extractSummaryTagText,
  isValidCompactedSummaryText,
  normalizeSummarySnapshotItems,
  parseSummaryCompactionResult,
  requestSummaryCompactionRaw,
  shouldRunSummaryCompaction,
} from '../../src/scripts/ui/chat/summary-compaction-utils.js';

{
  const prompt = buildSummaryCompactionPrompt({
    payload: '- [time] foo',
    compactedText: 'old summary',
  });
  assert.match(prompt, /【已有大总结】/);
  assert.match(prompt, /old summary/);
  assert.match(prompt, /【前文内容（按时间标注的摘要列表）】/);
  assert.match(prompt, /- \[time\] foo/);
  console.log('ok - buildSummaryCompactionPrompt includes prior compacted summary and payload');
}

{
  const payload = buildSummaryCompactionPayload([
    { text: '第一条', at: 1 },
    '第二条',
    { text: '   ' },
  ]);
  assert.match(payload, /- \[.*\] 第一条/);
  assert.match(payload, /- 第二条/);
  console.log('ok - buildSummaryCompactionPayload formats timeline items and skips empties');
}

{
  const ctx = buildSummaryCompactionContext({
    activeUser: {
      name: '我',
      description: 'desc',
      position: 'pos',
      depth: 2,
      role: 'role',
    },
    sessionId: 'group:1',
    characterName: '群聊A',
    isGroup: true,
    groupMembers: ['u1', 'u2'],
    groupMemberNames: ['甲', '乙'],
  });
  assert.deepEqual(ctx.session, { id: 'group:1', isGroup: true });
  assert.deepEqual(ctx.group, {
    id: 'group:1',
    name: '群聊A',
    members: ['u1', 'u2'],
    memberNames: ['甲', '乙'],
  });
  assert.equal(ctx.user.name, '我');
  assert.equal(ctx.meta.overrideLastUserMessage, '开始总结，勿输出聊天格式');
  console.log('ok - buildSummaryCompactionContext builds chat and group prompt context');
}

{
  const items = normalizeSummarySnapshotItems([
    ' 第一条 ',
    { text: '第二条', at: 42 },
    { text: '   ' },
    null,
  ]);
  assert.deepEqual(items, [
    { at: 0, text: '第一条' },
    { at: 42, text: '第二条' },
  ]);
  console.log('ok - normalizeSummarySnapshotItems trims empty entries and keeps timestamps');
}

{
  assert.equal(shouldRunSummaryCompaction({ items: [], force: false }), false);
  assert.equal(shouldRunSummaryCompaction({ items: ['x'.repeat(1000)], force: false }), false);
  assert.equal(shouldRunSummaryCompaction({ items: ['x'.repeat(1001)], force: false }), true);
  assert.equal(shouldRunSummaryCompaction({ items: [''], force: true }), true);
  console.log('ok - shouldRunSummaryCompaction respects threshold and force override');
}

{
  let builtArgs = null;
  let backgroundArgs = null;
  const raw = await requestSummaryCompactionRaw({
    items: [{ text: '摘要', at: 1 }],
    compactedText: '旧总结',
    context: { session: { id: 's1' } },
    buildMessages: (prompt, context) => {
      builtArgs = { prompt, context };
      return [{ role: 'user', content: prompt }];
    },
    backgroundChat: async (messages, options) => {
      backgroundArgs = { messages, options };
      return '  <summary>【关键事件】\n• 一: 二</summary>  ';
    },
  });
  assert.match(builtArgs?.prompt || '', /旧总结/);
  assert.deepEqual(builtArgs?.context, { session: { id: 's1' } });
  assert.equal(Array.isArray(backgroundArgs?.messages), true);
  assert.deepEqual(backgroundArgs?.options, { temperature: 0.2, maxTokens: 800 });
  assert.equal(raw, '<summary>【关键事件】\n• 一: 二</summary>');
  console.log('ok - requestSummaryCompactionRaw builds prompt, messages, and trims response');
}

{
  const text = extractSummaryTagText('<summary>a</summary>\n<summary>b</summary>');
  assert.equal(text, 'b');
  console.log('ok - extractSummaryTagText prefers the last summary block');
}

{
  assert.equal(isValidCompactedSummaryText('【关键事件】\n• 事件1: 内容'), true);
  assert.equal(isValidCompactedSummaryText('普通文本'), false);
  console.log('ok - isValidCompactedSummaryText validates required summary structure');
}

{
  assert.deepEqual(parseSummaryCompactionResult(''), { raw: '', text: '', valid: false });
  assert.deepEqual(parseSummaryCompactionResult('<summary>普通文本</summary>'), {
    raw: '<summary>普通文本</summary>',
    text: '普通文本',
    valid: false,
  });
  assert.deepEqual(parseSummaryCompactionResult('<summary>【关键事件】\n• 事件1: 内容</summary>'), {
    raw: '<summary>【关键事件】\n• 事件1: 内容</summary>',
    text: '【关键事件】\n• 事件1: 内容',
    valid: true,
  });
  console.log('ok - parseSummaryCompactionResult normalizes raw output and validity');
}
