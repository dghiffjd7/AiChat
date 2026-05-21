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
