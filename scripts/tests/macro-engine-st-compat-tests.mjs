import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const { MacroEngine } = await import('../../src/scripts/utils/macro-engine.js');

const messages = [
  { id: 'record-user-a', role: 'user', raw: 'hello' },
  { id: 'record-system-b', role: 'system', raw: 'note' },
  { id: 'record-assistant-c', role: 'assistant', raw: 'world' },
];
const engine = new MacroEngine({ getMessages: () => messages });

assert.equal(
  engine.process('{{lastMessageId}}|{{lastUserMessageId}}|{{lastCharMessageId}}|{{lastMessage}}', { sessionId: 's1' }),
  '2|0|2|world',
  'ST 的 MessageId 宏必须返回 0-based 聊天楼层索引，不能泄漏 App 数据库消息 id',
);

assert.equal(
  new MacroEngine({ getMessages: () => [] }).process('[{{lastMessageId}}]', { sessionId: 's1' }),
  '[]',
  '空聊天没有最后楼层时应替换为空字符串',
);

const variableEngine = new MacroEngine({
  getVariable: key => (key === 'known' ? 'local-value' : undefined),
  getGlobalVariable: key => (key === 'known' ? 'global-value' : undefined),
});
assert.equal(
  variableEngine.process(
    '{{getvar::missing::42}}|{{getglobalvar::missing::84}}|{{var::known}}',
    { sessionId: 's1' },
  ),
  '42|84|local-value',
  'getvar fallback 与 slash 既有 var 别名必须可达共享宏核心',
);

console.log('ok - MacroEngine 使用 ST 的 0-based 楼层索引语义');
