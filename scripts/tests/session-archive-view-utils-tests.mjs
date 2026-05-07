import assert from 'node:assert/strict';

import { renderSessionArchivesSection } from '../../src/scripts/ui/session-archive-view-utils.js';

const createContainer = () => ({
  innerHTML: '',
  children: [],
  appendChild(child) {
    this.children.push(child);
    return child;
  },
});

{
  const container = createContainer();
  const empty = { kind: 'empty' };
  const ok = renderSessionArchivesSection({
    container,
    sessionId: 's1',
    chatStore: {
      state: { sessions: {} },
      getArchives() {
        return [];
      },
    },
    createEmptyState: () => empty,
  });
  assert.equal(ok, true);
  assert.deepEqual(container.children, [empty]);
  console.log('ok - renderSessionArchivesSection renders empty archive state when session has no archives');
}

{
  const container = createContainer();
  const rows = [];
  renderSessionArchivesSection({
    container,
    sessionId: 's1',
    chatStore: {
      state: { sessions: { s1: { currentArchiveId: 'a2' } } },
      getArchives() {
        return [
          { id: 'a1', name: '旧档', timestamp: 1700000000000, messageCount: 3 },
          { id: 'a2', name: '当前档', timestamp: 1700001000000, messageCount: 5 },
        ];
      },
    },
    createArchiveRow: (payload) => {
      rows.push(payload);
      return { row: { payload } };
    },
  });
  assert.equal(container.children.length, 2);
  assert.equal(rows[0].archiveName, '旧档');
  assert.equal(rows[0].isCurrent, false);
  assert.equal(rows[1].isCurrent, true);
  assert.equal(String(rows[0].dateText).length > 0, true);
  assert.equal(rows[0].messageCount, 3);
  console.log('ok - renderSessionArchivesSection maps archive metadata into shared row builders');
}

{
  const container = createContainer();
  let loaded = 0;
  let hidden = 0;
  let deleted = 0;
  let confirmed = 0;
  let switchPayload = null;
  let deletePayload = null;
  const rowDefs = [];
  renderSessionArchivesSection({
    container,
    sessionId: 's1',
    isGroup: true,
    chatStore: {
      state: { sessions: { s1: { currentArchiveId: '' } } },
      getArchives() {
        return [{ id: 'a1', name: '旧档', timestamp: 1700000000000, messageCount: 3 }];
      },
    },
    appConfirmFn: async () => {
      confirmed += 1;
      return true;
    },
    runArchiveSwitchFlow: async (payload) => {
      switchPayload = payload;
    },
    runArchiveDeleteFlow: async (payload) => {
      deletePayload = payload;
    },
    onArchiveLoaded: () => {
      loaded += 1;
    },
    onHide: () => {
      hidden += 1;
    },
    onArchiveDeleted: () => {
      deleted += 1;
    },
    createArchiveRow: (payload) => {
      rowDefs.push(payload);
      return { row: { payload } };
    },
  });
  await rowDefs[0].onSelect();
  await rowDefs[0].onDelete({ stopPropagation() {} });
  assert.equal(confirmed, 2);
  assert.equal(loaded, 1);
  assert.equal(hidden, 1);
  assert.equal(switchPayload?.isGroup, true);
  assert.equal(switchPayload?.sessionId, 's1');
  assert.equal(switchPayload?.archive?.id, 'a1');
  assert.equal(deletePayload?.archiveId, 'a1');
  assert.equal(typeof deletePayload?.renderArchives, 'function');
  deletePayload.renderArchives();
  assert.equal(deleted, 1);
  console.log('ok - renderSessionArchivesSection wires archive load and delete flows through shared runtime');
}
