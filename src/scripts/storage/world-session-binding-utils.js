const normalizeWorldbookIds = value => Array.from(new Set(
  (Array.isArray(value) ? value : (value ? [value] : []))
    .map(item => String(item || '').trim())
    .filter(Boolean),
));

const sameWorldbookIds = (left = [], right = []) => (
  left.length === right.length && left.every((id, index) => id === right[index])
);

export const resolveWorldSessionBindingMutation = ({
  currentWorldbookIds = [],
  expectedWorldbookIds = [],
  worldbookId = '',
  mode = 'append',
} = {}) => {
  const current = normalizeWorldbookIds(currentWorldbookIds);
  const expected = normalizeWorldbookIds(expectedWorldbookIds);
  const id = String(worldbookId || '').trim();
  const normalizedMode = String(mode || '').trim() === 'replace' ? 'replace' : 'append';
  if (!id) {
    return {
      ok: false,
      conflict: false,
      reason: 'missing_worldbook_id',
      mode: normalizedMode,
      previousWorldbookIds: current,
      expectedWorldbookIds: expected,
      worldbookIds: current,
    };
  }

  if (normalizedMode === 'replace') {
    if (!sameWorldbookIds(current, expected)) {
      return {
        ok: false,
        conflict: true,
        reason: 'binding_changed_during_operation',
        mode: normalizedMode,
        previousWorldbookIds: current,
        expectedWorldbookIds: expected,
        worldbookIds: current,
      };
    }
    const next = [id];
    const changed = !sameWorldbookIds(current, next);
    return {
      ok: true,
      conflict: false,
      reason: changed ? '' : 'already_bound',
      mode: normalizedMode,
      changed,
      added: !current.includes(id),
      previousWorldbookIds: current,
      expectedWorldbookIds: expected,
      worldbookIds: next,
    };
  }

  const expectedBound = expected.includes(id);
  const currentlyBound = current.includes(id);
  if (expectedBound && !currentlyBound) {
    return {
      ok: false,
      conflict: true,
      reason: 'binding_changed_during_operation',
      mode: normalizedMode,
      previousWorldbookIds: current,
      expectedWorldbookIds: expected,
      worldbookIds: current,
    };
  }
  if (currentlyBound) {
    return {
      ok: true,
      conflict: false,
      reason: 'already_bound',
      mode: normalizedMode,
      changed: false,
      added: false,
      previousWorldbookIds: current,
      expectedWorldbookIds: expected,
      worldbookIds: current,
    };
  }
  return {
    ok: true,
    conflict: false,
    reason: '',
    mode: normalizedMode,
    changed: true,
    added: true,
    previousWorldbookIds: current,
    expectedWorldbookIds: expected,
    worldbookIds: [...current, id],
  };
};
