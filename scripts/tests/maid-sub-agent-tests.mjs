import assert from 'node:assert/strict';

import {
  MAID_SUB_AGENT_SKILLS,
  normalizeMaidSubAgent,
  normalizeMaidSettingsState,
} from '../../src/scripts/storage/maid-settings-store.js';
import { buildMaidSubAgentsPromptBlock, buildMaidModelPlannerMessages } from '../../src/scripts/agent/maid-model-planner.js';
import { createAppContentAgentTools } from '../../src/scripts/agent/tools/app-content-tools.js';

{
  const sub = normalizeMaidSubAgent({
    name: '快手 flash', modelProfileId: 'p1', modelOverride: 'deepseek-v4-flash',
    skills: ['summarization', 'bogus_skill', 'prose_writing'], note: '便宜快', enabled: true,
  });
  assert.equal(sub.skills.length, 2, '非法 skill 应过滤');
  assert.equal(normalizeMaidSubAgent({ name: 'x' }), null, '缺连线档应拒绝');
  const state = normalizeMaidSettingsState({ subAgents: [sub, { name: 'bad' }], fallbackProfileId: 'p2', boundModelOverride: 'm1' });
  assert.equal(state.subAgents.length, 1);
  assert.equal(state.fallbackProfileId, 'p2');
  assert.equal(state.boundModelOverride, 'm1', 'boundModelOverride 应被归一化保留（持久化修复）');
  console.log('ok - sub-agent 归一化与设置状态');
}

{
  const block = buildMaidSubAgentsPromptBlock([
    { id: 's1', name: '快手', skills: ['summarization'], note: '便宜', enabled: true },
    { id: 's2', name: '停用', skills: [], enabled: false },
  ]);
  assert.match(block, /<sub_agents>/);
  assert.match(block, /id: s1/);
  assert.doesNotMatch(block, /停用/, '停用的不注入');
  assert.equal(buildMaidSubAgentsPromptBlock([]), '', '无配置为空');

  const messages = buildMaidModelPlannerMessages({
    input: '帮我写世界书',
    context: { sessionId: 'x', subAgents: [{ id: 's1', name: '快手', skills: ['prose_writing'], enabled: true }] },
  });
  const user = typeof messages[1].content === 'string' ? messages[1].content : messages[1].content.map(p => p?.text || '').join('\n');
  assert.match(user, /<sub_agents>/, 'planner 消息应注入 sub_agents 段');
  console.log('ok - sub_agents 提示注入');
}

{
  // 委派工具：大纲 -> 生成 -> 追加写入；delegated 元数据透传
  const saved = {};
  const tools = createAppContentAgentTools({
    generateWithSubAgent: async ({ subAgentId, prompt }) => ({
      ok: true,
      text: `【生成正文】${prompt.match(/条目标题：(.+)/)?.[1] || ''}的内容。`,
      delegated: subAgentId === 's1',
      modelUsed: 'deepseek-v4-flash',
      subAgentName: '快手',
    }),
    saveWorldInfo: async (name, payload) => { saved[name] = payload; },
    getWorldInfo: async () => null,
    listWorlds: async () => [],
    waitForWorldStoreReady: async () => {},
    now: () => 1000,
  });
  const tool = tools.find(t => t.name === 'worldbook.generate_entries');
  assert.ok(tool, '工具应存在');
  const result = await tool.execute({
    name: '爱丽丝',
    subAgentId: 's1',
    entries: [
      { title: '角色设定', outline: '蓝发女仆，温柔', length: 100 },
      { title: '背景故事', outline: '王都出身', length: 120 },
    ],
  }, {});
  assert.equal(result.ok, true);
  assert.equal(result.delegated, true);
  assert.equal(result.generatedCount, 2);
  assert.equal(saved['爱丽丝'].entries.length, 2);
  assert.match(saved['爱丽丝'].entries[0].content, /角色设定的内容/);
  console.log('ok - worldbook.generate_entries 大纲生成并写入');
}

