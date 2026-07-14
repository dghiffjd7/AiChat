// 变量 swipe 联动三件套（C 计划 M1）：镜像 swipe-memory-state-utils，字段名改为变量语义。
// build/apply 由调用方注入（读/写当前会话变量），本模块只负责把变量快照挂到 swipe 分支 / 从分支还原。
// 与记忆侧唯一区别：字段 variableSnapshot / variableUpdateEntry（记忆是 memoryTableSnapshot / memoryUpdateEntry）。

export const persistSwipeBranchVariableState = async ({
  branches = [],
  index = -1,
  sessionId = '',
  buildSnapshot = null,
  cloneEntry = value => value,
  getVariableUpdateEntry = null,
} = {}) => {
  if (!Array.isArray(branches) || index < 0 || index >= branches.length) return false;
  const branch = branches[index] && typeof branches[index] === 'object' ? branches[index] : null;
  if (!branch || branch.draft === true || typeof buildSnapshot !== 'function') return false;

  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) return false;

  branch.variableSnapshot = snapshot;
  branch.variableUpdateEntry = cloneEntry(getVariableUpdateEntry?.(sessionId));
  return true;
};

export const applySwipeBranchVariableState = async ({
  sessionId = '',
  branch = null,
  applySnapshot = null,
  cloneEntry = value => value,
  setVariableUpdateEntry = null,
} = {}) => {
  if (!branch || typeof branch !== 'object' || !branch.variableSnapshot) return false;
  if (typeof applySnapshot !== 'function') return false;

  const applied = await applySnapshot(sessionId, branch.variableSnapshot);
  if (applied) {
    const entry = cloneEntry(branch.variableUpdateEntry);
    setVariableUpdateEntry?.(sessionId, entry || null);
  }
  return applied;
};

export const captureAssistantVariableState = async ({
  sessionId = '',
  buildSnapshot = null,
  cloneSnapshot = value => value,
  cloneEntry = value => value,
  getVariableUpdateEntry = null,
} = {}) => {
  if (typeof buildSnapshot !== 'function') return null;

  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) return null;

  return {
    variableSnapshot: cloneSnapshot(snapshot),
    variableUpdateEntry: cloneEntry(getVariableUpdateEntry?.(sessionId)),
  };
};

export const attachAssistantVariableStateToMeta = ({
  meta = null,
  variableState = null,
  cloneSnapshot = value => value,
  cloneEntry = value => value,
} = {}) => {
  if (!meta || typeof meta !== 'object') return meta;
  if (!variableState || !variableState.variableSnapshot) return meta;

  meta.variableSnapshot = cloneSnapshot(variableState.variableSnapshot);
  if (variableState.variableUpdateEntry !== undefined) {
    meta.variableUpdateEntry = cloneEntry(variableState.variableUpdateEntry);
  }
  return meta;
};
