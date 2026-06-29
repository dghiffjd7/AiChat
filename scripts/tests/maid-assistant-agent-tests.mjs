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
