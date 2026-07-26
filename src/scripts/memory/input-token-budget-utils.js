const toPositiveIntOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) && next > 0 ? next : null;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) ? Math.max(0, next) : Math.max(0, Math.trunc(Number(fallback)) || 0);
};

// history 裁剪的绝对兜底：预算调度器给不出 recent 配额时（条数模式 + ctx 未知等组合），
// history 不能彻底不设防。取高位值以符合「ctx 未知不钳低」的决议，只防病态膨胀。
export const HISTORY_TOKEN_BACKSTOP = 200000;

export const resolveRecentHistoryQuota = (recentAllocation, { backstopTokens = HISTORY_TOKEN_BACKSTOP } = {}) => {
  if (recentAllocation !== null && recentAllocation !== undefined && recentAllocation !== '') {
    const quota = Math.trunc(Number(recentAllocation));
    if (Number.isFinite(quota) && quota >= 0) return quota;
  }
  const backstop = Math.trunc(Number(backstopTokens));
  return Number.isFinite(backstop) && backstop > 0 ? backstop : null;
};

export const resolveInputTokenBudget = ({
  maxContextTokens = null,
  maxOutputTokens = 0,
  safetyReserveTokens = 512,
  userBudgetTokens = null,
} = {}) => {
  const maxContext = toPositiveIntOrNull(maxContextTokens);
  const maxOutput = toNonNegativeInt(maxOutputTokens);
  const safetyReserve = toNonNegativeInt(safetyReserveTokens, 512);
  const userBudget = toPositiveIntOrNull(userBudgetTokens);
  const contextInputLimitTokens = maxContext === null
    ? null
    : Math.max(0, maxContext - maxOutput - safetyReserve);

  let inputBudgetTokens = null;
  let source = 'unbounded';
  if (userBudget !== null && contextInputLimitTokens !== null) {
    inputBudgetTokens = Math.min(userBudget, contextInputLimitTokens);
    source = userBudget <= contextInputLimitTokens ? 'user' : 'context';
  } else if (userBudget !== null) {
    inputBudgetTokens = userBudget;
    source = 'user';
  } else if (contextInputLimitTokens !== null) {
    inputBudgetTokens = contextInputLimitTokens;
    source = 'context';
  }

  return {
    contextKnown: maxContext !== null,
    maxContextTokens: maxContext,
    maxOutputTokens: maxOutput,
    safetyReserveTokens: safetyReserve,
    userBudgetTokens: userBudget,
    contextInputLimitTokens,
    inputBudgetTokens,
    source,
  };
};

