import assert from 'node:assert/strict';

import {
  CHAT_FORMAT_EVENT_TYPES,
  buildChatFormatRepairCandidate,
  buildChatFormatGuardianModelPrompt,
  extractChatFormatEventDrafts,
  normalizeChatFormatGuardianModelReview,
  validateChatFormatEventDraft,
} from '../../src/scripts/ui/chat/chat-format-guardian-utils.js';

{
  const result = extractChatFormatEventDrafts([
    'MiPhone_start',
    'msg_start',
    '<我和菲伦的私聊>',
    '菲伦--今晚别一个人走。--22:10',
    '</我和菲伦的私聊>',
    'msg_end',
    'MiPhone_end',
  ].join('\n'), {
    userName: '我',
    sourceMessageId: 'assistant-1',
    resolvePrivateTargetId: name => (name === '菲伦' ? 'contact:firen' : ''),
    resolveSpeakerId: name => (name === '菲伦' ? 'contact:firen' : ''),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.eventDrafts.length, 1);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.privateMessage);
  assert.equal(result.eventDrafts[0].targetId, 'contact:firen');
  assert.equal(result.eventDrafts[0].speakerName, '菲伦');
  assert.equal(result.eventDrafts[0].content, '今晚别一个人走。');
  assert.equal(result.eventDrafts[0].sourceMessageId, 'assistant-1');
  console.log('ok - chat format guardian extracts private chat event drafts');
}

{
  const result = extractChatFormatEventDrafts([
    'MiPhone_start',
    '<我和菲伦的私聊>',
    '菲伦--今晚别一个人走。--22:12',
    '</我和菲伦的私聊>',
    'MiPhone_end',
  ].join('\n'), {
    userName: '我',
    enabledFormats: { phoneShell: true, privateChat: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.eventDrafts.length, 1);
  assert.match(result.warnings.join('\n'), /msg_start/);
  assert.match(result.warnings.join('\n'), /msg_end/);
  console.log('ok - chat format guardian reports missing phone shell markers');
}

{
  const result = extractChatFormatEventDrafts([
    '<群聊:调查组>',
    '<成员>我,菲伦,雪</成员>',
    '<聊天内容>',
    '系统消息: 菲伦加入了群聊',
    '雪--我看到了门口的鞋印。--22:11',
    '</聊天内容>',
    '</群聊:调查组>',
  ].join('\n'), {
    resolveGroupTargetId: name => (name === '调查组' ? 'group:case' : ''),
    resolveSpeakerId: name => (name === '雪' ? 'contact:snow' : ''),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.eventDrafts.length, 2);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.groupSystemEvent);
  assert.equal(result.eventDrafts[1].type, CHAT_FORMAT_EVENT_TYPES.groupMessage);
  assert.equal(result.eventDrafts[1].targetId, 'group:case');
  assert.equal(result.eventDrafts[1].speakerId, 'contact:snow');
  assert.equal(result.warnings.includes('time is missing'), true);
  const repair = buildChatFormatRepairCandidate(result, { fallbackTime: '22:12' });
  assert.equal(repair.available, true);
  assert.equal(repair.kind, 'fill_missing_time');
  assert.equal(repair.replacementText.includes('系统消息--菲伦加入了群聊--22:12'), true);
  assert.equal(repair.replacementText.includes('雪--我看到了门口的鞋印。--22:11'), true);
  console.log('ok - chat format guardian extracts group message and system event drafts');
}

{
  const result = extractChatFormatEventDrafts([
    'moment_reply_start',
    'moment_id:: moment-1',
    '菲伦--我会在楼下等你--reply_to:: comment-1--reply_to_author:: 雪',
    'moment_reply_end',
  ].join('\n'));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.eventDrafts.length, 1);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.momentComment);
  assert.equal(result.eventDrafts[0].surface, 'moments');
  assert.equal(result.eventDrafts[0].targetId, 'moment-1');
  assert.equal(result.eventDrafts[0].metadata.replyTo, 'comment-1');
  console.log('ok - chat format guardian extracts moment reply drafts');
}

