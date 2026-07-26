import { resolveInputTokenBudget } from './input-token-budget-utils.js';

export const MEMORY_BUDGET_SEGMENTS = Object.freeze([
  'state',
  'recent',
  'mid',
  'far',
  'recall',
]);

const DEFAULT_PROFILES = Object.freeze({
  writing: Object.freeze({
    state: 0.12,
    recent: 0.50,
    mid: 0.18,
    far: 0.08,
    recall: 0.12,
  }),
  chat: Object.freeze({
    state: 0.28,
    recent: 0.32,
    mid: 0.15,
    far: 0.10,
    recall: 0.15,
  }),
  moments: Object.freeze({
    state: 0.20,
    recent: 0.30,
    mid: 0.15,
    far: 0.10,
    recall: 0.25,
  }),
});

const toNonNegativeInt = (value, fallback = 0) => {
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) ? Math.max(0, next) : Math.max(0, Math.trunc(Number(fallback)) || 0);
};

const toDemand = (value) => {
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) ? Math.max(0, next) : Number.POSITIVE_INFINITY;
};

export const normalizeMemoryBudgetMode = value =>
  String(value || '').trim().toLowerCase() === 'rows' ? 'rows' : 'token';

export const resolveMemoryBudgetPlace = value => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'rp' || raw === 'writing' || raw === 'creative') return 'writing';
  if (raw === 'moments' || raw === 'moment') return 'moments';
  return 'chat';
};

export const resolveMemoryBudgetRatios = (place = 'chat', override = null) => {
  const profile = DEFAULT_PROFILES[resolveMemoryBudgetPlace(place)] || DEFAULT_PROFILES.chat;
  const source = override && typeof override === 'object' ? { ...profile, ...override } : profile;
  const raw = {};
  let total = 0;
  MEMORY_BUDGET_SEGMENTS.forEach((segment) => {
    const value = Number(source?.[segment]);
    raw[segment] = Number.isFinite(value) && value > 0 ? value : 0;
    total += raw[segment];
  });
  if (total <= 0) return { ...profile };
  return Object.fromEntries(
    MEMORY_BUDGET_SEGMENTS.map(segment => [segment, raw[segment] / total]),
  );
};

export const allocateMemoryTokenQuotas = ({
  poolTokens = 0,
  ratios = null,
  demands = null,
  reflowOrder = ['recent', 'state', 'mid', 'far', 'recall'],
} = {}) => {
  const pool = toNonNegativeInt(poolTokens);
  const normalizedRatios = resolveMemoryBudgetRatios('chat', ratios);
  const normalizedDemands = Object.fromEntries(
    MEMORY_BUDGET_SEGMENTS.map(segment => [segment, toDemand(demands?.[segment])]),
  );
  const baseQuotas = {};
  let assignedBase = 0;
  MEMORY_BUDGET_SEGMENTS.forEach((segment, index) => {
    const quota = index === MEMORY_BUDGET_SEGMENTS.length - 1
      ? Math.max(0, pool - assignedBase)
      : Math.floor(pool * normalizedRatios[segment]);
    baseQuotas[segment] = quota;
    assignedBase += quota;
  });

  const allocations = {};
  let usedCapacity = 0;
  MEMORY_BUDGET_SEGMENTS.forEach((segment) => {
    const demand = normalizedDemands[segment];
    const allocation = demand === Number.POSITIVE_INFINITY
      ? baseQuotas[segment]
      : Math.min(baseQuotas[segment], demand);
    allocations[segment] = allocation;
    usedCapacity += allocation;
  });

  const stateDemand = normalizedDemands.state;
  if (stateDemand !== Number.POSITIVE_INFINITY && stateDemand > allocations.state) {
    let shortfall = Math.min(pool, stateDemand) - allocations.state;
    for (const donor of ['recall', 'far', 'mid', 'recent']) {
      if (shortfall <= 0) break;
      const take = Math.min(shortfall, allocations[donor]);
      allocations[donor] -= take;
      allocations.state += take;
      shortfall -= take;
    }
  }

  usedCapacity = MEMORY_BUDGET_SEGMENTS.reduce(
    (sum, segment) => sum + allocations[segment],
    0,
  );
  let remaining = Math.max(0, pool - usedCapacity);
  const order = Array.from(new Set([
    ...(Array.isArray(reflowOrder) ? reflowOrder : []),
    ...MEMORY_BUDGET_SEGMENTS,
  ])).filter(segment => MEMORY_BUDGET_SEGMENTS.includes(segment));
  while (remaining > 0) {
    let changed = false;
    for (const segment of order) {
      const demand = normalizedDemands[segment];
      const unmet = demand === Number.POSITIVE_INFINITY
        ? remaining
        : Math.max(0, demand - allocations[segment]);
      if (unmet <= 0) continue;
      const add = Math.min(remaining, unmet);
      allocations[segment] += add;
      remaining -= add;
      changed = true;
      if (remaining <= 0) break;
    }
    if (!changed) break;
  }

  return {
    poolTokens: pool,
    ratios: normalizedRatios,
    demands: normalizedDemands,
    baseQuotas,
    allocations,
    unallocatedTokens: remaining,
    overQuotaSegments: MEMORY_BUDGET_SEGMENTS.filter(
      segment => normalizedDemands[segment] !== Number.POSITIVE_INFINITY
        && normalizedDemands[segment] > allocations[segment],
    ),
  };
};

