import assert from 'node:assert/strict';

import {
  createMaidAssistantAgent,
  planMaidAssistantCommand,
} from '../../src/scripts/agent/maid-assistant-agent.js';

{
  const plan = planMaidAssistantCommand('创建一个叫「A」的聊天室');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'session.create');
  assert.deepEqual(plan.args, { name: 'A', open: true });
  console.log('ok - maid assistant planner maps create-room wording to session.create');
}

{
  const plan = planMaidAssistantCommand('帮我创建两个聊天室，精灵女王和暗夜女王的');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'session.create');
  assert.deepEqual(plan.args, { names: ['精灵女王', '暗夜女王'], open: true });
  console.log('ok - maid assistant planner maps multi-room wording to session.create names');
}

{
  const plan = planMaidAssistantCommand('我想配置当前聊天室的会话配置');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'session.open_config');
  console.log('ok - maid assistant planner maps session config wording to session.open_config');
}

{
  const plan = planMaidAssistantCommand('我想设置 API');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'app.open_panel');
  assert.equal(plan.args.panel, 'config');
  console.log('ok - maid assistant planner maps API wording to config panel');
}

{
  const plan = planMaidAssistantCommand('创建一个名为「测试角色卡」的新角色卡');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'persona.create');
  assert.deepEqual(plan.args, { name: '测试角色卡', setActive: true });
  console.log('ok - maid assistant planner maps character card creation');
}

{
  const plan = planMaidAssistantCommand('创建一个名为「小悠」的新用户名称');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'user.create');
  assert.deepEqual(plan.args, { name: '小悠', setActive: true });
  console.log('ok - maid assistant planner maps user profile creation');
}

{
  const plan = planMaidAssistantCommand('切换到用户「小悠」');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'user.switch');
  assert.deepEqual(plan.args, { target: '小悠' });
  console.log('ok - maid assistant planner maps user profile switching');
}

{
  const plan = planMaidAssistantCommand('切换到角色卡「测试角色卡」');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'persona.switch');
  assert.deepEqual(plan.args, { target: '测试角色卡' });
  console.log('ok - maid assistant planner maps character card switching');
}

{
  const plan = planMaidAssistantCommand('为角色卡「测试角色卡」创建世界书「测试世界书」，包含条目「温柔大姐姐」内容「超级温柔特别会照顾人，和用户为姐弟关系。」和条目「傲娇大小姐青梅竹马」内容「傲娇的大小姐青梅竹马。」');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'worldbook.create');
  assert.equal(plan.args.name, '测试世界书');
  assert.equal(plan.args.personaName, '测试角色卡');
  assert.equal(plan.args.bindToPersona, true);
  assert.equal(plan.args.entries.length, 2);
  assert.match(plan.args.entries[0].content, /姐弟关系/);
  console.log('ok - maid assistant planner maps worldbook creation');
}

{
  const plan = planMaidAssistantCommand('在聊天室「温柔大姐姐」发送消息「晚上好」');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'chat.send_message');
  assert.deepEqual(plan.args, { sessionId: '温柔大姐姐', content: '晚上好', role: 'user', open: true });
  console.log('ok - maid assistant planner maps chat message sending');
}

{
  const calls = [];
  const statuses = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.open_panel',
      args: { panel: 'worldbook' },
      featureId: 'worldbook.open',
      title: '打开世界书',
      response: '我来打开世界书。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args, context) => {
        calls.push({ toolName, args, context });
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true },
          summary: `ran ${toolName}`,
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书', {
    sessionId: 's1',
    onStatus: status => statuses.push(status),
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].toolName, 'app.open_panel');
  assert.equal(calls[0].args.panel, 'worldbook');
  assert.equal(calls[0].context.sessionId, 's1');
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].stage, 'planned');
  assert.equal(statuses[0].message, '我来打开世界书。');
  console.log('ok - maid assistant agent executes planned tools through registry');
}

