export const WORLDBOOK_IMPORT_CONFLICT_CODE = 'worldbook_import_name_conflict';

export const WORLDBOOK_IMPORT_DECISIONS = Object.freeze({
  cancel: 'cancel',
  overwrite: 'overwrite',
});

const normalizeVersion = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const buildWorldbookImportPlan = ({
  worldId = '',
  incomingWorld = null,
  snapshot = null,
} = {}) => {
  const targetId = String(worldId || '').trim();
  if (!targetId) throw new Error('世界书名称不能为空');

  const baseline = Object.freeze({
    revision: normalizeVersion(snapshot?.revision),
    generation: normalizeVersion(snapshot?.generation),
    exists: snapshot?.exists === true,
  });
  const conflict = baseline.exists
    ? Object.freeze({
      code: WORLDBOOK_IMPORT_CONFLICT_CODE,
      resourceType: 'worldbook',
      targetId,
      baseline,
      base: snapshot?.data ?? null,
      incoming: incomingWorld,
    })
    : null;

  return Object.freeze({
    targetId,
    incomingWorld,
    baseline,
    conflict,
    saveOptions: Object.freeze({
      expectedRevision: baseline.revision,
      expectedGeneration: baseline.generation,
      expectedExists: baseline.exists,
    }),
  });
};
