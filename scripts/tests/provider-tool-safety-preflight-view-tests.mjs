import assert from 'node:assert/strict';

import {
  buildProviderToolSafetyPreflightViewModel,
  refreshProviderToolSafetyPreflightView,
} from '../../src/scripts/ui/provider-tool-safety-preflight-view.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.textContent = '';
      this.parentNode = null;
      this.disabled = false;
      this.listeners = {};
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

    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }

    async click() {
      const handlers = this.listeners.click || [];
      for (const handler of handlers) {
        await handler({ currentTarget: this });
      }
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
      runnerModePlan: {
        mode: 'real_runner',
        status: 'ready',
        runnerFacadeEnabled: true,
        network: true,
        writesChat: false,
      },
      realRunnerDebug: {
        status: 'armed',
        mode: 'real_runner',
        allowRunnerNetwork: true,
        writesChat: false,
        allowedTools: ['contact_profile.list'],
        modelContextPolicy: 'allowlist_only',
        rollback: 'set runnerMode=read_only_capture or remove providerRunner/providerClient',
      },
      loopState: {
        writesChat: false,
      },
      ...overrides,
    },
  ],
});

{
  const model = buildProviderToolSafetyPreflightViewModel({
    status: {
      enabled: false,
      allowedTools: ['contact_profile.list'],
      provider: 'debug-provider',
      model: 'debug-model',
    },
    diagnostics: { status: {}, history: [] },
    permissionRules: [],
    loopGuard: [],
    sessionId: 's1',
  });
  assert.equal(model.experimentEnabled, false);
  assert.equal(model.sessionGateEnabled, false);
  assert.equal(model.networkAllowed, false);
  assert.equal(model.gates.find(gate => gate.key === 'killSwitch').value, 'off');
  assert.equal(model.gates.find(gate => gate.key === 'debugExperiment').value, 'off');
  assert.equal(model.gates.find(gate => gate.key === 'network').value, 'blocked');
  assert.equal(model.gates.find(gate => gate.key === 'permissionUi').value, 'message part');
  assert.equal(model.permissionStrategy.promptModal, false);
  assert.equal(model.gates.find(gate => gate.key === 'sessionRules').value, '0 session rules');
  console.log('ok - buildProviderToolSafetyPreflightViewModel summarizes default safe gates');
}

{
  const model = buildProviderToolSafetyPreflightViewModel({
    status: {
      enabled: true,
      allowedTools: ['contact_profile.list'],
      provider: 'debug-provider',
      model: 'debug-model',
    },
    sessionGate: {
      enabled: true,
      source: 'test',
      allowedTools: ['contact_profile.list'],
      rollback: 'disable providerToolSessionGate for this session',
    },
    diagnostics: buildDiagnostics(),
    permissionRules: [
      {
        layer: 'session',
        decision: 'allow',
        toolName: 'contact_profile.list',
        permission: 'storage',
        sessionId: 's1',
      },
      {
        layer: 'global',
        decision: 'deny',
        toolName: '*',
        permission: '*',
        sessionId: '*',
      },
    ],
    loopGuard: [{ key: 'contact_profile.list:{"limit":1}', allowed: true }],
    sessionId: 's1',
  });
  assert.equal(model.experimentEnabled, true);
  assert.equal(model.sessionGateEnabled, true);
  assert.equal(model.networkAllowed, true);
  assert.equal(model.mode, 'real_runner');
  assert.equal(model.sessionRules.length, 1);
  assert.equal(model.gates.find(gate => gate.key === 'killSwitch').tone, 'warn');
  assert.equal(model.gates.find(gate => gate.key === 'debugExperiment').tone, 'warn');
  assert.equal(model.gates.find(gate => gate.key === 'permissionUi').tone, 'safe');
  assert.equal(model.gates.find(gate => gate.key === 'sessionRules').value, 'allow:contact_profile.list/storage');
  assert.equal(model.gates.find(gate => gate.key === 'loopGuard').value, '1 tracked');
  console.log('ok - buildProviderToolSafetyPreflightViewModel summarizes debug preflight warnings');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshProviderToolSafetyPreflightView({
    container,
    status: { enabled: false, allowedTools: ['contact_profile.list'] },
    diagnostics: { status: {}, history: [] },
    permissionRules: [],
    loopGuard: [],
    sessionId: 's1',
    documentRef,
  });
  assert.equal(result.model.title, 'Provider Tool Safety Preflight');
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'section');
  assert.equal(container.children[0].children[0].children[0].children[0].textContent, 'Provider Tool Safety Preflight');
  assert.equal(container.children[0].children[0].children[1].children[0].textContent, 'default off');
  assert.equal(container.children[0].children[1].children[0].children.length, 10);
  assert.equal(container.style.cssText.includes('display:grid'), true);
  console.log('ok - refreshProviderToolSafetyPreflightView renders safety preflight block');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const result = refreshProviderToolSafetyPreflightView({
    container,
    status: { enabled: true, allowedTools: ['contact_profile.list'] },
    diagnostics: buildDiagnostics({
      realRunnerDebug: {
        mode: 'real_runner',
        allowRunnerNetwork: true,
        writesChat: true,
        modelContextPolicy: 'unsafe',
      },
    }),
    permissionRules: [],
    loopGuard: [],
    sessionId: 's1',
    documentRef,
  });
  assert.equal(result.model.writesChat, true);
  assert.equal(result.model.gates.find(gate => gate.key === 'chatWrites').tone, 'danger');
  assert.equal(result.model.gates.find(gate => gate.key === 'modelContext').tone, 'warn');
  console.log('ok - refreshProviderToolSafetyPreflightView flags unsafe preflight diagnostics');
}

{
  const model = buildProviderToolSafetyPreflightViewModel({
    status: { enabled: false, allowedTools: ['contact_profile.list'] },
    diagnostics: buildDiagnostics({
      permissionStrategy: {
        mode: 'modal_prompt',
        presentation: 'modal',
        promptModal: true,
      },
    }),
    permissionRules: [],
    loopGuard: [],
    sessionId: 's1',
  });
  assert.equal(model.permissionStrategy.mode, 'modal_prompt');
  assert.equal(model.gates.find(gate => gate.key === 'permissionUi').value, 'modal prompt');
  assert.equal(model.gates.find(gate => gate.key === 'permissionUi').tone, 'warn');
  console.log('ok - buildProviderToolSafetyPreflightViewModel flags modal permission strategy');
}

{
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const toggles = [];
  const result = refreshProviderToolSafetyPreflightView({
    container,
    status: { enabled: false, allowedTools: ['contact_profile.list'] },
    sessionGate: { enabled: false, allowedTools: ['contact_profile.list'], source: 'test' },
    diagnostics: { status: {}, history: [] },
    permissionRules: [],
    loopGuard: [],
    sessionId: 's1',
    onSetSessionGate: request => {
      toggles.push(request);
      return { enabled: request.enabled };
    },
    documentRef,
  });

  const button = container.children[0].children[0].children[1].children[1];
  assert.equal(button.tagName, 'button');
  assert.equal(button.textContent, 'Enable');
  await button.click();
  assert.equal(toggles.length, 1);
  assert.equal(toggles[0].enabled, true);
  assert.equal(toggles[0].sessionId, 's1');
  assert.equal(toggles[0].model, result.model);
  console.log('ok - refreshProviderToolSafetyPreflightView exposes session gate toggle callback');
}