{
  const result = extractChatFormatEventDrafts('普通正文，没有手机协议');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'no_events');
  assert.equal(result.eventDrafts.length, 0);
  assert.equal(result.summary, 'no chat format events detected');
  console.log('ok - chat format guardian reports no_events without writing');
}

{
  const validation = validateChatFormatEventDraft({
    type: 'private_message',
    surface: 'chat',
    content: '',
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.severity, 'error');
  assert.equal(validation.errors.includes('content is required'), true);
  assert.equal(validation.warnings.includes('target is unresolved'), true);
  console.log('ok - chat format guardian validates missing required draft fields');
}

{
  const prompt = buildChatFormatGuardianModelPrompt({
    assistantText: '<我和菲伦的私聊>\n菲伦--今晚别一个人走。\n</我和菲伦的私聊>',
    formatReminderText: '以下为格式输出顺序，请严格遵守\nMiPhone_start\nmsg_start\nmsg_end\nMiPhone_end',
    enabledFormats: {
      phoneShell: true,
      privateChat: true,
      groupChat: false,
      momentComment: true,
      tableEdit: true,
      imagePrompt: false,
    },
    parserReport: {
      status: 'needs_review',
      warnings: ['time is missing'],
      eventDrafts: [{
        type: CHAT_FORMAT_EVENT_TYPES.privateMessage,
        surface: 'chat',
        targetName: '菲伦',
        speakerName: '菲伦',
        content: '今晚别一个人走。',
        warnings: ['time is missing'],
      }],
    },
    userName: '我',
    sessionLabel: '菲伦私聊',
  });

  const system = prompt.messages[0].content;
  const user = prompt.messages[1].content;
  assert.equal(prompt.responseFormat, 'json_object');
  assert.deepEqual(prompt.enabledFormatIds, ['phoneShell', 'privateChat', 'momentComment', 'tableEdit']);
  assert.match(system, /格式修复 Agent/);
  assert.match(system, /不得改写正文语义/);
  assert.match(system, /禁止 Markdown 代码块/);
  assert.match(system, /JSON 字符串字段内部不要使用英文双引号/);
  assert.match(system, /correctedText 必须是完整的/);
  assert.match(system, /不要在 MiPhone_end 之后追加额外段落或标签/);
  assert.match(user, /# Task/);
  assert.match(user, /# Required Format Examples/);
  assert.match(user, /# Required Additional Format Rules/);
  assert.match(user, /# Current Invalid Model Output/);
  assert.match(user, /# Output Contract/);
  assert.match(user, /Do not wrap it in Markdown code fences/);
  assert.match(user, /MiPhone_start/);
  assert.match(user, /私聊格式/);
  assert.match(user, /动态评论格式/);
  assert.match(user, /记忆表格写入格式/);
  assert.doesNotMatch(user, /群聊格式/);
  assert.doesNotMatch(user, /图片提示词格式/);
  assert.match(user, /1: <我和菲伦的私聊>/);
  assert.match(user, /"linePatches"/);
  assert.match(user, /"originalLines"/);
  assert.match(user, /"correctedText"/);
  assert.match(user, /Do not place unescaped double quotes/);
  assert.match(user, /可直接替换 Current Invalid Model Output/);
  assert.match(user, /<\{\{user\}\}和联系人名的私聊>/);
  assert.match(prompt.messages[0].content, /<\{\{user\}\}和联系人名的私聊>/);
  assert.match(prompt.messages[0].content, /末尾截断/);
  assert.match(user, /time is missing/);
  console.log('ok - chat format guardian model prompt uses only enabled format requirements');
}

{
  const prompt = buildChatFormatGuardianModelPrompt({
    assistantText: '',
    enabledFormats: { phoneShell: true, privateChat: true },
    parserReport: {
      status: 'no_events',
      summary: 'empty assistant response',
      errors: [],
      warnings: [],
      eventDrafts: [],
    },
    userName: '我',
    sessionLabel: '菲伦私聊',
  });
  const user = prompt.messages[1].content;
  assert.match(user, /没有发现可提交的完整协议内容/);
  assert.match(user, /canRepair=false/);
  assert.match(user, /建议用户重新生成/);
  assert.match(user, /（空）/);
  console.log('ok - chat format guardian model prompt asks no-events review to suggest regeneration');
}

{
  const prompt = buildChatFormatGuardianModelPrompt({
    assistantText: [
      '菲伦--今晚别一个人走。',
      '菲伦--我送你到门口--22:13',
    ].join('\n'),
    enabledFormats: { phoneShell: true, privateChat: true },
    parserReport: {
      status: 'no_events',
      summary: 'no protocol tags',
      repairFallbackTime: '22:12',
      errors: [],
      warnings: [],
      eventDrafts: [],
    },
    userName: '阿兰',
    sessionLabel: '菲伦',
  });
  const system = prompt.messages[0].content;
  const user = prompt.messages[1].content;
  assert.match(system, /没有任何外层标签/);
  assert.match(system, /优先补齐标签而不是建议重新生成/);
  assert.match(user, /疑似聊天内容/);
  assert.match(user, /可修复的标签缺漏/);
  assert.match(user, /只补齐下方格式范例或格式规则明确要求的标签/);
  assert.match(user, /<阿兰和菲伦的私聊>/);
  assert.match(user, /MiPhone_start \/ msg_start/);
  assert.match(user, /repairFallbackTime（22:12）/);
  assert.match(user, /1: 菲伦--今晚别一个人走。/);
  console.log('ok - chat format guardian model prompt asks loose chat rows to be wrapped');
}

{
  const review = normalizeChatFormatGuardianModelReview([
    '```json',
    JSON.stringify({
      status: 'needs_repair',
      issues: [{ severity: 'warning', type: 'missing_field', message: 'time is missing', evidence: '菲伦--今晚' }],
      canRepair: true,
      repairSummary: '补齐时间字段',
      correctedText: '菲伦--今晚别一个人走。--22:12',
    }),
    '```',
  ].join('\n'));
  assert.equal(review.ok, true);
  assert.equal(review.status, 'needs_repair');
  assert.equal(review.canRepair, true);
  assert.equal(review.issues[0].message, 'time is missing');
  assert.match(review.correctedText, /22:12/);
  assert.match(review.rawText, /```json/);

  const invalid = normalizeChatFormatGuardianModelReview('不是 JSON');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.issues[0].type, 'parse_error');
  assert.equal(invalid.rawText, '不是 JSON');
  console.log('ok - chat format guardian normalizes model review json');
}

{
  const raw = [
    '```json',
    '{"status":"needs_repair","issues":[{"severity":"error","type":"parse_error","message":"聊天行格式错误，使用了"说话人: 正文"而非"说话人--正文--HH:mm"","evidence":"老板娘: 呵呵"}],"canRepair":true,"repairSummary":"补齐标签，将"说话人: 正文"转换为"说话人--正文--HH:mm"格式","linePatches":[],"correctedText":"MiPhone_start\\nmsg_start\\n<阿兰和老板娘的私聊>\\n老板娘--呵呵，小坏蛋。--20:01\\n老板娘--[img-穿着半透明睡裙，慵懒地靠在床头，手指拨弄着发梢]--20:01\\n老板娘--那姐姐的床可算给你留着，钥匙现在就给你，自己过来还是我去接你？--20:01\\n</阿兰和老板娘的私聊>\\nmsg_end\\nMiPhone_end"}',
    '```',
  ].join('\n');
  const review = normalizeChatFormatGuardianModelReview(raw);
  assert.equal(review.ok, true);
  assert.equal(review.status, 'needs_repair');
  assert.equal(review.canRepair, true);
  assert.equal(review.issues[0].type, 'parse_error');
  assert.match(review.issues[0].message, /抢救修复文本/);
  assert.match(review.rawText, /```json/);
  assert.equal(review.correctedText, [
    'MiPhone_start',
    'msg_start',
    '<阿兰和老板娘的私聊>',
    '老板娘--呵呵，小坏蛋。--20:01',
    '老板娘--[img-穿着半透明睡裙，慵懒地靠在床头，手指拨弄着发梢]--20:01',
    '老板娘--那姐姐的床可算给你留着，钥匙现在就给你，自己过来还是我去接你？--20:01',
    '</阿兰和老板娘的私聊>',
    'msg_end',
    'MiPhone_end',
  ].join('\n'));
  const repaired = extractChatFormatEventDrafts(review.correctedText, {
    userName: '阿兰',
    enabledFormats: { phoneShell: true, privateChat: true },
  });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.eventDrafts.length, 3);
  assert.equal(repaired.eventDrafts[0].speakerName, '老板娘');
  assert.equal(repaired.eventDrafts[1].content, '[img-穿着半透明睡裙，慵懒地靠在床头，手指拨弄着发梢]');
  assert.equal(repaired.eventDrafts[2].time, '20:01');
  console.log('ok - chat format guardian salvages correctedText from loose model json');
}

{
  const review = normalizeChatFormatGuardianModelReview(JSON.stringify({
    status: 'needs_repair',
    issues: [{ severity: 'warning', type: 'missing_field', message: 'time is missing' }],
    canRepair: true,
    repairSummary: '补齐时间字段',
    linePatches: [{
      startLine: 2,
      endLine: 2,
      originalLines: ['菲伦--今晚别一个人走。'],
      replacementLines: ['菲伦--今晚别一个人走。--22:12'],
      reason: '补齐时间',
    }],
  }), {
    originalText: [
      '<我和菲伦的私聊>',
      '菲伦--今晚别一个人走。',
      '</我和菲伦的私聊>',
    ].join('\n'),
  });
  assert.equal(review.canRepair, true);
  assert.equal(review.linePatches.length, 1);
  assert.equal(review.linePatches[0].startLine, 2);
  assert.deepEqual(review.linePatches[0].originalLines, ['菲伦--今晚别一个人走。']);
  assert.equal(review.linePatches[0].originalMatches, true);
  assert.equal(review.correctedText, '<我和菲伦的私聊>\n菲伦--今晚别一个人走。--22:12\n</我和菲伦的私聊>');
  console.log('ok - chat format guardian applies model line patches');
}

{
  const review = normalizeChatFormatGuardianModelReview(JSON.stringify({
    status: 'needs_repair',
    issues: [{ severity: 'warning', type: 'missing_field', message: 'time is missing' }],
    canRepair: true,
    repairSummary: '补齐时间字段',
    linePatches: [{
      startLine: 2,
      endLine: 2,
      originalLines: ['菲伦--今晚别一个人走错了。'],
      replacementLines: ['菲伦--今晚别一个人走。--22:12'],
      reason: '补齐时间',
    }],
  }), {
    originalText: [
      '<我和菲伦的私聊>',
      '菲伦--今晚别一个人走。',
      '</我和菲伦的私聊>',
    ].join('\n'),
  });
  assert.equal(review.canRepair, false);
  assert.equal(review.linePatches.length, 1);
  assert.equal(review.linePatches[0].originalMatches, false);
  assert.equal(review.correctedText, '');
  console.log('ok - chat format guardian refuses stale line patches when original lines mismatch');
}

{
  const review = normalizeChatFormatGuardianModelReview(JSON.stringify({
    status: 'needs_repair',
    issues: [{ severity: 'warning', type: 'missing_field', message: 'time is missing' }],
    canRepair: true,
    repairSummary: '补齐时间字段',
    correctedText: '',
    linePatches: [{
      startLine: 2,
      endLine: 2,
      replacementLines: ['菲伦--今晚别一个人走。--22:12', ''],
      reason: '补齐时间并保留空行',
    }],
  }), {
    originalText: [
      '<我和菲伦的私聊>',
      '菲伦--今晚别一个人走。',
      '</我和菲伦的私聊>',
    ].join('\n'),
  });
  assert.equal(review.canRepair, true);
  assert.equal(review.correctedText, '<我和菲伦的私聊>\n菲伦--今晚别一个人走。--22:12\n\n</我和菲伦的私聊>');
  console.log('ok - chat format guardian applies line patches when correctedText is empty');
}
