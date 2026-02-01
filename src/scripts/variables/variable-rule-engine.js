import { logger } from '../utils/logger.js';

const genId = () => `vr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const normalizeRule = (raw) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const trigger = input.trigger && typeof input.trigger === 'object' ? input.trigger : {};
  const action = input.action && typeof input.action === 'object' ? input.action : {};
  return {
    id: String(input.id || genId()),
    name: String(input.name || ''),
    enabled: input.enabled !== false,
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
    trigger: {
      type: String(trigger.type || 'every_turn').trim().toLowerCase(),
      n: Number.isFinite(Number(trigger.n)) ? Math.max(1, Math.trunc(Number(trigger.n))) : 0,
      keywords: Array.isArray(trigger.keywords)
        ? trigger.keywords.map(k => String(k)).filter(Boolean)
        : (typeof trigger.keywords === 'string' ? trigger.keywords.split(',').map(s => s.trim()).filter(Boolean) : []),
      match: String(trigger.match || 'any').trim().toLowerCase(),
      caseSensitive: Boolean(trigger.caseSensitive),
      expr: typeof trigger.expr === 'string' ? trigger.expr : '',
    },
    action: {
      type: String(action.type || '').trim().toLowerCase(),
      target: String(action.target || ''),
      value: action.value,
      prompt: typeof action.prompt === 'string' ? action.prompt : '',
      mode: String(action.mode || '').trim().toLowerCase(),
    },
  };
};

const buildKeywordMatcher = (keywords, caseSensitive) => {
  const list = Array.isArray(keywords) ? keywords : [];
  const prepared = list.map(k => (caseSensitive ? k : k.toLowerCase())).filter(Boolean);
  return (content) => {
    if (!prepared.length) return false;
    const text = caseSensitive ? String(content || '') : String(content || '').toLowerCase();
    return prepared.some(k => text.includes(k));
  };
};

const evalCondition = (expr, vars) => {
  if (!expr) return false;
  try {
    const fn = new Function('vars', `with (vars) { return (${expr}); }`);
    return Boolean(fn(vars || {}));
  } catch (err) {
    logger.warn('variable rule condition eval failed', err);
    return false;
  }
};

export class VariableRuleEngine {
  constructor({ chatStore, appBridge }) {
    this.chatStore = chatStore;
    this.appBridge = appBridge || null;
    this.turnCounts = new Map();
    this.running = new Set();
  }

  getRules(sessionId) {
    const list = this.chatStore?.listVariableRules?.(sessionId) || [];
    return list.map(normalizeRule);
  }

  async handleBeforeSend({ sessionId, content, useGlobalVariables = false }) {
    await this.runRules(sessionId, { type: 'keyword', content, useGlobalVariables });
  }

  async handleAfterReceive({ sessionId, message, useGlobalVariables = false }) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const next = (this.turnCounts.get(sid) || 0) + 1;
    this.turnCounts.set(sid, next);
    await this.runRules(sid, { type: 'every_turn', turn: next, message, useGlobalVariables });
    await this.runRules(sid, { type: 'every_n_turns', turn: next, message, useGlobalVariables });
    await this.runRules(sid, { type: 'condition', turn: next, message, useGlobalVariables });
  }

  async runManual(sessionId, ruleId = '') {
    await this.runRules(sessionId, { type: 'manual', ruleId });
  }

  async runRules(sessionId, context) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    if (this.running.has(sid)) return;
    const rules = this.getRules(sid).filter(r => r.enabled);
    if (!rules.length) return;

    const ctx = context || {};
    const type = String(ctx.type || '').trim().toLowerCase();
    const useGlobal = ctx.useGlobalVariables === true;
    const vars = useGlobal
      ? (this.chatStore?.listGlobalVariables?.() || {})
      : (this.chatStore?.listVariables?.(sid) || {});

    const sorted = rules.slice().sort((a, b) => b.priority - a.priority);
    const eligible = sorted.filter(rule => {
      const trigger = rule.trigger || {};
      if (type === 'manual') {
        if (ctx.ruleId && rule.id !== ctx.ruleId) return false;
        return trigger.type === 'manual';
      }
      if (trigger.type !== type) return false;
      if (trigger.type === 'keyword') {
        const matches = buildKeywordMatcher(trigger.keywords, trigger.caseSensitive);
        const ok = matches(ctx.content || '');
        if (!ok) return false;
        return true;
      }
      if (trigger.type === 'every_n_turns') {
        const n = trigger.n || 0;
        if (!n) return false;
        return Number(ctx.turn || 0) % n === 0;
      }
      if (trigger.type === 'condition') {
        return evalCondition(trigger.expr, vars);
      }
      if (trigger.type === 'every_turn') return true;
      return false;
    });

    if (!eligible.length) return;
    this.running.add(sid);
    try {
      for (const rule of eligible) {
        await this.applyAction(rule, { sessionId: sid, vars, context: ctx, useGlobalVariables: useGlobal });
      }
    } finally {
      this.running.delete(sid);
    }
  }

  async applyAction(rule, { sessionId, vars, useGlobalVariables = false }) {
    const action = rule.action || {};
    const target = String(action.target || '').trim();
    if (!target) return;
    const cur = vars?.[target];
    const setVar = (name, value) => (
      useGlobalVariables
        ? this.chatStore?.setGlobalVariable?.(name, value)
        : this.chatStore?.setVariable?.(name, value, sessionId)
    );
    if (action.type === 'set_value') {
      setVar(target, action.value);
      return;
    }
    if (action.type === 'increment' || action.type === 'decrement') {
      const deltaRaw = Number(action.value);
      const delta = Number.isFinite(deltaRaw) ? deltaRaw : 1;
      const curNum = Number(cur) || 0;
      const next = action.type === 'decrement' ? curNum - delta : curNum + delta;
      setVar(target, next);
      return;
    }
    if (action.type === 'ai_evaluate') {
      const bridge = this.appBridge;
      if (!bridge?.backgroundChat || !bridge?.buildMessages) {
        logger.warn('ai_evaluate skipped: backgroundChat/buildMessages unavailable');
        return;
      }
      const prompt = String(action.prompt || '').trim();
      if (!prompt) return;
      try {
        const history = this.chatStore?.getMessages?.(sessionId) || [];
        const recent = history.slice(-6).map(m => `${m.role || ''}: ${String(m.content || '').slice(0, 120)}`).join('\n');
        const system = '你是规则评估器，只输出一个整数，不要解释。';
        const user = `${prompt}\n\n<chat_history>\n${recent}\n</chat_history>`;
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ];
        const response = await bridge.backgroundChat(messages, { temperature: 0.2, maxTokens: 40 });
        const text = String(response || '').trim();
        const match = text.match(/-?\d+(?:\.\d+)?/);
        if (!match) {
          logger.warn('ai_evaluate: no number found', text);
          return;
        }
        const num = Number(match[0]);
        if (!Number.isFinite(num)) return;
        const mode = action.mode === 'set' ? 'set' : 'delta';
        if (mode === 'set') {
          setVar(target, num);
        } else {
          const curNum = Number(cur) || 0;
          setVar(target, curNum + num);
        }
      } catch (err) {
        logger.warn('ai_evaluate failed', err);
      }
    }
  }
}