{
  // 生成失败中断并报告已生成数
  const tools = createAppContentAgentTools({
    generateWithSubAgent: async () => ({ ok: false, reason: 'generation_failed', message: 'boom' }),
    saveWorldInfo: async () => {},
    getWorldInfo: async () => null,
    listWorlds: async () => [],
    now: () => 1000,
  });
  const tool = tools.find(t => t.name === 'worldbook.generate_entries');
  const result = await tool.execute({ name: 'x', entries: [{ title: 'a', outline: 'b' }] }, {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'generation_failed');
  console.log('ok - 生成失败时如实报错');
}

{
  const saved = {};
  const generationCalls = [];
  const tools = createAppContentAgentTools({
    getWorldAiGenerationSettings: () => ({
      templateStorageKey: 'world_ai_template_v1',
      hasCustomTemplate: true,
      template: 'name: ""\npersonality: ""',
    }),
    generateWithSubAgent: async options => {
      generationCalls.push(options);
      return {
        ok: true,
        text: 'name: "米娅"\npersonality: "温柔"',
        webSearchUsed: true,
        sources: [{ title: '资料', url: 'https://example.com/mia', snippet: '角色资料' }],
      };
    },
    saveWorldInfo: async (name, payload) => { saved[name] = payload; },
    getWorldInfo: async () => null,
    listWorlds: async () => [],
  });
  const tool = tools.find(item => item.name === 'worldbook.generate_entries');
  assert.equal(tool.capabilities.network, 'opt_in');
  assert.ok(tool.schema.properties.useAiTemplate);
  assert.ok(tool.schema.properties.webSearch);
  const result = await tool.execute({
    name: '角色资料',
    useAiTemplate: true,
    webSearch: true,
    entries: [{ title: '基础资料', outline: '米娅的公开设定', length: 180 }],
  }, {});
  assert.equal(result.ok, true);
  assert.equal(result.templateApplied, true);
  assert.equal(result.templateSource, 'custom');
  assert.equal(result.webSearchRequested, true);
  assert.equal(result.webSearchUsed, true);
  assert.match(generationCalls[0].prompt, /<ai_generation_template>/);
  assert.equal(generationCalls[0].webSearch, true);
  assert.match(generationCalls[0].sessionId, /^maid-world-ai:/);
  assert.deepEqual(saved['角色资料'].entries[0].sourceRefs, ['https://example.com/mia']);
  assert.equal(result.sources[0].url, 'https://example.com/mia');
  console.log('ok - worldbook.generate_entries 共享 AI 模板并显式透传本次联网与来源');
}

console.log('maid-sub-agent-tests passed');

{
  const { rankModelCandidates } = await import('../../src/scripts/utils/model-candidates.js');
  const models = ['gpt-5', 'deepseek-v4-flash', 'deepseek-v4-pro', 'claude-fable-5'];
  assert.deepEqual(rankModelCandidates(models, ''), models, '空输入保持原序');
  const ranked = rankModelCandidates(models, 'deepseek-v4-pro');
  assert.equal(ranked[0], 'deepseek-v4-pro', '完全匹配排第一');
  assert.equal(ranked.length, 4, '不过滤任何项');
  const prefix = rankModelCandidates(models, 'deepseek');
  assert.deepEqual(prefix.slice(0, 2), ['deepseek-v4-flash', 'deepseek-v4-pro'], '前缀匹配组保持原序靠前');
  assert.equal(prefix[2], 'gpt-5', '不匹配的跟随在后且保持原序');
  console.log('ok - 模型候选筛选排序（匹配靠前不过滤）');
}

{
  // load 合并回归：新字段（subAgents/fallback/override）不被 load 抹掉
  const { MaidSettingsStore } = await import('../../src/scripts/storage/maid-settings-store.js');
  const kvData = {};
  const store = new MaidSettingsStore({
    storage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
    loadKv: async key => kvData[key] || null,
    saveKv: async (key, data) => { kvData[key] = data; },
    now: () => 1000,
  });
  await store.load();
  await store.upsertSubAgent({ name: '快手', modelProfileId: 'p1', modelOverride: 'flash', skills: ['summarization'] });
  await store.setFallbackProfileId('p2');
  await store.setBoundModelOverride('pro');

  const store2 = new MaidSettingsStore({
    storage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
    loadKv: async key => kvData[key] || null,
    saveKv: async (key, data) => { kvData[key] = data; },
    now: () => 2000,
  });
  await store2.load();
  assert.equal(store2.listSubAgents().length, 1, 'reload 后 subAgents 应保留');
  assert.equal(store2.listSubAgents()[0].modelOverride, 'flash');
  assert.equal(store2.getFallbackProfileId(), 'p2', 'fallback 应保留');
  assert.equal(store2.getBoundModelOverride(), 'pro', '模型覆盖应保留');
  console.log('ok - load 合并保留新字段（reload 持久化回归）');
}
