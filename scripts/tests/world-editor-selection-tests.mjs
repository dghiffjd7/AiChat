import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = globalThis.window || {};
globalThis.window.toastr = globalThis.window.toastr || { info() {}, warning() {} };
globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { WorldEditorModal } = await import('../../src/scripts/ui/world-editor.js');
const { evaluateConditionTree } = await import('../../src/scripts/variables/world-condition-core.js');

{
  const editor = new WorldEditorModal();
  assert.equal(editor.entryPageSize, 4);
  console.log('ok - worldbook editor defaults to four entries per page');
}

{
  const source = await readFile(new URL('../../src/scripts/ui/world-editor.js', import.meta.url), 'utf8');
  assert.match(source, /this\.entryCommentRenderTimer = setTimeout\([\s\S]*?this\.renderList\(\);[\s\S]*?}, 160\)/);
  console.log('ok - worldbook entry title list refresh is debounced');
}

{
  const editor = new WorldEditorModal();
  editor.entryPageIndex = 1;
  editor.entryTotalPages = 4;
  const renderOptions = [];
  editor.renderList = (options) => renderOptions.push(options);

  assert.equal(editor.changeEntryPage(3), true);
  assert.equal(editor.entryPageIndex, 3);
  assert.deepEqual(renderOptions.pop(), { pageDirection: 1 });

  assert.equal(editor.changeEntryPage(0), true);
  assert.equal(editor.entryPageIndex, 0);
  assert.deepEqual(renderOptions.pop(), { pageDirection: -1 });

  assert.equal(editor.changeEntryPage(0), false);
  assert.equal(editor.changeEntryPage(9), false);
  assert.equal(renderOptions.length, 0);
  console.log('ok - worldbook pagination requests directional lazy-page transitions');
}

