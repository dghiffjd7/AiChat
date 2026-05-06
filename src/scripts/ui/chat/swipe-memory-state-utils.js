export const persistSwipeBranchMemoryState = async ({
  branches = [],
  index = -1,
  sessionId = '',
  buildSnapshot = null,
  cloneEntry = value => value,
  getMemoryUpdateEntry = null,
} = {}) => {
  if (!Array.isArray(branches) || index < 0 || index >= branches.length) return false;
  const branch = branches[index] && typeof branches[index] === 'object' ? branches[index] : null;
  if (!branch || branch.draft === true || typeof buildSnapshot !== 'function') return false;

  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) return false;

  branch.memoryTableSnapshot = snapshot;
  branch.memoryUpdateEntry = cloneEntry(getMemoryUpdateEntry?.(sessionId));
  return true;
};

export const applySwipeBranchMemoryState = async ({
  sessionId = '',
  branch = null,
  applySnapshot = null,
  cloneEntry = value => value,
  setMemoryUpdateEntry = null,
} = {}) => {
  if (!branch || typeof branch !== 'object' || !branch.memoryTableSnapshot) return false;
  if (typeof applySnapshot !== 'function') return false;

  const applied = await applySnapshot(sessionId, branch.memoryTableSnapshot);
  if (applied) {
    const entry = cloneEntry(branch.memoryUpdateEntry);
    setMemoryUpdateEntry?.(sessionId, entry || null);
  }
  return applied;
};

export const captureAssistantMemoryState = async ({
  sessionId = '',
  buildSnapshot = null,
  cloneSnapshot = value => value,
  cloneEntry = value => value,
  getMemoryUpdateEntry = null,
} = {}) => {
  if (typeof buildSnapshot !== 'function') return null;

  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) return null;

  return {
    memoryTableSnapshot: cloneSnapshot(snapshot),
    memoryUpdateEntry: cloneEntry(getMemoryUpdateEntry?.(sessionId)),
  };
};

export const attachAssistantMemoryStateToMeta = ({
  meta = null,
  memoryState = null,
  cloneSnapshot = value => value,
  cloneEntry = value => value,
} = {}) => {
  if (!meta || typeof meta !== 'object') return meta;
  if (!memoryState || !memoryState.memoryTableSnapshot) return meta;

  meta.memoryTableSnapshot = cloneSnapshot(memoryState.memoryTableSnapshot);
  if (memoryState.memoryUpdateEntry !== undefined) {
    meta.memoryUpdateEntry = cloneEntry(memoryState.memoryUpdateEntry);
  }
  return meta;
};
