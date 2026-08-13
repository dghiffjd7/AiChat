import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const windowListeners = new Map();
globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = (type, listener) => {
  const key = String(type || '');
  if (!key || typeof listener !== 'function') return;
  if (!windowListeners.has(key)) windowListeners.set(key, new Set());
  windowListeners.get(key).add(listener);
};
globalThis.window.dispatchEvent = (event) => {
  const type = String(event?.type || '');
  if (!type) return false;
  const listeners = windowListeners.get(type);
  if (!listeners) return true;
  [...listeners].forEach((listener) => listener(event));
  return true;
};
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = String(type || '');
      this.detail = init?.detail;
    }
  };
}
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}
globalThis.setTimeout = () => 0;

const { VariableRuleEngine } = await import('../../src/scripts/variables/variable-rule-engine.js');
const { StageManager } = await import('../../src/scripts/variables/stage-manager.js');

test('VariableRuleEngine condition rules use shared nested/global variable context', async () => {
  const writes = [];
  const chatStore = {
    listVariableRules: () => [
      {
        id: 'rule_1',
        enabled: true,
        trigger: {
          type: 'condition',
          expr: 'vars.variables.hero.hp >= 10 && vars.global_variables.profile.level === 2 && vars.local_variables["hero.hp"] === 12',
        },
        action: {
          type: 'set_value',
          target: 'status',
          value: 'ready',
        },
      },
    ],
    listVariables: () => ({ 'hero.hp': 12 }),
    listGlobalVariables: () => ({ 'profile.level': 2 }),
    setVariable: (name, value, sessionId) => {
      writes.push({ name, value, sessionId });
    },
  };
  const engine = new VariableRuleEngine({ chatStore, appBridge: null });

  await engine.runRules('session_rule', { type: 'condition', useGlobalVariables: false });

  assert.deepEqual(writes, [
    { name: 'status', value: 'ready', sessionId: 'session_rule' },
  ]);
});

test('StageManager resolves stage conditions with shared nested/global variable context', () => {
  const chatStore = {
    getStageSchema: () => ({
      id: 'stage_schema',
      currentStageVar: 'stage',
      stages: [
        {
          id: 'fallback',
          name: 'Fallback',
          condition: 'false',
        },
        {
          id: 'winter_ready',
          name: 'Winter Ready',
          condition: 'vars.stat_data.hero.hp >= 10 && vars.global_variables.profile.level === 2 && vars.local_variables["hero.hp"] === 12',
        },
      ],
    }),
    listVariables: () => ({ 'hero.hp': 12 }),
    listGlobalVariables: () => ({ 'profile.level': 2 }),
    getVariable: () => '',
  };
  const manager = new StageManager({ chatStore, appBridge: null });

  const stage = manager.resolveStage('session_stage');

  assert.equal(stage?.id, 'winter_ready');
});

test('StageManager exposes prompt position metadata for prompt injection planner', () => {
  const chatStore = {
    getStageSchema: () => ({
      id: 'stage_schema',
      currentStageVar: 'stage',
      stages: [{
        id: 'active',
        name: 'Active',
        prompt: '阶段提示词',
        role: 'assistant',
        position: 'after_latest_user',
        depth: 0,
        order: 3210,
      }],
    }),
    getVariable: () => 'active',
  };
  const manager = new StageManager({ chatStore, appBridge: null });

  assert.deepEqual(manager.getPromptBlocks('session_stage'), [{
    content: '阶段提示词',
    role: 'assistant',
    position: 'after_latest_user',
    depth: 0,
    order: 3210,
    source: 'stage',
  }]);
});

test('StageManager reevaluates the active session when global variables change', () => {
  const chatStore = {
    getStageSchema: () => null,
  };
  const manager = new StageManager({ chatStore, appBridge: null });
  manager.activeSessionId = 'session_active';
  const calls = [];
  manager.evaluateStageTransition = (sessionId, options = {}) => {
    calls.push({ sessionId, options });
    return false;
  };

  window.dispatchEvent(new CustomEvent('chatapp-variable-changed', {
    detail: { scope: 'global', sessionId: null, name: 'season' },
  }));

  assert.deepEqual(calls, [
    { sessionId: 'session_active', options: {} },
  ]);
});

test('StageManager exposes diagnostics for unsupported stage condition syntax', () => {
  const chatStore = {
    getStageSchema: () => ({
      id: 'stage_schema',
      currentStageVar: 'stage',
      stages: [
        { id: 'fallback', name: 'Fallback', condition: '' },
        { id: 'broken', name: 'Broken', condition: 'alert(1)' },
      ],
    }),
    getVariable: () => '',
  };
  const manager = new StageManager({ chatStore, appBridge: null });

  const state = manager.getStageState('session_stage');

  assert.equal(Boolean(state?.diagnosticsByStageId?.broken), true);
});

test('variable rules and stage runtime pause without mutating state', async () => {
  const writes = [];
  const chatStore = {
    listVariableRules: () => [{
      id: 'paused-rule',
      enabled: true,
      trigger: { type: 'every_turn' },
      action: { type: 'set_value', target: 'hp', value: 0 },
    }],
    listVariables: () => ({ hp: 10 }),
    listGlobalVariables: () => ({}),
    setVariable: (...args) => writes.push(args),
    getStageSchema: () => ({
      currentStageVar: 'stage',
      stages: [{ id: 'one', condition: '', prompt: '不应注入' }],
    }),
    getVariable: () => '',
  };
  const isVariableRuntimeEnabled = () => false;
  const ruleEngine = new VariableRuleEngine({ chatStore, appBridge: null, isVariableRuntimeEnabled });
  const stageManager = new StageManager({ chatStore, appBridge: null, isVariableRuntimeEnabled });

  await ruleEngine.handleAfterReceive({ sessionId: 's-off', message: {} });
  assert.equal(await stageManager.evaluateStageTransition('s-off', { force: true }), false);
  assert.equal(stageManager.resolveStage('s-off'), null);
  assert.deepEqual(stageManager.getPromptBlocks('s-off'), []);
  assert.deepEqual(writes, []);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
