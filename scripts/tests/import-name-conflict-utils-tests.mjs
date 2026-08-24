import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const {
  IMPORT_NAME_CONFLICT_DECISIONS,
  findRegexSetNameConflict,
  findPersonaNameConflict,
} = await import('../../src/scripts/ui/import-name-conflict-utils.js');

{
  assert.deepEqual(IMPORT_NAME_CONFLICT_DECISIONS, {
    cancel: 'cancel',
    keepBoth: 'keep_both',
    overwrite: 'overwrite',
  });
  console.log('ok - import name conflict decisions are a frozen tri-state');
}

{
  const sets = [
    { id: 'a', name: '战斗正则', bind: { type: 'world' } },
    { id: 'b', name: '战斗正则', bind: { type: 'preset' } },
    { id: 'c', name: '  旁白清理  ', bind: { type: 'world' } },
  ];
  assert.equal(findRegexSetNameConflict(sets, { name: '战斗正则', bindType: 'world' })?.id, 'a');
  assert.equal(findRegexSetNameConflict(sets, { name: '战斗正则', bindType: 'preset' })?.id, 'b');
  assert.equal(findRegexSetNameConflict(sets, { name: '旁白清理', bindType: 'world' })?.id, 'c');
  assert.equal(findRegexSetNameConflict(sets, { name: '旁白清理', bindType: 'preset' }), null);
  assert.equal(findRegexSetNameConflict(sets, { name: '不存在', bindType: 'world' }), null);
  assert.equal(findRegexSetNameConflict(sets, { name: '   ', bindType: 'world' }), null);
  assert.equal(findRegexSetNameConflict(null, { name: '战斗正则', bindType: 'world' }), null);
  console.log('ok - regex set conflicts match by trimmed name within the same bind type');
}

{
  const personas = [
    { id: 'p1', name: '艾拉' },
    { id: 'p2', name: '  小满 ' },
  ];
  assert.equal(findPersonaNameConflict(personas, '艾拉')?.id, 'p1');
  assert.equal(findPersonaNameConflict(personas, '小满')?.id, 'p2');
  assert.equal(findPersonaNameConflict(personas, '不存在'), null);
  assert.equal(findPersonaNameConflict(personas, ''), null);
  assert.equal(findPersonaNameConflict(undefined, '艾拉'), null);
  console.log('ok - persona conflicts match by trimmed name and tolerate missing lists');
}

{
  const panelSource = await readFile(new URL('../../src/scripts/ui/regex-panel.js', import.meta.url), 'utf8');
  const handlerStart = panelSource.indexOf("top.querySelector('#re-scoped-import').onclick");
  const handlerEnd = panelSource.indexOf("top.querySelector('#re-scoped-batch').onclick", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'regex scoped import handler must exist');
  const handlerBody = panelSource.slice(handlerStart, handlerEnd);
  const conflictIndex = handlerBody.indexOf('findRegexSetNameConflict');
  const choiceIndex = handlerBody.indexOf('await appChoice');
  const upsertIndex = handlerBody.indexOf('upsertLocalSet');
  assert.ok(conflictIndex >= 0, 'regex import must detect same-name sets before writing');
  assert.ok(choiceIndex > conflictIndex, 'same-name choice must follow conflict detection');
  assert.ok(upsertIndex > choiceIndex, 'regex set must not be written before the collision choice');
  assert.match(handlerBody, /defaultActionId:\s*IMPORT_NAME_CONFLICT_DECISIONS\.cancel/);
  assert.match(handlerBody, /IMPORT_NAME_CONFLICT_DECISIONS\.overwrite/);
  assert.match(handlerBody, /IMPORT_NAME_CONFLICT_DECISIONS\.keepBoth/);
  assert.match(handlerBody, /overwriteId\s*\?\s*\{\s*id:\s*overwriteId\s*\}/);
  console.log('ok - regex panel import requires an explicit choice and keeps skip as the safe default');
}

{
  const importerSource = await readFile(new URL('../../src/scripts/ui/character-card-importer.js', import.meta.url), 'utf8');
  const importStart = importerSource.indexOf('async importCard(');
  assert.ok(importStart >= 0, 'importCard must exist');
  const importBody = importerSource.slice(importStart);
  const conflictIndex = importBody.indexOf('findPersonaNameConflict');
  const createIndex = importBody.indexOf('this.personaStore.create');
  assert.ok(conflictIndex >= 0, 'card import must detect same-name personas');
  assert.ok(createIndex > conflictIndex, 'persona must not be created before the same-name choice');
  assert.match(importBody, /await this\.personaStore\.ready/);
  assert.match(importBody, /defaultActionId:\s*IMPORT_NAME_CONFLICT_DECISIONS\.cancel/);
  assert.match(importBody, /decision\s*!==\s*IMPORT_NAME_CONFLICT_DECISIONS\.keepBoth\)\s*return false/);
  assert.doesNotMatch(
    importBody.slice(0, importBody.indexOf('promptImportOptions')),
    /personaStore\.create/,
  );
  console.log('ok - card import asks before creating a duplicate persona and cancels by default');
}
