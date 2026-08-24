import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const {
  WORLDBOOK_IMPORT_CONFLICT_CODE,
  WORLDBOOK_IMPORT_DECISIONS,
  buildWorldbookImportPlan,
} = await import('../../src/scripts/ui/worldbook-import-conflict-utils.js');

{
  const incomingWorld = { name: 'New world', entries: [{ id: 2, content: 'incoming' }] };
  const plan = buildWorldbookImportPlan({
    worldId: 'shared-world',
    incomingWorld,
    snapshot: {
      exists: false,
      revision: 0,
      generation: 4,
      data: null,
    },
  });

  assert.equal(plan.targetId, 'shared-world');
  assert.equal(plan.incomingWorld, incomingWorld);
  assert.equal(plan.conflict, null);
  assert.deepEqual(plan.saveOptions, {
    expectedRevision: 0,
    expectedGeneration: 4,
    expectedExists: false,
  });
  console.log('ok - new worldbook import plans an atomic create without a conflict');
}

{
  const existingWorld = { name: 'Existing world', entries: [{ id: 1, content: 'existing' }] };
  const incomingWorld = { name: 'Incoming world', entries: [{ id: 2, content: 'incoming' }] };
  const plan = buildWorldbookImportPlan({
    worldId: 'shared-world',
    incomingWorld,
    snapshot: {
      exists: true,
      revision: 7,
      generation: 3,
      data: existingWorld,
    },
  });

  assert.equal(plan.conflict?.code, WORLDBOOK_IMPORT_CONFLICT_CODE);
  assert.equal(plan.conflict?.resourceType, 'worldbook');
  assert.equal(plan.conflict?.targetId, 'shared-world');
  assert.equal(plan.conflict?.base, existingWorld);
  assert.equal(plan.conflict?.incoming, incomingWorld);
  assert.deepEqual(plan.conflict?.baseline, {
    revision: 7,
    generation: 3,
    exists: true,
  });
  assert.deepEqual(plan.saveOptions, {
    expectedRevision: 7,
    expectedGeneration: 3,
    expectedExists: true,
  });
  assert.deepEqual(WORLDBOOK_IMPORT_DECISIONS, {
    cancel: 'cancel',
    overwrite: 'overwrite',
  });
  console.log('ok - same-id import exposes both sides and a CAS baseline for future diff review');
}

{
  assert.throws(
    () => buildWorldbookImportPlan({ worldId: '   ', incomingWorld: {}, snapshot: null }),
    /世界书名称不能为空/,
  );
  console.log('ok - worldbook import plans reject an empty resource identity');
}

{
  const panelSource = await readFile(new URL('../../src/scripts/ui/world-panel.js', import.meta.url), 'utf8');
  const onImportStart = panelSource.indexOf('async onImport()');
  const onImportEnd = panelSource.indexOf('async onExportCurrent()', onImportStart);
  const onImportBody = panelSource.slice(onImportStart, onImportEnd);
  const planIndex = onImportBody.indexOf('buildWorldbookImportPlan');
  const choiceIndex = onImportBody.indexOf('await appChoice');
  const saveIndex = onImportBody.indexOf('saveWorldInfo');

  assert.ok(planIndex >= 0, 'world panel import must build a structured collision plan');
  assert.ok(choiceIndex > planIndex, 'same-name choice must happen after collision detection');
  assert.ok(saveIndex > choiceIndex, 'worldbook must not be saved before the collision choice');
  assert.match(onImportBody, /defaultActionId:\s*WORLDBOOK_IMPORT_DECISIONS\.cancel/);
  assert.match(onImportBody, /decision\s*!==\s*WORLDBOOK_IMPORT_DECISIONS\.overwrite/);
  console.log('ok - world panel requires explicit overwrite and keeps cancel as the safe default');
}

{
  const bridgeSource = await readFile(new URL('../../src/scripts/ui/bridge.js', import.meta.url), 'utf8');
  const importStart = bridgeSource.indexOf('window.importSTWorld = async');
  const importEnd = bridgeSource.indexOf('// 初始化', importStart);
  const importBody = bridgeSource.slice(importStart, importEnd);
  assert.match(importBody, /buildWorldbookImportPlan/);
  assert.match(importBody, /WORLDBOOK_IMPORT_CONFLICT_CODE/);
  assert.match(importBody, /conflictAction/);
  console.log('ok - compatibility worldbook import fails closed unless overwrite is explicit');
}
