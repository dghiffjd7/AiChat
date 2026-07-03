import assert from 'node:assert/strict';

import { searchAppFeatures } from '../../src/scripts/agent/app-feature-catalog.js';
import { planMaidAssistantCommand } from '../../src/scripts/agent/maid-assistant-agent.js';

// 女仆意图回归基线（golden fixtures）。
// 目的：固定“用户说法 -> 命中能力/工具”的行为，防止检索评分或 local planner 改动造成回归。
// 修改功能目录、评分规则或 local planner 后如果这里失败，先确认新行为是否更好，再更新基线。

// 一、功能检索基线：searchAppFeatures 的 top-1 命中。
// 检索结果同时决定模型 planner 提示词中的候选功能，top-1 错误会直接误导模型。
const RETRIEVAL_FIXTURES = [
  // 16.4 验收样例
  { input: '世界书重复了帮我清理', expect: 'worldbook.delete_entries' },
  { input: '给这个角色换头像', expect: 'persona.avatar.set' },
  { input: '读取当前预设', expect: 'app.resource.read' },
  // 导航与打开
  { input: '打开会话配置', expect: 'session.config.open' },
  { input: '我想设置API', expect: 'config.api.open' },
  { input: '打开世界书', expect: 'worldbook.open' },
  { input: '打开记忆表格', expect: 'memory.open' },
  { input: '打开变量面板', expect: 'variables.open' },
  { input: '打开正则', expect: 'regex.open' },
  // 会话与消息
  { input: '创建一个叫小美的聊天室', expect: 'session.create' },
  { input: '给小美发消息晚上好', expect: 'chat.send_message' },
  // 世界书
  { input: '删除世界书重复条目', expect: 'worldbook.delete_entries' },
  { input: '把世界书绑定到聊天室', expect: 'worldbook.bind_session' },
  { input: '看看世界书里有什么', expect: 'worldbook.open' },
  // 观察与联网
  { input: '看看当前用了哪些资源', expect: 'app.state.read' },
  { input: '看一下当前界面', expect: 'app.visible_panel.read' },
  { input: '帮我搜一下今天的新闻', expect: 'web.search' },
  // 图片资产
  { input: '把这张图设为壁纸', expect: 'session.wallpaper.set' },
  // 能力自描述
  { input: '你能做什么', expect: 'app.capabilities.search' },
  { input: '女仆有什么功能', expect: 'app.capabilities.search' },
  // 错误自查
  { input: '刚才为什么失败', expect: 'app.errors.read' },
  { input: '看看最近错误', expect: 'app.errors.read' },
  // 格式修复
  { input: '这次回复掉格式了', expect: 'chat.format.repair' },
  { input: '帮我修一下格式', expect: 'chat.format.repair' },
  { input: '回复格式不对', expect: 'chat.format.repair' },
  // 正文优化
  { input: '帮我润色一下这条回复', expect: 'chat.message.optimize' },
  { input: '这段写得太啰嗦了帮我精简', expect: 'chat.message.optimize' },
  { input: '删掉重复的句子', expect: 'chat.message.optimize' },
];

for (const { input, expect } of RETRIEVAL_FIXTURES) {
  const top = searchAppFeatures(input, { limit: 1 })[0];
  assert.ok(top, `「${input}」没有命中任何功能，期望 ${expect}`);
  assert.equal(
    top.id,
    expect,
    `「${input}」top-1 命中 ${top.id}(${top.score})，期望 ${expect}`,
  );
}
console.log(`ok - 功能检索基线 ${RETRIEVAL_FIXTURES.length} 条 top-1 命中`);

// 二、local planner 基线：无 API 时的规则规划结果。
const PLANNER_FIXTURES = [
  {
    input: '创建一个叫小美的聊天室',
    expectTool: 'session.create',
    expectArgs: { name: '小美' },
  },
  {
    input: '创建两个聊天室「精灵女王」和「暗夜女王」',
    expectTool: 'session.create',
    expectArgs: { names: ['精灵女王', '暗夜女王'] },
  },
  { input: '打开会话配置', expectTool: 'session.open_config' },
  { input: '我想设置API', expectTool: 'app.open_panel', expectArgs: { panel: 'config' } },
  { input: '打开记忆表格', expectTool: 'app.open_panel', expectArgs: { panel: 'memory' } },
  { input: '看看当前用了哪些资源', expectTool: 'app.get_current_state' },
  {
    // 无引号时 local planner 不猜会话名，发送到当前会话。
    input: '给小美发消息晚上好',
    expectTool: 'chat.send_message',
    expectArgs: { content: '晚上好' },
  },
  {
    input: '给聊天室「小美」发消息晚上好',
    expectTool: 'chat.send_message',
    expectArgs: { sessionId: '小美', content: '晚上好' },
  },
  {
    input: '创建角色卡「精灵女王」',
    expectTool: 'persona.create',
    expectArgs: { name: '精灵女王' },
  },
  { input: '切换到用户「小明」', expectTool: 'user.switch', expectArgs: { target: '小明' } },
  // 删除/绑定类不允许被 create 分支误接：应落到功能检索兜底（打开对应面板）。
  { input: '删除世界书重复条目', expectTool: 'app.open_panel', expectArgs: { panel: 'worldbook' } },
  { input: '把世界书绑定到聊天室', expectTool: 'app.open_panel', expectArgs: { panel: 'worldbook' } },
  // 信息不足时必须报可读原因，而不是执行错误动作。
  { input: '创建角色卡', expectUnsupported: 'missing_persona_name' },
  { input: '给小美发个消息', expectUnsupported: 'missing_message_content' },
];

for (const fixture of PLANNER_FIXTURES) {
  const plan = planMaidAssistantCommand(fixture.input);
  if (fixture.expectUnsupported) {
    assert.equal(plan.ok, false, `「${fixture.input}」应为 unsupported，实际 ok`);
    assert.equal(
      plan.reason,
      fixture.expectUnsupported,
      `「${fixture.input}」原因 ${plan.reason}，期望 ${fixture.expectUnsupported}`,
    );
    continue;
  }
  assert.equal(plan.ok, true, `「${fixture.input}」规划失败：${plan.reason || ''}`);
  assert.equal(
    plan.toolName,
    fixture.expectTool,
    `「${fixture.input}」选择了 ${plan.toolName}，期望 ${fixture.expectTool}`,
  );
  Object.entries(fixture.expectArgs || {}).forEach(([key, value]) => {
    assert.deepEqual(
      plan.args?.[key],
      value,
      `「${fixture.input}」args.${key} = ${JSON.stringify(plan.args?.[key])}，期望 ${JSON.stringify(value)}`,
    );
  });
}
console.log(`ok - local planner 基线 ${PLANNER_FIXTURES.length} 条规划结果`);

console.log('maid-intent-regression-tests passed');
