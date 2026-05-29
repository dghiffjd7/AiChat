export const cloneVariableValue = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

export const isPlainVariableObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const isWrappedMvuScalar = (value) =>
  Array.isArray(value) && value.length === 2 && typeof value[1] === 'string' && !Array.isArray(value[0]);

export const deepEqualVariableValue = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqualVariableValue(value, b[index]));
  }
  if (isPlainVariableObject(a)) {
    if (!isPlainVariableObject(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqualVariableValue(a[key], b[key]));
  }
  return false;
};

export const mergeVariableObjects = (target, value) => {
  if (!isPlainVariableObject(target) || !isPlainVariableObject(value)) return false;
  Object.entries(value).forEach(([key, next]) => {
    if (isPlainVariableObject(next) && isPlainVariableObject(target[key])) {
      mergeVariableObjects(target[key], next);
    } else {
      target[key] = next;
    }
  });
  return true;
};

export const variablePathToString = (path) => {
  if (!Array.isArray(path) || !path.length) return '(root)';
  return path.map(segment => String(segment)).join('.');
};

export const previewVariableValue = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  } catch {
    return '[unserializable]';
  }
};

export const toVariableDateValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || Number.isFinite(Number(raw))) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const buildVariableStateUpdates = (original = {}, root = {}) => {
  const updates = {};
  const allKeys = [...new Set([...Object.keys(original || {}), ...Object.keys(root || {})])];
  allKeys.forEach((key) => {
    const nextValue = root[key];
    const prevValue = original[key];
    if (nextValue === undefined) {
      if (key in original) updates[key] = undefined;
      return;
    }
    if (!deepEqualVariableValue(prevValue, nextValue)) updates[key] = nextValue;
  });
  return { allKeys, updates };
};

export const collectChangedVariableKeys = (original = {}, root = {}, { limit = 12 } = {}) => {
  const keys = [];
  const allKeys = new Set([...Object.keys(original || {}), ...Object.keys(root || {})]);
  for (const key of allKeys) {
    if (!deepEqualVariableValue(original[key], root[key])) keys.push(String(key));
    if (keys.length >= limit) break;
  }
  return keys;
};

