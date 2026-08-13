import { logger } from '../utils/logger.js';
import { buildVariableContext } from './variable-path-utils.js';
import { evaluateBooleanExpression } from './safe-expression-evaluator.js';
import { buildStageConditionDiagnostics } from './expression-compat-diagnostics.js';

const normalizeStageId = (value, fallback = '') => {
  const id = String(value || '').trim();
  return id || fallback;
};

const normalizeStageSchema = (raw) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const stages = Array.isArray(input.stages) ? input.stages : [];
  const normalizedStages = stages
    .map((stage, idx) => {
      if (!stage || typeof stage !== 'object') return null;
      const id = normalizeStageId(stage.id, `stage_${idx + 1}`);
      const name = String(stage.name || id).trim() || id;
      const condition = typeof stage.condition === 'string' ? stage.condition.trim() : '';
      const persona = typeof stage.persona === 'string' ? stage.persona.trim() : '';
      const worldbook = stage.worldbook || stage.worldBook || stage.world_id || '';
      const worldId = Array.isArray(worldbook)
        ? worldbook.map(w => String(w || '').trim()).filter(Boolean)
        : String(worldbook || '').trim();
      const prompt = typeof stage.prompt === 'string' ? stage.prompt.trim() : '';
      const role = typeof stage.role === 'string' ? stage.role.trim().toLowerCase() : '';
      const position = String(stage.position ?? stage.promptPosition ?? 'before_latest_user').trim();
      const depthRaw = Math.trunc(Number(stage.depth ?? stage.promptDepth));
      const orderRaw = Number(stage.order ?? stage.promptOrder);
      return {
        id,
        name,
        condition,
        persona,
        worldbook: worldId,
        prompt,
        role,
        position,
        depth: Number.isFinite(depthRaw) ? Math.max(0, depthRaw) : 0,
        order: Number.isFinite(orderRaw) ? orderRaw : 3200,
      };
    })
    .filter(Boolean);

  return {
    id: normalizeStageId(input.id, 'default_stage_schema'),
    name: String(input.name || '阶段系统').trim() || '阶段系统',
    currentStageVar: String(input.currentStageVar || 'stage').trim() || 'stage',
    stages: normalizedStages,
    ui: {
      display: String(input?.ui?.display || 'timeline').trim().toLowerCase(),
      showProgress: input?.ui?.showProgress !== false,
    },
  };
};

const evalCondition = (expr, vars) => {
  if (!expr) return true;
  try {
    const scope = { ...(vars || {}), vars: vars || {} };
    return evaluateBooleanExpression(expr, scope, { fallback: true });
  } catch (err) {
    logger.warn('stage condition eval failed', err);
    return false;
  }
};

export class StageManager {
  constructor({ chatStore, appBridge, isVariableRuntimeEnabled } = {}) {
    this.chatStore = chatStore;
    this.appBridge = appBridge || null;
    this.isVariableRuntimeEnabled = typeof isVariableRuntimeEnabled === 'function'
      ? isVariableRuntimeEnabled
      : () => true;
    this.activeSessionId = '';
    this._bound = false;
    this.warnedInvalidConditions = new Set();
    this.bindEvents();
  }

  warnInvalidStageConditions(sessionId, schema = null) {
    const sid = String(sessionId || this.activeSessionId || '').trim();
    const diagnosticsByStageId = buildStageConditionDiagnostics(schema);
    Object.entries(diagnosticsByStageId).forEach(([stageId, diagnostic]) => {
      const key = `${sid}:${stageId}:${diagnostic.error}`;
      if (this.warnedInvalidConditions.has(key)) return;
      this.warnedInvalidConditions.add(key);
      logger.warn('stage condition syntax unsupported', {
        sessionId: sid,
        stageId,
        error: diagnostic.error,
        expr: diagnostic.expression,
      });
    });
    return diagnosticsByStageId;
  }

