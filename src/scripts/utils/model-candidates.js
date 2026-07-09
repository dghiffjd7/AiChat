// 模型候选排序（筛选排序而非过滤隐藏）：与输入匹配的排前，其余保持原序跟随，
// 永远不出现"匹配不到就空菜单"的 datalist 式问题。
export const rankModelCandidates = (models = [], query = '') => {
  const list = (Array.isArray(models) ? models : []).map(item => String(item || '')).filter(Boolean);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  const score = (model) => {
    const value = model.toLowerCase();
    if (value === q) return 0;
    if (value.startsWith(q)) return 1;
    if (value.includes(q)) return 2;
    return 3;
  };
  return list
    .map((model, index) => ({ model, index, rank: score(model) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.model);
};
