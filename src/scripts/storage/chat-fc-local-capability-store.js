import {
  CHAT_FC_LOCAL_CAPABILITY_MAX_RULES,
  CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
  CHAT_FC_LOCAL_CAPABILITY_STORE_KEY,
  applyChatFcLocalRuleAttemptOutcome,
  getChatFcLocalCapabilityRules,
  getChatFcLocalRuleIdentityKey,
  normalizeChatFcLocalRule,
  parseChatFcLocalRulesImport,
  replaceChatFcLocalCapabilityRules,
} from '../agent/chat-fc-local-capability-rules.js';
import { safeInvoke } from '../utils/tauri.js';

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const normalizeSavedAt = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
};

const normalizeStore = (input = null, { now = Date.now } = {}) => {
  if (!input || typeof input !== 'object') return null;
  if (Number(input.schemaVersion) !== CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION) return null;
  const source = Array.isArray(input.rules) ? input.rules : [];
  if (source.length > CHAT_FC_LOCAL_CAPABILITY_MAX_RULES) return null;
  const rules = [];
  const ids = new Set();
  for (const entry of source) {
    const normalized = normalizeChatFcLocalRule(entry, { now });
    if (!normalized.ok || ids.has(normalized.rule.ruleId)) return null;
    ids.add(normalized.rule.ruleId);
    rules.push(normalized.rule);
  }
  return {
    schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
    savedAt: normalizeSavedAt(input.savedAt),
    rules,
  };
};

const chooseNewest = (left, right) => {
  if (!left) return right;
  if (!right) return left;
  return left.savedAt >= right.savedAt ? left : right;
};

const readMirror = (storage, now) => {
  try {
    const raw = storage?.getItem?.(CHAT_FC_LOCAL_CAPABILITY_STORE_KEY);
    return raw ? normalizeStore(JSON.parse(raw), { now }) : null;
  } catch {
    return null;
  }
};

