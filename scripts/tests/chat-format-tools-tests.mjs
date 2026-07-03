import assert from 'node:assert/strict';

import { createChatFormatRepairTools } from '../../src/scripts/agent/tools/chat-format-tools.js';
import { buildChatFormatGuardianModelPrompt } from '../../src/scripts/ui/chat/chat-format-guardian-utils.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

{
  const calls = [];
  const tools = createChatFormatRepairTools({
    repairMessageFormat: async (args) => {
      calls.push(args);
      return { ok: true, applied: true, added: 2, removed: 1, summary: '补齐缺失标签' };
    },
  });
  const tool = getTool(tools, 'chat.repair_message_format');
  const result = await tool.execute({
    messageId: 'msg-1',
    sessionName: '小美',
    formatHint: '正文必须包含 <status>...</status> 状态块',
  });
  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.deepEqual(calls[0], {
    messageId: 'msg-1',
    sessionId: '',
    sessionName: '小美',
    formatHint: '正文必须包含 <status>...</status> 状态块',
    source: 'maid',
  });
  assert.equal(tool.summarizeResult(result), 'format repair applied (+2/-1)');
  console.log('ok - 修复工具透传参数并汇总应用结果');
}

{
  const tools = createChatFormatRepairTools({});
  const result = await getTool(tools, 'chat.repair_message_format').execute({});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'format_repair_unavailable');
  console.log('ok - 无执行器时返回可读错误');
}

{
  const tools = createChatFormatRepairTools({
    repairMessageFormat: async () => ({
      ok: true,
      applied: false,
      userDecision: 'cancelled',
      message: '用户在 diff 预览中取消了修复。',
    }),
  });
  const tool = getTool(tools, 'chat.repair_message_format');
  const result = await tool.execute({});
  assert.equal(result.ok, true, '用户取消不是失败，避免 ReAct 重试重复弹窗');
  assert.equal(result.applied, false);
  assert.equal(tool.summarizeResult(result), 'format repair cancelled by user in diff preview');
  console.log('ok - 用户取消返回 ok:true + applied:false');
}

{
  const prompt = buildChatFormatGuardianModelPrompt({
    assistantText: '小美--晚上好--21:30',
    customFormatGuide: '每条回复末尾必须有 <status>好感度:N</status> 状态块',
    enabledFormats: { privateChat: true },
  });
  const userMessage = prompt.messages.find(item => item.role === 'user')?.content || '';
  assert.match(userMessage, /# Custom Format Guide/);
  assert.match(userMessage, /<status>好感度:N<\/status>/);
  const withoutGuide = buildChatFormatGuardianModelPrompt({
    assistantText: '小美--晚上好--21:30',
    enabledFormats: { privateChat: true },
  });
  const plainUser = withoutGuide.messages.find(item => item.role === 'user')?.content || '';
  assert.doesNotMatch(plainUser, /# Custom Format Guide/);
  console.log('ok - customFormatGuide 拼入修复 prompt 且缺省不出现');
}

{
  const { runChatFormatGuardianBackgroundChat } = await import('../../src/scripts/ui/chat/after-receive-dispatch-utils.js');
  const calls = [];
  const backgroundChat = async (messages, options = {}) => {
    calls.push({ ...options });
    if (Object.prototype.hasOwnProperty.call(options, 'temperature')) {
      throw new Error('temperature 参数不被该模型支持');
    }
    return '{"status":"ok"}';
  };
  const raw = await runChatFormatGuardianBackgroundChat(backgroundChat, [], { temperature: 0, maxTokens: 900 }, { timeoutMs: 0 });
  assert.equal(raw, '{"status":"ok"}');
  assert.equal(calls.length, 2, '应剥掉 temperature 重试一次');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[1], 'temperature'), false);
  assert.equal(calls[1].maxTokens, 900, '其余参数应保留');

  let otherError = null;
  try {
    await runChatFormatGuardianBackgroundChat(async () => {
      throw new Error('rate limited');
    }, [], { temperature: 0 }, { timeoutMs: 0 });
  } catch (err) {
    otherError = err;
  }
  assert.match(String(otherError?.message), /rate limited/, '非 temperature 错误不应吞掉');
  console.log('ok - temperature 不兼容时剥参重试一次，其他错误原样抛出');
}

console.log('chat-format-tools-tests passed');
