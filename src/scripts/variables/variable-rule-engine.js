import { logger } from '../utils/logger.js';
import { buildVariableContext } from './variable-path-utils.js';
import { evaluateBooleanExpression } from './safe-expression-evaluator.js';
import { buildRuleConditionDiagnostics } from './expression-compat-diagnostics.js';

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
      message: typeof action.message === 'string' ? action.message : '',
      style: typeof action.style === 'string' ? action.style : '',
      persona: typeof action.persona === 'string' ? action.persona : '',
      role: typeof action.role === 'string' ? action.role : '',
      position: typeof action.position === 'string' ? action.position : '',
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
    const scope = { ...(vars || {}), vars: vars || {} };
    return evaluateBooleanExpression(expr, scope, { fallback: false });
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
    this.warnedInvalidConditions = new Set();
  }

  warnInvalidConditionRules(sessionId, rules = []) {
    const sid = String(sessionId || '').trim();
    const diagnosticsByRuleId = buildRuleConditionDiagnostics(rules);
    Object.entries(diagnosticsByRuleId).forEach(([ruleId, diagnostic]) => {
      const key = `${sid}:${ruleId}:${diagnostic.error}`;
      if (this.warnedInvalidConditions.has(key)) return;
      this.warnedInvalidConditions.add(key);
      logger.warn('variable rule condition syntax unsupported', {
        sessionId: sid,
        ruleId,
        error: diagnostic.error,
        expr: diagnostic.expression,
      });
    });
  }

  getRules(sessionId) {
    const list = this.chatStore?.listVariableRules?.(sessionId) || [];
    const normalized = list.map(normalizeRule);
    this.warnInvalidConditionRules(sessionId, normalized);
    return normalized;
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
    const localVars = this.chatStore?.listVariables?.(sid) || {};
    const globalVars = this.chatStore?.listGlobalVariables?.() || {};
    const baseVars = useGlobal ? globalVars : localVars;
    const vars = buildVariableContext({
      baseVars,
      globalVars,
      localVars,
    }).variableContext;

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
    const type = String(action.type || '').trim().toLowerCase();
    const needsTarget = !['notify', 'switch_persona', 'inject_prompt'].includes(type);
    const target = String(action.target || '').trim();
    if (needsTarget && !target) return;
    const cur = target ? vars?.[target] : undefined;
    const setVar = (name, value) => (
      useGlobalVariables
        ? this.chatStore?.setGlobalVariable?.(name, value)
        : this.chatStore?.setVariable?.(name, value, sessionId)
    );
    if (type === 'set_value') {
      setVar(target, action.value);
      return;
    }
    if (type === 'increment' || type === 'decrement') {
      const deltaRaw = Number(action.value);
      const delta = Number.isFinite(deltaRaw) ? deltaRaw : 1;
      const curNum = Number(cur) || 0;
      const next = type === 'decrement' ? curNum - delta : curNum + delta;
      setVar(target, next);
      return;
    }
    if (type === 'toggle') {
      setVar(target, !Boolean(cur));
      return;
    }
    if (type === 'push') {
      const list = Array.isArray(cur) ? [...cur] : (cur === undefined || cur === null || cur === '' ? [] : [cur]);
      const value = action.value;
      if (value === undefined) return;
      if (!list.some(item => Object.is(item, value))) list.push(value);
      setVar(target, list);
      return;
    }
    if (type === 'remove') {
      const list = Array.isArray(cur) ? cur : [];
      const value = action.value;
      if (value === undefined) return;
      const next = list.filter(item => !Object.is(item, value));
      setVar(target, next);
      return;
    }
    if (type === 'notify') {
      const message = String(action.message || action.value || '').trim();
      if (!message) return;
      const style = String(action.style || 'info').trim().toLowerCase();
      const notify = this.appBridge?.notify || ((msg, level) => {
        const fn = window?.toastr?.[level] || window?.toastr?.info;
        fn?.(msg);
      });
      notify(message, style);
      return;
    }
    if (type === 'switch_persona') {
      const personaId = String(action.persona || action.value || '').trim();
      if (!personaId) return;
      if (!this.appBridge?.switchPersona) {
        logger.warn('switch_persona skipped: appBridge.switchPersona unavailable');
        return;
      }
      await this.appBridge.switchPersona(personaId);
      return;
    }
    if (type === 'inject_prompt') {
      const rawPrompt = String(action.prompt || action.value || '').trim();
      if (!rawPrompt) return;
      const roleRaw = String(action.role || 'system').trim().toLowerCase();
      const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
      const processed = this.appBridge?.processTextMacros
        ? this.appBridge.processTextMacros(rawPrompt, { sessionId, useGlobalVariables })
        : rawPrompt;
      if (!this.appBridge?.queuePromptInjection) {
        logger.warn('inject_prompt skipped: appBridge.queuePromptInjection unavailable');
        return;
      }
      this.appBridge.queuePromptInjection(sessionId, {
        content: String(processed || '').trim(),
        role,
        position: String(action.position || '').trim(),
      });
      return;
    }
    if (type === 'ai_evaluate') {
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
