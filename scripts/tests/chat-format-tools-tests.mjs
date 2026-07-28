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

{
  const calls = [];
  const tools = createChatFormatRepairTools({
    optimizeMessage: async (args) => {
      calls.push(args);
      return { ok: true, applied: true, added: 3, removed: 5, summary: '精简重复描写' };
    },
  });
  const tool = tools.find(t => t.name === 'chat.optimize_message');
  const result = await tool.execute({ instruction: '更简洁', sessionName: '小美' });
  assert.equal(result.applied, true);
  assert.equal(calls[0].instruction, '更简洁');
  assert.equal(calls[0].sessionName, '小美');
  assert.equal(tool.summarizeResult(result), 'body optimize applied (+3/-5)');

  const bare = createChatFormatRepairTools({});
  const unavailable = await bare.find(t => t.name === 'chat.optimize_message').execute({});
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, 'body_optimize_unavailable');

  const cancelled = tool.summarizeResult({ ok: true, applied: false, userDecision: 'cancelled' });
  assert.equal(cancelled, 'body optimize cancelled by user in diff preview');
  console.log('ok - chat.optimize_message 工具透传参数、汇总与降级');
}

{
  const { createMaidFormatProfileStore } = await import('../../src/scripts/storage/maid-format-profile-store.js');
  const storage = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
  const profileStore = createMaidFormatProfileStore({ storage, now: () => 1000 });
  const tools = createChatFormatRepairTools({
    formatProfileStore: profileStore,
    resolveSessionId: ({ sessionId, sessionName }) => sessionId || (sessionName === '蒂法' ? '蒂法' : ''),
  });
  const saveTool = getTool(tools, 'chat.save_format_profile');
  const readTool = getTool(tools, 'chat.read_format_profile');

  const missing = await readTool.execute({ sessionName: '蒂法' });
  assert.equal(missing.ok, true);
  assert.equal(missing.hasProfile, false);

  const saved = await saveTool.execute({
    sessionName: '蒂法',
    guide: '回复必须以 <status>...</status> 状态块结尾',
    sources: [{ type: 'worldbook', ref: '蒂法' }],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.sessionId, '蒂法');

  const found = await readTool.execute({ sessionName: '蒂法' });
  assert.equal(found.hasProfile, true);
  assert.match(found.profile.guide, /status/);

  const noSession = await saveTool.execute({ sessionName: '不存在', guide: '规范内容规范' });
  assert.equal(noSession.ok, false);
  assert.equal(noSession.reason, 'session_not_found');

  const bare = createChatFormatRepairTools({});
  const unavailable = await getTool(bare, 'chat.read_format_profile').execute({ sessionId: 'x' });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, 'format_profile_store_unavailable');
  console.log('ok - 格式画像保存/读取工具与降级路径');
}

{
  // 修复工具产出 diff 提案、落盘必经 UI 确认——只读意图下允许发起
  const { createChatFormatRepairTools } = await import('../../src/scripts/agent/tools/chat-format-tools.js');
  const repair = createChatFormatRepairTools({}).find(tool => tool.name === 'chat.repair_message_format');
  assert.equal(repair.metadata?.allowInReadOnlyIntent, true);
  assert.equal(repair.capabilities.write, true, '写标记保持真实，白名单只影响只读升级');
  console.log('ok - format repair tool is allowed under read-only intent via metadata flag');
}

console.log('chat-format-tools-tests passed');
