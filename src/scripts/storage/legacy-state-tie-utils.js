const KEEP_BLOCKED = Object.freeze({ action: 'keep_blocked', backupRequired: false });

export const resolveLegacyStateTie = ({
  local = null,
  kv = null,
  isEmpty = null,
} = {}) => {
  if (!local || !kv || typeof isEmpty !== 'function') return KEEP_BLOCKED;
  const localUpdatedAt = Number(local.updatedAt || 0) || 0;
  const kvUpdatedAt = Number(kv.updatedAt || 0) || 0;
  if (localUpdatedAt !== 0 || kvUpdatedAt !== 0) return KEEP_BLOCKED;

  let localEmpty = true;
  let kvEmpty = true;
  try {
    localEmpty = isEmpty(local) === true;
    kvEmpty = isEmpty(kv) === true;
  } catch {
    return KEEP_BLOCKED;
  }

  if (localEmpty) return { action: 'adopt_kv', backupRequired: false };
  if (kvEmpty) return { action: 'adopt_local', backupRequired: false };
  return { action: 'adopt_local', backupRequired: true };
};
