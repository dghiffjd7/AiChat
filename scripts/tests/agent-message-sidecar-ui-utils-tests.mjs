import assert from 'node:assert/strict';

import {
  buildAgentMessageSidecarElement,
  buildAgentMessageSidecarSignature,
  getAgentMessagePartsForMessage,
} from '../../src/scripts/ui/chat/agent-message-sidecar-ui-utils.js';
import { buildProviderToolMessageParts } from '../../src/scripts/agent/provider-tool-call-parts.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.dataset = {};
      this.open = false;
      this.style = { cssText: '' };
      this.listeners = {};
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }

    click() {
      (this.listeners.click || []).forEach(handler => handler({ currentTarget: this }));
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

const collectElements = (node, predicate, out = []) => {
  if (!node) return out;
  if (predicate(node)) out.push(node);
  (node.children || []).forEach(child => collectElements(child, predicate, out));
  return out;
};

{
  const parts = [{ type: 'agent_status', runId: 'run-1', status: 'running' }];
  assert.equal(getAgentMessagePartsForMessage({ meta: { agentMessageParts: parts } }), parts);
  assert.deepEqual(getAgentMessagePartsForMessage({ agentMessageParts: parts }), parts);
  assert.deepEqual(getAgentMessagePartsForMessage({ meta: {} }), []);
  console.log('ok - getAgentMessagePartsForMessage reads explicit message sidecar payloads only');
}

{
  const running = buildAgentMessageSidecarSignature({
    meta: {
      agentMessageParts: [{ type: 'agent_status', runId: 'run-1', status: 'running', title: 'Memory' }],
    },
  });
  const done = buildAgentMessageSidecarSignature({
    meta: {
      agentMessageParts: [{ type: 'agent_status', runId: 'run-1', status: 'succeeded', title: 'Memory' }],
    },
  });
  assert.notEqual(running, '');
  assert.notEqual(running, done);
  console.log('ok - buildAgentMessageSidecarSignature changes when agent status changes');
}

{
  const documentLike = createFakeDocument();
  const empty = buildAgentMessageSidecarElement({
    documentLike,
    message: { meta: {} },
  });
  assert.equal(empty, null);

  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      meta: {
        agentMessageParts: [
          { type: 'agent_status', runId: 'run-1', status: 'running', title: 'Memory', summary: 'updating' },
          { type: 'agent_tool', runId: 'run-1', toolCallId: 'tool-1', status: 'succeeded', title: 'memory.write' },
        ],
      },
    },
  });
  assert.equal(element.className, 'chat-agent-sidecar');
  assert.equal(element.dataset.agentPartsCount, '2');
  assert.equal(element.children[0].className, 'chat-agent-sidecar-header');
  assert.equal(element.children[1].tagName, 'DETAILS');
  assert.equal(element.children[1].style.cssText.includes('flex:0 0 auto'), true);
  assert.equal(element.children[1].children[0].children[1].textContent, 'Memory');
  assert.equal(element.children[2].children[0].children[2].textContent, 'done');
  console.log('ok - buildAgentMessageSidecarElement renders compact non-shrinking chat sidecar rows');
}

{
  const documentLike = createFakeDocument();
  const providerParts = buildProviderToolMessageParts({
    toolCall: {
      id: 'provider-call-1',
      toolName: 'memory.write',
      arguments: { text: 'remember' },
    },
    permission: { permissions: ['memory:write'] },
    result: { status: 'succeeded', result: { changed: 1 } },
    now: () => 6000,
  });
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      meta: { agentMessageParts: providerParts },
    },
  });
  assert.equal(element.dataset.agentPartsCount, '3');
  assert.equal(element.children[1].children[0].children[1].textContent, 'memory.write');
  assert.equal(element.children[2].children[0].children[2].textContent, 'ask');
  assert.equal(element.children[3].children[0].children[2].textContent, 'done');
  console.log('ok - buildAgentMessageSidecarElement renders provider tool call permission and result parts');
}

