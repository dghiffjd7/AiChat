import assert from 'node:assert/strict';

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
