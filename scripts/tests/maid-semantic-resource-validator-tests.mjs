import assert from 'node:assert/strict';

import {
  createMaidSemanticResourceValidator,
} from '../../src/scripts/agent/maid-semantic-resource-validator.js';

{
  const validator = createMaidSemanticResourceValidator({
    appBridge: {
      waitForWorldStoreReady: async () => {},
      listWorlds: () => [
        { id: 'world-1', name: '晨雾港' },
        'world-2',
      ],
    },
    chatStore: {
      listSessions: () => ['session-1', 'group:tea'],
    },
    contactsStore: {
      getContact: id => (
        id === 'group:tea'
          ? { id, name: '茶会群', isGroup: true }
          : null
      ),
      listContacts: () => [{ id: 'group:tea', name: '茶会群', isGroup: true }],
    },
    personaStore: {
      getAll: () => [{ id: 'persona-1', name: '精灵女王' }],
    },
    userStore: {
      getAll: () => [{ id: 'user-1', name: '主人' }],
    },
    presetStore: {
      list: type => type === 'sysprompt' ? [{ id: 'preset-1', name: '叙事预设' }] : [],
    },
    regexStore: {
      listLocalSets: () => [{ id: 'regex-1', name: '旁白清理' }],
    },
    scriptStore: {
      getScripts: scope => scope === 'global' ? [{ id: 'script-1', name: '状态栏' }] : [],
      listScopes: () => ({ character: [], preset: [] }),
    },
  });

  assert.deepEqual(await validator({ type: 'worldbook', id: '晨雾港' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'session', id: 'session-1' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'group', id: '茶会群' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'persona', id: 'persona-1' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'user', id: '主人' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'preset', id: 'preset-1' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'regex', id: '旁白清理' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'script', id: 'script-1' }), { status: 'found' });
  assert.deepEqual(await validator({ type: 'worldbook', id: '不存在的世界书' }), { status: 'not_found' });
  assert.deepEqual(await validator({ type: 'variable', id: 'stats.hp' }), { status: 'unavailable' });
  console.log('ok - semantic resource validator checks supported stores without importing resource logic');
}

{
  const validator = createMaidSemanticResourceValidator({
    appBridge: {
      listWorlds: async () => {
        throw new Error('store unavailable');
      },
    },
  });
  assert.deepEqual(
    await validator({ type: 'worldbook', id: '晨雾港' }),
    { status: 'unavailable' },
    '读取异常不能误判资源已删除',
  );
  console.log('ok - semantic resource validator distinguishes unavailable readers from missing resources');
}

console.log('maid-semantic-resource-validator-tests passed');
