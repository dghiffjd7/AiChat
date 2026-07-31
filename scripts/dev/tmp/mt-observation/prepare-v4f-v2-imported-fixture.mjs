import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/v4f-v2-imported-fixture-20260731.json',
);

const result = await evaluateInApp(`(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const persona = stores.personaStore?.getActive?.() || null;
  if (persona?.name !== '冻结观察V4F-V2-0731') {
    return { ok: false, reason: 'unexpected_active_persona', persona };
  }
  const context = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const entries = [
    {
      title: '艾琳·洛',
      keys: ['艾琳', '调查队长'],
      content: '艾琳·洛是霜港调查队长，冷静果断，擅长航海与现场判断，是长期故事中的主要人物。',
    },
    {
      title: '顾风',
      keys: ['顾风', '机关师'],
      content: '顾风是调查队机关师，谨慎寡言，负责修理设备与破解遗迹机关，是长期故事中的主要人物。',
    },
    {
      title: '米娅',
      keys: ['米娅', '向导'],
      content: '米娅是熟悉霜港街巷与潮汐的年轻向导，外向敏锐，是长期故事中的主要人物。',
    },
    {
      title: '霜港概览',
      keys: ['霜港', '城市'],
      content: '霜港终年受潮雾笼罩，港区、旧城与灯塔区构成主要舞台。',
    },
    {
      title: '蓝焰灯塔',
      keys: ['灯塔', '蓝焰'],
      content: '蓝焰灯塔每逢退潮会发出异常光芒，是调查主线的重要地点。',
    },
    {
      title: '潮汐规则',
      keys: ['潮汐', '通行'],
      content: '船只靠岸前必须鸣笛三短一长，夜间仅持证者可以进入旧港。',
    },
    {
      title: '调查队守则',
      keys: ['守则', '规则'],
      content: '调查必须两人同行，发现未知遗物时先记录、隔离，再交由机关师检查。',
    },
    {
      title: '旧港遗迹',
      keys: ['遗迹', '旧港'],
      content: '旧港地下保存着失落航线的石刻与多处尚未开启的密室。',
    },
    {
      title: '输出格式',
      keys: ['格式', '对话'],
      content: '角色聊天使用 APP 既有私聊协议，不要求额外自定义标签。',
    },
    {
      title: '用户边界',
      keys: ['用户', '边界'],
      content: '用户是刚加入调查队的新成员；不得替用户决定行动、关系或背景。',
    },
    {
      title: '时间线',
      keys: ['时间', '序章'],
      content: '故事从蓝焰灯塔连续三夜异常点亮后的清晨开始。',
    },
    {
      title: '资料来源说明',
      keys: ['来源', '测试'],
      content: '以上均为 V4F-V2 冻结观察用原创测试资料，不属于任何正式角色卡。',
    },
  ];
  const createdOutput = await stores.agentToolRegistry?.executeTool?.('worldbook.create', {
    name: 'V4F-V2导入卡资料-0731',
    entries,
    mode: 'append',
    personaId: persona.id,
    bindToPersona: true,
  }, context);
  const created = createdOutput?.result || createdOutput || null;
  const activeAfter = stores.personaStore?.getActive?.() || null;
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const readOutput = await stores.agentToolRegistry?.executeTool?.('worldbook.read', {
    name: 'V4F-V2导入卡资料-0731',
    includeContent: false,
    maxEntries: 200,
  }, readContext);
  const worldbook = readOutput?.result || readOutput || null;
  return {
    ok: created?.ok === true
      && activeAfter?.source?.worldbookId === 'V4F-V2导入卡资料-0731'
      && worldbook?.entryCount === entries.length,
    created,
    persona: {
      id: activeAfter?.id || '',
      name: activeAfter?.name || '',
      source: activeAfter?.source || null,
    },
    worldbook,
  };
})()`, { timeoutMs: 120_000 });

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...result }, null, 2));
if (!result?.ok) process.exitCode = 1;
