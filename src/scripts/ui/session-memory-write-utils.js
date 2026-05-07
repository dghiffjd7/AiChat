export const batchCreateMemoriesWithFallback = async ({
  memoryTableStore = null,
  inputs = [],
} = {}) => {
  const list = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  if (!memoryTableStore || !list.length) return 0;
  try {
    const result = await memoryTableStore.batchCreateMemories?.(list);
    const normalized = Number(result);
    return Number.isFinite(normalized) ? normalized : list.length;
  } catch {
    let inserted = 0;
    for (const input of list) {
      try {
        await memoryTableStore.createMemory?.(input);
        inserted += 1;
      } catch {}
    }
    return inserted;
  }
};