{
  const modelResponse = '模型生成的发送前回应。';
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'chat.send_message',
      args: { sessionName: '目标联系人', message: '测试消息' },
      featureId: 'chat.send_message',
      title: '发送聊天消息',
      response: modelResponse,
    }),
    toolRegistry: {
      executeTool: async () => ({
        toolName: 'chat.send_message',
        status: 'succeeded',
        result: {
          ok: true,
          sent: true,
          requestTriggered: true,
          sessionId: '目标联系人',
        },
        summary: 'sent message to target contact',
      }),
    },
    logger: { warn() {} },
  });
  const statuses = [];
  const result = await agent.runPrompt('给目标联系人发送测试消息', {
    onStatus: status => statuses.push(status),
  });
  assert.equal(result.ok, true);
  assert.equal(statuses[0].message, modelResponse);
  assert.equal(result.message, '已发送给「目标联系人」，联系人正在回复。');
  console.log('ok - maid assistant agent reports pre-action reply and send-trigger final status');
}

{
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.open_panel',
      args: { panel: 'worldbook' },
      featureId: 'worldbook.open',
      title: '打开世界书',
      response: '我来打开世界书。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => ({
        toolName,
        status: 'succeeded',
        result: { ok: true, args },
        summary: `ran ${toolName}`,
      }),
    },
    guidedActionRuntime: {
      run: async ({ execute }) => {
        const output = await execute();
        return {
          output,
          guided: true,
          guide: { guideId: 'worldbook.open.guide' },
          message: '首次引导：打开世界书的 APP 路径是「聊天室右上角菜单 -> 世界书」。',
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书');
  assert.equal(result.ok, true);
  assert.equal(result.guided, true);
  assert.equal(result.guide.guideId, 'worldbook.open.guide');
  assert.match(result.message, /首次引导/);
  console.log('ok - maid assistant agent includes guided action results');
}

{
  const calls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.open_panel',
      args: { panel: 'variables' },
      featureId: 'variables.open',
      title: '打开变量',
      response: '我来打开变量。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true },
          summary: `ran ${toolName}`,
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('异步规划');
  assert.equal(result.ok, true);
  assert.equal(calls[0].toolName, 'app.open_panel');
  assert.equal(calls[0].args.panel, 'variables');
  console.log('ok - maid assistant agent awaits async planners');
}

{
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'session.open_config',
      args: {},
      featureId: 'session.config.open',
      title: '打开会话配置',
      response: '我来打开当前会话配置。',
    }),
    toolRegistry: {
      executeTool: async () => ({
        status: 'succeeded',
        result: { ok: false, reason: 'missing_session_id' },
        summary: 'open session config failed: missing_session_id',
      }),
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开当前聊天室的会话配置');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.match(result.message, /missing_session_id/);
  console.log('ok - maid assistant agent reports business-level tool failures');
}

{
  const statuses = [];
  const reactCalls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'chat', sessionName: '精灵女王' },
      featureId: 'app.resource.read',
      title: '读取聊天消息',
      response: '我先看看精灵女王最后回了什么。',
    }),
    reactPlanner: async (input, context) => {
      reactCalls.push({ input, context });
      return {
        ok: true,
        action: 'final',
        message: '精灵女王最后回复了「晚上好，今天辛苦了」。',
      };
    },
    toolRegistry: {
      executeTool: async () => ({
        toolName: 'app.read_resource',
        status: 'succeeded',
        result: {
          ok: true,
          resource: 'chat',
          messages: [
            { role: 'user', content: '晚上好' },
            { role: 'assistant', rawOriginal: '晚上好，今天辛苦了', displayText: '晚上好，今天辛苦了' },
          ],
        },
        summary: 'read resource chat',
      }),
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('女王最后回了我什么？', {
    onStatus: status => statuses.push(status),
  });
  assert.equal(result.ok, true);
  assert.equal(result.responseType, 'react');
  assert.match(result.message, /今天辛苦了/);
  assert.equal(result.steps.length, 1);
  assert.equal(reactCalls.length, 1);
  assert.equal(reactCalls[0].context.maidReactSteps[0].toolName, 'app.read_resource');
  assert.equal(statuses.some(status => status.stage === 'observed'), true);
  console.log('ok - maid assistant agent continues after read tool and returns final answer');
}

