import assert from 'node:assert/strict';

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

if (!globalThis.sessionStorage) {
  const store = new Map();
  globalThis.sessionStorage = {
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

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
}

if (!globalThis.window) globalThis.window = globalThis;
globalThis.window.dispatchEvent = globalThis.window.dispatchEvent || (() => true);
globalThis.window.toastr = globalThis.window.toastr || {
  success() {},
  warning() {},
  error() {},
};
globalThis.setTimeout = () => 0;

if (!globalThis.btoa) {
  globalThis.btoa = value => Buffer.from(String(value), 'binary').toString('base64');
}
if (!globalThis.atob) {
  globalThis.atob = value => Buffer.from(String(value), 'base64').toString('binary');
}

const jsonEntry = (name, value) => ({
  name,
  text: JSON.stringify(value),
});

const base64JsonEntry = (name, value) => ({
  name,
  base64: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
});

const {
  BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
} = await import('../../src/scripts/storage/builtin-worldbooks.js');
const { CharacterCardTransfer } = await import('../../src/scripts/ui/character-card-transfer.js');
const { ExperiencePackTransfer } = await import('../../src/scripts/ui/experience-pack-transfer.js');
const { CustomBundleExporter } = await import('../../src/scripts/ui/custom-bundle-exporter.js');

{
  const getMemoryQueries = [];
  const transfer = new CharacterCardTransfer({
    contactsStore: {
      getContact(id) {
        assert.equal(id, 'contact:alice');
        return {
          id,
          name: 'Alice',
          labels: ['好友', 7],
          avatar: 'data:image/webp;base64,AAAA',
          description: '角色说明',
        };
      },
    },
    chatStore: {
      listVariables: () => ({ affection: 5 }),
      listVariableSchemas: () => ({ affection: { type: 'number' } }),
      listVariableRules: () => [{ id: 'rule-1' }],
    },
    memoryTemplateStore: {
      async getTemplates(query) {
        assert.deepEqual(query, { is_default: true });
        return [{ id: 'tpl-default' }];
      },
    },
    memoryTableStore: {
      async getMemories(query) {
        getMemoryQueries.push(query);
        return [
          {
            id: 'row-1',
            table_id: 'profile',
            row_data: { name: 'Alice' },
            is_active: true,
            is_pinned: true,
            priority: '4',
            sort_order: '2',
          },
          {
            id: 'row-skip',
            table_id: '',
            row_data: { skip: true },
          },
        ];
      },
    },
    appBridge: {
      globalWorldId: 'world:global',
      getWorldIdsForSession: () => ['world:main', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, 'world:main'],
      async getWorldInfo(id) {
        return { id, name: `${id}:name`, entries: [{ key: id }] };
      },
      regex: {
        getSession: () => ({ enabled: true, rules: [{ id: 'session-rule' }] }),
        listLocalSets: () => [
          { id: 'local-main', bind: { type: 'world', worldId: 'world:main' }, rules: [{ id: 'r1' }] },
          { id: 'local-global', bind: { type: 'world', worldId: 'world:global' }, rules: [{ id: 'r2' }] },
          { id: 'local-skip', bind: { type: 'world', worldId: 'world:skip' }, rules: [{ id: 'r3' }] },
        ],
      },
    },
  });

  const { card, avatarFile, avatarDataUrl } = await transfer.buildCardPayload('contact:alice');

  assert.equal(card.format, 'chatapp.card.v1');
  assert.equal(card.contact.name, 'Alice');
  assert.deepEqual(card.contact.labels, ['好友', '7']);
  assert.equal(avatarFile, 'avatar.webp');
  assert.equal(avatarDataUrl, 'data:image/webp;base64,AAAA');
  assert.deepEqual(card.session.worldIds, ['world:main', 'world:global']);
  assert.deepEqual(Object.keys(card.worldbooks), ['world:main', 'world:global']);
  assert.deepEqual(card.variables.values, { affection: 5 });
  assert.deepEqual(card.regex.localSets.map(set => set.id), ['local-main', 'local-global']);
  assert.deepEqual(card.memory, {
    templateId: 'tpl-default',
    rows: [
      {
        id: 'row-1',
        table_id: 'profile',
        row_data: { name: 'Alice' },
        is_active: true,
        is_pinned: true,
        priority: 4,
        sort_order: 2,
      },
    ],
  });
  assert.deepEqual(getMemoryQueries, [{
    scope: 'contact',
    group_id: undefined,
    contact_id: 'contact:alice',
    template_id: 'tpl-default',
  }]);
  console.log('ok - CharacterCardTransfer buildCardPayload preserves export manifest world regex variable and memory contracts');
}

{
  const deleted = [];
  const created = [];
  let batchDeleteTried = false;
  const transfer = new CharacterCardTransfer({
    memoryTemplateStore: {
      async getTemplates(query) {
        assert.deepEqual(query, { is_default: true });
        return [{ id: 'tpl-default' }];
      },
    },
    memoryTableStore: {
      async getMemories(query) {
        assert.equal(query.contact_id, 'contact:alice');
        return [{ id: 'old-1' }, { id: 'old-2' }];
      },
      async batchDeleteMemories(ids) {
        batchDeleteTried = true;
        assert.deepEqual(ids, ['old-1', 'old-2']);
        throw new Error('force fallback');
      },
      async deleteMemory(id) {
        deleted.push(id);
      },
      async batchCreateMemories(inputs) {
        created.push(...inputs);
      },
    },
    appBridge: {},
  });

  const applied = await transfer.applyMemorySnapshot('contact:alice', {
    templateId: '',
    rows: [
      {
        id: 'row-1',
        table_id: 'profile',
        row_data: { name: 'Alice' },
        is_active: false,
        is_pinned: true,
        priority: '9',
        sort_order: '3',
      },
      { id: 'skip', table_id: '' },
    ],
  });

  assert.equal(applied, true);
  assert.equal(batchDeleteTried, true);
  assert.deepEqual(deleted, ['old-1', 'old-2']);
  assert.deepEqual(created, [{
    id: 'row-1',
    template_id: 'tpl-default',
    table_id: 'profile',
    contact_id: 'contact:alice',
    group_id: null,
    row_data: { name: 'Alice' },
    is_active: false,
    is_pinned: true,
    priority: 9,
    sort_order: 3,
  }]);
  console.log('ok - CharacterCardTransfer applyMemorySnapshot preserves delete fallback and create payload contracts');
}

{
  const transfer = new ExperiencePackTransfer({ appBridge: {} });
  const packageData = transfer.parsePackageEntries([
    jsonEntry('manifest.json', {
      format: 'chatapp.experience-pack.v1',
      layers: { chat_history: true },
    }),
    jsonEntry('character.json', { contact: { id: 'contact:alice', name: 'Alice' } }),
    base64JsonEntry('worldbook/worldbooks.json', { worldIds: ['world:main'], worldbooks: { 'world:main': { name: '世界' } } }),
    jsonEntry('chat\\session.json', { exportedRange: 'recent_50' }),
    jsonEntry('chat/current.json', [{ id: 'm1' }]),
    jsonEntry('chat/archives/archive-a.json', { id: 'archive-a', messages: [{ id: 'old' }] }),
    { name: 'assets/avatar.png', base64: 'AAAA' },
  ]);

  assert.equal(packageData.manifest.format, 'chatapp.experience-pack.v1');
  assert.equal(packageData.character.contact.name, 'Alice');
  assert.deepEqual(packageData.worldbooks.worldIds, ['world:main']);
  assert.equal(packageData.chatSession.exportedRange, 'recent_50');
  assert.deepEqual(packageData.chatArchives, [{ id: 'archive-a', messages: [{ id: 'old' }] }]);
  assert.equal(packageData.get?.('missing'), undefined);
  assert.equal(transfer.getEntryDataUrl(packageData, 'assets/avatar.png'), 'data:image/png;base64,AAAA');
  assert.throws(
    () => transfer.parsePackageEntries([jsonEntry('manifest.json', { format: 'invalid' })]),
    /不支持的体验包格式/,
  );
  console.log('ok - ExperiencePackTransfer parsePackageEntries preserves manifest archive base64 and asset contracts');
}

{
  const exporter = new CustomBundleExporter({
    personaStore: {},
    appBridge: {},
  });
  const packageData = exporter.parsePackageEntries([
    jsonEntry('manifest.json', {
      format: 'chatapp.custom-bundle.v1',
      roles: [{ id: 'role:alice', rooms: ['room:chat'] }],
    }),
    jsonEntry('roles/role_alice/persona.json', { id: 'role:alice', name: 'Alice' }),
    jsonEntry('roles/role_alice/persona_original_card.json', { spec: 'card' }),
    jsonEntry('roles/role_alice/moments.json', { moments: [{ id: 'moment-1' }] }),
    jsonEntry('rooms/room_chat/manifest.json', { key: 'room:chat', sessionId: 'contact:alice', uiMode: 'chat' }),
    jsonEntry('rooms/room_chat/contact.json', { id: 'contact:alice', name: 'Alice' }),
    jsonEntry('rooms/room_chat/archives/archive-a.json', { id: 'archive-a', messages: [{ id: 'old' }] }),
    jsonEntry('resources/worldbooks.json', { worldIds: ['world:main'], worldbooks: { 'world:main': { name: '世界' } } }),
    { name: 'roles/role_alice/assets/avatar.webp', base64: 'BBBB' },
  ]);

  assert.equal(packageData.manifest.format, 'chatapp.custom-bundle.v1');
  assert.equal(packageData.roles.length, 1);
  assert.equal(packageData.roles[0].persona.name, 'Alice');
  assert.deepEqual(packageData.roles[0].originalCard, { spec: 'card' });
  assert.deepEqual(packageData.roles[0].momentsPayload, { moments: [{ id: 'moment-1' }] });
  assert.equal(packageData.rolesById.get('role:alice').basePath, 'roles/role_alice');
  assert.equal(packageData.roomMap.get('room:chat').contact.name, 'Alice');
  assert.deepEqual(packageData.roomMap.get('room:chat').archives, [{ id: 'archive-a', messages: [{ id: 'old' }] }]);
  assert.deepEqual(packageData.worldbooks.worldIds, ['world:main']);
  assert.equal(exporter.getEntryDataUrl(packageData, 'roles/role_alice/assets/avatar.webp'), 'data:image/webp;base64,BBBB');
  assert.throws(
    () => exporter.parsePackageEntries([jsonEntry('manifest.json', { format: 'invalid' })]),
    /不支持的自定义资料包格式/,
  );
  console.log('ok - CustomBundleExporter parsePackageEntries preserves role room archive resource and asset contracts');
}
