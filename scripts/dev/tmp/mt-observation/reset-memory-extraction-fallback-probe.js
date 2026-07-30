(async () => {
  const store = window.appBridge?.debugUiRegistry?.stores?.maidSettingsStore;
  if (!store?.getMemoryExtractionSettings || !store?.setMemoryExtractionSettings) {
    return { ok: false, reason: 'store_unavailable' };
  }
  const before = store.getMemoryExtractionSettings();
  const isEarlierProbeDefault = (
    before.mode === 'follow_main' &&
    !before.profileId &&
    !before.modelOverride &&
    before.fallbackToMain === true
  );
  if (isEarlierProbeDefault) {
    await store.setMemoryExtractionSettings({ fallbackToMain: false });
  }
  return {
    ok: true,
    reset: isEarlierProbeDefault,
    before,
    after: store.getMemoryExtractionSettings(),
  };
})()
