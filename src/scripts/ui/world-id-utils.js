export const normalizeWorldIdList = (value, { excludeBuiltin = '' } = {}) => {
  const builtin = String(excludeBuiltin || '').trim();
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const normalized = list
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const deduped = Array.from(new Set(normalized));
  return builtin
    ? deduped.filter((id) => id !== builtin)
    : deduped;
};