{
  const documentLike = createFakeDocument();
  const providerParts = buildProviderToolMessageParts({
    toolCall: {
      id: 'provider-call-2',
      toolName: 'memory.write',
      arguments: { text: 'remember' },
    },
    permission: {
      permissions: ['memory:write'],
      pendingPermissionId: 'pending-sidecar-1',
    },
    now: () => 7000,
  });
  const actions = [];
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      id: 'm-provider-permission',
      meta: { agentMessageParts: providerParts },
    },
    onProviderToolPermissionAction: request => actions.push(request),
  });
  const permissionBody = element.children[2].children[1];
  const actionRow = permissionBody.children[5];
  assert.equal(permissionBody.children[4].textContent, 'approval: message_part · default=deny');
  assert.equal(actionRow.children.length, 3);
  assert.equal(actionRow.children[0].textContent, 'Allow Once');
  actionRow.children[0].click();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'allow_once');
  assert.equal(actions[0].part.type, 'provider_tool_permission_request');
  assert.equal(actions[0].part.metadata.pendingPermissionId, 'pending-sidecar-1');
  console.log('ok - buildAgentMessageSidecarElement exposes deferred provider permission actions');
}

{
  const documentLike = createFakeDocument();
  const providerParts = buildProviderToolMessageParts({
    toolCall: {
      id: 'provider-call-3',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
      sessionId: 's-sidecar',
    },
    permission: {
      permissions: ['storage'],
      pendingPermissionId: 'pending-sidecar-continue-1',
    },
    now: () => 8000,
  });
  const actions = [];
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      id: 'm-provider-continuation',
      meta: { agentMessageParts: providerParts },
    },
    onProviderToolPermissionAction: () => {},
    onProviderToolContinuationAction: request => actions.push(request),
  });
  const permissionBody = element.children[2].children[1];
  const continuationRow = permissionBody.children[6];
  assert.equal(continuationRow.children.length, 2);
  assert.equal(continuationRow.children[0].textContent, 'Preview Continue');
  assert.equal(continuationRow.children[0].dataset.providerToolContinuationAction, 'preview_continue');
  assert.equal(continuationRow.children[1].textContent, 'Disable Gate');
  continuationRow.children[0].click();
  continuationRow.children[1].click();
  assert.equal(actions.length, 2);
  assert.equal(actions[0].action, 'preview_continue');
  assert.equal(actions[0].part.metadata.pendingPermissionId, 'pending-sidecar-continue-1');
  assert.equal(actions[1].action, 'disable_gate');
  console.log('ok - buildAgentMessageSidecarElement exposes provider continuation preview and rollback actions');
}

{
  const documentLike = createFakeDocument();
  const actions = [];
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      id: 'm-chat-format',
      meta: {
        agentMessageParts: [{
          id: 'chat-format-guardian:m-chat-format',
          type: 'agent_status',
          runId: 'run:chat-format-guardian:m-chat-format',
          kind: 'chat_format.validate',
          source: 'chat-format-guardian',
          status: 'waiting_permission',
          title: '聊天格式待确认',
          summary: '1 event draft · 0 errors · 1 warning',
          metadata: {
            inputSuggestion: '请重写上一条回复，严格遵守当前聊天/动态输出格式。',
            decisionActions: [
              {
                id: 'apply_repair',
                label: '应用修复',
                enabled: true,
                repairCandidate: { replacementText: '<我和菲伦的私聊>\n菲伦--你好--22:10\n</我和菲伦的私聊>' },
              },
              { id: 'swipe_retry', label: '重试生成', enabled: true },
              { id: 'review_original', label: '查看原文', enabled: true },
              { id: 'edit_user_input_suggestion', label: '修改输入建议', enabled: true, suggestion: '请重写上一条回复。' },
              { id: 'open_agent_center', label: 'Agent Center', enabled: true },
            ],
          },
        }],
      },
    },
    onChatFormatGuardianAction: request => actions.push(request),
  });
  const buttons = collectElements(element, node => Boolean(node.dataset?.chatFormatGuardianAction));
  assert.equal(buttons.length, 5);
  assert.deepEqual(buttons.map(button => button.textContent), ['应用修复', '重试生成', '查看原文', '修改输入建议', 'Agent Center']);
  buttons[0].click();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'apply_repair');
  assert.equal(actions[0].actionMeta.repairCandidate.replacementText.includes('菲伦--你好'), true);
  assert.equal(actions[0].part.kind, 'chat_format.validate');
  console.log('ok - buildAgentMessageSidecarElement exposes chat format guardian review actions');
}

