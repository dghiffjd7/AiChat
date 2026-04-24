import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

class MemoryLocalStorageMock {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }
}

if (globalThis.localStorage === undefined) {
  globalThis.localStorage = new MemoryLocalStorageMock();
}

const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = () => 0;
const {
  TurnCheckpointStore,
  buildTurnCheckpointSessionSuffix,
  collectCheckpointSnapshotIds,
} = await import('../../src/scripts/storage/turn-checkpoint-store.js');
const { MemorySnapshotStore } = await import('../../src/scripts/storage/memory-snapshot-store.js');
globalThis.setTimeout = originalSetTimeout;

const withMockStorage = async fn => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = new MemoryLocalStorageMock();
  try {
    await fn(globalThis.localStorage);
  } finally {
    if (previous === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previous;
    }
  }
};

test('buildTurnCheckpointSessionSuffix should normalize special characters and stay deterministic', () => {
  const first = buildTurnCheckpointSessionSuffix('rp:persona/测试');
  const second = buildTurnCheckpointSessionSuffix('rp:persona/测试');
  assert.equal(first, second);
  assert.match(first, /^rp_persona___/);
});

test('TurnCheckpointStore should persist checkpoint, pointer and baseline snapshot id', async () => {
  await withMockStorage(async () => {
    const checkpointStore = new TurnCheckpointStore({ scopeId: 'persona:test' });
    const snapshotStore = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const sessionId = 'rp:persona:test';

    const baseSnapshot = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-1', table_id: 'profile', row_data: { name: '第一版' } }],
    });
    const altSnapshot = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-2', table_id: 'profile', row_data: { name: '第二版' } }],
    });

    assert.ok(baseSnapshot?.id);
    assert.ok(altSnapshot?.id);

    await checkpointStore.setBaselineSnapshotId(sessionId, baseSnapshot.id);
    await checkpointStore.upsertCheckpoint(sessionId, {
      sessionId,
      assistantMessageId: 'asst-1',
      userMessageId: 'user-1',
      activeSwipeIndex: 1,
      branches: [
        {
          swipeIndex: 0,
          messageContent: '第一条回复',
          messageRaw: '第一条回复',
          memorySnapshotId: baseSnapshot.id,
        },
        {
          swipeIndex: 1,
          messageContent: '第二条回复',
          messageRaw: '第二条回复',
          memorySnapshotId: altSnapshot.id,
        },
      ],
    });
    await checkpointStore.setPointer(sessionId, {
      sessionId,
      tailAssistantMessageId: 'asst-1',
      tailSwipeIndex: 1,
      source: 'test',
    });
    await checkpointStore.setArchivePointer(sessionId, 'arc-1', {
      sessionId,
      archiveId: 'arc-1',
      tailAssistantMessageId: 'asst-1',
      tailSwipeIndex: 1,
      memorySnapshotId: altSnapshot.id,
      source: 'archive-test',
    });

    const state = await checkpointStore.getSessionState(sessionId);
    assert.equal(state.baselineSnapshotId, baseSnapshot.id);
    assert.equal(state.pointer.tailAssistantMessageId, 'asst-1');
    assert.equal(state.pointer.tailSwipeIndex, 1);
    assert.equal(state.archivePointers['arc-1']?.tailAssistantMessageId, 'asst-1');
    assert.deepEqual(
      collectCheckpointSnapshotIds(state).sort(),
      [baseSnapshot.id, altSnapshot.id].sort(),
    );
  });
});

test('MemorySnapshotStore should prune unreachable snapshots after checkpoint removal', async () => {
  await withMockStorage(async () => {
    const checkpointStore = new TurnCheckpointStore({ scopeId: 'persona:test' });
    const snapshotStore = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const sessionId = 'rp:persona:test';

    const kept = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-keep', table_id: 'profile', row_data: { name: '保留' } }],
    });
    const removed = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-drop', table_id: 'profile', row_data: { name: '删除' } }],
    });

    await checkpointStore.setBaselineSnapshotId(sessionId, kept.id);
    await checkpointStore.upsertCheckpoint(sessionId, {
      sessionId,
      assistantMessageId: 'asst-1',
      branches: [
        { swipeIndex: 0, messageContent: '保留分支', memorySnapshotId: kept.id },
        { swipeIndex: 1, messageContent: '临时分支', memorySnapshotId: removed.id },
      ],
    });

    await snapshotStore.markReachable(sessionId, [kept.id, removed.id]);
    await checkpointStore.removeCheckpoint(sessionId, 'asst-1');
    await snapshotStore.markReachable(sessionId, [kept.id]);
    const removedIds = await snapshotStore.pruneUnreachable(sessionId, [kept.id], { graceMs: 0 });

    assert.deepEqual(removedIds, [removed.id]);
    const keptSnapshot = await snapshotStore.getSnapshot(kept.id);
    assert.equal(keptSnapshot?.rows?.[0]?.row_data?.name, '保留');
  });
});