{
  const css = await readFile(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8');
  const listRule = css.match(/\.world-entries-list\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(
    listRule,
    /max-height:/,
    'the horizontal pager must grow around the padded page instead of clipping its last entry',
  );
  assert.match(
    css,
    /\.world-entry-page-list\s*\{[\s\S]*?scrollbar-gutter:\s*stable;/,
    'worldbook entry list should reserve the vertical scrollbar gutter during entry animation',
  );
  console.log('ok - worldbook entry list keeps a stable scrollbar gutter');
}

{
  const editor = new WorldEditorModal();
  editor.data = {
    entries: Array.from({ length: 8 }, (_, index) => ({
      id: `entry-${index}`,
      comment: `Entry ${index}`,
      depth: 4,
      order: 100,
      position: 0,
    })),
  };
  editor.currentIndex = 0;
  editor.entryPageSize = 5;
  editor.entryPageIndex = 0;
  editor.hideBlockManageModal = () => {};

  let renderListCalls = 0;
  let refreshSelectionCalls = 0;
  let renderEditorCalls = 0;
  editor.renderList = () => {
    renderListCalls += 1;
  };
  editor.refreshEntryListSelection = () => {
    refreshSelectionCalls += 1;
    return true;
  };
  editor.renderEditor = () => {
    renderEditorCalls += 1;
  };

  editor.selectEntry(2);
  assert.equal(editor.currentIndex, 2);
  assert.equal(editor.entryPageIndex, 0);
  assert.equal(refreshSelectionCalls, 1);
  assert.equal(renderListCalls, 0);
  assert.equal(renderEditorCalls, 1);

  editor.selectEntry(6);
  assert.equal(editor.currentIndex, 6);
  assert.equal(editor.entryPageIndex, 1);
  assert.equal(renderListCalls, 1);
  assert.equal(refreshSelectionCalls, 1);
  assert.equal(renderEditorCalls, 2);

  editor.selectEntry(1, { forceRenderList: true });
  assert.equal(editor.currentIndex, 1);
  assert.equal(editor.entryPageIndex, 0);
  assert.equal(renderListCalls, 2);
  assert.equal(refreshSelectionCalls, 1);
  assert.equal(renderEditorCalls, 3);
  console.log('ok - world editor selects entries without rerendering the list on the same page');
}

{
  const editor = new WorldEditorModal();
  editor.data = {
    name: 'entry-gate',
    entries: [{
      id: 'gate-entry',
      constant: true,
      content: '常驻内容',
      when: {
        left: 'enabled',
        op: '==',
        right: true,
        rightType: 'boolean',
      },
    }],
  };
  const payload = editor.prepareForSave('entry-gate');
  const saved = payload.entries[0];
  assert.ok(saved.when && typeof saved.when === 'object');
  assert.ok(saved.nodeGraph && Array.isArray(saved.nodeGraph.nodes));
  assert.equal(evaluateConditionTree(saved.when, {
    resolvePathValue: path => (path === 'enabled' ? false : undefined),
  }), false);
  assert.equal(evaluateConditionTree(saved.when, {
    resolvePathValue: path => (path === 'enabled' ? true : undefined),
  }), true);
  console.log('ok - world editor preserves entry-level variable gate with the shared node graph format');
}

{
  const editor = new WorldEditorModal();
  editor.worldName = 'large-legacy-world';
  editor.data = {
    name: editor.worldName,
    entries: [{
      id: 'legacy-entry',
      comment: 'Legacy entry',
      content: 'large legacy content',
      key: ['legacy'],
      constant: false,
    }],
  };
  const saved = editor.prepareForSave(editor.worldName).entries[0];
  assert.equal(Object.hasOwn(saved, 'promptBlocks'), false);
  assert.equal(Object.hasOwn(saved, 'promptMode'), false);
  assert.equal(Object.hasOwn(saved, 'nodeGraph'), false);
  assert.equal(Object.hasOwn(saved, 'when'), false);
  assert.equal(Object.hasOwn(saved, 'scope'), false);
  assert.equal(Object.hasOwn(saved, 'latestUserAnchor'), false);
  assert.equal(Object.hasOwn(saved, 'selectiveExplicit'), false);
  assert.equal(saved.content, 'large legacy content');
  console.log('ok - saving an untouched legacy entry does not materialize duplicate editor-only fields');
}

{
  const editor = new WorldEditorModal();
  editor.worldName = 'block-world';
  editor.data = {
    name: editor.worldName,
    entries: [{
      id: 'block-entry',
      comment: 'Block entry',
      content: 'first page',
      promptMode: 'blocks',
      promptBlocks: [
        { id: 'page-1', title: '第一页', content: 'first page', enabled: true, role: 0, priority: 100 },
        { id: 'page-2', title: '第二页', content: 'second page', enabled: true, role: 0, priority: 100 },
      ],
    }],
  };
  const saved = editor.prepareForSave(editor.worldName).entries[0];
  assert.equal(saved.promptMode, 'blocks');
  assert.equal(saved.promptBlocks.length, 2);
  assert.equal(saved.promptBlocks[1].content, 'second page');
  console.log('ok - compact legacy saves preserve explicit multi-page prompt blocks');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const base = {
    name: 'Concurrent Editor World',
    entries: [
      { id: 'a', comment: 'A', content: 'initial-A' },
      { id: 'b', comment: 'B', content: 'initial-B' },
    ],
  };
  const latest = clone(base);
  latest.entries[0].content = 'maid-A';
  const local = clone(base);
  local.entries[1].content = 'user-B';
  let saveCalls = 0;
  let committed = null;
  window.appBridge = {
    saveWorldInfo: async (_id, payload, options = {}) => {
      saveCalls += 1;
      if (saveCalls === 1) {
        assert.equal(options.expectedRevision, 1);
        return {
          ok: false,
          reason: 'worldbook_revision_conflict',
          latestSnapshot: {
            worldbookId: 'Concurrent Editor World',
            exists: true,
            data: clone(latest),
            revision: 2,
            generation: 1,
          },
        };
      }
      assert.equal(options.expectedRevision, 2);
      committed = clone(payload);
      return { ok: true, data: clone(payload), revision: 3, generation: 1 };
    },
  };
  const editor = new WorldEditorModal();
  editor.worldName = 'Concurrent Editor World';
  editor.data = clone(local);
  editor.baseWorldData = clone(base);
  editor.baseRevision = 1;
  editor.baseGeneration = 1;

  const result = await editor.commitWorldPayload('Concurrent Editor World', local);
  assert.equal(result.ok, true);
  assert.equal(saveCalls, 2);
  assert.deepEqual(
    committed.entries.map(entry => entry.content),
    ['maid-A', 'user-B'],
  );
  console.log('ok - world editor CAS auto-merges non-overlapping stale draft changes');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const rawBase = {
    name: 'Legacy Prompt Block World',
    entries: [
      { id: 'a', comment: 'A', content: 'initial-A' },
      { id: 'b', comment: 'B', content: 'initial-B' },
    ],
  };
  const editor = new WorldEditorModal();
  editor.worldName = rawBase.name;
  editor.data = clone(rawBase);
  const normalizedBase = editor.prepareForSave(rawBase.name);
  const local = clone(normalizedBase);
  local.entries[1].content = 'user-B';
  assert.equal(Object.hasOwn(local.entries[0], 'promptBlocks'), false);
  const latest = clone(rawBase);
  latest.entries[0].content = 'maid-A';
  let saveCalls = 0;
  let committed = null;
  window.appBridge = {
    saveWorldInfo: async (_id, payload, options = {}) => {
      saveCalls += 1;
      if (saveCalls === 1) {
        assert.equal(options.expectedRevision, 1);
        return {
          ok: false,
          reason: 'worldbook_revision_conflict',
          latestSnapshot: {
            worldbookId: rawBase.name,
            exists: true,
            data: clone(latest),
            revision: 2,
            generation: 1,
          },
        };
      }
      committed = clone(payload);
      return { ok: true, data: clone(payload), revision: 3, generation: 1 };
    },
  };
  editor.baseWorldData = clone(normalizedBase);
  editor.baseRevision = 1;
  editor.baseGeneration = 1;

  const result = await editor.commitWorldPayload(rawBase.name, local);
  assert.equal(result.ok, true);
  assert.equal(saveCalls, 2);
  assert.deepEqual(
    committed.entries.map(entry => entry.content),
    ['maid-A', 'user-B'],
  );
  assert.equal(Object.hasOwn(committed.entries[0], 'promptBlocks'), false);
  console.log('ok - world editor merge keeps legacy entries compact without generated prompt blocks');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const base = {
    name: 'Overlapping Editor World',
    entries: [{ id: 'a', comment: 'A', content: 'initial-A' }],
  };
  const local = clone(base);
  local.entries[0].content = 'user-A';
  const latest = clone(base);
  latest.entries[0].content = 'maid-A';
  let saveCalls = 0;
  let reviewed = null;
  window.appBridge = {
    saveWorldInfo: async () => {
      saveCalls += 1;
      return {
        ok: false,
        reason: 'worldbook_revision_conflict',
        latestSnapshot: {
          worldbookId: base.name,
          exists: true,
          data: clone(latest),
          revision: 2,
          generation: 1,
        },
      };
    },
  };
  const editor = new WorldEditorModal();
  editor.worldName = base.name;
  editor.data = clone(local);
  editor.baseWorldData = clone(base);
  editor.baseRevision = 1;
  editor.baseGeneration = 1;
  editor.reviewWorldSaveConflict = async (details) => {
    reviewed = details;
    return { ok: false, handled: true, reason: 'draft-kept' };
  };

  const result = await editor.commitWorldPayload(base.name, local);
  assert.equal(result.reason, 'draft-kept');
  assert.equal(saveCalls, 1, 'overlapping fields must not be retried as an automatic overwrite');
  assert.equal(reviewed.conflicts[0].path, 'entries.a.content');
  console.log('ok - world editor routes overlapping stale fields to explicit review');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const rawBaseEntries = [
    { id: 'a', comment: 'A', content: 'initial-A', _refSourceId: 'source-world', _refEntryId: 'a', _refEntryIndex: 0 },
    { id: 'b', comment: 'B', content: 'initial-B', _refSourceId: 'source-world', _refEntryId: 'b', _refEntryIndex: 1 },
  ];
  const editor = new WorldEditorModal();
  editor.worldName = 'Reference World';
  editor.refMode = true;
  editor.refBaseEntries = editor.normalizeWorldDataForMerge({
    name: 'Reference World',
    entries: rawBaseEntries,
  }).entries;
  editor.data = { name: 'Reference World', entries: clone(editor.refBaseEntries) };
  editor.data.entries[1].content = 'user-B';
  const latestSource = {
    name: 'source-world',
    entries: [
      { id: 'a', comment: 'A', content: 'maid-A' },
      { id: 'b', comment: 'B', content: 'initial-B' },
    ],
  };
  let saved = null;
  window.appBridge = {
    getWorldInfo: async () => clone(latestSource),
    saveWorldInfo: async (_id, payload) => {
      saved = clone(payload);
      return { ok: true };
    },
  };

  const result = await editor.saveRefEdits({ showToast: false });
  assert.equal(result, true);
  assert.deepEqual(
    saved.entries.map(entry => entry.content),
    ['maid-A', 'user-B'],
  );
  console.log('ok - reference world editor auto-merges non-overlapping source entry changes');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const editor = new WorldEditorModal();
  editor.worldName = 'Reference Conflict World';
  editor.refMode = true;
  editor.refBaseEntries = editor.normalizeWorldDataForMerge({
    name: editor.worldName,
    entries: [{
      id: 'a',
      comment: 'A',
      content: 'initial-A',
      _refSourceId: 'source-world',
      _refEntryId: 'a',
      _refEntryIndex: 0,
    }],
  }).entries;
  editor.data = { name: editor.worldName, entries: clone(editor.refBaseEntries) };
  editor.data.entries[0].content = 'user-A';
  let saveCalls = 0;
  let reviewed = null;
  window.appBridge = {
    getWorldInfo: async () => ({
      name: 'source-world',
      entries: [{ id: 'a', comment: 'A', content: 'maid-A' }],
    }),
    saveWorldInfo: async () => {
      saveCalls += 1;
      return { ok: true };
    },
  };
  editor.reviewRefWorldSaveConflict = async (details) => {
    reviewed = details;
    return false;
  };

  const result = await editor.saveRefEdits({ showToast: false });
  assert.equal(result, false);
  assert.equal(saveCalls, 0);
  assert.equal(reviewed.conflicts[0].sourceId, 'source-world');
  assert.equal(reviewed.conflicts[0].path, 'entries.a.content');
  console.log('ok - reference world editor routes overlapping source fields to explicit review');
}
