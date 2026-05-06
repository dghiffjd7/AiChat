import {
  applyUpdateVariableCommandsToState,
  buildVariableStateUpdates,
  cloneVariableValue,
  collectChangedVariableKeys,
  deepEqualVariableValue,
  isPlainVariableObject,
  previewVariableValue,
  variablePathToString,
} from './update-variable-command-utils.js';

export const applyUpdateVariableCommandsWithStore = ({
  sessionId = '',
  commands = [],
  useGlobal = false,
  listVars = {},
  getAt,
  setAt,
  deleteAt,
  resolveExistingPath,
  setVar,
  deleteVar,
  shouldEmitStarted = false,
  shouldEmitEnded = false,
  emitStarted,
  emitEnded,
  logger = console,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!Array.isArray(commands) || !commands.length || !sid) return false;
  if (typeof setVar !== 'function') return false;
  if (
    typeof getAt !== 'function' ||
    typeof setAt !== 'function' ||
    typeof deleteAt !== 'function' ||
    typeof resolveExistingPath !== 'function'
  ) {
    return false;
  }
  const updates = (shouldEmitStarted || shouldEmitEnded) ? {} : null;
  const original = cloneVariableValue(listVars);
  const { root, appliedCount, skipped } = applyUpdateVariableCommandsToState(listVars, commands, {
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    onAddDebug: ({ path, resolvedPath, current, delta, next }) => {
      logger?.info?.(
        `[update-variable] add-debug path=${variablePathToString(path)} resolved=${variablePathToString(resolvedPath)} cur=${previewVariableValue(current)} delta=${previewVariableValue(delta)} next=${previewVariableValue(next)}`,
      );
    },
  });
  if (!isPlainVariableObject(root)) return false;
  const { allKeys, updates: nextUpdates } = buildVariableStateUpdates(original, root);
  if (updates) {
    Object.assign(updates, nextUpdates);
    if (Object.keys(updates).length && shouldEmitStarted && typeof emitStarted === 'function') {
      emitStarted(sid, updates, { useGlobal });
    }
  }
  let changed = false;
  for (const key of allKeys) {
    if (updates && !Object.prototype.hasOwnProperty.call(updates, key)) continue;
    const nextVal = root[key];
    const prevVal = original[key];
    if (!updates && deepEqualVariableValue(prevVal, nextVal)) continue;
    if (nextVal === undefined) {
      if (typeof deleteVar === 'function' && key in original) {
        deleteVar(key, sid);
        changed = true;
      }
      continue;
    }
    setVar(key, nextVal, sid);
    changed = true;
  }
  if (changed && shouldEmitEnded && typeof emitEnded === 'function') {
    emitEnded(sid, { useGlobal });
  }
  if (appliedCount || skipped.length) {
    logger?.info?.(
      `[update-variable] apply session=${sid} total=${commands.length} applied=${appliedCount} skipped=${skipped.length}`,
    );
  }
  if (skipped.length) {
    logger?.warn?.(`[update-variable] skipped-detail ${skipped.join(' | ')}`);
  }
  if (changed) {
    const changedKeys = collectChangedVariableKeys(original, root, { limit: 12 });
    if (changedKeys.length) logger?.info?.(`[update-variable] changed-keys ${changedKeys.join(', ')}`);
  }
  return changed;
};
