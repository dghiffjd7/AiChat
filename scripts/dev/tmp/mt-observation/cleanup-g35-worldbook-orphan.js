(async () => {
  const worldId = '记忆系统G35-0730·资料库';
  const before = await window.appBridge.auditWorldInfoStorage();
  const existedBefore = await window.appBridge.worldInfoExists(worldId);
  const deletion = existedBefore
    ? await window.appBridge.deleteWorldInfo(worldId)
    : { ok: true, worldId, skipped: true, reason: 'already_missing' };
  const existedAfter = await window.appBridge.worldInfoExists(worldId);
  const after = await window.appBridge.auditWorldInfoStorage();
  return {
    worldId,
    existedBefore,
    deletion,
    existedAfter,
    nativeOnlyBefore: before.nativeOnlyIds,
    nativeOnlyAfter: after.nativeOnlyIds,
    indexedOnlyAfter: after.indexedOnlyIds,
  };
})()