{
  const calls = [];
  const reactCalls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'chat', sessionId: '姐姐' },
      featureId: 'app.resource.read',
      title: '读取姐姐聊天',
      response: '我先读取姐姐的聊天。',
    }),
    reactPlanner: async (input, context) => {
      reactCalls.push({ input, context });
      if (reactCalls.length === 1) {
        return {
          ok: true,
          action: 'tool',
          toolName: 'app.read_resource',
          args: { resource: 'chat', sessionId: '发小' },
          featureId: 'app.resource.read',
          title: '读取发小聊天',
          response: '我再读取发小的聊天。',
        };
      }
      if (reactCalls.length === 2) {
        return {
          ok: true,
          action: 'tool',
          toolName: 'chat.send_message',
          args: { sessionId: '姐姐', content: '我吃过了，你也早点睡。' },
          featureId: 'chat.send_message',
          title: '回复姐姐',
          response: '我先回复姐姐。',
        };
      }
      if (reactCalls.length === 3) {
        return {
          ok: true,
          action: 'tool',
          toolName: 'chat.send_message',
          args: { sessionId: '发小', content: '在吗？' },
          featureId: 'chat.send_message',
          title: '回复发小',
          response: '我再回复发小。',
        };
      }
      return {
        ok: true,
        action: 'final',
        message: '已经分别回复姐姐和发小。',
      };
    },
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        if (toolName === 'app.read_resource') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, resource: 'chat', sessionId: args.sessionId, messages: [] },
            summary: 'read resource chat',
          };
        }
        if (toolName === 'chat.send_message') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, sent: true, requestTriggered: true, sessionId: args.sessionId },
            summary: `sent message to ${args.sessionId}`,
          };
        }
        throw new Error(`unexpected tool ${toolName}`);
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('根据刚才读取到的回应，分别回复姐姐和发小');
  assert.equal(result.ok, true);
  assert.equal(result.message, '已经分别回复姐姐和发小。');
  assert.deepEqual(calls.map(call => `${call.toolName}:${call.args.sessionId}`), [
    'app.read_resource:姐姐',
    'app.read_resource:发小',
    'chat.send_message:姐姐',
    'chat.send_message:发小',
  ]);
  assert.equal(reactCalls.length, 4);
  console.log('ok - maid assistant agent continues ReAct after chat sends');
}

{
  const calls = [];
  const reactCalls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'chat', sessionName: '精灵女王' },
      featureId: 'app.resource.read',
      title: '读取聊天消息',
      response: '我先读取聊天消息。',
    }),
    reactPlanner: async (input, context) => {
      reactCalls.push({ input, context });
      if (reactCalls.length === 1) {
        return {
          ok: true,
          action: 'tool',
          toolName: 'app.read_resource',
          args: { resource: 'chat', sessionId: 's1' },
          featureId: 'app.resource.read',
          title: '重新读取聊天消息',
          response: '我换成正确的会话参数再试一次。',
        };
      }
      return {
        ok: true,
        action: 'final',
        message: '精灵女王最后回复了「晚上好」。',
      };
    },
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        if (calls.length === 1) {
          throw new Error('Agent tool arguments invalid: args.sessionName is not allowed');
        }
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true, messages: [{ role: 'assistant', rawOriginal: '晚上好。' }] },
          summary: 'read resource chat',
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('女王最后回了我什么？');
  assert.equal(result.ok, true);
  assert.match(result.message, /晚上好/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.sessionName, '精灵女王');
  assert.equal(calls[1].args.sessionId, 's1');
  assert.equal(result.steps[0].status, 'failed');
  assert.equal(result.steps[1].status, 'succeeded');
  console.log('ok - maid assistant agent can repair tool args through ReAct loop');
}

