import assert from 'node:assert/strict';

import {
  buildProviderRealRunnerDebugViewModel,
  refreshProviderRealRunnerDebugView,
} from '../../src/scripts/ui/provider-real-runner-debug-view.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.textContent = '';
      this.parentNode = null;
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

const buildDiagnostics = (overrides = {}) => ({
  status: {
    enabled: false,
    allowedTools: ['contact_profile.list'],
    provider: 'debug-provider',
    model: 'debug-model',
  },
  history: [
    {
      kind: 'stream_delta',
      status: 'succeeded',
      provider: 'anthropic',
      model: 'claude-x',
      sessionId: 's1',
      realRunnerDebug: {
        status: 'armed',
        mode: 'real_runner',
        experimentEnabled: true,
        providerRunnerInjected: true,
        providerClientInjected: false,
        llmClientInjected: true,
        adapterEnabled: true,
        allowRunnerNetwork: true,
        runnerFacadeEnabled: true,
        writesChat: false,
        allowedTools: ['contact_profile.list'],
        modelContextPolicy: 'allowlist_only',
        rollback: 'set runnerMode=read_only_capture or remove providerRunner/providerClient',
      },
      runnerModePlan: {
        mode: 'real_runner',
        status: 'ready',
        runnerFacadeEnabled: true,
        network: true,
        writesChat: false,
      },
      runnerFacade: {
        status: 'succeeded',
        network: true,
        writesChat: false,
        runnerBoundary: {
          status: 'ready',
          capability: {
            runnerKind: 'provider_native',
          },
          nativeRunnerContract: {
            contractKind: 'anthropic_messages_tool_result',
          },
        },
      },
      ...overrides,
    },
  ],
});

{
  const model = buildProviderRealRunnerDebugViewModel(buildDiagnostics());
  assert.equal(model.hasData, true);
  assert.equal(model.status, 'armed');
  assert.equal(model.armed, true);
  assert.equal(model.title, 'Real Runner Armed');
  assert.equal(model.runnerSource, 'llmClient');
  assert.equal(model.runnerCapability, 'provider_native');
  assert.equal(model.nativeContract, 'anthropic_messages_tool_result');
  assert.equal(model.allowedTools, 'contact_profile.list');
  assert.equal(model.gates.find(gate => gate.key === 'network').ok, true);
  assert.equal(model.gates.find(gate => gate.key === 'writesChat').ok, true);
  console.log('ok - buildProviderRealRunnerDebugViewModel summarizes armed real runner gates');
}

{
  const model = buildProviderRealRunnerDebugViewModel(buildDiagnostics({
    realRunnerDebug: {
      status: 'blocked',
      mode: 'read_only_capture',
      providerRunnerInjected: false,
      providerClientInjected: false,
      llmClientInjected: false,
      adapterEnabled: false,
      allowRunnerNetwork: false,
      runnerFacadeEnabled: false,
      writesChat: false,
      allowedTools: ['contact_profile.list'],
      modelContextPolicy: 'allowlist_only',
    },
    runnerModePlan: {
      mode: 'read_only_capture',
      status: 'ready',
      runnerFacadeEnabled: false,
      network: false,
      writesChat: false,
    },
    runnerFacade: {
      status: 'disabled',
      network: false,
      writesChat: false,
    },
  }));
  assert.equal(model.armed, false);
  assert.equal(model.title, 'Real Runner Locked');
  assert.equal(model.runnerSource, 'none');
  assert.equal(model.gates.find(gate => gate.key === 'network').value, 'blocked');
  assert.equal(model.gates.find(gate => gate.key === 'writesChat').ok, true);
  console.log('ok - buildProviderRealRunnerDebugViewModel summarizes blocked real runner gates');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshProviderRealRunnerDebugView({
    container,
    diagnostics: buildDiagnostics(),
    documentRef,
  });
  assert.equal(result.model.armed, true);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'section');
  assert.equal(container.children[0].children[0].children[1].children[0].textContent, 'Real Runner Armed');
  assert.equal(container.children[0].children[0].children[2].textContent, 'armed');
  assert.equal(container.children[0].children[1].children[0].children.length, 7);
  assert.equal(container.style.cssText.includes('display:grid'), true);
  console.log('ok - refreshProviderRealRunnerDebugView renders read-only real runner state block');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshProviderRealRunnerDebugView({
    container,
    diagnostics: { status: {}, history: [] },
    documentRef,
  });
  assert.equal(result.model.hasData, false);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'Real runner: no diagnostics yet');
  console.log('ok - refreshProviderRealRunnerDebugView renders empty real runner state');
}
