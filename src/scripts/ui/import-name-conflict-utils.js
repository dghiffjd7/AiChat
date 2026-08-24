export const IMPORT_NAME_CONFLICT_DECISIONS = Object.freeze({
  cancel: 'cancel',
  keepBoth: 'keep_both',
  overwrite: 'overwrite',
});

const normalizeName = (value) => String(value || '').trim();

// 同名判定限定在同一 bind 类型内：world 绑定与 preset 绑定的集合互不冲突。
export const findRegexSetNameConflict = (existingSets = [], { name = '', bindType = '' } = {}) => {
  const target = normalizeName(name);
  if (!target) return null;
  const type = normalizeName(bindType);
  const list = Array.isArray(existingSets) ? existingSets : [];
  return list.find((setObj) =>
    normalizeName(setObj?.name) === target
    && (!type || normalizeName(setObj?.bind?.type) === type)) || null;
};

export const findPersonaNameConflict = (personas = [], name = '') => {
  const target = normalizeName(name);
  if (!target) return null;
  const list = Array.isArray(personas) ? personas : [];
  return list.find((persona) => normalizeName(persona?.name) === target) || null;
};
