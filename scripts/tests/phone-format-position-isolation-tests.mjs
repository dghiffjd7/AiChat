import assert from 'node:assert/strict';

import { applyPromptPostProcessing } from '../../src/scripts/ui/chat/prompt-context-utils.js';
import {
  createChatSemanticSnapshot,
  assembleProviderFcRequest,
  restoreDeferredLegacyTextMessages,
} from '../../src/scripts/ui/chat/chat-semantic-snapshot-utils.js';
import { PHONE_FORMAT_PROMPT_POSITIONS } from '../../src/scripts/utils/phone-format-prompt-placement.js';

// 阶段 O.2 核心不变量：格式块位置只影响文本装配；FC/JSON 最终 payload 在任意
// 位置选择、任意 promptPostProcessing 模式下，都与「该层不存在」的基线逐字节一致。

const marker = id => `chat-semantic:request:${id}`;

const LAYERS = [
  { id: 'phone_format_intro', content: '【手机格式开头】intro 规则正文', marker: marker('phone_format_intro') },
  { id: 'phone_format_chat', content: '【QQ聊天格式】chat 规则正文', marker: marker('phone_format_chat') },
  { id: 'phone_format_moment', content: '【QQ空间格式】moment 规则正文', marker: marker('phone_format_moment') },
  { id: 'phone_format_footer', content: '【手机格式结尾】footer 规则正文', marker: marker('phone_format_footer') },
];

// 基础语义序列（不含格式层）：刻意包含尾随换行、连续空行与相邻同角色 user 消息，
// 覆盖 merge/semi/strict/single 的清洗与合并路径。
const buildBaseMessages = () => [
  { role: 'system', content: '你是角色小美。\n' },
  { role: 'system', content: '世界观：普通高中。\n\n\n附注。' },
  { role: 'user', content: '早安' },
  { role: 'user', content: '今天有空吗？\n' },
  { role: 'assistant', content: '有的呀。' },
  { role: 'user', content: '那出来玩' },
];

// 模拟 bridge 的注入：同锚位的层按 intro→chat→moment→footer 合并为一条 system 消息。
const buildMessagesWithMarkers = (positionById) => {
  const base = buildBaseMessages();
  const slots = { after_persona: [], system_end: [], history_before: [], history_depth: [] };
  LAYERS.forEach((layer) => {
    slots[positionById[layer.id] || 'history_before'].push(layer.marker);
  });
  const markerMessage = ids => ({ role: 'system', content: ids.join('\n\n') });
  const out = [];
  out.push(base[0]);
  if (slots.after_persona.length) out.push(markerMessage(slots.after_persona));
  out.push(base[1]);
  if (slots.system_end.length) out.push(markerMessage(slots.system_end));
  if (slots.history_before.length) out.push(markerMessage(slots.history_before));
  out.push(base[2]);
  // history_depth：刻意插在两条相邻同角色 user 消息之间（merge 模式的结构分歧点）
  if (slots.history_depth.length) out.push(markerMessage(slots.history_depth));
  out.push(base[3], base[4], base[5]);
  return out;
};

const fcPayload = (messages, layers) => {
  const created = createChatSemanticSnapshot({
    requestId: 'iso-test',
    legacyMessages: messages,
    legacyLayers: layers,
    providerFcTransportMessage: '结构化传输指令',
  });
  assert.equal(created.ok, true, `snapshot failed: ${created.reason} ${JSON.stringify(created.diagnostics || {})}`);
  const assembled = assembleProviderFcRequest(created.snapshot);
  assert.equal(assembled.ok, true, `assemble failed: ${assembled.reason}`);
  return JSON.stringify(assembled.messages);
};

const MODES = ['none', 'merge', 'semi', 'strict', 'single'];
const POSITION_SCENARIOS = [
  { name: 'all_history_before', map: {} },
  {
    name: 'spread_positions',
    map: {
      phone_format_intro: 'after_persona',
      phone_format_chat: 'history_depth',
      phone_format_moment: 'system_end',
      phone_format_footer: 'history_before',
    },
  },
  {
    name: 'all_history_depth_between_users',
    map: {
      phone_format_intro: 'history_depth',
      phone_format_chat: 'history_depth',
      phone_format_moment: 'history_depth',
      phone_format_footer: 'history_depth',
    },
  },
  {
    name: 'system_end_and_after_persona',
    map: {
      phone_format_intro: 'after_persona',
      phone_format_chat: 'after_persona',
      phone_format_moment: 'system_end',
      phone_format_footer: 'system_end',
    },
  },
];

assert.deepEqual(
  [...PHONE_FORMAT_PROMPT_POSITIONS].sort(),
  ['after_persona', 'history_before', 'history_depth', 'system_end'],
  '位置 token 集合与本测试覆盖面须一致',
);

for (const mode of MODES) {
  // 基线：该层完全不存在时的 FC payload
  const absentBaseline = fcPayload(applyPromptPostProcessing(buildBaseMessages(), mode), []);
  for (const scenario of POSITION_SCENARIOS) {
    const withMarkers = buildMessagesWithMarkers(scenario.map);
    const postProcessed = applyPromptPostProcessing(withMarkers, mode);

    const payload = fcPayload(postProcessed, LAYERS);
    assert.equal(
      payload,
      absentBaseline,
      `FC payload 必须与无格式层基线逐字节一致：mode=${mode} scenario=${scenario.name}`,
    );

    // 文本路由：每层 marker 恰好还原一次
    const restored = restoreDeferredLegacyTextMessages({
      messages: postProcessed,
      deferredLegacyLayers: LAYERS,
    });
    assert.equal(restored.ok, true, `restore failed: mode=${mode} scenario=${scenario.name} ${JSON.stringify(restored.replacements)}`);
    LAYERS.forEach((layer) => {
      assert.equal(restored.replacements[layer.id], 1, `layer ${layer.id} 还原次数须为 1：mode=${mode} scenario=${scenario.name}`);
      const joined = restored.messages.map(message => String(message?.content ?? '')).join('\n');
      assert.ok(joined.includes(layer.content), `还原后须包含 ${layer.id} 正文：mode=${mode} scenario=${scenario.name}`);
      assert.ok(!joined.includes(layer.marker), `还原后不得残留 ${layer.id} marker：mode=${mode} scenario=${scenario.name}`);
    });
  }
  console.log(`ok - ${mode} 模式下四位置 FC payload 与无层基线一致，文本还原恰好一次`);
}

// merge 模式补充断言：锚点占位保持独立，且不阻断两侧同角色合并
{
  const merged = applyPromptPostProcessing([
    { role: 'user', content: 'A' },
    { role: 'system', content: marker('phone_format_chat') },
    { role: 'user', content: 'B' },
  ], 'merge');
  assert.equal(merged.length, 2, 'merge 模式：user 消息应跨过锚点合并，锚点独立保留');
  const userMessage = merged.find(message => message.role === 'user');
  assert.equal(userMessage.content, 'A\n\nB');
  const anchorMessage = merged.find(message => message.role === 'system');
  assert.equal(anchorMessage.content, marker('phone_format_chat'));
}

console.log('phone-format-position-isolation-tests passed');