export const applyUpdateVariableCommandsToState = (
  initialRoot,
  commands,
  {
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    onAddDebug = null,
  } = {},
) => {
  let root = cloneVariableValue(initialRoot);
  const skipped = [];
  let appliedCount = 0;

  const pushSkip = (cmd, reason) => {
    if (skipped.length >= 12) return;
    const type = String(cmd?.type || '').trim().toLowerCase() || 'unknown';
    const path = Array.isArray(cmd?.path) ? cmd.path : (Array.isArray(cmd?.from) ? cmd.from : []);
    skipped.push(`${type}@${variablePathToString(path)}:${reason}`);
  };

  (Array.isArray(commands) ? commands : []).forEach((cmd) => {
    const type = String(cmd?.type || '').trim().toLowerCase();
    if (!type) return;
    if (type === 'move') {
      const from = Array.isArray(cmd.from) ? cmd.from : [];
      const to = Array.isArray(cmd.to) ? cmd.to : [];
      if (!from.length || !to.length) {
        pushSkip(cmd, 'invalid move path');
        return;
      }
      const resolvedFrom = resolveExistingPath(root, from, { allowLeaf: true });
      if (!resolvedFrom || !resolvedFrom.length) {
        pushSkip(cmd, 'move source not found');
        return;
      }
      const value = cloneVariableValue(getAt(root, resolvedFrom));
      const deleted = deleteAt(root, resolvedFrom);
      if (!deleted.ok) {
        pushSkip(cmd, 'move source delete failed');
        return;
      }
      const moved = setAt(root, to, value, { create: true });
      if (!moved.ok) {
        pushSkip(cmd, 'move target set failed');
        return;
      }
      appliedCount += 1;
      return;
    }

    const path = Array.isArray(cmd.path) ? cmd.path : [];

    if (type === 'set') {
      if (!path.length) {
        if (!cmd.value || typeof cmd.value !== 'object') {
          pushSkip(cmd, 'root set requires object');
          return;
        }
        root = cloneVariableValue(cmd.value);
        appliedCount += 1;
        return;
      }
      const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
      if (!resolvedPath || !resolvedPath.length) {
        pushSkip(cmd, 'set path not found');
        return;
      }
      const prev = getAt(root, resolvedPath);
      if (isWrappedMvuScalar(prev) && (typeof prev[0] !== 'object' || prev[0] === null)) {
        const nextWrapped = cloneVariableValue(prev);
        let nextValue = cmd.value;
        if (typeof prev[0] === 'number' && typeof cmd.value === 'string') {
          const parsed = Number(cmd.value);
          if (Number.isFinite(parsed)) nextValue = parsed;
        }
        nextWrapped[0] = nextValue;
        const result = setAt(root, resolvedPath, nextWrapped, { create: false });
        if (!result.ok) {
          pushSkip(cmd, 'wrapped set failed');
          return;
        }
        appliedCount += 1;
        return;
      }
      const result = setAt(root, resolvedPath, cmd.value, { create: false });
      if (!result.ok) {
        pushSkip(cmd, 'set failed');
        return;
      }
      appliedCount += 1;
      return;
    }

    if (type === 'add') {
      const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
      if (!resolvedPath || !resolvedPath.length) {
        pushSkip(cmd, 'add path not found');
        return;
      }
      const currentRaw = getAt(root, resolvedPath);
      const wrapped = isWrappedMvuScalar(currentRaw) && (typeof currentRaw[0] !== 'object' || currentRaw[0] === null);
      const current = wrapped ? currentRaw[0] : currentRaw;
      const delta = Number(cmd.value);
      if (!Number.isFinite(delta)) {
        pushSkip(cmd, 'add delta not number');
        return;
      }
      let next = null;
      const dateBase = toVariableDateValue(current);
      if (dateBase) {
        next = new Date(dateBase.getTime() + delta).toISOString();
      } else if (typeof current === 'number') {
        next = parseFloat((current + delta).toPrecision(12));
      } else if (typeof current === 'string') {
        const baseNum = Number(current);
        if (!Number.isFinite(baseNum)) {
          pushSkip(cmd, 'add target is non-numeric string');
          return;
        }
        next = parseFloat((baseNum + delta).toPrecision(12));
      } else {
        pushSkip(cmd, `add target unsupported type=${typeof current}`);
        return;
      }
      if (wrapped) {
        const nextWrapped = cloneVariableValue(currentRaw);
        nextWrapped[0] = next;
        const result = setAt(root, resolvedPath, nextWrapped, { create: false });
        if (!result.ok) {
          pushSkip(cmd, 'wrapped add failed');
          return;
        }
      } else {
        const result = setAt(root, resolvedPath, next, { create: false });
        if (!result.ok) {
          pushSkip(cmd, 'add set failed');
          return;
        }
      }
      if (typeof onAddDebug === 'function') {
        onAddDebug({
          path,
          resolvedPath,
          current,
          delta: cmd.value,
          next,
        });
      }
      appliedCount += 1;
      return;
    }

    if (type === 'insert') {
      const key = cmd.key;
      const target = path.length ? getAt(root, path) : root;
      if (target === undefined || target === null || typeof target !== 'object') {
        const created = typeof key === 'number' || key === '-' ? [] : {};
        setAt(root, path, created, { create: true });
      }
      const container = path.length ? getAt(root, path) : root;
      if (Array.isArray(container)) {
        if (key === null || key === undefined || key === '-') {
          container.push(cmd.value);
          appliedCount += 1;
        } else if (typeof key === 'number') {
          const index = Math.max(0, Math.min(container.length, key));
          container.splice(index, 0, cmd.value);
          appliedCount += 1;
        } else {
          pushSkip(cmd, 'insert array key invalid');
        }
      } else if (isPlainVariableObject(container)) {
        if (key === null || key === undefined) {
          if (!mergeVariableObjects(container, cmd.value)) {
            pushSkip(cmd, 'insert merge requires object');
            return;
          }
        } else {
          container[String(key)] = cmd.value;
        }
        appliedCount += 1;
      } else {
        pushSkip(cmd, 'insert target not object');
      }
      return;
    }

    if (type === 'remove') {
      const key = cmd.key;
      const target = path.length ? getAt(root, path) : root;
      if (!target || typeof target !== 'object') {
        pushSkip(cmd, 'remove target not object');
        return;
      }
      if (Array.isArray(target)) {
        if (typeof key === 'number') {
          if (key >= 0 && key < target.length) {
            target.splice(key, 1);
            appliedCount += 1;
          } else {
            pushSkip(cmd, 'remove array index out of range');
          }
        } else {
          const index = target.findIndex(item => deepEqualVariableValue(item, key));
          if (index >= 0) {
            target.splice(index, 1);
            appliedCount += 1;
          } else {
            pushSkip(cmd, 'remove array item not found');
          }
        }
        return;
      }
      if (isPlainVariableObject(target)) {
        if (typeof key === 'number') {
          const keys = Object.keys(target);
          if (key >= 0 && key < keys.length) {
            delete target[keys[key]];
            appliedCount += 1;
          } else {
            pushSkip(cmd, 'remove object index out of range');
          }
          return;
        }
        if (key === null || key === undefined) {
          pushSkip(cmd, 'remove object key missing');
          return;
        }
        const objectKey = String(key);
        if (!Object.prototype.hasOwnProperty.call(target, objectKey)) {
          pushSkip(cmd, 'remove object key not found');
          return;
        }
        delete target[objectKey];
        appliedCount += 1;
        return;
      }
      pushSkip(cmd, 'remove target unsupported');
      return;
    }

    if (type === 'delete') {
      const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
      if (!resolvedPath || !resolvedPath.length) {
        pushSkip(cmd, 'delete path not found');
        return;
      }
      const result = deleteAt(root, resolvedPath);
      if (!result.ok) {
        pushSkip(cmd, 'delete failed');
        return;
      }
      appliedCount += 1;
    }
  });

  return {
    root,
    appliedCount,
    skipped,
  };
};

