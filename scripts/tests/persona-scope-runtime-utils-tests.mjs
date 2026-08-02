import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPersonaScopeStoreTargets,
  arePersonaScopedStoresReady,
  buildPersonaScopedStorageKey,
  canReusePersonaScope,
  canEnterPersonaScopedSession,
  createPersonaScopeApplyCoordinator,
  getOwnRpSessionIdForScope,
  hasPersonaScopedSession,
  isForeignRpSessionForScope,
  resolvePersonaScopedCurrentSession,
  settlePersonaScopeStores,
} from '../../src/scripts/ui/persona-scope-runtime-utils.js';

{
  const chatStore = { scopeId: 'persona_a' };
  const contactsStore = { scopeId: 'persona_a' };
  assert.equal(canReusePersonaScope({
    nextScopeId: 'persona_a',
    activeScopeId: 'persona_a',
    chatStore,
    contactsStore,
  }), true);
  chatStore.scopeId = 'persona_b';
  contactsStore.scopeId = 'persona_b';
  assert.equal(canReusePersonaScope({
    nextScopeId: 'persona_a',
    activeScopeId: 'persona_a',
    chatStore,
    contactsStore,
  }), false, 'A→B stale 后 key=A/store=B 时不得早退');
  assert.equal(canReusePersonaScope({
    nextScopeId: 'persona_a',
    activeScopeId: 'persona_a',
    chatStore: { scopeId: 'persona_a' },
    contactsStore: { scopeId: 'persona_a' },
    force: true,
  }), false);
  console.log('ok - persona scope reuse requires both key and critical stores to match');
}

{
  const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  const applyScopeSource = appSource.slice(
    appSource.indexOf('const applyPersonaScopeNow = async'),
    appSource.indexOf('const wasChatRoomVisible', appSource.indexOf('const applyPersonaScopeNow = async')),
  );
  assert.match(applyScopeSource, /canReusePersonaScope\(\{[\s\S]*nextScopeId:\s*nextKey[\s\S]*activeScopeId:\s*activePersonaScopeKey[\s\S]*chatStore[\s\S]*contactsStore/);
  assert.match(appSource, /createPersonaScopeApplyCoordinator\(\{/);
  assert.match(appSource, /stores:\s*buildPersonaScopeStoreTargets\(\{/);
  assert.match(appSource, /scopeRun\.commit\(nextKey,[\s\S]*activePersonaScopeKey\s*=\s*nextKey/);
  const staleGateIndex = appSource.indexOf('if (!scopeRun?.isCurrent?.(nextKey) || activeKey !== nextKey)');
  const criticalGateIndex = appSource.indexOf('const criticalFailure = scopeSettlement.criticalFailures[0]');
  const scopeCommitIndex = appSource.indexOf('scopeRun.commit(nextKey');
  const degradedWarningIndex = appSource.indexOf('部分资料未载入：');
  assert.ok(staleGateIndex > 0 && staleGateIndex < criticalGateIndex, 'stale 运行必须先静默退出');
  assert.ok(criticalGateIndex < scopeCommitIndex, '关键 store 失败不得提交 scope key');
  assert.ok(scopeCommitIndex < degradedWarningIndex, '降级提示只属于已提交的最终运行');
  console.log('ok - app early return delegates to the store-ready persona scope guard');
}

{
  assert.equal(buildPersonaScopedStorageKey('phone_ui_state_v1', ''), 'phone_ui_state_v1__default');
  assert.equal(buildPersonaScopedStorageKey('phone_ui_state_v1', 'persona/a'), 'phone_ui_state_v1__persona_a');
  assert.equal(getOwnRpSessionIdForScope(''), 'rp:default');
  assert.equal(getOwnRpSessionIdForScope('persona_1'), 'rp:persona_1');
  console.log('ok - persona scoped storage keys use a stable default bucket');
}

{
  assert.equal(isForeignRpSessionForScope('rp:persona_2', 'persona_1'), true);
  assert.equal(isForeignRpSessionForScope('rp:persona_1', 'persona_1'), false);
  assert.equal(isForeignRpSessionForScope('plain-room', 'persona_1'), false);
  console.log('ok - foreign RP sessions are detected relative to active persona scope');
}

{
  const chatStore = { hasSession: id => id === 'room-a' || id === 'rp:persona_1' };
  const contactsStore = { getContact: id => (id === 'room-contact' ? { id } : null) };
  assert.equal(hasPersonaScopedSession({ sessionId: 'room-a', scopeId: 'persona_1', chatStore, contactsStore }), true);
  assert.equal(hasPersonaScopedSession({ sessionId: 'room-contact', scopeId: 'persona_1', chatStore, contactsStore }), true);
  assert.equal(hasPersonaScopedSession({ sessionId: 'rp:persona_2', scopeId: 'persona_1', chatStore, contactsStore }), false);
  console.log('ok - known-session checks reject foreign RP ids before store lookup');
}

{
  const current = { value: 'rp:persona_2' };
  const chatStore = {
    getCurrent: () => current.value,
    hasSession: id => id === current.value,
  };
  const contactsStore = { getContact: () => null };
  assert.deepEqual(resolvePersonaScopedCurrentSession({ scopeId: 'persona_1', chatStore, contactsStore }), {
    sessionId: '',
    known: false,
    foreignRp: true,
    source: 'foreign-rp',
  });
  current.value = 'room-a';
  assert.deepEqual(resolvePersonaScopedCurrentSession({ scopeId: 'persona_1', chatStore, contactsStore }), {
    sessionId: 'room-a',
    known: true,
    foreignRp: false,
    source: 'chat',
  });
  console.log('ok - current session resolution returns only safe current ids');
}

{
  const chatStore = {
    getCurrent: () => 'rp:persona_1',
    hasSession: id => id === 'rp:persona_1',
  };
  const contactsStore = { getContact: () => null };
  assert.deepEqual(resolvePersonaScopedCurrentSession({
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
    allowRpSession: false,
  }), {
    sessionId: '',
    known: false,
    foreignRp: false,
    source: 'rp-excluded',
  });
  console.log('ok - social session resolution excludes the active persona creative-writing room');
}

{
  const chatStore = { scopeId: 'default', hasSession: id => id === '海伦娜' };
  const contactsStore = { scopeId: 'default', getContact: id => (id === '海伦娜' ? { id } : null) };
  assert.equal(arePersonaScopedStoresReady({ scopeId: 'persona_1', chatStore, contactsStore }), false);
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
  }), {
    allowed: false,
    reason: 'scope-mismatch',
  });

  chatStore.scopeId = 'persona_1';
  contactsStore.scopeId = 'persona_1';
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore: { ...chatStore, hasSession: () => false },
    contactsStore: { ...contactsStore, getContact: () => null },
  }), {
    allowed: false,
    reason: 'unknown-session',
  });
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
  }), {
    allowed: true,
    reason: 'known-session',
  });
  console.log('ok - persona scoped enter guard blocks stale DOM sessions during scope switches');
}

