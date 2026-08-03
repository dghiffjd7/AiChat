import assert from 'node:assert/strict';

import {
  STORAGE_MIGRATION_CONTRACTS,
  buildStorageMigrationChecklist,
  findStorageMigrationContract,
  listStorageMigrationContracts,
} from '../../src/scripts/storage/storage-migration-contracts.js';

{
  const ids = STORAGE_MIGRATION_CONTRACTS.map(contract => contract.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(STORAGE_MIGRATION_CONTRACTS.every(contract => contract.currentKey && contract.owner), true);
  assert.equal(STORAGE_MIGRATION_CONTRACTS.every(contract => /_v\d+(?:_|$)/.test(String(contract.currentKey))), true);
  assert.equal(STORAGE_MIGRATION_CONTRACTS.every(contract => Array.isArray(contract.writeTargets) && contract.writeTargets.length), true);
  assert.equal(STORAGE_MIGRATION_CONTRACTS.every(contract => Array.isArray(contract.tests) && contract.tests.length), true);
  console.log('ok - storage migration contracts have stable ids keys owners write targets and tests');
}

{
  const scopedLegacyContracts = listStorageMigrationContracts({
    scopeStrategy: 'scoped-with-legacy-migration',
  });
  assert.deepEqual(
    scopedLegacyContracts.map(contract => contract.id),
    ['contacts', 'groups', 'moments', 'moment-summaries'],
  );
  scopedLegacyContracts.forEach((contract) => {
    assert.equal(contract.legacyMigrationKey, `${contract.currentKey}__scoped_migrated`);
    assert.deepEqual(contract.legacyReadKeys, [contract.currentKey]);
    assert.equal(contract.writeTargets.includes(`${contract.currentKey}__<scope>`), true);
  });
  console.log('ok - scoped legacy migration contracts preserve migration marker and read/write key policy');
}

{
  const highRisk = listStorageMigrationContracts({ risk: 'high' });
  assert.equal(highRisk.length >= 8, true);
  assert.equal(highRisk.every(contract => contract.importExportSurfaces.length > 0), true);
  assert.equal(highRisk.some(contract => contract.id === 'memory-snapshots'), true);
  assert.equal(highRisk.some(contract => contract.id === 'turn-checkpoints'), true);
  assert.equal(findStorageMigrationContract('world-global-id').scopeStrategy, 'shared-with-scoped-legacy-read');
  assert.equal(findStorageMigrationContract('world-global-id').currentKey, 'global_world_ids_shared_v1');
  assert.deepEqual(findStorageMigrationContract('prompt-presets').legacyReadKeys, ['prompt_preset_store_v1']);
  assert.equal(findStorageMigrationContract('prompt-presets').writeTargets.includes('prompt_preset_store_v2_index'), true);
  assert.equal(findStorageMigrationContract('missing'), null);
  console.log('ok - storage migration contract filters expose high-risk and shared legacy-read boundaries');
}

{
  const checklist = buildStorageMigrationChecklist({ scopeId: 'persona:Alice/主线' });
  const contacts = checklist.find(item => item.id === 'contacts');
  const globalId = checklist.find(item => item.id === 'world-global-id');
  assert.equal(contacts.scopedKeyExample, 'contacts_store_v1__persona_Alice___');
  assert.deepEqual(contacts.writeTargets, ['contacts_store_v1__<scope>']);
  assert.equal(globalId.scopedKeyExample, 'global_world_ids_shared_v1__persona_Alice___');
  assert.deepEqual(globalId.legacyReadKeys, ['global_world_id_shared_v1', 'global_world_id_v1__<scope>']);
  assert.deepEqual(globalId.writeTargets, ['global_world_ids_shared_v1', 'global_world_id_shared_v1']);
  assert.notEqual(contacts.writeTargets, STORAGE_MIGRATION_CONTRACTS[0].writeTargets);
  contacts.writeTargets.push('mutated');
  assert.deepEqual(STORAGE_MIGRATION_CONTRACTS[0].writeTargets, ['contacts_store_v1__<scope>']);
  console.log('ok - buildStorageMigrationChecklist produces scoped examples and cloned checklist arrays');
}