export const createChatFcLocalCapabilityStore = ({
  invoke = safeInvoke,
  storage = globalThis?.localStorage,
  now = Date.now,
} = {}) => {
  let state = {
    schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
    savedAt: 0,
    rules: getChatFcLocalCapabilityRules(),
  };
  let mutationQueue = Promise.resolve();

  const enqueueMutation = (operation) => {
    const run = mutationQueue.then(operation, operation);
    mutationQueue = run.catch(() => {});
    return run;
  };

  const commitRuntime = (next) => {
    const rules = replaceChatFcLocalCapabilityRules(next.rules, { now });
    state = {
      schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
      savedAt: normalizeSavedAt(next.savedAt),
      rules,
    };
    return clone(rules, []);
  };

  const persist = async (rules) => {
    const normalizedRules = replaceChatFcLocalCapabilityRules(rules, { now });
    const payload = {
      schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
      savedAt: Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now())),
      rules: normalizedRules,
    };
    let nativeSaved = false;
    let mirrorSaved = false;
    try {
      await invoke?.('save_kv', {
        name: CHAT_FC_LOCAL_CAPABILITY_STORE_KEY,
        data: payload,
      });
      nativeSaved = true;
    } catch {}
    try {
      storage?.setItem?.(CHAT_FC_LOCAL_CAPABILITY_STORE_KEY, JSON.stringify(payload));
      mirrorSaved = true;
    } catch {}
    if (!nativeSaved && !mirrorSaved) {
      replaceChatFcLocalCapabilityRules(state.rules, { now });
      throw new Error('chat_fc_local_rules_save_failed');
    }
    return commitRuntime(payload);
  };

  return Object.freeze({
    async load() {
      return enqueueMutation(async () => {
        let nativeStore = null;
        try {
          nativeStore = normalizeStore(await invoke?.('load_kv', {
            name: CHAT_FC_LOCAL_CAPABILITY_STORE_KEY,
          }), { now });
        } catch {}
        const mirrorStore = readMirror(storage, now);
        const selected = chooseNewest(nativeStore, mirrorStore) || {
          schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
          savedAt: 0,
          rules: [],
        };
        return commitRuntime(selected);
      });
    },

    list() {
      return clone(state.rules, []);
    },

    async replace(rules = []) {
      return enqueueMutation(() => persist(rules));
    },

    async upsert(input = {}) {
      return enqueueMutation(async () => {
        const normalized = normalizeChatFcLocalRule(input, { now });
        if (!normalized.ok) {
          const error = new Error(normalized.reason);
          error.code = normalized.reason;
          throw error;
        }
        const next = state.rules.slice();
        const index = next.findIndex(rule => rule.ruleId === normalized.rule.ruleId);
        if (index >= 0) next[index] = normalized.rule;
        else next.push(normalized.rule);
        return persist(next);
      });
    },

    async remove(ruleId = '') {
      return enqueueMutation(async () => {
        const id = String(ruleId || '').trim();
        const next = state.rules.filter(rule => rule.ruleId !== id);
        if (next.length === state.rules.length) return false;
        await persist(next);
        return true;
      });
    },

    async recordAttempt(ruleId = '', attempt = {}) {
      return enqueueMutation(async () => {
        const id = String(ruleId || '').trim();
        const index = state.rules.findIndex(rule => rule.ruleId === id);
        if (index < 0) {
          return { changed: false, action: 'rule_not_found', reason: '', rule: null };
        }
        const transition = applyChatFcLocalRuleAttemptOutcome(state.rules[index], attempt, { now });
        if (!transition.changed || !transition.rule) return transition;
        const next = state.rules.slice();
        next[index] = transition.rule;
        await persist(next);
        return {
          ...transition,
          rule: clone(state.rules[index], null),
        };
      });
    },

    async resetCircuit(ruleId = '') {
      return enqueueMutation(async () => {
        const id = String(ruleId || '').trim();
        const index = state.rules.findIndex(rule => rule.ruleId === id);
        if (index < 0) return false;
        const current = state.rules[index];
        if (
          current.health?.circuitOpen !== true
          && Number(current.health?.consecutiveDeterministicFailures || 0) === 0
        ) return true;
        const normalized = normalizeChatFcLocalRule({
          ...current,
          health: {
            consecutiveDeterministicFailures: 0,
            circuitOpen: false,
            lastFailureReason: '',
            lastFailureAt: 0,
            openedAt: 0,
          },
          updatedAt: Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now())),
        }, { now });
        if (!normalized.ok) throw new Error(normalized.reason);
        const next = state.rules.slice();
        next[index] = normalized.rule;
        await persist(next);
        return true;
      });
    },

    async mergeImportedRules(inputRules = []) {
      return enqueueMutation(async () => {
        const parsed = parseChatFcLocalRulesImport({
          type: 'miphone.chat-fc.local-rules',
          schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
          rules: inputRules,
        }, { now });
        if (!parsed.ok) {
          const error = new Error(parsed.reason);
          error.code = parsed.reason;
          throw error;
        }
        const existingKeys = new Set(state.rules.map(getChatFcLocalRuleIdentityKey));
        const additions = [];
        let skippedCount = 0;
        for (const imported of parsed.rules) {
          const source = inputRules.find(rule => (
            getChatFcLocalRuleIdentityKey(rule) === getChatFcLocalRuleIdentityKey(imported)
          ));
          const rebound = normalizeChatFcLocalRule({
            ...imported,
            profileId: String(source?.profileId || '').trim(),
            profileName: String(source?.profileName || '').trim(),
          }, { now });
          if (!rebound.ok) throw new Error(rebound.reason);
          const key = getChatFcLocalRuleIdentityKey(rebound.rule);
          if (existingKeys.has(key)) {
            skippedCount += 1;
            continue;
          }
          existingKeys.add(key);
          additions.push(rebound.rule);
        }
        if (state.rules.length + additions.length > CHAT_FC_LOCAL_CAPABILITY_MAX_RULES) {
          throw new RangeError('chat_fc_local_rules_limit_exceeded');
        }
        if (additions.length) await persist([...state.rules, ...additions]);
        return {
          importedCount: additions.length,
          skippedCount,
          rules: clone(state.rules, []),
        };
      });
    },
  });
};

export const chatFcLocalCapabilityStore = createChatFcLocalCapabilityStore();