test('MemorySnapshotStore should keep baseline snapshot reachable during prune', async () => {
  await withMockStorage(async () => {
    const checkpointStore = new TurnCheckpointStore({ scopeId: 'persona:test' });
    const snapshotStore = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const sessionId = 'rp:persona:test';

    const baseline = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-baseline', table_id: 'profile', row_data: { name: '起点' } }],
    });

    await checkpointStore.setBaselineSnapshotId(sessionId, baseline.id);
    const removedIds = await snapshotStore.pruneUnreachable(sessionId, [baseline.id], { graceMs: 0 });

    assert.deepEqual(removedIds, []);
    const loaded = await snapshotStore.getSnapshot(baseline.id);
    assert.equal(loaded?.rows?.[0]?.row_data?.name, '起点');
  });
});

test('checkpoint and snapshot stores should rename session state without losing payloads', async () => {
  await withMockStorage(async () => {
    const checkpointStore = new TurnCheckpointStore({ scopeId: 'persona:test' });
    const snapshotStore = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const from = 'rp:persona:old';
    const to = 'rp:persona:new';

    const snapshot = await snapshotStore.persistSnapshot(from, {
      sessionId: from,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-1', table_id: 'profile', row_data: { name: '迁移前' } }],
    });
    await checkpointStore.setBaselineSnapshotId(from, snapshot.id);
    await checkpointStore.upsertCheckpoint(from, {
      sessionId: from,
      assistantMessageId: 'asst-1',
      branches: [{ swipeIndex: 0, messageContent: '回复', memorySnapshotId: snapshot.id }],
    });
    await checkpointStore.setArchivePointer(from, 'arc-1', {
      sessionId: from,
      archiveId: 'arc-1',
      tailAssistantMessageId: 'asst-1',
      tailSwipeIndex: 0,
      memorySnapshotId: snapshot.id,
    });

    await snapshotStore.renameSession(from, to);
    await checkpointStore.renameSession(from, to);

    const renamedCheckpoint = await checkpointStore.getCheckpoint(to, 'asst-1');
    const renamedSnapshot = await snapshotStore.getSnapshot(snapshot.id);
    const renamedArchivePointer = await checkpointStore.getArchivePointer(to, 'arc-1');
    const oldCheckpoint = await checkpointStore.getCheckpoint(from, 'asst-1');

    assert.equal(renamedCheckpoint?.sessionId, to);
    assert.equal(renamedSnapshot?.sessionId, to);
    assert.equal(renamedSnapshot?.rows?.[0]?.row_data?.name, '迁移前');
    assert.equal(renamedArchivePointer?.sessionId, to);
    assert.equal(renamedArchivePointer?.archiveId, 'arc-1');
    assert.equal(oldCheckpoint, null);
  });
});

test('MemorySnapshotStore clearSession should remove refs and payloads for that session', async () => {
  await withMockStorage(async () => {
    const snapshotStore = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const sessionId = 'rp:persona:test';
    const snapshot = await snapshotStore.persistSnapshot(sessionId, {
      sessionId,
      templateId: 'default-v1',
      scope: 'contact',
      rows: [{ id: 'row-1', table_id: 'profile', row_data: { name: '待清理' } }],
    });

    await snapshotStore.clearSession(sessionId);

    const refs = await snapshotStore.listSnapshotIds(sessionId);
    const payload = await snapshotStore.getSnapshot(snapshot.id);
    assert.deepEqual(refs, []);
    assert.equal(payload, null);
  });
});

let failed = 0;
for (const item of tests) {
  try {
    await item.fn();
    console.log(`ok - ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${item.name}`);
    console.error(error);
  }
}

if (failed > 0) process.exit(1);