export const reflowUnusedRecallToRecent = (allocations = null, recallUsedTokens = 0) => {
  if (!allocations || typeof allocations !== 'object') {
    return { allocations: null, releasedTokens: 0 };
  }
  const next = { ...allocations };
  const recallQuota = toNonNegativeInt(next.recall);
  const recallUsed = Math.min(recallQuota, toNonNegativeInt(recallUsedTokens));
  const releasedTokens = Math.max(0, recallQuota - recallUsed);
  next.recall = recallUsed;
  next.recent = toNonNegativeInt(next.recent) + releasedTokens;
  return { allocations: next, releasedTokens };
};

export const resolveMemoryBudgetEnvelope = ({
  settings = null,
  maxContextTokens = null,
  maxOutputTokens = 0,
  place = 'chat',
  worldContextPercent = 20,
  worldBudgetCap = 0,
  demands = null,
} = {}) => {
  const mode = normalizeMemoryBudgetMode(settings?.memoryBudgetMode);
  const configuredBudget = toNonNegativeInt(settings?.memoryInputBudgetTokens, 100000);
  const input = resolveInputTokenBudget({
    maxContextTokens,
    maxOutputTokens,
    safetyReserveTokens: 512,
    userBudgetTokens: mode === 'token' ? configuredBudget : null,
  });
  const inputBudgetTokens = input.inputBudgetTokens;
  if (inputBudgetTokens === null) {
    return {
      mode,
      place: resolveMemoryBudgetPlace(place),
      input,
      inputBudgetTokens: null,
      worldBudgetTokens: null,
      fixedReserveTokens: 0,
      distributableTokens: null,
      allocation: null,
    };
  }
  const percent = Math.max(0, Math.min(100, Number(worldContextPercent) || 0));
  const percentBudget = percent > 0
    ? Math.floor(inputBudgetTokens * (percent / 100))
    : null;
  const cap = toNonNegativeInt(worldBudgetCap);
  const worldBudgetTokens = cap > 0
    ? (percentBudget === null ? cap : Math.min(cap, percentBudget))
    : percentBudget;
  const configuredFixed = toNonNegativeInt(settings?.memoryFixedPromptReserveTokens, 0);
  const fixedReserveTokens = configuredFixed > 0
    ? Math.min(configuredFixed, inputBudgetTokens)
    : Math.min(4096, Math.floor(inputBudgetTokens * 0.10));
  const distributableTokens = Math.max(
    0,
    inputBudgetTokens - (worldBudgetTokens ?? 0) - fixedReserveTokens,
  );
  const ratios = resolveMemoryBudgetRatios(place, settings?.memoryBudgetRatios);
  const allocation = allocateMemoryTokenQuotas({
    poolTokens: distributableTokens,
    ratios,
    demands,
    reflowOrder: resolveMemoryBudgetPlace(place) === 'writing'
      ? ['recent', 'mid', 'state', 'far', 'recall']
      : ['state', 'recall', 'recent', 'mid', 'far'],
  });
  return {
    mode,
    place: resolveMemoryBudgetPlace(place),
    input,
    inputBudgetTokens,
    worldBudgetTokens,
    fixedReserveTokens,
    distributableTokens,
    allocation,
  };
};
