import assert from 'node:assert/strict';

import {
  buildAgentMessagePartViewModel,
  refreshAgentMessagePartsView,
} from '../../src/scripts/ui/agent-message-parts-view.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.textContent = '';
      this.parentNode = null;
      this.open = false;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    replaceChildren(...children) {
      this.children = [];
      children.forEach(child => this.appendChild(child));
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const view = buildAgentMessagePartViewModel([
    {
      type: 'agent_status',
      runId: 'run-1',
      status: 'running',
      title: 'Memory Update',
      summary: 'syncing memory',
      source: 'memory-agent',
      createdAt: 1000,
      updatedAt: 1200,
      metadata: { attempt: 1 },
    },
    {
      type: 'agent_step',
      runId: 'run-1',
      stepId: 'step-1',
      status: 'succeeded',
      title: 'write',
      errorMessage: '',
    },
    {
      type: 'agent_tool',
      runId: 'run-1',
      toolCallId: 'tool-1',
      status: 'failed',
      title: 'contact_profile.write',
      errorMessage: 'permission denied',
    },
  ]);

  assert.equal(view.length, 3);
  assert.equal(view[0].open, true);
  assert.equal(view[0].summaryLabel.includes('[RUNNING] Memory Update'), true);
  assert.equal(view[0].statusLabel, 'running');
  assert.equal(view[0].metaLabel.includes('run=run-1'), true);
  assert.equal(view[0].summaryLabel.includes('run=run-1'), true);
  assert.equal(view[0].rows.some(([label, value]) => label === 'metadata' && value === '{"attempt":1}'), true);
  assert.equal(view[1].open, false);
  assert.equal(view[1].statusLabel, 'done');
  assert.equal(view[2].open, true);
  assert.equal(view[2].statusLabel, 'failed');
  assert.equal(view[2].rows.some(([label, value]) => label === 'error' && value === 'permission denied'), true);
  console.log('ok - buildAgentMessagePartViewModel formats summaries rows and expanded state');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshAgentMessagePartsView({
    container,
    parts: [],
    documentRef,
  });

  assert.equal(result.count, 0);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'No agent message parts');
  assert.equal(container.style.cssText.includes('display:grid'), true);
  console.log('ok - refreshAgentMessagePartsView renders empty state');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshAgentMessagePartsView({
    container,
    parts: [
      {
        type: 'agent_status',
        runId: 'run-2',
        status: 'running',
        title: 'Image Director',
        summary: 'generating prompt',
      },
      {
        type: 'agent_tool',
        runId: 'run-2',
        toolCallId: 'tool-2',
        status: 'succeeded',
        title: 'image.generate',
        metadata: { provider: 'local' },
      },
    ],
    documentRef,
  });

  assert.equal(result.count, 2);
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].tagName, 'details');
  assert.equal(container.children[0].open, true);
  assert.equal(container.children[0].children[0].tagName, 'summary');
  assert.equal(container.children[0].style.cssText.includes('flex:0 0 auto'), true);
  assert.equal(container.children[0].children[0].children.length, 3);
  assert.equal(container.children[0].children[0].children[1].children[0].textContent, 'Image Director');
  assert.equal(container.children[0].children[0].children[2].textContent, 'running');
  assert.equal(container.children[1].open, false);
  assert.equal(container.children[1].children[1].children.some(row => row.textContent === 'metadata: {"provider":"local"}'), true);
  console.log('ok - refreshAgentMessagePartsView renders read-only collapsible details');
}