{
  const calls = [];
  const result = await settlePersonaScopeStores({
    scopeId: 'persona_2',
    stores: [
      { name: 'chat', store: { setScope: async scope => calls.push(['chat', scope]) } },
      { name: 'memory', store: { setScope: async scope => {
        calls.push(['memory', scope]);
        throw new Error('memory unavailable');
      } } },
      { name: 'missing', store: null },
      { name: 'contacts', store: { setScope: async scope => calls.push(['contacts', scope]) } },
    ],
  });
  assert.deepEqual(calls, [
    ['chat', 'persona_2'],
    ['memory', 'persona_2'],
    ['contacts', 'persona_2'],
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map(item => item.name), ['memory']);
  assert.match(result.failures[0].error.message, /memory unavailable/);
  console.log('ok - persona scope store settlement completes every store and reports partial failures');
}

{
  const result = await settlePersonaScopeStores({
    scopeId: 'persona_soft',
    stores: [
      {
        name: 'legacyFalseStore',
        feature: '旧式资料',
        store: { scopeId: '', setScope: async function setScope(scopeId) {
          this.scopeId = scopeId;
          return false;
        } },
      },
      {
        name: 'memoryTableStore',
        feature: '记忆表',
        store: { scopeId: '', setScope: async function setScope(scopeId) {
          this.scopeId = scopeId;
          return false;
        } },
        isReady: ({ result: value, store, scopeId }) => ({
          ok: value === true && store.scopeId === scopeId,
          reason: '记忆数据库未就绪',
        }),
      },
      {
        name: 'chatStore',
        feature: '聊天与联系人',
        critical: true,
        store: { scopeId: '', setScope: async function setScope() {
          return undefined;
        } },
        isReady: ({ store, scopeId }) => ({
          ok: store.scopeId === scopeId,
          reason: '聊天资料未切换到目标角色卡',
        }),
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map(item => item.name), ['memoryTableStore', 'chatStore']);
  assert.deepEqual(result.degradedFailures.map(item => item.feature), ['记忆表']);
  assert.deepEqual(result.criticalFailures.map(item => item.feature), ['聊天与联系人']);
  assert.equal(result.failures[0].kind, 'soft_failure');
  assert.match(result.failures[0].error.message, /记忆数据库未就绪/);
  assert.equal(
    result.failures.some(item => item.name === 'legacyFalseStore'),
    false,
    '没有声明健康契约的 false 返回值不得被一概判失败',
  );
  console.log('ok - persona scope settlement distinguishes explicit soft failures from legacy false results');
}

{
  const makeStore = (result, extra = {}) => ({
    scopeId: '',
    ...extra,
    async setScope(scopeId) {
      this.scopeId = scopeId;
      return result;
    },
  });
  const targets = buildPersonaScopeStoreTargets({
    chatStore: makeStore(undefined),
    contactsStore: makeStore(undefined),
    momentsStore: makeStore(undefined, { lastDiskError: '动态 KV 暂时不可读' }),
    rpSessionStore: makeStore(undefined, { persistenceBlocked: true }),
    memoryTableStore: makeStore(false),
    memoryTemplateStore: makeStore(true),
  });
  const result = await settlePersonaScopeStores({
    scopeId: 'persona_contracts',
    stores: targets,
  });

  assert.deepEqual(result.criticalFailures, []);
  assert.deepEqual(result.degradedFailures.map(item => item.feature), [
    '动态',
    '创意写作会话',
    '记忆表',
  ]);
  assert.equal(targets.find(item => item.name === 'chatStore').critical, true);
  assert.equal(targets.find(item => item.name === 'contactsStore').critical, true);
  console.log('ok - persona scope target contracts classify critical assignment and explicit degraded stores');
}

{
  let requestedScopeId = 'persona_a';
  let committedScopeId = 'persona_a';
  const chatStore = { scopeId: 'persona_a' };
  const contactsStore = { scopeId: 'persona_a' };
  const switches = [];
  const warnings = [];
  let releaseB = null;
  let markBStarted = null;
  const bStarted = new Promise(resolve => { markBStarted = resolve; });
  const coordinator = createPersonaScopeApplyCoordinator({
    getRequestedScopeId: () => requestedScopeId,
  });

  const runSwitch = async (nextScopeId, run) => {
    if (canReusePersonaScope({
      nextScopeId,
      activeScopeId: committedScopeId,
      chatStore,
      contactsStore,
    })) {
      switches.push(['reuse', nextScopeId]);
      return false;
    }
    switches.push(['apply', nextScopeId]);
    chatStore.scopeId = nextScopeId;
    contactsStore.scopeId = nextScopeId;
    if (nextScopeId === 'persona_b') {
      await new Promise(resolve => {
        releaseB = resolve;
        markBStarted();
      });
    }
    if (!run.commit(nextScopeId, () => { committedScopeId = nextScopeId; })) {
      switches.push(['stale', nextScopeId]);
      return false;
    }
    warnings.push(nextScopeId);
    return true;
  };

  requestedScopeId = 'persona_b';
  const switchToB = coordinator.enqueue(run => runSwitch('persona_b', run));
  await bStarted;
  requestedScopeId = 'persona_a';
  const switchBackToA = coordinator.enqueue(run => runSwitch('persona_a', run));
  releaseB();

  assert.equal(await switchToB, false);
  assert.equal(await switchBackToA, true);
  assert.equal(committedScopeId, 'persona_a');
  assert.equal(chatStore.scopeId, 'persona_a');
  assert.equal(contactsStore.scopeId, 'persona_a');
  assert.deepEqual(switches, [
    ['apply', 'persona_b'],
    ['stale', 'persona_b'],
    ['apply', 'persona_a'],
  ]);
  assert.deepEqual(warnings, ['persona_a'], 'stale 运行不得弹出降级提示');
  console.log('ok - persona scope coordinator recovers A to B to A without committing or warning for stale runs');
}
