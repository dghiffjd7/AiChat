import assert from 'node:assert/strict';
import {
  analyzeChatBodyQuality,
  CHAT_BODY_QUALITY_STATUSES,
  resolveChatBodyQualityInputText,
} from '../../src/scripts/ui/chat/chat-body-quality-guardian-utils.js';

{
  const input = resolveChatBodyQualityInputText({
    rawOriginal: ' 原始回复 ',
    rawSource: 'raw source',
    content: '清理后正文',
  });
  assert.equal(input.text, '原始回复');
  assert.equal(input.source, 'rawOriginal');
  assert.equal(input.displayText, '清理后正文');
  assert.equal(input.hasRawOriginal, true);
  console.log('ok - chat body quality input prefers rawOriginal before cleaned content');
}

{
  const result = analyzeChatBodyQuality({
    rawAssistantText: [
      '她看了看门口。',
      '她看了看门口。',
      '',
      '',
      '',
      '',
      '她压低声音说话。',
    ].join('\n'),
  });
  assert.equal(result.status, CHAT_BODY_QUALITY_STATUSES.minorIssues);
  assert.equal(result.ok, true);
  assert.equal(result.issues.some(issue => issue.id === 'consecutive_duplicate_lines'), true);
  assert.equal(result.issues.some(issue => issue.id === 'excess_blank_lines'), true);
  assert.equal(result.patchCandidate.available, true);
  assert.equal(result.patchCandidate.replacementText.includes('她看了看门口。\n她看了看门口。'), false);
  assert.equal(result.patchCandidate.operations.length, 2);
  assert.equal(result.recommendedActions[0].id, 'preview_patch');
  console.log('ok - chat body quality detects deterministic low-risk cleanup candidates');
}

{
  const result = analyzeChatBodyQuality({
    rawAssistantText: '作为AI语言模型，我不能继续这个角色扮演。\n希望你喜欢。',
  });
  assert.equal(result.status, CHAT_BODY_QUALITY_STATUSES.needsReview);
  assert.equal(result.ok, false);
  assert.equal(result.patchCandidate, null);
  assert.equal(result.issues.some(issue => issue.id === 'ai_disclaimer'), true);
  assert.equal(result.issues.some(issue => issue.id === 'reader_closing'), true);
  assert.equal(result.recommendedActions.some(action => action.id === 'retry_generation'), true);
  console.log('ok - chat body quality flags meta narration without auto patching');
}

{
  const result = analyzeChatBodyQuality({
    rawAssistantText: '<我和菲伦的私聊>\n菲伦--你好\n</我和菲伦的私聊>',
    formatReport: {
      status: 'invalid',
      errors: ['time is missing'],
      warnings: ['target is unresolved'],
    },
  });
  assert.equal(result.status, CHAT_BODY_QUALITY_STATUSES.needsReview);
  assert.equal(result.issues.some(issue => issue.id === 'format_errors_present'), true);
  assert.equal(result.issues.some(issue => issue.id === 'format_warnings_present'), true);
  assert.equal(result.patchCandidate, null);
  console.log('ok - chat body quality carries format report issues into review state');
}

{
  const result = analyzeChatBodyQuality({ rawAssistantText: '   ' });
  assert.equal(result.status, CHAT_BODY_QUALITY_STATUSES.invalid);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].id, 'empty_body');
  assert.equal(result.recommendedActions[0].id, 'retry_generation');
  console.log('ok - chat body quality treats empty body as invalid');
}
