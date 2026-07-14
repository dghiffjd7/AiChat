import assert from 'node:assert/strict';

import {
  AGENT_CAPABILITY_KIND,
  buildCapabilityRef,
  capabilityRefKey,
  createAgentRegistry,
  createSubAgentRegistryProvider,
  projectSubAgentCapability,
} from '../../src/scripts/agent/agent-registry.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildCapabilityRef fills defaults and ref falls back to id', () => {
  const ref = buildCapabilityRef({ id: 'worldbook.generate_entries' });
  assert.deepEqual(ref, {
    id: 'worldbook.generate_entries', version: '1', namespace: 'builtin',
    kind: 'agent', provider: 'app', ref: 'worldbook.generate_entries',
  });
  assert.equal(capabilityRefKey(ref), 'builtin:agent:worldbook.generate_entries@1');
});

test('projectSubAgentCapability maps config to unified agent capability', () => {
  const cap = projectSubAgentCapability({
    id: 'sub-1', name: '便宜档', modelProfileId: 'p-deepseek', modelOverride: 'v4-flash',
    skills: ['worldbook', 'longform'], note: '用于批量条目', enabled: true,
  });
  assert.equal(cap.ref.kind, AGENT_CAPABILITY_KIND);
  assert.equal(cap.ref.namespace, 'user');
  assert.equal(cap.ref.provider, 'maid-sub-agent');
  assert.equal(cap.ref.id, 'sub-1');
  assert.deepEqual(cap.capabilityTags, ['worldbook', 'longform']);
  assert.equal(cap.modelProfileRef, 'p-deepseek');
  assert.equal(cap.modelOverride, 'v4-flash');
  assert.equal(cap.memoryScope, 'maid-run');
  assert.equal(cap.delegation.maxDepth, 1);
  // 行为兼容投影：与迁移前 planner 收到的 sub-agent 形状一致
  assert.deepEqual(cap.promptShape, { id: 'sub-1', name: '便宜档', skills: ['worldbook', 'longform'], note: '用于批量条目', enabled: true, profileHint: '' });
});

test('projectSubAgentCapability rejects records without id', () => {
  assert.equal(projectSubAgentCapability({ name: 'x', modelProfileId: 'p' }), null);
  assert.equal(projectSubAgentCapability(null), null);
});

test('registry lists projected sub-agents and looks up by id/ref', () => {
  const registry = createAgentRegistry({
    providers: [createSubAgentRegistryProvider(() => ([
      { id: 'a', name: 'A', modelProfileId: 'pa', skills: ['x'], enabled: true },
      { id: 'b', name: 'B', modelProfileId: 'pb', skills: [], enabled: false },
    ]))],
  });
  const all = registry.listAgents();
  assert.equal(all.length, 2);
  assert.deepEqual(registry.providers, ['maid-sub-agent']);
  assert.equal(registry.listEnabledAgents().length, 1);
  assert.equal(registry.getAgent('a').name, 'A');
  assert.equal(registry.getAgentByRef(all[0].ref).id, 'a');
  assert.equal(registry.listByProvider('maid-sub-agent').length, 2);
  // listPromptShapes 只含 enabled，且形状与迁移前一致（供 planner）
  const shapes = registry.listPromptShapes();
  assert.equal(shapes.length, 1);
  assert.deepEqual(shapes[0], { id: 'a', name: 'A', skills: ['x'], note: '', enabled: true, profileHint: '' });
});

test('registry preserves order and dedupes by capability ref key across providers', () => {
  const provA = createSubAgentRegistryProvider(() => ([{ id: 'dup', name: 'first', modelProfileId: 'p1' }]));
  const provB = createSubAgentRegistryProvider(() => ([{ id: 'dup', name: 'second', modelProfileId: 'p2' }, { id: 'uniq', name: 'u', modelProfileId: 'p3' }]));
  const registry = createAgentRegistry({ providers: [provA, provB] });
  const all = registry.listAgents();
  assert.equal(all.length, 2); // dup 只保留先注册 provider 的
  assert.equal(registry.getAgent('dup').name, 'first');
  assert.equal(registry.getAgent('uniq').name, 'u');
});

test('registry tolerates throwing providers without breaking others', () => {
  const bad = { provider: 'bad', listCapabilities: () => { throw new Error('boom'); } };
  const good = createSubAgentRegistryProvider(() => ([{ id: 'ok', name: 'ok', modelProfileId: 'p' }]));
  const registry = createAgentRegistry({ providers: [bad, good] });
  assert.equal(registry.listAgents().length, 1);
  assert.equal(registry.getAgent('ok').name, 'ok');
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
if (failed > 0) process.exit(1);
