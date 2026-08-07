import assert from 'node:assert/strict';
import {
  collectBoundWorldRegexSets,
  ensureUniqueWorldbookIdCore,
  getWorldEntryActivationExplanationCore,
  resolveRefEntriesForDisplayCore,
  resolveWorldEditorBridgeContext,
  saveWorldInfoWithName,
  sanitizeWorldbookId,
} from '../../src/scripts/ui/world-editor/world-editor-bridge-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('sanitizeWorldbookId preserves unicode only when requested', () => {
  assert.equal(sanitizeWorldbookId('角色 世界:01'), '_01');
  assert.equal(sanitizeWorldbookId('角色 世界:01', { allowUnicode: true }), '角色 世界:01');
  assert.equal(sanitizeWorldbookId('', { fallback: 'fallback' }), 'fallback');
});

test('ensureUniqueWorldbookIdCore waits for store and appends suffix on collisions', async () => {
  const calls = [];
  const worldStore = {
    ready: Promise.resolve().then(() => calls.push('ready')),
    has: id => ['book', 'book_1'].includes(id),
    load: () => { throw new Error('cold bodies must not be loaded for collision checks'); },
  };
  const id = await ensureUniqueWorldbookIdCore({
    worldStore,
    baseName: 'book',
  });
  assert.equal(id, 'book_2');
  assert.deepEqual(calls, ['ready']);
});

test('resolveRefEntriesForDisplayCore caches source worlds and supports includeAll', async () => {
  const calls = [];
  const getWorldInfo = async (id) => {
    calls.push(id);
    return {
      entries: [
        { id: 'a', comment: 'A' },
        { uid: 2, comment: 'B' },
      ],
    };
  };
  const entries = await resolveRefEntriesForDisplayCore({
    getWorldInfo,
    refs: [
      { sourceId: 'world-1', entryId: 'a' },
      { sourceId: 'world-1', includeAll: true },
    ],
  });
  assert.deepEqual(calls, ['world-1']);
  assert.deepEqual(entries.map(item => [item.comment, item._refSourceId, item._refEntryId]), [
    ['A', 'world-1', 'a'],
    ['A', 'world-1', 'a'],
    ['B', 'world-1', '2'],
  ]);
});

test('collectBoundWorldRegexSets normalizes only sets bound to the target world', async () => {
  const regexStore = {
    ready: Promise.resolve(),
    listLocalSets: () => [
      { name: 'keep', enabled: undefined, bind: { type: 'world', worldId: 'w1' }, rules: [{ id: 1 }] },
      { name: 'disabled', enabled: false, bind: { type: 'world', worldId: 'w1' }, rules: [] },
      { name: 'skip', bind: { type: 'world', worldId: 'w2' }, rules: [] },
    ],
  };
  const sets = await collectBoundWorldRegexSets({ regexStore, worldId: 'w1' });
  assert.deepEqual(sets, [
    { name: 'keep', enabled: true, rules: [{ id: 1 }] },
    { name: 'disabled', enabled: false, rules: [] },
  ]);
});

test('saveWorldInfoWithName rejects duplicate rename before writes', async () => {
  const calls = [];
  const result = await saveWorldInfoWithName({
    currentName: 'old',
    nextName: 'new',
    payload: { name: 'new' },
    listWorlds: async () => ['new'],
    renameWorldInfo: () => calls.push('rename'),
    saveWorldInfo: () => calls.push('save'),
  });
  assert.deepEqual(result, { ok: false, reason: 'duplicate-name', worldName: 'old' });
  assert.deepEqual(calls, []);
});

test('saveWorldInfoWithName saves unchanged names and renames changed names', async () => {
  const calls = [];
  const saved = await saveWorldInfoWithName({
    currentName: 'same',
    nextName: 'same',
    payload: { name: 'same' },
    saveWorldInfo: (name, payload) => calls.push(['save', name, payload.name]),
  });
  const renamed = await saveWorldInfoWithName({
    currentName: 'old',
    nextName: 'new',
    payload: { name: 'new' },
    listWorlds: async () => ['other'],
    renameWorldInfo: (from, to, payload) => calls.push(['rename', from, to, payload.name]),
  });
  assert.deepEqual(saved, { ok: true, reason: 'saved', worldName: 'same' });
  assert.deepEqual(renamed, { ok: true, reason: 'renamed', worldName: 'new' });
  assert.deepEqual(calls, [
    ['save', 'same', 'same'],
    ['rename', 'old', 'new', 'new'],
  ]);
});

test('resolveWorldEditorBridgeContext binds bridge methods and exposes stores', () => {
  const bridge = {
    worldStore: { id: 'world-store' },
    contactsStore: { id: 'contacts-store' },
    chatStore: { id: 'chat-store' },
    regex: { id: 'regex-store' },
    marker: 'bridge-marker',
    getWorldInfo() {
      return this.marker;
    },
  };
  const context = resolveWorldEditorBridgeContext({ bridge });
  assert.equal(context.worldStore.id, 'world-store');
  assert.equal(context.contactsStore.id, 'contacts-store');
  assert.equal(context.chatStore.id, 'chat-store');
  assert.equal(context.regexStore.id, 'regex-store');
  assert.equal(context.getWorldInfo(), 'bridge-marker');
});

test('resolveWorldEditorBridgeContext binds world activation diagnostic methods', () => {
  const bridge = {
    marker: 'diagnostic-marker',
    buildWorldDebugLabel() {
      return { marker: this.marker };
    },
    explainWorldEntryActivation(worldId, entryId, label) {
      return { worldId, entryId, label };
    },
  };
  const context = resolveWorldEditorBridgeContext({ bridge });
  assert.deepEqual(context.buildWorldDebugLabel(), { marker: 'diagnostic-marker' });
  assert.deepEqual(context.explainWorldEntryActivation('w1', 'e1', { marker: 'x' }), {
    worldId: 'w1',
    entryId: 'e1',
    label: { marker: 'x' },
  });
});

test('getWorldEntryActivationExplanationCore resolves source id entry id and debug label', () => {
  const explanation = getWorldEntryActivationExplanationCore({
    entry: { _refSourceId: 'ref-world', id: 'entry-id' },
    idx: 2,
    worldName: 'fallback-world',
    getEntryId: (entry, idx) => `${entry.id}-${idx}`,
    buildWorldDebugLabel: () => ({ sessionId: 's1' }),
    explainWorldEntryActivation: (worldId, entryId, label) => ({ worldId, entryId, label }),
  });
  assert.deepEqual(explanation, {
    worldId: 'ref-world',
    entryId: 'entry-id-2',
    label: { sessionId: 's1' },
  });
});

test('getWorldEntryActivationExplanationCore logs and returns null on diagnostic failure', () => {
  const warnings = [];
  const explanation = getWorldEntryActivationExplanationCore({
    entry: { id: 'entry-id' },
    worldName: 'world-id',
    buildWorldDebugLabel: () => ({ sessionId: 's1' }),
    explainWorldEntryActivation: () => {
      throw new Error('boom');
    },
    logger: {
      warn: (...args) => warnings.push(args),
    },
  });
  assert.equal(explanation, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '读取世界书条目激活解释失败');
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