export const buildUpdateVariableCommandsPreview = (
  initialRoot,
  commands,
  {
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    changeLimit = 24,
  } = {},
) => {
  const original = cloneVariableValue(isPlainVariableObject(initialRoot) ? initialRoot : {});
  const result = applyUpdateVariableCommandsToState(original, commands, {
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
  });
  if (!isPlainVariableObject(result.root)) {
    return {
      appliedCount: Number(result.appliedCount || 0),
      skipped: Array.isArray(result.skipped) ? result.skipped.slice() : [],
      changed: 0,
      entries: [],
      updates: {},
      rollbackSnapshot: original,
      invalid: true,
    };
  }
  const { updates } = buildVariableStateUpdates(original, result.root);
  const limit = Math.max(0, Math.trunc(Number(changeLimit) || 24));
  const entries = Object.keys(updates)
    .slice(0, limit)
    .map((key) => {
      const before = original[key];
      const after = result.root[key];
      const removed = after === undefined;
      const created = before === undefined && !removed;
      return {
        key,
        kind: removed ? 'delete' : (created ? 'create' : 'update'),
        before,
        after: removed ? undefined : after,
        beforePreview: previewVariableValue(before),
        afterPreview: removed ? '(deleted)' : previewVariableValue(after),
      };
    });
  return {
    appliedCount: Number(result.appliedCount || 0),
    skipped: Array.isArray(result.skipped) ? result.skipped.slice() : [],
    changed: Object.keys(updates).length,
    truncated: Object.keys(updates).length > entries.length,
    entries,
    updates,
    rollbackSnapshot: original,
    invalid: false,
  };
};