  bindEvents() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('chatapp-variable-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      const scope = String(ev?.detail?.scope || '').trim();
      if (scope === 'global') {
        const targetSessionId = String(this.activeSessionId || sid || '').trim();
        if (!targetSessionId) return;
        this.evaluateStageTransition(targetSessionId);
        return;
      }
      if (!sid) return;
      this.evaluateStageTransition(sid);
    });
    window.addEventListener('chatapp-stage-schema-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      if (!sid) return;
      this.evaluateStageTransition(sid, { force: true });
    });
  }

  setSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    this.activeSessionId = sid;
    if (this.isVariableRuntimeEnabled(sid)) this.evaluateStageTransition(sid, { force: true });
  }

  getStageSchema(sessionId) {
    const sid = String(sessionId || this.activeSessionId || '').trim();
    if (!sid || !this.chatStore?.getStageSchema) return null;
    const raw = this.chatStore.getStageSchema(sid);
    if (!raw) return null;
    const schema = normalizeStageSchema(raw);
    this.warnInvalidStageConditions(sid, schema);
    return schema;
  }

  defineStages(sessionId, schema) {
    const sid = String(sessionId || '').trim();
    if (!sid || !this.chatStore?.setStageSchema) return false;
    const normalized = normalizeStageSchema(schema);
    const ok = this.chatStore.setStageSchema(normalized, sid);
    if (ok) this.evaluateStageTransition(sid, { force: true });
    return ok;
  }

  clearStages(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid || !this.chatStore?.clearStageSchema) return false;
    return this.chatStore.clearStageSchema(sid);
  }

  getCurrentStage(sessionId) {
    const schema = this.getStageSchema(sessionId);
    if (!schema) return null;
    const sid = String(sessionId || this.activeSessionId || '').trim();
    const currentId = String(this.chatStore?.getVariable?.(schema.currentStageVar, sid) || '').trim();
    return schema.stages.find(s => s.id === currentId) || null;
  }

  getStageState(sessionId) {
    const schema = this.getStageSchema(sessionId);
    if (!schema) return null;
    const sid = String(sessionId || this.activeSessionId || '').trim();
    const currentId = String(this.chatStore?.getVariable?.(schema.currentStageVar, sid) || '').trim();
    const index = schema.stages.findIndex(s => s.id === currentId);
    return {
      schema,
      currentId,
      index,
      diagnosticsByStageId: buildStageConditionDiagnostics(schema),
    };
  }

  resolveStage(sessionId) {
    const sid = String(sessionId || this.activeSessionId || '').trim();
    if (!sid || !this.isVariableRuntimeEnabled(sid)) return null;
    const schema = this.getStageSchema(sessionId);
    if (!schema) return null;
    const localVars = this.chatStore?.listVariables?.(sid) || {};
    const globalVars = this.chatStore?.listGlobalVariables?.() || {};
    const vars = buildVariableContext({
      baseVars: localVars,
      globalVars,
      localVars,
    }).variableContext;
    let candidate = null;
    schema.stages.forEach((stage) => {
      if (!stage) return;
      if (evalCondition(stage.condition, vars)) candidate = stage;
    });
    if (!candidate && schema.stages.length) candidate = schema.stages[0];
    return candidate;
  }

  async applyStageEffects(sessionId, stage) {
    if (!stage) return;
    const sid = String(sessionId || '').trim();
    if (!sid || !this.isVariableRuntimeEnabled(sid)) return;
    if (stage.persona) {
      try {
        await this.appBridge?.switchPersona?.(stage.persona);
      } catch (err) {
        logger.warn('stage switch persona failed', err);
      }
    }
    if (stage.worldbook) {
      try {
        const worldIds = Array.isArray(stage.worldbook)
          ? stage.worldbook.filter(Boolean)
          : [String(stage.worldbook || '').trim()].filter(Boolean);
        if (worldIds.length && this.appBridge?.setSessionWorldIds) {
          this.appBridge.setSessionWorldIds(sid, worldIds, { silent: false });
        }
      } catch (err) {
        logger.warn('stage worldbook apply failed', err);
      }
    }
  }

  getPromptBlocks(sessionId) {
    const sid = String(sessionId || this.activeSessionId || '').trim();
    if (!sid || !this.isVariableRuntimeEnabled(sid)) return [];
    const schema = this.getStageSchema(sessionId);
    if (!schema) return [];
    const currentId = String(this.chatStore?.getVariable?.(schema.currentStageVar, sid) || '').trim();
    const stage = schema.stages.find(s => s.id === currentId) || null;
    if (!stage || !stage.prompt) return [];
    const roleRaw = String(stage.role || 'system').trim().toLowerCase();
    const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
    let content = stage.prompt;
    try {
      if (this.appBridge?.processTextMacros) {
        content = this.appBridge.processTextMacros(content, { sessionId: sid });
      }
    } catch {}
    return [{
      content,
      role,
      position: String(stage.position || 'before_latest_user').trim(),
      depth: Number.isFinite(Number(stage.depth)) ? Math.max(0, Math.trunc(Number(stage.depth))) : 0,
      order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : 3200,
      source: 'stage',
    }];
  }

  async evaluateStageTransition(sessionId, { force = false } = {}) {
    const sid = String(sessionId || this.activeSessionId || '').trim();
    if (!sid || !this.isVariableRuntimeEnabled(sid)) return false;
    const schema = this.getStageSchema(sessionId);
    if (!schema || !schema.stages.length) return false;
    const currentId = String(this.chatStore?.getVariable?.(schema.currentStageVar, sid) || '').trim();
    const nextStage = this.resolveStage(sid);
    if (!nextStage) return false;
    if (!force && currentId === nextStage.id) return false;
    this.chatStore?.setVariable?.(schema.currentStageVar, nextStage.id, sid);
    await this.applyStageEffects(sid, nextStage);
    try {
      window.dispatchEvent(new CustomEvent('chatapp-stage-changed', {
        detail: { sessionId: sid, stageId: nextStage.id, stageName: nextStage.name },
      }));
      window.dispatchEvent(new CustomEvent('chatapp-stage-evaluated', {
        detail: { sessionId: sid, stageId: nextStage.id },
      }));
    } catch {}
    return true;
  }
}