{
  const calls = [];
  const agent = createMaidAssistantAgent({
    maxReactSteps: 2,
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'worldbook', name: '异世界 世界书' },
      featureId: 'app.resource.read',
      title: '读取世界书',
      response: '我先读取世界书。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'tool',
      toolName: 'app.read_resource',
      args: { resource: 'worldbook', name: '异世界 世界书', includeContent: true },
      featureId: 'app.resource.read',
      title: '继续读取世界书',
      response: '我继续读取正文。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true, resource: 'worldbook', entryCount: 3 },
          summary: 'read resource worldbook',
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('帮我完整检查异世界世界书');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.continuable, true);
  assert.equal(result.reactStoppedReason, 'max_steps_reached');
  assert.match(result.continueHint, /下一步建议工具/);
  assert.equal(result.reactStepBudget.maxSteps, 2);
  assert.equal(calls.length, 2);
  console.log('ok - maid assistant agent returns continuable max-step interruption');
}

{
  const agent = createMaidAssistantAgent({
    repeatedFailureLimit: 3,
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'chat', sessionName: '精灵女王' },
      featureId: 'app.resource.read',
      title: '读取聊天消息',
      response: '我先读取聊天消息。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'tool',
      toolName: 'app.read_resource',
      args: { resource: 'chat', sessionName: '精灵女王' },
      featureId: 'app.resource.read',
      title: '再次读取聊天消息',
      response: '我再试一次。',
    }),
    toolRegistry: {
      executeTool: async () => {
        throw new Error('Agent tool arguments invalid: args.sessionName is not allowed');
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('女王最后回了我什么？');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'repeated_tool_failure');
  assert.equal(result.continuable, false);
  assert.equal(result.steps.length, 3);
  assert.match(result.message, /连续失败 3 次/);
  console.log('ok - maid assistant agent stops repeated identical tool failures');
}

{
  const calls = [];
  const reactCalls = [];
  const statuses = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'worldbook.update_entries',
      args: {
        name: '异世界 世界书',
        updates: [{ entryTitle: '精灵女王', content: '扩展后的精灵女王设定。' }],
      },
      featureId: 'worldbook.update_entries',
      title: '修改世界书条目',
      response: '我来更新这个条目。',
    }),
    reactPlanner: async (input, context) => {
      reactCalls.push({ input, context });
      return {
        ok: true,
        action: 'final',
        message: '已经更新并读回确认，世界书里仍有 3 个条目。',
      };
    },
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        if (toolName === 'worldbook.update_entries') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, worldbookId: '异世界 世界书', updatedEntryCount: 1, entryCount: 3 },
            summary: 'updated worldbook entries',
          };
        }
        if (toolName === 'worldbook.read') {
          return {
            toolName,
            status: 'succeeded',
            result: {
              ok: true,
              name: args.name,
              entryCount: 3,
              entries: [{ title: '精灵女王', contentLength: 12 }],
            },
            summary: 'read worldbook for verification',
          };
        }
        throw new Error(`unexpected tool ${toolName}`);
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('把精灵女王条目替换成扩展版', {
    onStatus: status => statuses.push(status),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.toolName), ['worldbook.update_entries', 'worldbook.read']);
  assert.equal(calls[1].args.name, '异世界 世界书');
  assert.equal(calls[1].args.includeContent, true);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1].metadata.verificationFor, 'worldbook.update_entries');
  assert.equal(reactCalls.length, 1);
  assert.deepEqual(reactCalls[0].context.maidReactSteps.map(step => step.toolName), ['worldbook.update_entries', 'worldbook.read']);
  assert.equal(statuses.some(status => status.stage === 'verifying'), true);
  assert.match(result.message, /读回确认/);
  console.log('ok - maid assistant agent verifies worldbook writes before final answer');
}

{
  const calls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'worldbook.create',
      args: {
        name: '测试世界书',
        entries: [
          { title: '超级温柔大姐姐', content: '大姐姐设定。' },
          { title: '傲娇大小姐青梅竹马', content: '青梅竹马设定。' },
        ],
      },
      featureId: 'worldbook.create',
      title: '创建测试世界书',
      response: '我来创建测试世界书。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'tool',
      toolName: 'worldbook.create',
      args: {
        name: '测试世界书',
        entries: [
          { title: '超级温柔大姐姐', content: '重复的大姐姐设定。' },
          { title: '傲娇大小姐青梅竹马', content: '重复的青梅竹马设定。' },
        ],
      },
      featureId: 'worldbook.create',
      title: '再次创建测试世界书',
      response: '我再创建一次。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        if (toolName === 'worldbook.create') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, worldbookId: args.name, addedEntryCount: args.entries.length, entryCount: 2 },
            summary: 'saved worldbook',
          };
        }
        if (toolName === 'worldbook.read') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, name: args.name, entryCount: 2, entries: args.includeContent ? [] : [] },
            summary: 'read worldbook',
          };
        }
        throw new Error(`unexpected tool ${toolName}`);
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('创建测试世界书');
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.toolName), ['worldbook.create', 'worldbook.read']);
  assert.equal(result.finalDecision.source, 'duplicate_write_guard');
  assert.match(result.message, /避免重复追加/);
  console.log('ok - maid assistant agent stops duplicate verified worldbook writes');
}