{
  const documentLike = createFakeDocument();
  const actions = [];
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      id: 'm-body-quality',
      meta: {
        agentMessageParts: [{
          id: 'chat-body-quality:m-body-quality',
          type: 'agent_status',
          runId: 'run:chat-body-quality:m-body-quality',
          kind: 'chat_body_quality.review',
          source: 'chat-body-quality-guardian',
          status: 'waiting_permission',
          title: '正文可优化',
          summary: '1 body quality issue(s)',
          metadata: {
            decisionActions: [
              {
                id: 'apply_body_patch',
                label: '应用优化',
                enabled: true,
                patchCandidate: {
                  available: true,
                  id: 'body_quality_deterministic_cleanup',
                  summary: '移除 1 行连续重复',
                },
              },
              { id: 'review_original', label: '查看原文', enabled: true },
              { id: 'open_agent_center', label: 'Agent Center', enabled: true },
            ],
          },
        }],
      },
    },
    onChatFormatGuardianAction: request => actions.push(request),
  });
  const buttons = collectElements(element, node => Boolean(node.dataset?.chatFormatGuardianAction));
  assert.deepEqual(buttons.map(button => button.textContent), ['应用优化', '查看原文', 'Agent Center']);
  buttons[0].click();
  buttons[1].click();
  buttons[2].click();
  assert.equal(actions.length, 3);
  assert.equal(actions[0].action, 'apply_body_patch');
  assert.equal(actions[0].part.kind, 'chat_body_quality.review');
  assert.equal(actions[0].actionMeta.patchCandidate.replacementText, undefined);
  assert.equal(actions[1].action, 'review_original');
  assert.equal(actions[2].action, 'open_agent_center');
  console.log('ok - buildAgentMessageSidecarElement exposes chat body quality review actions');
}

{
  const documentLike = createFakeDocument();
  const translations = new Map([
    ['聊天格式待确认', 'Chat Format Needs Review'],
    ['应用修复', 'Apply Repair'],
    ['查看原文', 'View Original'],
    ['ask', 'Review'],
  ]);
  const element = buildAgentMessageSidecarElement({
    documentLike,
    message: {
      id: 'm-localized-sidecar',
      meta: {
        agentMessageParts: [{
          type: 'agent_status',
          status: 'waiting_permission',
          title: '聊天格式待确认',
          summary: '保留这段模型摘要',
          metadata: {
            decisionActions: [
              { id: 'apply_repair', label: '应用修复', enabled: true },
              { id: 'review_original', label: '查看原文', enabled: true },
            ],
          },
          kind: 'chat_format.validate',
        }],
      },
    },
    translateText: value => translations.get(String(value)) || String(value),
    onChatFormatGuardianAction: () => {},
  });
  assert.equal(element.children[1].children[0].children[1].textContent, 'Chat Format Needs Review');
  assert.equal(element.children[1].children[0].children[2].textContent, 'Review');
  const buttons = collectElements(element, node => Boolean(node.dataset?.chatFormatGuardianAction));
  assert.deepEqual(buttons.map(button => button.textContent), ['Apply Repair', 'View Original']);
  assert.equal(collectElements(element, node => node.textContent.includes('保留这段模型摘要')).length > 0, true);
  console.log('ok - chat sidecar localizes built-in chrome while preserving model-authored summaries');
}
