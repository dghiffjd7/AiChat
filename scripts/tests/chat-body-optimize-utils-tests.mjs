import assert from 'node:assert/strict';

import {
  DEFAULT_CHAT_BODY_OPTIMIZE_INSTRUCTION,
  buildChatBodyOptimizeModelPrompt,
  normalizeChatBodyOptimizeModelResult,
} from '../../src/scripts/ui/chat/chat-body-optimize-utils.js';

{
  const prompt = buildChatBodyOptimizeModelPrompt({
    originalText: '夜色很深。夜色很深。她端来热茶。',
    instruction: '删掉重复句子',
    userName: '阳翔',
    sessionLabel: '测试会话',
    surface: 'creative',
  });
  const system = prompt.messages[0].content;
  const user = prompt.messages[1].content;
  assert.match(system, /不得改变剧情事实/);
  assert.match(system, /<image_prompt>/);
  assert.match(system, /禁止 Markdown 代码块/);
  assert.match(user, /# Instruction（用户优化指示）\n删掉重复句子/);
  assert.match(user, /# Original Text（待优化正文）\n夜色很深。/);
  assert.match(user, /surface: creative/);
  console.log('ok - 优化 prompt 包含指示、原文与只改表达约束');
}

{
  const prompt = buildChatBodyOptimizeModelPrompt({ originalText: 'x' });
  assert.match(prompt.messages[1].content, new RegExp(DEFAULT_CHAT_BODY_OPTIMIZE_INSTRUCTION.slice(0, 10)));
  console.log('ok - 缺省指示回落到默认优化指示');
}

{
  const result = normalizeChatBodyOptimizeModelResult(
    '{"status":"optimized","canOptimize":true,"summary":"删除了 1 处重复句","optimizedText":"夜色很深。她端来热茶。"}',
    { originalText: '夜色很深。夜色很深。她端来热茶。' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.canOptimize, true);
  assert.equal(result.optimizedText, '夜色很深。她端来热茶。');
  assert.equal(result.summary, '删除了 1 处重复句');
  console.log('ok - 正常优化结果归一');
}

{
  const result = normalizeChatBodyOptimizeModelResult('这不是 JSON，我拒绝输出格式');
  assert.equal(result.ok, false);
  assert.equal(result.canOptimize, false);
  assert.equal(result.issues[0].type, 'parse_error');
  console.log('ok - 非 JSON 输出归一为 parse_error（供重试判定）');
}

{
  const fenced = normalizeChatBodyOptimizeModelResult(
    '```json\n{"canOptimize":true,"summary":"ok","optimizedText":"新文本"}\n```',
    { originalText: '旧文本' },
  );
  assert.equal(fenced.canOptimize, true, '容错提取代码块内 JSON');
  assert.equal(fenced.optimizedText, '新文本');
  console.log('ok - 代码块包裹的 JSON 可容错提取');
}

{
  const unchanged = normalizeChatBodyOptimizeModelResult(
    '{"canOptimize":true,"summary":"没什么可改","optimizedText":"原样文本"}',
    { originalText: '原样文本' },
  );
  assert.equal(unchanged.canOptimize, false, '产出与原文相同应视为无需优化');
  assert.equal(unchanged.unchanged, true);

  const declined = normalizeChatBodyOptimizeModelResult(
    '{"canOptimize":false,"summary":"指示与正文无关","optimizedText":""}',
  );
  assert.equal(declined.canOptimize, false);
  assert.equal(declined.summary, '指示与正文无关');
  console.log('ok - 无需优化与拒绝优化路径');
}

console.log('chat-body-optimize-utils-tests passed');