{
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.read_resource',
      args: { resource: 'worldbook', name: '青梅竹马' },
      featureId: 'app.resource.read',
      title: '读取世界书',
      response: '我先读取世界书。',
    }),
    reactPlanner: async () => ({
      ok: false,
      reason: 'invalid_model_react_decision',
      message: '模型没有返回有效 ReAct 决策。',
    }),
    toolRegistry: {
      executeTool: async () => ({
        toolName: 'app.read_resource',
        status: 'succeeded',
        result: { ok: true, resource: 'worldbook', worldbooks: [{ id: '青梅竹马', entryCount: 4 }] },
        summary: 'read resource worldbook',
      }),
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('帮我看青梅竹马世界书');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.partial, true);
  assert.equal(result.continuable, true);
  assert.equal(result.reactStoppedReason, 'invalid_model_react_decision');
  assert.match(result.continueHint, /用户原始目标/);
  assert.match(result.message, /没有完成最终回答/);
  console.log('ok - maid assistant agent reports ReAct interruption instead of false success');
}

{
  const agent = createMaidAssistantAgent({
    toolRegistry: {
      executeTool: async () => {
        throw new Error('should not run');
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty_input');
  console.log('ok - maid assistant agent requires planner input without calling tools');
}

{
  const agent = createMaidAssistantAgent({
    toolRegistry: {
      executeTool: async () => {
        throw new Error('should not run');
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'maid_planner_required');
  console.log('ok - maid assistant agent does not use local rules by default');
}

{
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: false,
      status: 'unsupported',
      reason: 'unsupported_intent',
      message: '这个请求还没有接入女仆工具。',
    }),
    chatResponder: async (input, context) => ({
      ok: true,
      status: 'responded',
      source: 'test_chat',
      message: `你好，${input} / ${context.sessionId}`,
    }),
    toolRegistry: {
      executeTool: async () => {
        throw new Error('should not run');
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('你好啊', { sessionId: 's1' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'responded');
  assert.equal(result.responseType, 'chat');
  assert.equal(result.source, 'test_chat');
  assert.match(result.message, /你好啊/);
  console.log('ok - maid assistant agent uses chat responder for unsupported plain input');
}

{
  const calls = [];
  const reactContexts = [];
  let chatCalls = 0;
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: false,
      status: 'unsupported',
      reason: 'invalid_model_plan',
      message: '模型没有返回有效计划。',
    }),
    reactPlanner: async (input, context) => {
      reactContexts.push(context);
      if (!context.maidReactSteps?.length) {
        return {
          ok: true,
          action: 'tool',
          toolName: 'worldbook.read',
          args: { name: '异世界 世界书', includeContent: true },
          featureId: 'worldbook.read',
          title: '读取世界书',
          response: '我重新读取世界书。',
        };
      }
      return {
        ok: true,
        action: 'final',
        message: '已经重新读回世界书内容。',
      };
    },
    chatResponder: async () => {
      chatCalls += 1;
      return { ok: true, status: 'responded', message: '不该进入聊天。' };
    },
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true, name: args.name, entryCount: 3 },
          summary: 'read worldbook',
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('刚失败了，再试一次');
  assert.equal(result.ok, true);
  assert.equal(result.responseType, 'react');
  assert.equal(chatCalls, 0);
  assert.deepEqual(calls.map(call => call.toolName), ['worldbook.read']);
  assert.equal(calls[0].args.includeContent, true);
  assert.equal(reactContexts[0].plannerFailure.reason, 'invalid_model_plan');
  assert.equal(reactContexts[1].maidReactSteps.length, 1);
  assert.match(result.message, /读回/);
  console.log('ok - maid assistant agent lets ReAct recover invalid planner continuations');
}

{
  const calls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'persona.create',
      args: { name: '精灵女王', setActive: true },
      featureId: 'persona.create',
      title: '创建角色卡',
      response: '我来创建角色卡。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'final',
      message: '角色卡已创建并读回确认。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        if (toolName === 'persona.create') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, personaId: 'p-1', name: '精灵女王' },
            summary: 'created persona',
          };
        }
        if (toolName === 'app.read_resource') {
          return {
            toolName,
            status: 'succeeded',
            result: { ok: true, resource: 'persona', items: [{ id: 'p-1', name: '精灵女王', active: true }] },
            summary: 'read personas',
          };
        }
        throw new Error(`unexpected tool ${toolName}`);
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('创建角色卡精灵女王');
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.toolName), ['persona.create', 'app.read_resource']);
  assert.equal(calls[1].args.resource, 'persona');
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1].metadata.verificationFor, 'persona.create');
  assert.equal(result.steps[1].metadata.verificationSuccess, '角色卡列表包含新建的角色卡');
  console.log('ok - maid assistant agent auto-verifies catalog-declared write tools');
}

