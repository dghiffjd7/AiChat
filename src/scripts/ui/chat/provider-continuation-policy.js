import {
  PROVIDER_CONTINUATION_COMMIT_STRATEGIES,
  normalizeProviderContinuationCommitStrategy,
} from './provider-continuation-commit-utils.js';

export const PROVIDER_CONTINUATION_POLICY_STORAGE_KEY = 'provider_continuation_commit_policy_v1';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readStorage = (storage = globalThis?.localStorage) => {
  try {
    return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
      ? storage
      : null;
  } catch {
    return null;
  }
};

export const normalizeProviderContinuationCommitPolicy = (policy = {}) => {
  const src = isPlainObject(policy) ? policy : {};
  return {
    defaultStrategy: normalizeProviderContinuationCommitStrategy(src.defaultStrategy),
    strategies: [
      PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly,
      PROVIDER_CONTINUATION_COMMIT_STRATEGIES.appendToPreviousBubble,
    ],
  };
};

export const readProviderContinuationCommitPolicy = ({
  storage = globalThis?.localStorage,
  key = PROVIDER_CONTINUATION_POLICY_STORAGE_KEY,
} = {}) => {
  const store = readStorage(storage);
  if (!store) return normalizeProviderContinuationCommitPolicy();
  try {
    const raw = store.getItem(key);
    return normalizeProviderContinuationCommitPolicy(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeProviderContinuationCommitPolicy();
  }
};

export const writeProviderContinuationCommitPolicy = (policy = {}, {
  storage = globalThis?.localStorage,
  key = PROVIDER_CONTINUATION_POLICY_STORAGE_KEY,
} = {}) => {
  const normalized = normalizeProviderContinuationCommitPolicy(policy);
  const store = readStorage(storage);
  if (store) {
    try {
      store.setItem(key, JSON.stringify(normalized));
    } catch {}
  }
  return normalized;
};

export const createProviderContinuationCommitPolicyStore = ({
  storage = globalThis?.localStorage,
  key = PROVIDER_CONTINUATION_POLICY_STORAGE_KEY,
} = {}) => ({
  getPolicy: () => readProviderContinuationCommitPolicy({ storage, key }),
  setPolicy: policy => writeProviderContinuationCommitPolicy(policy, { storage, key }),
});
