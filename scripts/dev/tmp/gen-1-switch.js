(async () => {
  const mod = await import('/scripts/storage/config.js');
  const mgr = new mod.ConfigManager();
  await mgr.load();
  const prev = mgr.getActiveProfileId?.();
  await mgr.setActiveProfile('profile-1769099653885-3faa87');
  return { prev, now: mgr.getActiveProfileId?.() };
})()