{
  const calls = [];
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'session.set_wallpaper',
      args: { sessionId: 'A' },
      featureId: 'session.wallpaper.set',
      title: '设置聊天室壁纸',
      response: '我来设置壁纸。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'final',
      message: '壁纸已应用。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        return {
          toolName,
          status: 'succeeded',
          result: { ok: true, applied: true },
          summary: 'wallpaper applied',
        };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('把这张图设为壁纸');
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.toolName), ['session.set_wallpaper'], 'verification: null 的工具不应触发读回');
  console.log('ok - maid assistant agent skips auto-verification for result-authoritative tools');
}

{
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'maid.todo.write',
      args: { todos: [{ content: 'a' }, { content: 'b' }, { content: 'c' }, { content: 'd' }] },
      featureId: 'maid.todo',
      title: '记录任务清单',
      response: '我先记录任务清单。',
    }),
    reactPlanner: (() => {
      let round = 0;
      // 工具名与 args 每轮变化：预算测试需要跑满步数，不能触发重复/同工具 guard
      const toolNames = ['app.open_panel', 'app.read_resource', 'app.get_current_state'];
      return async () => {
        round += 1;
        return {
          ok: true,
          action: 'tool',
          toolName: toolNames[round % toolNames.length],
          args: { panel: `worldbook-${round}` },
          featureId: 'worldbook.open',
          title: '继续执行',
          response: '继续。',
        };
      };
    })(),
    toolRegistry: { executeTool: async () => ({ ok: true }) },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('复合任务');
  assert.equal(result.status, 'interrupted');
  assert.equal(result.reactStepBudget.maxSteps, 30, '4 项清单应获得 10+4*5=30 步预算');
  assert.equal(result.continuable, true);
  console.log('ok - maid.todo.write 开场的复合任务获得扩展步数预算（4 项 -> 30 步）');
}

{
  // 同工具同参数连续成功 3 次 = 原地转圈，应中断且可继续
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'maid.todo.read',
      args: {},
      featureId: 'maid.todo',
      title: '查看清单',
      response: '我看看清单。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'tool',
      toolName: 'maid.todo.read',
      args: {},
      featureId: 'maid.todo',
      title: '再看清单',
      response: '再核对一次。',
    }),
    toolRegistry: { executeTool: async toolName => ({ toolName, status: 'succeeded', result: { ok: true }, summary: 'todos listed' }) },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('核对清单');
  assert.equal(result.status, 'interrupted');
  assert.equal(result.failureCode, 'repeated_tool_loop', '应以 repeated_tool_loop 中断');
  assert.equal(result.continuable, true);
  assert.ok((result.steps || []).length <= 4, '应在少量重复后即中断而不是耗尽预算');
  console.log('ok - 同参数连续成功重复触发防转圈中断');
}

{
  // 同工具连续（参数不同）超过 8 次 = 单工具打转，应中断可继续
  let round = 0;
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true, toolName: 'web.search_images', args: { query: 'q0' },
      featureId: 'web.search', title: '搜索', response: '搜。',
    }),
    reactPlanner: async () => ({
      ok: true, action: 'tool', toolName: 'web.search_images',
      args: { query: `q${round += 1}` },
      featureId: 'web.search', title: '再搜', response: '再搜。',
    }),
    toolRegistry: { executeTool: async (toolName, args) => ({ toolName, status: 'succeeded', result: { ok: true, images: [] }, summary: `searched ${args?.query}` }) },
    maxReactSteps: 40,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('找图', { maxReactSteps: 40 });
  assert.equal(result.failureCode, 'same_tool_overuse');
  assert.ok((result.steps || []).length <= 10, '应在 8 次左右中断');
  assert.equal(result.continuable, true);
  console.log('ok - 同工具连续超限触发打转中断');
}

{
  let call = 0;
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'app.open_panel',
      args: { panel: 'worldbook' },
      featureId: 'worldbook.open',
      title: '打开世界书',
      response: '我来打开世界书。',
    }),
    reactPlanner: async () => ({
      ok: true,
      action: 'tool',
      toolName: 'app.open_panel',
      args: { panel: 'memory' },
      featureId: 'memory.open',
      title: '继续',
      response: '继续。',
    }),
    toolRegistry: {
      executeTool: async (toolName, args) => {
        call += 1;
        if (call === 2) {
          return { toolName, status: 'failed', result: { ok: false, reason: 'memory panel busy' }, summary: 'memory panel busy' };
        }
        return { toolName, status: 'succeeded', result: { ok: true }, summary: `opened ${args?.panel}` };
      },
    },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书和记忆', { maxReactSteps: 3, repeatedFailureLimit: 8 });
  assert.equal(result.status, 'interrupted', '应因步数耗尽中断（最后一步成功）');
  assert.equal(result.continuable, true);
  assert.match(result.continueHint, /已完成步骤（恢复后不要重复执行，也不要报告为未完成）：/);
  assert.match(result.continueHint, /opened worldbook/);
  assert.match(result.continueHint, /失败步骤：/);
  assert.match(result.continueHint, /memory panel busy/);
  console.log('ok - continueHint 附带已完成与失败步骤清单');
}

{
  // 等待工具确认期间 run 应标记 waiting_permission，确认后恢复 running
  const statusLog = [];
  const runtimeMock = {
    startRun: () => ({ id: 'run-1' }),
    finishRun: () => {},
    startStep: () => ({ id: 'step-1' }),
    finishStep: () => {},
    updateRun: (id, patch) => { statusLog.push(patch?.status); },
    executeTool: async (toolName, args, context) => {
      context.onToolConfirmationPending?.({ toolName });
      await new Promise(r => setTimeout(r, 5));
      context.onToolConfirmationResolved?.({ toolName });
      return { toolName, status: 'succeeded', result: { ok: true }, summary: 'done' };
    },
  };
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true, toolName: 'session.set_wallpaper', args: { target: 'x' },
      featureId: 'session.wallpaper.set', title: '设置', response: '我来设置。',
    }),
    reactPlanner: async () => ({ ok: true, action: 'final', message: '完成', response: '完成' }),
    agentTaskRuntime: runtimeMock,
    toolRegistry: { executeTool: async () => ({ ok: true }) },
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('设置壁纸');
  assert.equal(result.ok, true);
  assert.deepEqual(statusLog.filter(s => s === 'waiting_permission').length, 1, '确认等待应标记一次');
  const waitIdx = statusLog.indexOf('waiting_permission');
  const resumeIdx = statusLog.indexOf('running');
  assert.ok(waitIdx >= 0 && resumeIdx > waitIdx, '确认后应恢复 running');
  console.log('ok - 工具确认等待期间 run 标记 waiting_permission 并在确认后恢复');
}
