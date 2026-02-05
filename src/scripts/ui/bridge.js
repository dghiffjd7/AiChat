/**
 * UI 桥接层 - 连接原有 UI 代码和新的 API 层
 */

import { LLMClient } from '../api/client.js';
import { BUILTIN_PHONE_FORMAT_WORLDBOOK, BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { ChatStorage } from '../storage/chat.js';
import { ConfigManager } from '../storage/config.js';
import { PresetStore } from '../storage/preset-store.js';
import { RegexStore, regex_placement } from '../storage/regex-store.js';
import { ScriptStore } from '../storage/script-store.js';
import { WorldInfoStore, convertSTWorld } from '../storage/worldinfo.js';
import { stickerPackStore } from '../storage/sticker-pack-store.js';
import { makeScopedKey, normalizeScopeId } from '../storage/store-scope.js';
import { appSettings } from '../storage/app-settings.js';
import { renderTemplateMessages, templateSettings } from '../plugins/template-engine.js';
import {
  buildMemoryTablePlan,
  estimateTokens,
  isSummaryLimitTableId,
  isSummaryTableId,
  formatMemoryRowText,
  normalizeMemoryCell,
  normalizeMemoryUpdateMode,
  normalizeTokenMode,
  parseMemoryPromptPositions,
} from '../memory/memory-prompt-utils.js';
import { logger } from '../utils/logger.js';
import { MacroEngine } from '../utils/macro-engine.js';
import { listMediaAssets } from '../utils/media-assets.js';
import { isRetryableError, retryWithBackoff } from '../utils/retry.js';
import { safeInvoke } from '../utils/tauri.js';

const canInitClient = cfg => {
  const c = cfg || {};
  const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
  const hasVertexSa =
    c.provider === 'vertexai' &&
    typeof c.vertexaiServiceAccount === 'string' &&
    c.vertexaiServiceAccount.trim().length > 0;
  return hasKey || hasVertexSa;
};

const truthy = v => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
};

const renderStTemplate = (template, vars) => {
  let out = String(template || '');
  const varsLower = (() => {
    try {
      const m = Object.create(null);
      for (const [k, v] of Object.entries(vars || {})) {
        if (!k) continue;
        m[String(k).toLowerCase()] = v;
      }
      return m;
    } catch {
      return Object.create(null);
    }
  })();
  // {{#if var}}...{{else}}...{{/if}} (SillyTavern preset format)
  const ifRe = /{{#if\s+([a-zA-Z0-9_]+)\s*}}([\s\S]*?)({{else}}([\s\S]*?))?{{\/if}}/g;
  // Loop to handle multiple blocks (no nesting expected in presets)
  for (let i = 0; i < 100; i++) {
    const next = out.replace(ifRe, (_m, key, ifTrue, _elseBlock, ifFalse) => {
      const v =
        vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : varsLower[String(key).toLowerCase()];
      return truthy(v) ? ifTrue : ifFalse || '';
    });
    if (next === out) break;
    out = next;
  }
  // Replace variables {{var}} and {{trim}}
  out = out.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
    if (key === 'trim') return '';
    const hasDirect = vars && Object.prototype.hasOwnProperty.call(vars, key);
    const v = hasDirect ? vars[key] : varsLower[String(key).toLowerCase()];
    // Preserve unknown keys for MacroEngine (e.g. {{USER}}, {{lastUserMessage}}, {{getvar::...}})
    if (v === null || v === undefined) return `{{${key}}}`;
    return String(v);
  });
  // Cleanup any leftover trim token and trim surrounding whitespace
  out = out.replace(/{{\s*trim\s*}}/g, '');
  return out.trim();
};

const withSpeakerPrefix = (content, speaker) => {
  const text = String(content ?? '');
  const name = String(speaker || '').trim();
  if (!text.trim() || !name) return text;
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  // Avoid double prefix
  if (firstLine.startsWith(`${name}:`) || firstLine.startsWith(`${name}：`)) return text;
  return `${name}: ${text}`;
};

const normalizeHistoryLineBreaks = (content, role) => {
  if (role !== 'assistant') return content;
  const text = String(content ?? '');
  if (!text.includes('\n') && !text.includes('\r')) return text;
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
};

const HISTORY_RECALL_NOTICE =
  '以下为聊天历史回顾（仅用于理解上下文）：请不要逐字复述或重复其中内容，只需基于上下文继续对话。';
const SUMMARY_REQUEST_NOTICE = [
  '每次输出结束后，**紧跟着**以一句话概括本次互动的摘要，确保<details><summary>摘要</summary>',
  '<内容>',
  '</details>标签顺序正确，摘要**纯中文输出**，不得夹杂其它语言',
  '[summary_format]',
  '摘要格式示例：',
  '',
  '<details><summary>摘要</summary>',
  '',
  '用一句话概括本条回复的内容，禁止不必要的总结和升华',
].join('\n');

const formatExactTime = (ts) => {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return '';
  try {
    return new Date(t).toLocaleString();
  } catch {
    return '';
  }
};

const buildTimeContextText = () => {
  const now = new Date();
  const date = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
  const time = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const hour = now.getHours();
  const period = hour < 5 ? '凌晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';
  const month = now.getMonth() + 1;
  const season = (month === 12 || month <= 2) ? '冬季' : month <= 5 ? '春季' : month <= 8 ? '夏季' : '秋季';
  return `<TimeContext:当前真实时间是${date} ${weekday} ${time}（24小时制），现在是${period}时段，${season}。注意：仅在开启新话题、或对话长时间中断后、或对方主动问候时，才适合使用时间问候语。否则请将此信息作为背景自然融入对话。>`;
};

const formatSince = (ts) => {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return '';
  const delta = Math.max(0, Date.now() - t);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  return `${day}天前`;
};

const formatSinceInParens = (ts) => {
  const raw = formatSince(ts);
  if (!raw) return '';
  return `距今${raw.replace(/前$/, '')}`;
};

const DEFAULT_MEMORY_BUDGET = {
  maxRows: Number.POSITIVE_INFINITY,
  maxTokens: Number.POSITIVE_INFINITY,
  safetyRatio: 0.9,
};

class AppBridge {
  constructor() {
    this.config = new ConfigManager();
    this.chatStorage = new ChatStorage();
    this.worldStore = new WorldInfoStore();
    this.presets = new PresetStore();
    this.regex = new RegexStore();
    this.scriptStore = new ScriptStore();
    this.client = null;
    this.initialized = false;
    this.currentCharacterId = 'default';
    this.currentWorldId = null;
    this.currentWorldIds = [];
    this.scopeId = '';
    this.globalWorldId = this.loadGlobalWorldId();
    this.worldGlobalSettings = this.loadWorldGlobalSettings();
    this.activeSessionId = 'default';
    this.worldSessionMap = this.loadWorldSessionMap();
    this.currentWorldIds = this.normalizeWorldIds(this.worldSessionMap[this.activeSessionId]);
    this.currentWorldId = this.currentWorldIds[0] || null;
    this.isGenerating = false;
    this.abortController = null;
    this.abortReason = '';
    this.chatStore = null; // Injected
    this.macroEngine = null; // Initialized on setChatStore
    this.contactsStore = null; // Injected
    this.momentSummaryStore = null; // Injected
    this.memoryTableStore = null; // Injected
    this.memoryTemplateStore = null; // Injected
    this.chatUI = null; // Injected
    this.pluginRuntime = null; // Injected
    this.scriptRuntime = null; // Injected
    this.contextBuilder = null; // Injected (from UI)
    this.lastMemoryPlan = null;
    this.lastMemoryUpdateBySession = {};
    this.lastWorldBudgetWarningAt = 0;
    this.hydrateWorldSessionMap();
    this.hydrateGlobalWorldId();
    this.hydrateWorldGlobalSettings();
  }

  setChatStore(store) {
    this.chatStore = store;
    this.macroEngine = new MacroEngine(store);
  }

  setChatUI(ui) {
    this.chatUI = ui;
  }

  setPluginRuntime(runtime) {
    this.pluginRuntime = runtime || null;
  }

  setScriptRuntime(runtime) {
    this.scriptRuntime = runtime || null;
  }

  setContactsStore(store) {
    this.contactsStore = store;
  }

  setMomentSummaryStore(store) {
    this.momentSummaryStore = store;
  }

  setMemoryTableStore(store) {
    this.memoryTableStore = store;
  }

  setMemoryTemplateStore(store) {
    this.memoryTemplateStore = store;
  }

  setContextBuilder(fn) {
    this.contextBuilder = typeof fn === 'function' ? fn : null;
  }

  processTextMacros(text, extraContext = {}) {
    if (!this.macroEngine) return text || '';
    const ctx = {
      sessionId: this.activeSessionId,
      ...extraContext,
    };
    return this.macroEngine.process(text, ctx);
  }

  cancelCurrentGeneration(reason = 'user') {
    this.abortReason = String(reason || 'user');
    try {
      if (this.abortController && !this.abortController.signal.aborted) {
        this.abortController.abort();
      }
    } catch {}
  }

  async getDefaultMemoryTemplateRecord() {
    if (!this.memoryTemplateStore || typeof this.memoryTemplateStore.getTemplates !== 'function') return null;
    const list = await this.memoryTemplateStore.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) return list[0];
    const fallback = await this.memoryTemplateStore.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) return fallback[0];
    return null;
  }

  async buildMemoryPromptPlan(context = {}) {
    const memoryMode = String(context?.meta?.memoryStorageMode || '').trim().toLowerCase();
    const autoExtract = Boolean(context?.meta?.memoryAutoExtract);
    const updateMode = normalizeMemoryUpdateMode(context?.meta?.memoryUpdateMode, 'full');
    const disabledPlan = (reason) => ({
      enabled: false,
      reason,
      items: [],
      truncated: [],
      tokenTotal: 0,
      tokenBudget: DEFAULT_MEMORY_BUDGET.maxTokens,
      tokenBudgetSafety: Math.floor(DEFAULT_MEMORY_BUDGET.maxTokens * DEFAULT_MEMORY_BUDGET.safetyRatio),
      tokenBudgetData: Math.floor(DEFAULT_MEMORY_BUDGET.maxTokens * DEFAULT_MEMORY_BUDGET.safetyRatio),
      overheadTokens: 0,
      maxRows: DEFAULT_MEMORY_BUDGET.maxRows,
      position: 'after_persona',
      injectDepth: 4,
      promptText: '',
      tableData: '',
      updateMode,
      templateId: '',
      templateName: '',
      targetId: '',
      targetName: '',
      scope: '',
      autoExtract,
      tableOrder: [],
      rowIndexMap: {},
    });

    if (memoryMode !== 'table') return disabledPlan('memory_mode');
    if (!this.memoryTableStore || !this.memoryTemplateStore) return disabledPlan('missing_store');

    let record = null;
    try {
      record = await this.getDefaultMemoryTemplateRecord();
    } catch {
      record = null;
    }
    if (!record) return disabledPlan('missing_template');

    const toTemplate = this.memoryTemplateStore.toTemplateDefinition?.bind(this.memoryTemplateStore);
    const baseSchema = record?.schema && typeof record.schema === 'object' ? record.schema : {};
    const template = toTemplate ? toTemplate(record) : { ...baseSchema, injection: record?.injection ?? null };
    const templateId = String(template?.meta?.id || record?.id || '').trim();
    const templateName = String(template?.meta?.name || record?.name || '').trim();
    if (!templateId) return disabledPlan('missing_template_id');

    const sessionId = String(context?.session?.id || this.activeSessionId || '').trim();
    if (!sessionId) return disabledPlan('missing_session');

    const isGroup = Boolean(context?.session?.isGroup) || sessionId.startsWith('group:');
    const scope = isGroup ? 'group' : 'contact';
    const targetName =
      String(context?.character?.name || '').trim() ||
      String(this.contactsStore?.getContact?.(sessionId)?.name || '').trim() ||
      (isGroup ? sessionId.replace(/^group:/, '') : sessionId);

    const macroVars = {
      user: String(context?.user?.name || 'user'),
      char: String(context?.character?.name || 'assistant'),
      group: String(context?.group?.name || ''),
      members: Array.isArray(context?.group?.memberNames)
        ? context.group.memberNames.filter(Boolean).join(',')
        : '',
    };

    const injection = (template && typeof template === 'object' && template.injection) ? template.injection : {};
    const templateRaw = typeof injection?.template === 'string' ? injection.template : '{{tableData}}';
    const wrapperRaw = typeof injection?.wrapper === 'string' ? injection.wrapper : '<memories>\n{{tableData}}\n</memories>';
    const overridePositionRaw = String(context?.meta?.memoryInjectPosition || '').trim().toLowerCase();
    const overridePositions =
      overridePositionRaw && overridePositionRaw !== 'template'
        ? parseMemoryPromptPositions(overridePositionRaw)
        : [];
    const injectionPositions = parseMemoryPromptPositions(injection?.position);
    const positions = overridePositions.length
      ? overridePositions
      : injectionPositions.length
        ? injectionPositions
        : ['after_persona'];
    const position = positions.join('+');

    const tables = Array.isArray(template?.tables) ? template.tables : [];
    const tableByIdAll = new Map();
    const tableById = new Map();
    const tableOrder = [];
    const allowSummaryTables = updateMode === 'summary' || updateMode === 'full';
    const allowStandardTables = updateMode === 'standard' || updateMode === 'full';
    const shouldIncludeTable = (tableId) => {
      const isSummary = isSummaryTableId(tableId);
      if (isSummary && !allowSummaryTables) return false;
      if (!isSummary && !allowStandardTables) return false;
      return true;
    };
    const matchesScope = (table) => {
      const scopeRaw = String(table?.scope || '').trim().toLowerCase();
      if (!scopeRaw) return true;
      if (scopeRaw === 'global') return true;
      if (scopeRaw === 'group') return isGroup;
      if (scopeRaw === 'contact') return !isGroup;
      return true;
    };
    tables.forEach(t => {
      const id = String(t?.id || '').trim();
      if (!id) return;
      tableByIdAll.set(id, t);
      if (!shouldIncludeTable(id)) return;
      if (!matchesScope(t)) return;
      tableById.set(id, t);
      tableOrder.push(id);
    });

    const maxRows = DEFAULT_MEMORY_BUDGET.maxRows;
    const maxTokens = DEFAULT_MEMORY_BUDGET.maxTokens;
    const tokenBudgetSafety = Number.isFinite(maxTokens)
      ? Math.max(0, Math.floor(maxTokens * DEFAULT_MEMORY_BUDGET.safetyRatio))
      : maxTokens;
    const tokenMode = 'rough';
    const injectDepthRaw = Math.trunc(Number(context?.meta?.memoryInjectDepth));
    const injectDepth = Number.isFinite(injectDepthRaw) ? Math.max(0, injectDepthRaw) : 4;

    const buildMemoryEditGuide = (requiredHints = []) => {
      const lines = [];
      lines.push('<memory_edit_rules>');
      if (requiredHints.length) {
        lines.push('【系统必填】');
        requiredHints.forEach((hint) => {
          lines.push(`- ${hint}`);
        });
      }
      if (updateMode === 'summary') {
        lines.push('本轮仅允许更新“摘要/总体大纲”类表格，其他表格禁止写入。');
      } else if (updateMode === 'standard') {
        lines.push('本轮仅允许更新非摘要类表格，摘要/总体大纲类表格禁止写入。');
      }
      if (tableOrder.some(tableId => isSummaryTableId(tableId))) {
        lines.push('摘要/总体大纲表格只允许 insert；禁止 update/delete。');
      }
      lines.push('需要更新记忆表格时，在回复末尾输出 <tableEdit>...</tableEdit>，每行一个 JSON（允许 insert/update/delete: 前缀）。');
      lines.push('insert: {"action":"insert","table_id":"relationship","data":{"relation":"朋友"}}');
      lines.push('update: {"action":"update","table_id":"relationship","row_index":0,"data":{"relation":"亲密朋友"}}');
      lines.push('delete: {"action":"delete","table_id":"relationship","row_index":0}');
      lines.push('若该表当前无任何行，只能使用 insert；不要输出 update/delete。');
      lines.push('仅当 row_index 对应现有行时才使用 update/delete。');
      lines.push('也可使用函数式语法：insertRow(tableIndex, {...}) / updateRow(tableIndex, rowIndex, {...}) / deleteRow(tableIndex, rowIndex)');
      lines.push('row_index 对应表格中每行前的编号；table_id 见下表。');
      lines.push('无修改则输出空 <tableEdit></tableEdit>。');
      lines.push('表格索引:');
      tableOrder.forEach((tableId, index) => {
        const table = tableById.get(tableId) || { id: tableId, name: tableId, columns: [] };
        const cols = (table?.columns || [])
          .map(col => {
            const cid = String(col?.id || '').trim();
            const cname = String(col?.name || '').trim();
            if (!cid && !cname) return '';
            if (cid && cname && cid !== cname) return `${cid}:${cname}`;
            return cid || cname;
          })
          .filter(Boolean)
          .join(', ');
        const scope = String(table?.scope || '').trim();
        const meta = [scope ? `scope:${scope}` : '', cols ? `cols:${cols}` : ''].filter(Boolean).join(', ');
        const label = String(table?.name || tableId);
        lines.push(`[${index}] ${label} (table_id:${tableId}${meta ? `, ${meta}` : ''})`);
        const sourceData = table?.sourceData || table?.source_data || {};
        const ruleLines = [];
        const note = String(sourceData?.note || '').trim();
        const initNode = String(sourceData?.initNode || '').trim();
        const insertNode = String(sourceData?.insertNode || '').trim();
        const updateNode = String(sourceData?.updateNode || '').trim();
        const deleteNode = String(sourceData?.deleteNode || '').trim();
        if (note) ruleLines.push(`  - note: ${note}`);
        if (initNode) ruleLines.push(`  - init: ${initNode}`);
        if (insertNode) ruleLines.push(`  - insert: ${insertNode}`);
        if (updateNode) ruleLines.push(`  - update: ${updateNode}`);
        if (deleteNode) ruleLines.push(`  - delete: ${deleteNode}`);
        if (ruleLines.length) lines.push(...ruleLines);
      });
      lines.push('</memory_edit_rules>');
      return lines.join('\n').trim();
    };
    const useSharedMemory = context?.meta?.sharedMemory === true && !isGroup;
    let scopedRows = [];
    let globalRows = [];
    try {
      if (!useSharedMemory) {
        if (isGroup) {
          scopedRows = await this.memoryTableStore.getMemories({ scope: 'group', group_id: sessionId, template_id: templateId });
        } else {
          scopedRows = await this.memoryTableStore.getMemories({ scope: 'contact', contact_id: sessionId, template_id: templateId });
        }
      }
    } catch {
      scopedRows = [];
    }
    try {
      globalRows = await this.memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
    } catch {
      globalRows = [];
    }

    const resolveRequiredHints = () => {
      const hints = [];
      const baseRows = useSharedMemory ? globalRows : scopedRows;
      const rows = Array.isArray(baseRows) ? baseRows : [];
      if (!isGroup) {
        const targetTableId = 'character_profile';
        const table = tableById.get(targetTableId);
        if (table) {
          const targetRows = rows.filter(row => String(row?.table_id || '').trim() === targetTableId && row?.is_active !== false);
          const requiredFields = ['personality'];
          const missing = [];
          if (!targetRows.length) {
            missing.push(...requiredFields);
          } else {
            const rowData = targetRows[0]?.row_data || {};
            requiredFields.forEach((fieldId) => {
              const value = normalizeMemoryCell(rowData?.[fieldId]).trim();
              if (!value) missing.push(fieldId);
            });
          }
          if (missing.length) {
            const columns = Array.isArray(table?.columns) ? table.columns : [];
            const fieldNames = missing.map((fieldId) => {
              const col = columns.find(c => String(c?.id || '').trim() === fieldId);
              return String(col?.name || fieldId || '').trim() || fieldId;
            });
            const tableLabel = String(table?.name || targetTableId).trim() || targetTableId;
            const action = targetRows.length ? 'update' : 'insert';
            hints.push(`系统检测：${tableLabel} 必填字段为空（${fieldNames.join('、')}）。请在 <tableEdit> 中使用 ${action} 补全。`);
          }
        }
      }

      const summaryTableId = isGroup ? 'group_summary' : 'chat_summary';
      const summaryTable = tableById.get(summaryTableId);
      if (summaryTable) {
        const summaryLabel = String(summaryTable?.name || summaryTableId).trim() || summaryTableId;
        hints.push(`本轮必须新增${summaryLabel}（摘要栏位使用“【摘要】...”格式；仅使用 insert）。`);
      }
      const outlineTableId = isGroup ? 'group_outline' : 'chat_outline';
      const outlineTable = tableById.get(outlineTableId);
      if (outlineTable) {
        const outlineLabel = String(outlineTable?.name || outlineTableId).trim() || outlineTableId;
        hints.push(`本轮必须新增${outlineLabel}（精简摘要；仅使用 insert）。`);
      }
      return hints;
    };
    const requiredHints = autoExtract ? resolveRequiredHints() : [];
    const editGuide = autoExtract ? buildMemoryEditGuide(requiredHints) : '';

    const emptyTemplate = renderStTemplate(templateRaw, { ...macroVars, tableData: '' });
    const emptyWrapped = wrapperRaw
      ? renderStTemplate(wrapperRaw, { ...macroVars, tableData: emptyTemplate })
      : emptyTemplate;
    const overheadTokens = estimateTokens(emptyWrapped, tokenMode) + (editGuide ? estimateTokens(editGuide, tokenMode) : 0);
    const tokenBudgetData = Math.max(0, tokenBudgetSafety - overheadTokens);
    const buildPromptText = (tableData) => {
      const renderedTemplate = renderStTemplate(templateRaw, { ...macroVars, tableData });
      const wrapped = wrapperRaw
        ? renderStTemplate(wrapperRaw, { ...macroVars, tableData: renderedTemplate })
        : renderedTemplate;
      const processed = this.processTextMacros(wrapped, { ...macroVars, sessionId });
      let promptText = String(processed || '').trim();
      if (autoExtract && editGuide) {
        promptText = promptText ? `${promptText}\n\n${editGuide}` : editGuide;
      }
      return promptText;
    };

    const activeTableIds = new Set(tableOrder);
    const rows = [...(Array.isArray(globalRows) ? globalRows : []), ...(Array.isArray(scopedRows) ? scopedRows : [])]
      .filter(row => row && row.is_active !== false)
      .filter(row => activeTableIds.has(String(row?.table_id || '').trim()));
    const resolveRowSortKey = (row, fallback = 0) => {
      const updatedAt = Number(row?.updated_at);
      if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
      const createdAt = Number(row?.created_at);
      if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
      const updatedAlt = Number(row?.updatedAt);
      if (Number.isFinite(updatedAlt) && updatedAlt > 0) return updatedAlt;
      const createdAlt = Number(row?.createdAt);
      if (Number.isFinite(createdAlt) && createdAlt > 0) return createdAlt;
      return fallback;
    };
    const limitedRows = (() => {
      const grouped = new Map();
      const kept = [];
      rows.forEach((row, index) => {
        const tableId = String(row?.table_id || '').trim();
        if (!isSummaryLimitTableId(tableId)) {
          kept.push(row);
          return;
        }
        if (!grouped.has(tableId)) grouped.set(tableId, []);
        grouped.get(tableId).push({ row, index });
      });
      grouped.forEach((list) => {
        if (!list.length) return;
        if (list.length <= 10) {
          list.forEach(item => kept.push(item.row));
          return;
        }
        list.sort((a, b) => {
          const ak = resolveRowSortKey(a.row, a.index);
          const bk = resolveRowSortKey(b.row, b.index);
          if (ak !== bk) return ak - bk;
          return a.index - b.index;
        });
        list.slice(-10).forEach(item => kept.push(item.row));
      });
      return kept;
    })();

    const planResult = buildMemoryTablePlan({
      rows: limitedRows,
      tableById,
      tableOrder,
      autoExtract,
      maxRows,
      tokenBudgetData,
      tokenMode,
    });
    const selected = planResult.items || [];
    const truncated = planResult.truncated || [];
    const tableData = planResult.tableData || '';
    const rowIndexMap = planResult.rowIndexMap || {};
    const tableOrderNext = planResult.tableOrder || tableOrder;

    const buildCrossScopeExtraText = async (budgetTokens) => {
      if (!this.memoryTableStore || budgetTokens <= 0) return { text: '', tokens: 0 };
      const parts = [];
      let used = 0;
      const pushLine = (line) => {
        if (line === null || line === undefined) return true;
        const text = String(line);
        if (!text) {
          parts.push('');
          return true;
        }
        const cost = estimateTokens(text, tokenMode);
        if (used + cost > budgetTokens) return false;
        parts.push(text);
        used += cost;
        return true;
      };
      const pushSpacer = () => {
        if (parts.length && parts[parts.length - 1] !== '') parts.push('');
      };
      const getRowText = (row, table) => {
        if (!table) return '';
        return formatMemoryRowText(row?.row_data || {}, table?.columns || []);
      };
      const normalizeId = (cid) => String(cid || '').trim();
      const resolveContactName = (cid) => {
        const c = this.contactsStore?.getContact?.(cid);
        return String(c?.name || cid || '').trim();
      };

      if (!isGroup) {
        const contactId = sessionId;
        const groups = this.contactsStore?.listGroups?.() || [];
        const memberGroups = groups.filter(g => Array.isArray(g?.members) && g.members.includes(contactId));
        const outlineTable = tableByIdAll.get('group_outline');
        if (outlineTable && memberGroups.length) {
          if (!pushLine('【跨会话参考｜群聊大纲】')) return { text: '', tokens: used };
          pushLine('（仅供当前私聊参考，不在本会话记忆表格中更新）');
          for (const group of memberGroups) {
            const groupId = String(group?.id || '').trim();
            if (!groupId) continue;
            const groupName = String(group?.name || groupId).trim();
            const groupRows = await this.memoryTableStore.getMemories({
              scope: 'group',
              group_id: groupId,
              template_id: templateId,
            }).catch(() => []);
            const outlineRows = (Array.isArray(groupRows) ? groupRows : [])
              .filter(row => row && row.is_active !== false)
              .filter(row => String(row?.table_id || '').trim() === 'group_outline')
              .sort((a, b) => resolveRowSortKey(a, 0) - resolveRowSortKey(b, 0));
            if (!outlineRows.length) continue;
            pushSpacer();
            if (!pushLine(`【${groupName}】`)) break;
            for (const row of outlineRows) {
              const rowText = getRowText(row, outlineTable);
              if (!rowText) continue;
              if (!pushLine(`- ${rowText}`)) break;
            }
          }
        }
      } else {
        const groupContact = this.contactsStore?.getContact?.(sessionId);
        const members = Array.isArray(groupContact?.members)
          ? groupContact.members.map(item => normalizeId(item)).filter(Boolean)
          : [];
        const memberSet = new Set(members);
        const outlineTableId = 'chat_outline';
        const outlineTable = tableByIdAll.get(outlineTableId);
        if (members.length) {
          if (!pushLine('【跨会话参考｜成员私聊记忆】')) return { text: '', tokens: used };
          pushLine('（以下为用户与各成员的私聊关系记忆，群内其他人不应知道；仅供模型掌握，勿在群聊中泄露）');
          for (const memberId of members) {
            const memberRows = await this.memoryTableStore.getMemories({
              scope: 'contact',
              contact_id: memberId,
              template_id: templateId,
            }).catch(() => []);
            const activeRows = (Array.isArray(memberRows) ? memberRows : [])
              .filter(row => row && row.is_active !== false);
            const filteredRows = activeRows.filter(row => {
              const tableId = normalizeId(row?.table_id);
              return tableId && !isSummaryTableId(tableId);
            });
            const outlineRows = outlineTable
              ? activeRows.filter(row => normalizeId(row?.table_id) === outlineTableId)
              : [];
            if (!filteredRows.length && !outlineRows.length) continue;
            const memberName = resolveContactName(memberId);
            pushSpacer();
            if (!pushLine(`【成员：${memberName || memberId}】`)) break;
            const rowsByTable = new Map();
            filteredRows.forEach((row) => {
              const tableId = normalizeId(row?.table_id);
              if (!tableId) return;
              if (!rowsByTable.has(tableId)) rowsByTable.set(tableId, []);
              rowsByTable.get(tableId).push(row);
            });
            for (const [tableId, tableRows] of rowsByTable.entries()) {
              const table = tableByIdAll.get(tableId);
              if (!table) continue;
              const label = String(table?.name || tableId).trim() || tableId;
              const header = autoExtract ? `【${label}｜${tableId}】` : `【${label}】`;
              if (!pushLine(header)) return { text: parts.join('\n').trim(), tokens: used };
              tableRows.sort((a, b) => resolveRowSortKey(a, 0) - resolveRowSortKey(b, 0));
              for (const row of tableRows) {
                const rowText = getRowText(row, table);
                if (!rowText) continue;
                if (!pushLine(`- ${rowText}`)) return { text: parts.join('\n').trim(), tokens: used };
              }
            }
            if (outlineTable && outlineRows.length) {
              const outlineLabel = String(outlineTable?.name || outlineTableId).trim() || outlineTableId;
              const header = autoExtract ? `【${outlineLabel}｜${outlineTableId}】` : `【${outlineLabel}】`;
              if (!pushLine(header)) return { text: parts.join('\n').trim(), tokens: used };
              outlineRows.sort((a, b) => resolveRowSortKey(a, 0) - resolveRowSortKey(b, 0));
              for (const row of outlineRows) {
                const rowText = getRowText(row, outlineTable);
                if (!rowText) continue;
                if (!pushLine(`- ${rowText}`)) return { text: parts.join('\n').trim(), tokens: used };
              }
            }
          }
        }
        const groupOutlineTable = tableByIdAll.get('group_outline');
        if (groupOutlineTable && members.length) {
          const groups = this.contactsStore?.listGroups?.() || [];
          const relatedGroups = groups
            .map(group => {
              const gid = normalizeId(group?.id);
              const groupMembers = Array.isArray(group?.members)
                ? group.members.map(item => normalizeId(item)).filter(Boolean)
                : [];
              return { group, gid, groupMembers };
            })
            .filter(item => item.gid && item.gid !== normalizeId(sessionId))
            .filter(item => item.groupMembers.some(memberId => memberSet.has(memberId)));
          if (relatedGroups.length) {
            if (!pushLine('【跨群聊参考｜相关群聊大纲】')) return { text: '', tokens: used };
            pushLine('（以下为与当前群成员重叠的群聊大纲，仅共享成员知情）');
            for (const item of relatedGroups) {
              const groupId = item.gid;
              const groupName = String(item.group?.name || groupId).trim() || groupId;
              const groupRows = await this.memoryTableStore.getMemories({
                scope: 'group',
                group_id: groupId,
                template_id: templateId,
              }).catch(() => []);
              const outlineRows = (Array.isArray(groupRows) ? groupRows : [])
                .filter(row => row && row.is_active !== false)
                .filter(row => normalizeId(row?.table_id) === 'group_outline')
                .sort((a, b) => resolveRowSortKey(a, 0) - resolveRowSortKey(b, 0));
              if (!outlineRows.length) continue;
              const unknownMembers = members.filter(memberId => !item.groupMembers.includes(memberId));
              const unknownNames = unknownMembers.map(memberId => resolveContactName(memberId) || memberId).filter(Boolean);
              pushSpacer();
              if (!pushLine(`【${groupName}】`)) break;
              if (unknownNames.length) {
                if (!pushLine(`（提示：本群聊中成员${unknownNames.join('、')}未参与该群聊，不知道以下内容）`)) break;
              }
              for (const row of outlineRows) {
                const rowText = getRowText(row, groupOutlineTable);
                if (!rowText) continue;
                if (!pushLine(`- ${rowText}`)) break;
              }
            }
          }
        }
      }
      return { text: parts.join('\n').trim(), tokens: used };
    };

    const baseTokens = tableData ? estimateTokens(tableData, tokenMode) : 0;
    const remainingBudget = Math.max(0, tokenBudgetData - baseTokens);
    const extraResult = await buildCrossScopeExtraText(remainingBudget);
    const extraText = String(extraResult?.text || '').trim();
    const combinedTableData = [tableData, extraText].filter(Boolean).join('\n\n').trim();

    if (!selected.length && !truncated.length && !combinedTableData) {
      const promptText = autoExtract ? buildPromptText('') : '';
      const tokenTotal = promptText ? estimateTokens(promptText, tokenMode) : 0;
      return {
        enabled: true,
        reason: 'empty',
        items: [],
        truncated: [],
        tokenTotal,
        tokenBudget: maxTokens,
        tokenBudgetSafety,
        tokenBudgetData,
        overheadTokens,
        maxRows,
        position,
        injectDepth,
        promptText,
        tableData: '',
        updateMode,
        templateId,
        templateName,
        targetId: sessionId,
        targetName,
        scope,
        autoExtract,
        tableOrder: tableOrderNext,
        rowIndexMap: {},
      };
    }

    if (!selected.length && !combinedTableData) {
      const promptText = autoExtract ? buildPromptText('') : '';
      const tokenTotal = promptText ? estimateTokens(promptText, tokenMode) : 0;
      return {
        enabled: true,
        reason: 'budget_empty',
        items: [],
        truncated,
        tokenTotal,
        tokenBudget: maxTokens,
        tokenBudgetSafety,
        tokenBudgetData,
        overheadTokens,
        maxRows,
        position,
        injectDepth,
        promptText,
        tableData: '',
        updateMode,
        templateId,
        templateName,
        targetId: sessionId,
        targetName,
        scope,
        autoExtract,
        tableOrder: tableOrderNext,
        rowIndexMap: {},
      };
    }

    const promptText = buildPromptText(combinedTableData);
    const tokenTotal = estimateTokens(promptText, tokenMode);

    return {
      enabled: true,
      reason: '',
      items: selected,
      truncated,
      tokenTotal,
      tokenBudget: maxTokens,
      tokenBudgetSafety,
      tokenBudgetData,
      overheadTokens,
      maxRows,
      position,
      injectDepth,
      promptText,
      tableData,
      updateMode,
      templateId,
      templateName,
      targetId: sessionId,
      targetName,
      scope,
      autoExtract,
      tableOrder: tableOrderNext,
      rowIndexMap,
    };
  }

  async getMemoryPromptPlan(context = null) {
    const ctx = context || (this.contextBuilder ? this.contextBuilder('') : null) || {};
    const plan = await this.buildMemoryPromptPlan(ctx);
    this.lastMemoryPlan = plan;
    return plan;
  }

  setLastMemoryUpdate(sessionId, payload = null) {
    const id = String(sessionId || '').trim();
    if (!id) return;
    if (!payload) {
      delete this.lastMemoryUpdateBySession[id];
      return;
    }
    this.lastMemoryUpdateBySession[id] = { ...(payload || {}), sessionId: id };
  }

  getLastMemoryUpdate(sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) return null;
    return this.lastMemoryUpdateBySession?.[id] || null;
  }

  async ensureBuiltinWorldbooks() {
    await this.worldStore.ready;
    try {
      const existing = this.worldStore.load(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
      const incoming = BUILTIN_PHONE_FORMAT_WORLDBOOK;
      if (!existing || !Array.isArray(existing.entries)) {
        await this.worldStore.save(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, incoming);
        logger.info(`已写入内置世界书：${BUILTIN_PHONE_FORMAT_WORLDBOOK_ID}`);
        return;
      }
      const byComment = new Map();
      for (const e of existing.entries || []) {
        const key = String(e?.comment || e?.title || e?.id || '').trim();
        if (key) byComment.set(key, e);
      }
      let changed = false;
      const merged = [];
      const incomingKeys = new Set();
      for (const ie of incoming.entries || []) {
        const key = String(ie?.comment || ie?.title || ie?.id || '').trim();
        if (!key) continue;
        incomingKeys.add(key);
        const cur = byComment.get(key);
        if (!cur) {
          merged.push(ie);
          changed = true;
          continue;
        }
        const next = { ...cur, ...ie };
        if (JSON.stringify(next) !== JSON.stringify(cur)) changed = true;
        merged.push(next);
      }
      for (const e of existing.entries || []) {
        const key = String(e?.comment || e?.title || e?.id || '').trim();
        if (key && incomingKeys.has(key)) continue;
        merged.push(e);
      }
      if (changed) {
        await this.worldStore.save(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, { ...existing, entries: merged });
        logger.info(`已更新内置世界书：${BUILTIN_PHONE_FORMAT_WORLDBOOK_ID}`);
      }
    } catch (err) {
      logger.warn('内置世界书迁移失败（忽略）', err);
    }
  }

  getWorldSessionMapKey() {
    return makeScopedKey('world_session_map_v1', this.scopeId);
  }

  getGlobalWorldIdKey() {
    return makeScopedKey('global_world_id_v1', this.scopeId);
  }

  getWorldGlobalSettingsKey() {
    return makeScopedKey('world_global_settings_v1', this.scopeId);
  }

  normalizeWorldIds(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map(item => String(item || '').trim()).filter(Boolean);
  }

  setPersonaScope(scopeId = '') {
    const next = normalizeScopeId(scopeId);
    if (next === this.scopeId) return;
    this.scopeId = next;
    this.worldSessionMap = this.loadWorldSessionMap();
    this.globalWorldId = this.loadGlobalWorldId();
    this.worldGlobalSettings = this.loadWorldGlobalSettings();
    this.currentWorldIds = this.activeSessionId ? this.normalizeWorldIds(this.worldSessionMap[this.activeSessionId]) : [];
    this.currentWorldId = this.currentWorldIds[0] || null;
    this.hydrateWorldSessionMap();
    this.hydrateGlobalWorldId();
    this.hydrateWorldGlobalSettings();
    this.syncWorldRegexBindings?.();
  }

  loadGlobalWorldId() {
    try {
      const raw = localStorage.getItem(this.getGlobalWorldIdKey());
      return raw ? String(raw) : null;
    } catch {
      return null;
    }
  }

  getDefaultWorldGlobalSettings() {
    return {
      scanDepth: 2,
      insertionStrategy: 'role_first',
      contextPercent: 20,
      includeNames: false,
      budgetCap: 0,
      minActivations: 0,
      maxDepth: 0,
      maxRecursionSteps: 0,
      recursiveScan: true,
      caseSensitive: false,
      matchWholeWords: true,
      useGroupScoring: false,
      alertOnOverflow: false,
    };
  }

  normalizeWorldGlobalSettings(value) {
    const base = this.getDefaultWorldGlobalSettings();
    const obj = value && typeof value === 'object' ? value : {};
    const scanDepthRaw = obj.scanDepth;
    const scanDepth = (scanDepthRaw === null || scanDepthRaw === '' || scanDepthRaw === undefined)
      ? base.scanDepth
      : (Number.isFinite(Number(scanDepthRaw)) ? Math.max(0, Math.trunc(Number(scanDepthRaw))) : base.scanDepth);
    const strategyRaw = String(obj.insertionStrategy || base.insertionStrategy || 'role_first');
    const insertionStrategy = ['role_first', 'global_first', 'even'].includes(strategyRaw)
      ? strategyRaw
      : base.insertionStrategy;
    const contextRaw = obj.contextPercent;
    const contextPercent = (contextRaw === null || contextRaw === '' || contextRaw === undefined)
      ? base.contextPercent
      : (Number.isFinite(Number(contextRaw)) ? Math.max(0, Math.min(100, Math.trunc(Number(contextRaw)))) : base.contextPercent);
    const budgetRaw = obj.budgetCap;
    const budgetCap = (budgetRaw === null || budgetRaw === '' || budgetRaw === undefined)
      ? base.budgetCap
      : (Number.isFinite(Number(budgetRaw)) ? Math.max(0, Math.trunc(Number(budgetRaw))) : base.budgetCap);
    const minActRaw = obj.minActivations;
    const minActivations = (minActRaw === null || minActRaw === '' || minActRaw === undefined)
      ? base.minActivations
      : (Number.isFinite(Number(minActRaw)) ? Math.max(0, Math.trunc(Number(minActRaw))) : base.minActivations);
    const maxDepthRaw = obj.maxDepth;
    const maxDepth = (maxDepthRaw === null || maxDepthRaw === '' || maxDepthRaw === undefined)
      ? base.maxDepth
      : (Number.isFinite(Number(maxDepthRaw)) ? Math.max(0, Math.trunc(Number(maxDepthRaw))) : base.maxDepth);
    const maxRecursionRaw = obj.maxRecursionSteps;
    const maxRecursionSteps = (maxRecursionRaw === null || maxRecursionRaw === '' || maxRecursionRaw === undefined)
      ? base.maxRecursionSteps
      : (Number.isFinite(Number(maxRecursionRaw)) ? Math.max(0, Math.trunc(Number(maxRecursionRaw))) : base.maxRecursionSteps);
    const includeNames = obj.includeNames === undefined || obj.includeNames === null ? base.includeNames : obj.includeNames === true;
    const recursiveScan = obj.recursiveScan === undefined || obj.recursiveScan === null ? base.recursiveScan : obj.recursiveScan === true;
    const caseSensitive = obj.caseSensitive === undefined || obj.caseSensitive === null ? base.caseSensitive : obj.caseSensitive === true;
    const matchWholeWords = obj.matchWholeWords === undefined || obj.matchWholeWords === null ? base.matchWholeWords : obj.matchWholeWords === true;
    const useGroupScoring = obj.useGroupScoring === undefined || obj.useGroupScoring === null ? base.useGroupScoring : obj.useGroupScoring === true;
    const alertOnOverflow = obj.alertOnOverflow === undefined || obj.alertOnOverflow === null ? base.alertOnOverflow : obj.alertOnOverflow === true;
    return {
      scanDepth,
      insertionStrategy,
      contextPercent,
      includeNames,
      budgetCap,
      minActivations,
      maxDepth,
      maxRecursionSteps,
      recursiveScan,
      caseSensitive,
      matchWholeWords,
      useGroupScoring,
      alertOnOverflow,
    };
  }

  loadWorldGlobalSettings() {
    try {
      const raw = localStorage.getItem(this.getWorldGlobalSettingsKey());
      if (!raw) return this.getDefaultWorldGlobalSettings();
      return this.normalizeWorldGlobalSettings(JSON.parse(raw));
    } catch {
      return this.getDefaultWorldGlobalSettings();
    }
  }

  loadWorldSessionMap() {
    try {
      const raw = localStorage.getItem(this.getWorldSessionMapKey());
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      logger.warn('world-session map 读取失败，重置', err);
      return {};
    }
  }

  async hydrateWorldSessionMap() {
    try {
      const kv = await safeInvoke('load_kv', { name: this.getWorldSessionMapKey() });
      if (kv && typeof kv === 'object' && Object.keys(kv).length) {
        this.worldSessionMap = kv;
        localStorage.setItem(this.getWorldSessionMapKey(), JSON.stringify(kv));
        // 切换当前 session 的世界书
        if (this.activeSessionId && kv[this.activeSessionId]) {
          this.currentWorldIds = this.normalizeWorldIds(kv[this.activeSessionId]);
          this.currentWorldId = this.currentWorldIds[0] || null;
          window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds } }));
        }
        logger.info('world-session map hydrated from disk');
      }
    } catch (err) {
      logger.debug('world-session map 磁盘加载失败（可能非 Tauri）', err);
    }
  }

  async hydrateGlobalWorldId() {
    try {
      const kv = await safeInvoke('load_kv', { name: this.getGlobalWorldIdKey() });
      if (kv && typeof kv === 'string' && kv.trim()) {
        this.globalWorldId = kv.trim();
        try {
          localStorage.setItem(this.getGlobalWorldIdKey(), this.globalWorldId);
        } catch {}
      }
    } catch (err) {
      logger.debug('global world id 磁盘加载失败（可能非 Tauri）', err);
    }
  }

  async hydrateWorldGlobalSettings() {
    try {
      const kv = await safeInvoke('load_kv', { name: this.getWorldGlobalSettingsKey() });
      if (kv && typeof kv === 'object') {
        this.worldGlobalSettings = this.normalizeWorldGlobalSettings(kv);
        localStorage.setItem(this.getWorldGlobalSettingsKey(), JSON.stringify(this.worldGlobalSettings));
      }
    } catch (err) {
      logger.debug('global world settings 磁盘加载失败（可能非 Tauri）', err);
    }
  }

  persistWorldSessionMap() {
    localStorage.setItem(this.getWorldSessionMapKey(), JSON.stringify(this.worldSessionMap || {}));
    safeInvoke('save_kv', { name: this.getWorldSessionMapKey(), data: this.worldSessionMap }).catch(() => {});
  }

  persistGlobalWorldId() {
    try {
      localStorage.setItem(this.getGlobalWorldIdKey(), this.globalWorldId || '');
    } catch {}
    // 保存为 string（kv 支持任意 JSON；这里用 string 简化）
    safeInvoke('save_kv', { name: this.getGlobalWorldIdKey(), data: String(this.globalWorldId || '') }).catch(() => {});
  }

  persistWorldGlobalSettings() {
    try {
      localStorage.setItem(this.getWorldGlobalSettingsKey(), JSON.stringify(this.worldGlobalSettings || {}));
    } catch {}
    safeInvoke('save_kv', { name: this.getWorldGlobalSettingsKey(), data: this.worldGlobalSettings || {} }).catch(() => {});
  }

  /**
   * 初始化桥接层
   */
  async init() {
    try {
      logger.info('初始化 AppBridge...');

      // 加载配置
      await this.presets.ready;
      await this.regex.ready;
      await this.ensureBuiltinWorldbooks();
      let config = await this.config.load();
      // 注意：不要在启动时强制用“预设绑定连接”覆盖用户最后一次使用的连接配置。
      // 预设绑定仅在用户切换预设时应用（由 preset-panel 调用 applyBoundConfigIfAny），否则会导致
      // “明明保存/选择了 Deepseek，重启又回到默认配置”的问题。

      // 初始化 LLM 客户端
      if (canInitClient(config)) {
        this.client = new LLMClient(config);
        logger.info(`LLM 客户端初始化成功 (provider: ${config.provider})`);
      } else {
        logger.warn('未配置 API 认证信息，请先配置');
      }

      this.initialized = true;
      logger.info('AppBridge 初始化完成');

      return true;
    } catch (error) {
      logger.error('AppBridge 初始化失败:', error);
      return false;
    }
  }

  /**
   * 检查是否已配置
   */
  isConfigured() {
    const config = this.config.get();
    return Boolean(canInitClient(config));
  }

  /**
   * 切换当前会话（影响世界书选中）
   */
  setActiveSession(sessionId = 'default') {
    const prevSessionId = this.activeSessionId;
    this.activeSessionId = sessionId;
    this.currentWorldIds = this.normalizeWorldIds(this.worldSessionMap[sessionId]);
    this.currentWorldId = this.currentWorldIds[0] || null;
    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds } }));
    try {
      const runtime = this.pluginRuntime;
      if (runtime) {
        const buildSessionPayload = (sid) => {
          const id = String(sid || '').trim();
          if (!id) return null;
          const contact = this.contactsStore?.getContact?.(id) || null;
          const name = contact?.name || id;
          const isGroup = Boolean(contact?.isGroup) || id.startsWith('group:');
          return { id, name, isGroup };
        };
        runtime.dispatchEvent('session.changed', {
          oldSession: buildSessionPayload(prevSessionId),
          newSession: buildSessionPayload(sessionId),
        }).catch(err => logger.warn('plugin session.changed failed', err));
      }
      const scriptRuntime = this.scriptRuntime;
      if (scriptRuntime) {
        const buildSessionPayload = (sid) => {
          const id = String(sid || '').trim();
          if (!id) return null;
          const contact = this.contactsStore?.getContact?.(id) || null;
          const name = contact?.name || id;
          const isGroup = Boolean(contact?.isGroup) || id.startsWith('group:');
          return { id, name, isGroup };
        };
        scriptRuntime.dispatchEvent('session.changed', {
          oldSession: buildSessionPayload(prevSessionId),
          newSession: buildSessionPayload(sessionId),
        }).catch(err => logger.warn('script session.changed failed', err));
      }
    } catch (err) {
      logger.debug('plugin session.changed dispatch skipped', err);
    }
  }

  getRegexContext() {
    const presetState = this.presets?.getState?.() || {};
    const activePresets = (() => {
      const active = presetState?.active || {};
      const enabled = presetState?.enabled || {};
      const out = {};
      for (const [type, id] of Object.entries(active)) {
        if (!id) continue;
        if (enabled && enabled[type] === false) continue;
        out[type] = id;
      }
      return out;
    })();
    const worldIds = [];
    if (this.globalWorldId) worldIds.push(String(this.globalWorldId));
    (this.currentWorldIds || []).forEach(id => {
      if (id) worldIds.push(String(id));
    });
    const sid = String(this.activeSessionId || '').trim();
    const buildNestedVars = (flat = {}) => {
      const root = {};
      const toPath = (val) => String(val || '')
        .replace(/\[([^\]]+)\]/g, '.$1')
        .split('.')
        .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      const isIndex = (seg) => /^\d+$/.test(seg);
      const setByPath = (obj, path, value) => {
        const parts = toPath(path);
        if (!parts.length) return;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = isIndex(parts[i]) ? Number(parts[i]) : parts[i];
          const nextKey = parts[i + 1];
          const shouldArray = isIndex(nextKey);
          if (!cur[key] || typeof cur[key] !== 'object') {
            cur[key] = shouldArray ? [] : {};
          }
          cur = cur[key];
        }
        const lastKey = isIndex(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
        cur[lastKey] = value;
      };
      Object.entries(flat || {}).forEach(([key, value]) => {
        const name = String(key || '').trim();
        if (!name) return;
        setByPath(root, name, value);
      });
      return root;
    };
    let localVars = {};
    let globalVars = {};
    try {
      localVars = this.chatStore?.listVariables?.(sid) || {};
    } catch {}
    try {
      globalVars = this.chatStore?.listGlobalVariables?.() || {};
    } catch {}
    const isShared = typeof this.isSharedVariableSession === 'function'
      ? Boolean(this.isSharedVariableSession(sid))
      : false;
    const baseVars = isShared ? globalVars : localVars;
    const baseNested = buildNestedVars(baseVars);
    const globalNested = buildNestedVars(globalVars);
    const mergedVars = { ...globalVars, ...localVars };
    return {
      sessionId: this.activeSessionId,
      worldId: this.currentWorldId,
      worldIds,
      activePresets,
      macroVars: {
        ...mergedVars,
        stat_data: baseNested,
        variables: baseNested,
        status_current_variables: baseNested,
        global_variables: globalNested,
        local_variables: localVars,
      },
    };
  }

  async syncPresetRegexBindings() {
    try {
      await this.presets?.ready;
      await this.regex?.ready;
      const presetState = this.presets?.getState?.() || {};
      const active = (() => {
        const activePresets = presetState?.active || {};
        const enabled = presetState?.enabled || {};
        const out = {};
        for (const [type, id] of Object.entries(activePresets)) {
          if (!id) continue;
          if (enabled && enabled[type] === false) continue;
          out[type] = id;
        }
        return out;
      })();
      const changed = await this.regex.syncPresetBindings?.(active);
      if (changed) {
        window.dispatchEvent(new CustomEvent('regex-changed'));
      }
      return Boolean(changed);
    } catch {
      return false;
    }
  }

  async syncWorldRegexBindings() {
    try {
      await this.regex?.ready;
      const worldIds = [];
      if (this.globalWorldId) worldIds.push(String(this.globalWorldId));
      (this.currentWorldIds || []).forEach(id => {
        if (id) worldIds.push(String(id));
      });
      const changed = await this.regex?.syncWorldBindings?.(worldIds);
      if (changed) {
        window.dispatchEvent(new CustomEvent('regex-changed'));
      }
      return Boolean(changed);
    } catch {
      return false;
    }
  }

  applyInputRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.USER_INPUT, {
        isMarkdown: false,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  applyInputStoredRegex(text, opts) {
    return this.applyInputRegex(text, opts);
  }

  applyInputDisplayRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.USER_INPUT, {
        isMarkdown: true,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  /**
   * Direct (non-ephemeral) scripts: alter stored chat content irreversibly
   * - ST semantics: neither "Alter Chat Display" nor "Alter Outgoing Prompt" checked
   */
  applyOutputStoredRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.AI_OUTPUT, {
        isMarkdown: false,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  /**
   * Ephemeral display scripts: alter what user sees, without changing stored chat text
   */
  applyOutputDisplayRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.AI_OUTPUT, {
        isMarkdown: true,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  /**
   * Compatibility: raw -> stored -> display
   */
  applyOutputRegex(text) {
    const stored = this.applyOutputStoredRegex(text);
    return this.applyOutputDisplayRegex(stored);
  }

  applyReasoningStoredRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.REASONING, {
        isMarkdown: false,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  applyReasoningDisplayRegex(text, { isEdit = false, depth } = {}) {
    try {
      return this.regex.apply(text, this.getRegexContext(), regex_placement.REASONING, {
        isMarkdown: true,
        isPrompt: false,
        isEdit: Boolean(isEdit),
        depth,
      });
    } catch {
      return String(text ?? '');
    }
  }

  /**
   * 生成 AI 回复
   * @param {string} userMessage - 用户消息
   * @param {Object} context - 上下文（角色设定、历史消息等）
   * @returns {Promise<string>|AsyncGenerator<string>} 回复内容或流
   */
  async generate(userMessage, context = {}) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.isConfigured()) {
      throw new Error('请先配置 API 信息');
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('当前离线，请连接网络后再试');
    }

    if (this.isGenerating) {
      throw new Error('正在生成中，请稍候...');
    }

    this.isGenerating = true;
    this.abortController = new AbortController();
    this.abortReason = '';
    let streaming = false;

    try {
      const originalInput = userMessage;
      // ST semantics:
      // - direct scripts (non-ephemeral) may alter stored chat content
      // - promptOnly scripts apply to outgoing prompt only
      const ctx = this.getRegexContext();
      const skipInputRegex = context?.meta?.skipInputRegex === true;
      const directInput = skipInputRegex
        ? userMessage
        : this.regex.apply(userMessage, ctx, regex_placement.USER_INPUT, {
            isMarkdown: false,
            isPrompt: false,
            isEdit: false,
            depth: 0,
          });
      let promptInput = skipInputRegex
        ? userMessage
        : this.regex.apply(userMessage, ctx, regex_placement.USER_INPUT, {
            // Product requirement: as long as enabled, input regex should apply to outgoing prompt.
            // So, include markdownOnly scripts too when building outgoing prompt.
            isMarkdown: true,
            isPrompt: true,
            isEdit: false,
            depth: 0,
          });
      let nextContext = {
        ...(context || {}),
        meta: {
          ...(context?.meta || {}),
          rawUserMessage: originalInput,
          userMessageProcessed: true,
        },
      };
      try {
        const memoryPlan = await this.buildMemoryPromptPlan(nextContext);
        this.lastMemoryPlan = memoryPlan;
        if (memoryPlan?.enabled && memoryPlan.promptText) {
          nextContext.meta = {
            ...(nextContext.meta || {}),
            memoryPrompt: {
              content: memoryPlan.promptText,
              position: memoryPlan.position,
              depth: memoryPlan.injectDepth,
            },
          };
        }
      } catch (err) {
        logger.warn('memory prompt plan failed', err);
      }
      const scriptRuntime = this.scriptRuntime;
      if (scriptRuntime && nextContext?.meta?.skipScripts !== true) {
        try {
          const updated = await scriptRuntime.dispatchEvent('prompt.before_build', {
            input: promptInput,
            context: nextContext,
          });
          if (updated && typeof updated === 'object') {
            if (typeof updated.input === 'string') promptInput = updated.input;
            if (updated.context && typeof updated.context === 'object') nextContext = updated.context;
          }
        } catch (err) {
          logger.warn('script prompt.before_build failed', err);
        }
      }
      const pluginRuntime = this.pluginRuntime;
      if (pluginRuntime) {
        try {
          const updated = await pluginRuntime.dispatchEvent('prompt.before_build', {
            input: promptInput,
            context: nextContext,
          });
          if (updated && typeof updated === 'object') {
            if (typeof updated.input === 'string') promptInput = updated.input;
            if (updated.context && typeof updated.context === 'object') nextContext = updated.context;
          }
        } catch (err) {
          logger.warn('plugin prompt.before_build failed', err);
        }
      }
      let messages = this.buildMessages(promptInput, nextContext);
      if (scriptRuntime && nextContext?.meta?.skipScripts !== true) {
        try {
          const updated = await scriptRuntime.dispatchEvent('prompt.after_build', {
            prompt: messages,
            context: nextContext,
          });
          if (updated && typeof updated === 'object' && Array.isArray(updated.prompt)) {
            messages = updated.prompt;
          }
        } catch (err) {
          logger.warn('script prompt.after_build failed', err);
        }
      }
      if (pluginRuntime) {
        try {
          const updated = await pluginRuntime.dispatchEvent('prompt.after_build', {
            prompt: messages,
            context: nextContext,
          });
          if (updated && typeof updated === 'object' && Array.isArray(updated.prompt)) {
            messages = updated.prompt;
          }
        } catch (err) {
          logger.warn('plugin prompt.after_build failed', err);
        }
      }
      if (templateSettings.shouldRun('generate', nextContext)) {
        const sessionId = String(nextContext?.session?.id || this.activeSessionId || '').trim();
        try {
          const rendered = await renderTemplateMessages(messages, {
            stage: 'generate',
            chatStore: this.chatStore,
            sessionId,
            context: {
              ...(nextContext || {}),
              messages,
            },
          });
          if (rendered && Array.isArray(rendered.messages)) {
            messages = rendered.messages;
          }
        } catch (err) {
          logger.warn('template render (generate) failed', err);
        }
      }
      const config = this.config.get();
      const genOptions = this.getGenerationOptions();
      const requestOptions = { ...(genOptions || {}), signal: this.abortController.signal };

      logger.debug('发送消息到 LLM:', { messageCount: messages.length, stream: config.stream });
      // Debug: keep the exact request payload used for the latest generation
      this.lastRequest = {
        at: Date.now(),
        provider: config?.provider,
        baseUrl: config?.baseUrl,
        model: config?.model,
        stream: Boolean(config?.stream),
        options: genOptions,
        messages,
      };

      if (config.stream) {
        streaming = true;
        const inner = this.generateStream(messages, requestOptions, originalInput);
        const self = this;
        return (async function* () {
          try {
            yield* inner;
          } finally {
            self.isGenerating = false;
            self.abortController = null;
            self.abortReason = '';
          }
        })();
      } else {
        const response = await retryWithBackoff(() => this.client.chat(messages, requestOptions), {
          maxRetries: config.maxRetries || 3,
          shouldRetry: err => !this.abortController?.signal?.aborted && isRetryableError(err),
        });

        // 保存到历史记录
        await this.saveToHistory(originalInput, response);
        return response;
      }
    } catch (error) {
      logger.error('生成失败:', error);
      throw error;
    } finally {
      if (!streaming) {
        this.isGenerating = false;
        this.abortController = null;
        this.abortReason = '';
      }
    }
  }

  /**
   * Background one-shot chat (does not block main generation / no isGenerating lock).
   * Intended for maintenance tasks like summary compaction.
   */
  async backgroundChat(messages, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    if (!this.isConfigured()) {
      throw new Error('请先配置 API 信息');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('当前离线，请连接网络后再试');
    }
    const msgs = Array.isArray(messages) ? messages : [];
    if (!msgs.length) throw new Error('messages 不能为空');

    // Use the same generation options mapping as normal chat, but allow caller overrides.
    const genOptions = { ...this.getGenerationOptions(), ...(options || {}) };
    return this.client.chat(msgs, genOptions);
  }

  /**
   * 流式生成
   */
  async *generateStream(messages, genOptions = {}, originalUserMessage = '') {
    let fullResponse = '';

    try {
      for await (const chunk of this.client.streamChat(messages, genOptions)) {
        fullResponse += chunk;
        yield chunk;
      }

      // 流式完成后保存到历史记录
      await this.saveToHistory(originalUserMessage || '', fullResponse);
    } catch (error) {
      // User-initiated cancellation (e.g. message retract) should not be converted into a timeout error.
      if (this.abortController?.signal?.aborted && this.abortReason) {
        const e = new Error('cancelled');
        e.name = 'AbortError';
        e.cancelled = true;
        e.reason = this.abortReason;
        throw e;
      }
      const normalized = (() => {
        try {
          // Android WebView may throw DOMException on abort/timeout
          const name = String(error?.name || '');
          const msg = String(error?.message || '');
          if (name === 'AbortError' || (error instanceof DOMException && name === 'AbortError')) {
            const ms = Number(this.config?.get?.()?.timeout);
            const sec = Number.isFinite(ms) ? Math.round(ms / 1000) : 60;
            const e = new Error(`请求超时（${sec}秒），请稍后重试或在 API 设定中调低输出/切换网络`);
            e.cause = error;
            return e;
          }
          if (error instanceof DOMException) {
            const e = new Error(`${name || 'DOMException'}${msg ? `: ${msg}` : ''}`);
            e.cause = error;
            return e;
          }
        } catch {}
        return error;
      })();
      logger.error('流式生成失败:', normalized?.name, normalized?.message, normalized);
      throw normalized;
    }
  }

  /**
   * 构建消息数组
   */
	  buildMessages(userMessage, context = {}) {
	    const messages = [];

    const name1 = context?.user?.name || 'user';
    const name2 = context?.character?.name || 'assistant';
    const sessionIdForSummary = String(context?.session?.id || this.activeSessionId || 'default');
    const rawUserMessage = (typeof context?.meta?.rawUserMessage === 'string')
      ? String(context.meta.rawUserMessage)
      : String(userMessage ?? '');
    const pendingUserTextRaw = String(rawUserMessage ?? '').trim();
    const appendUserToHistory = context?.meta?.appendUserToHistory !== false;
    const isMomentCommentTask = String(context?.task?.type || '').toLowerCase() === 'moment_comment';
    const isGroupChat = Boolean(context?.session?.isGroup) || String(context?.session?.id || '').startsWith('group:');
    const memoryMode = String(context?.meta?.memoryStorageMode || '').trim().toLowerCase();
    const useSummaryMemory = memoryMode !== 'table' && !Boolean(context?.meta?.disableSummary);
    const includeTimeContext = (() => {
      const raw = context?.meta?.includeTimeContext;
      if (typeof raw === 'boolean') return raw;
      try {
        return appSettings.get().promptCurrentTimeEnabled === true;
      } catch {
        return false;
      }
    })();
    const timeContextBlock = includeTimeContext ? { role: 'system', content: buildTimeContextText() } : null;
    const memoryPromptRaw = context?.meta?.memoryPrompt;
    const memoryPromptContent = typeof memoryPromptRaw?.content === 'string' ? String(memoryPromptRaw.content).trim() : '';
    const memoryPromptPositionRaw = memoryPromptRaw?.position ?? '';
    const parsedPositions = parseMemoryPromptPositions(memoryPromptPositionRaw);
    const memoryPromptPositions = parsedPositions.length ? parsedPositions : ['after_persona'];
    const memoryPromptDepthRaw = Math.trunc(Number(memoryPromptRaw?.depth));
    const memoryPromptDepth = Number.isFinite(memoryPromptDepthRaw) ? Math.max(0, memoryPromptDepthRaw) : 4;
    const memoryPromptRoleRaw = String(memoryPromptRaw?.role || 'system').toLowerCase();
    const memoryPromptRole =
      memoryPromptRoleRaw === 'user' || memoryPromptRoleRaw === 'assistant' || memoryPromptRoleRaw === 'system'
        ? memoryPromptRoleRaw
        : 'system';
    const memoryPrompt = memoryPromptContent
      ? { content: memoryPromptContent, positions: memoryPromptPositions, role: memoryPromptRole, depth: memoryPromptDepth }
      : null;
    const disableScenarioHint = Boolean(context?.meta?.disableScenarioHint);
    const overrideLastUserMessageRaw = (typeof context?.meta?.overrideLastUserMessage === 'string')
      ? String(context.meta.overrideLastUserMessage)
      : '';
    const scenarioHint = (() => {
      if (isMomentCommentTask) {
        const isReply = Boolean(context?.task?.replyToAuthor) || Boolean(context?.task?.replyToCommentId) || Boolean(context?.task?.isReplyToComment);
        return isReply ? '在动态评论回复，注意动态评论格式' : '在动态评论，注意动态评论格式';
      }
      if (isGroupChat) return '在群聊，注意群聊格式';
      return '在私聊，注意私聊格式';
    })();
    const pendingUserText = pendingUserTextRaw && !disableScenarioHint
      ? `${pendingUserTextRaw}（${scenarioHint}）`
      : pendingUserTextRaw;
    const lastUserMessageRe = /{{\s*(?:lastUserMessage|userLastMessage|user_last_message)\s*}}/i;
    const hasLastUserMessagePlaceholder = (raw) => lastUserMessageRe.test(String(raw || ''));
    let usedLastUserMessageForPendingInput = false;
    const pendingUserPrompt = (() => {
      if (!pendingUserTextRaw) return '';
      const baseText = disableScenarioHint ? String(rawUserMessage ?? '') : pendingUserText;
      if (context?.meta?.skipInputRegex === true) return String(baseText ?? '');
      return this.regex.apply(baseText, this.getRegexContext(), regex_placement.USER_INPUT, {
        isMarkdown: true,
        isPrompt: true,
        isEdit: false,
        depth: 0,
      });
    })();
    const normalizeAttachmentParts = (parts) => {
      const list = Array.isArray(parts) ? parts : [];
      return list
        .map((part) => {
          if (!part || typeof part !== 'object') return null;
          if (part.type === 'text') {
            const text = String(part.text || '');
            return text ? { type: 'text', text } : null;
          }
          if (part.type === 'image_url') {
            const url = String(part.image_url?.url || '').trim();
            return url ? { type: 'image_url', image_url: { url } } : null;
          }
          return null;
        })
        .filter(Boolean);
    };
    const userAttachmentParts = normalizeAttachmentParts(context?.meta?.userAttachmentParts);
    const hasUserAttachments = userAttachmentParts.length > 0;
    const buildUserContentWithAttachments = (text) => {
      if (!hasUserAttachments) return text;
      const parts = [];
      const base = String(text ?? '');
      if (base.trim()) parts.push({ type: 'text', text: base });
      userAttachmentParts.forEach(part => parts.push(part));
      return parts;
    };
    const pendingUserContent = buildUserContentWithAttachments(pendingUserPrompt);
    const attachmentOnlyContent = hasUserAttachments ? buildUserContentWithAttachments('') : '';
    let attachmentsInserted = false;
    const effectiveLastUserMessage = overrideLastUserMessageRaw.trim()
      ? overrideLastUserMessageRaw.trim()
      : pendingUserPrompt;
    const macroUiMode = String(context?.meta?.uiMode || context?.uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat';
    const macroUseGlobalVariables = context?.meta?.useGlobalVariables === true || context?.useGlobalVariables === true;
    const processTextMacrosWithPendingFlag = (rawText, extraContext) => {
      const raw = String(rawText ?? '');
      return raw
        ? this.processTextMacros(raw, {
            ...(extraContext || {}),
            uiMode: macroUiMode,
            lastUserMessage: effectiveLastUserMessage,
            useGlobalVariables: macroUseGlobalVariables,
          })
        : '';
    };
    const trimEdgeBlankLines = (text) =>
      String(text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
    const joinPromptBlocks = (blocks = []) => {
      const parts = Array.isArray(blocks) ? blocks : [blocks];
      const cleaned = parts.map(trimEdgeBlankLines).filter(s => String(s || '').trim().length > 0);
      return cleaned.join('\n\n');
    };
    // SillyTavern-like persona settings (subset)
    const personaRaw = String(context?.user?.persona || '');
    const personaPosition = Number.isFinite(Number(context?.user?.personaPosition))
      ? Number(context.user.personaPosition)
      : 0; // IN_PROMPT
    const personaDepth = Number.isFinite(Number(context?.user?.personaDepth))
      ? Math.max(0, Math.trunc(Number(context.user.personaDepth)))
      : 2;
    const personaRole = Number.isFinite(Number(context?.user?.personaRole))
      ? Math.max(0, Math.min(2, Math.trunc(Number(context.user.personaRole))))
      : 0; // 0=system
    const personaText = personaRaw ? processTextMacrosWithPendingFlag(personaRaw, { user: name1, char: name2 }) : '';
    const stringifyMatchContent = (content) => {
      if (Array.isArray(content)) {
        return content
          .map((part) => (part?.type === 'text' ? String(part.text || '') : ''))
          .filter(Boolean)
          .join('\n');
      }
      return String(content ?? '');
    };
    const historyForMatch = Array.isArray(context.history) ? context.history : [];
    const globalWorldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
    const includeNames = globalWorldSettings.includeNames === true;
    const fullHistoryLines = historyForMatch
      .map(m => {
        const content = stringifyMatchContent(m?.content);
        if (!content) return '';
        if (!includeNames) return content;
        const role = String(m?.role || '').trim();
        const speaker = String(m?.name || (role === 'user' ? name1 : role === 'assistant' ? name2 : '') || '').trim();
        return speaker ? `${speaker}: ${content}` : content;
      })
      .filter(Boolean);
    let historyMatchLines = [...fullHistoryLines];
    const globalScanDepthRaw = globalWorldSettings.scanDepth;
    const globalScanDepth = Number.isFinite(Number(globalScanDepthRaw)) ? Math.max(0, Math.trunc(Number(globalScanDepthRaw))) : null;
    if (globalScanDepth !== null) {
      historyMatchLines = historyMatchLines.slice(-globalScanDepth);
    }
    const matchText = [String(userMessage ?? ''), ...historyMatchLines].join('\n');
    const sessionId = String(context?.session?.id || '').trim();
    const sessionName = String(context?.session?.name || '').trim();
    const uiModeRaw = String(context?.meta?.uiMode || context?.uiMode || '').trim().toLowerCase();
    const uiMode = uiModeRaw === 'rp' ? 'rp' : 'chat';
    const matchContext = {
      userMessage: String(userMessage ?? ''),
      history: historyMatchLines,
      fullHistory: fullHistoryLines,
      personaText,
      sessionId,
      sessionName,
      uiMode,
      character: {
        description: String(context?.character?.description || ''),
        personality: String(context?.character?.personality || ''),
        scenario: String(context?.character?.scenario || ''),
        depthPrompt: String(context?.character?.depthPrompt || ''),
        creatorNotes: String(context?.character?.creatorNotes || ''),
      },
    };
    const groupName = String(context?.group?.name || '').trim();
    const groupMemberIds = Array.isArray(context?.group?.members) ? context.group.members.map(String) : [];
    const groupMemberNames = Array.isArray(context?.group?.memberNames) ? context.group.memberNames.map(String) : [];
    const membersText = groupMemberNames.filter(Boolean).join(',');
    const macroContext = {
      user: name1,
      char: name2,
      group: groupName || name2,
      members: membersText,
      scenario: context?.character?.scenario || '',
      personality: context?.character?.personality || '',
    };

    const getSessionSummaryItems = (sid, { limitPlain = 30, limitPlainGroup = 10, limitWithCompacted = 2, limitWithCompactedGroup = 3 } = {}) => {
      const id = String(sid || '').trim();
      if (!id || !this.chatStore?.getSummaries) return { compacted: null, summaries: [] };
      const compacted = this.chatStore?.getCompactedSummary?.(id) || null;
      const list = this.chatStore.getSummaries(id) || [];
      const arrRaw = Array.isArray(list) ? list : [];

      if (isGroupChat) {
        if (compacted && String(compacted.text || '').trim()) {
          return { compacted, summaries: arrRaw.slice(-Math.max(0, limitWithCompactedGroup)) };
        }
        return { compacted: null, summaries: arrRaw.slice(-Math.max(0, limitPlainGroup)) };
      }

      // Non-group chats keep existing behavior unless caller wants different limits.
      if (compacted && String(compacted.text || '').trim()) {
        return { compacted, summaries: arrRaw.slice(-Math.max(0, limitWithCompacted)) };
      }
      return { compacted: null, summaries: arrRaw.slice(-Math.max(0, limitPlain)) };
    };

    const buildPrivateChatMemberGroupSummaryBlock = () => {
      if (isGroupChat) return null;
      if (isMomentCommentTask) return null;
      const memberId = String(sessionIdForSummary || '').trim();
      if (!memberId) return null;
      if (!this.chatStore?.getSummaries) return null;
      const groups = (() => {
        try {
          const list = this.contactsStore?.listGroups?.() || [];
          return Array.isArray(list)
            ? list.filter(g => Array.isArray(g?.members) && g.members.map(String).includes(memberId))
            : [];
        } catch {
          return [];
        }
      })();
      if (!groups.length) return null;

      const sections = [];
      for (const g of groups) {
        const gid = String(g?.id || '').trim();
        if (!gid) continue;
        const gname = String(g?.name || '').trim() || gid.replace(/^group:/, '') || gid;

        const compacted = this.chatStore?.getCompactedSummary?.(gid) || null;
        const list = this.chatStore.getSummaries(gid) || [];
        const arrRaw = Array.isArray(list) ? list : [];
        const arr = (compacted && String(compacted.text || '').trim()) ? arrRaw.slice(-2) : arrRaw.slice(-5);
        const items = [];
        if (compacted && String(compacted.text || '').trim()) {
          items.push(`- 大总结：${String(compacted.text).trim()}`);
        }
        for (let j = 0; j < arr.length; j++) {
          const it = arr[j];
          const text = String((typeof it === 'string') ? it : it?.text || '').trim();
          if (!text) continue;
          const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
          const isNewest = j === arr.length - 1;
          const when = (isNewest && at) ? formatSinceInParens(at) : '';
          items.push(`- ${text}${when ? `（${when}）` : ''}`);
        }
        if (items.length) {
          sections.push([`群聊：${gname}`, ...items].join('\n'));
        }
      }
      if (!sections.length) return null;
      return {
        role: 'system',
        content: [
          '角色所在群聊摘要回顾（仅供理解上下文）：',
          ...sections,
        ].join('\n\n'),
      };
    };
    const disablePhoneFormat = Boolean(context?.meta?.disablePhoneFormat);
    const worldPromptRaw = isMomentCommentTask
      ? ''
      : (() => {
          const worldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
          const strategyRaw = String(worldSettings.insertionStrategy || 'role_first');
          const insertionStrategy = ['role_first', 'global_first', 'even'].includes(strategyRaw) ? strategyRaw : 'role_first';
          const collectEntries = (worldId) => this.collectWorldEntries(worldId, { matchText, matchContext });
          const buildMergedContent = (globalEntries, sessionEntries) => {
            const merged = this.mergeWorldEntries(globalEntries, sessionEntries, insertionStrategy);
            return merged.map(e => e.content).join('\n\n');
          };
          const builtinEntries = disablePhoneFormat ? [] : collectEntries(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
          const builtinPart = builtinEntries.map(e => e.content).join('\n\n');
          const globalEntries =
            this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
              ? collectEntries(this.globalWorldId)
              : [];
          if (!isGroupChat) {
            const sessionEntries = [];
            (this.currentWorldIds || []).forEach((id) => {
              if (!id) return;
              const list = collectEntries(id);
              if (list.length) sessionEntries.push(...list);
            });
            const mergedContent = buildMergedContent(globalEntries, sessionEntries);
            return [builtinPart, mergedContent].filter(Boolean).join('\n\n');
          }
          const sessionEntries = [];
          for (const memberSessionId of groupMemberIds) {
            const list = this.normalizeWorldIds(this.worldSessionMap[String(memberSessionId) || '']);
            if (!list.length) continue;
            list.forEach((wid) => {
              const p = collectEntries(wid);
              if (p.length) sessionEntries.push(...p);
            });
          }
          const mergedContent = buildMergedContent(globalEntries, sessionEntries);
          return [builtinPart, mergedContent].filter(Boolean).join('\n\n');
        })();
    // Apply MacroEngine to worldbook text too (worldbook entries may include {{user}}/{{char}} etc.)
    const worldPrompt = worldPromptRaw
      ? processTextMacrosWithPendingFlag(worldPromptRaw, {
          user: name1,
          char: name2,
          group: groupName || name2,
          members: membersText,
        })
      : '';

    const presetState = this.presets?.getState?.() || null;
    const useSysprompt = Boolean(presetState?.enabled?.sysprompt);
    const useContext = Boolean(presetState?.enabled?.context);
    const useOpenAIPreset = Boolean(presetState?.enabled?.openai);
    const syspActive = this.presets.getActive('sysprompt') || null;
    const sysp = useSysprompt ? syspActive : null;
    const ctxp = useContext ? this.presets.getActive('context') : null;
    const openp = useOpenAIPreset ? this.presets.getActive('openai') : null;

    // 对话模式：额外注入对话协议提示词（保存于 sysprompt 预设）
    // ST extension prompt types => IN_PROMPT:0, IN_CHAT:1, BEFORE_PROMPT:2, NONE:-1
    const dialogueEnabled = Boolean(syspActive?.dialogue_enabled);
    const dialogueRulesRaw = typeof syspActive?.dialogue_rules === 'string' ? syspActive.dialogue_rules : '';
    const dialogueRules = processTextMacrosWithPendingFlag(dialogueRulesRaw, { user: name1, char: name2 });
    const dialoguePosition = Number.isFinite(Number(syspActive?.dialogue_position))
      ? Number(syspActive.dialogue_position)
      : 0;
    const dialogueDepth = Number.isFinite(Number(syspActive?.dialogue_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.dialogue_depth)))
      : 1;
    const dialogueRole = Number.isFinite(Number(syspActive?.dialogue_role))
      ? Math.trunc(Number(syspActive.dialogue_role))
      : 0;

    // 动态发布决策提示词（用于私聊/群聊场景）
    const momentCreateEnabled = Boolean(syspActive?.moment_create_enabled);
    const momentCreateRulesRaw =
      typeof syspActive?.moment_create_rules === 'string' ? syspActive.moment_create_rules : '';
    const momentCreateRules = processTextMacrosWithPendingFlag(momentCreateRulesRaw, { user: name1, char: name2 });
    const momentCreatePosition = Number.isFinite(Number(syspActive?.moment_create_position))
      ? Number(syspActive.moment_create_position)
      : 0;
    const momentCreateDepth = Number.isFinite(Number(syspActive?.moment_create_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.moment_create_depth)))
      : 1;
    const momentCreateRole = Number.isFinite(Number(syspActive?.moment_create_role))
      ? Math.trunc(Number(syspActive.moment_create_role))
      : 0;

    // 动态评论回复提示词（仅用于“动态评论”场景）
    const momentCommentEnabled = Boolean(syspActive?.moment_comment_enabled);
    const momentCommentRulesRaw =
      typeof syspActive?.moment_comment_rules === 'string' ? syspActive.moment_comment_rules : '';
    const momentCommentRules = processTextMacrosWithPendingFlag(momentCommentRulesRaw, { user: name1, char: name2 });
    const momentCommentPosition = Number.isFinite(Number(syspActive?.moment_comment_position))
      ? Number(syspActive.moment_comment_position)
      : 0;
    const momentCommentDepth = Number.isFinite(Number(syspActive?.moment_comment_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.moment_comment_depth)))
      : 0;
    const momentCommentRole = Number.isFinite(Number(syspActive?.moment_comment_role))
      ? Math.trunc(Number(syspActive.moment_comment_role))
      : 0;

    // 群聊模式：群聊协议提示词（保存于 sysprompt 预设）
    const groupEnabled = Boolean(syspActive?.group_enabled);
    const groupRulesRaw = typeof syspActive?.group_rules === 'string' ? syspActive.group_rules : '';
    const groupRules = processTextMacrosWithPendingFlag(groupRulesRaw, {
      user: name1,
      char: name2,
      group: groupName || name2,
      members: membersText,
    });
    const groupPosition = Number.isFinite(Number(syspActive?.group_position)) ? Number(syspActive.group_position) : 0;
    const groupDepth = Number.isFinite(Number(syspActive?.group_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.group_depth)))
      : 1;
    const groupRole = Number.isFinite(Number(syspActive?.group_role)) ? Math.trunc(Number(syspActive.group_role)) : 0;

    // Formatting helpers from OpenAI preset (optional)
    const wiFormatRaw =
      typeof openp?.wi_format === 'string' && openp.wi_format.includes('{0}') ? openp.wi_format : '{0}';
	    const wiFormat =
	      processTextMacrosWithPendingFlag(wiFormatRaw, {
	        user: name1,
	        char: name2,
	        group: groupName || name2,
	        members: membersText,
	      }) || '{0}';
    const scenarioFormat = typeof openp?.scenario_format === 'string' ? openp.scenario_format : '{{scenario}}';
    const personalityFormat =
      typeof openp?.personality_format === 'string' ? openp.personality_format : '{{personality}}';

	    // When OpenAI preset has prompt_order: use ST-like block ordering (drag & drop in UI)
	    // ST PromptManager global dummyId=100001; keep 100000 as fallback.
	    const pickOpenAIOrderBlock = () => {
	      const arr = Array.isArray(openp?.prompt_order) ? openp.prompt_order : [];
	      const byId = (id) => arr.find(b => b && typeof b === 'object' && String(b.character_id) === String(id));
	      return byId(100001) || byId(100000) || arr[0] || null;
	    };
	    const openaiOrderBlock = pickOpenAIOrderBlock();
	    const openaiOrder = Array.isArray(openaiOrderBlock?.order) ? openaiOrderBlock.order : null;

	    // 摘要提示词：移入“聊天提示词”区块管理，并固定在系统深度=1（紧跟历史）
	    const summaryPosition = (() => {
	      if (!useSysprompt) return 3;
	      if (!syspActive || typeof syspActive !== 'object') return 3;
	      const n = Number(syspActive.summary_position);
	      return Number.isFinite(n) ? n : 3;
	    })();
	    const summaryEnabled = (() => {
	      if (!useSummaryMemory) return false;
	      if (summaryPosition === -1) return false;
	      if (!useSysprompt) return true;
	      if (!syspActive || typeof syspActive !== 'object') return true;
	      return syspActive.summary_enabled !== false;
	    })();
	    const summaryRulesRaw = (() => {
	      if (!useSysprompt) return SUMMARY_REQUEST_NOTICE;
	      if (!syspActive || typeof syspActive !== 'object') return SUMMARY_REQUEST_NOTICE;
	      const raw = typeof syspActive.summary_rules === 'string' ? syspActive.summary_rules : '';
	      return raw.trim() ? raw : SUMMARY_REQUEST_NOTICE;
	    })();
	    const summaryRules = summaryEnabled
	      ? processTextMacrosWithPendingFlag(summaryRulesRaw, {
	          user: name1,
	          char: name2,
	          group: groupName || name2,
	          members: membersText,
	        })
	      : '';

	    // 聊天提示词（私聊/群聊/动态/摘要）：按扩展位置注入
	    // - IN_PROMPT / BEFORE_PROMPT / SYSTEM_DEPTH_1：包装为 <chat_guide>
	    // - IN_CHAT：按深度插入历史
	    const buildChatGuideBlock = (parts) => {
	      const content = joinPromptBlocks(parts);
	      if (!content) return '';
	      return `<chat_guide>\n${content}\n</chat_guide>`;
	    };
	    const buildChatGuideHistoryMessages = (items) => {
	      const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
	      const out = [];
	      const list = Array.isArray(items) ? items : [];
	      list.forEach((item, idx) => {
	        const content = trimEdgeBlankLines(item?.content || '');
	        if (!content) return;
	        const role = roleMap[item?.role] || 'system';
	        let finalContent = content;
	        if (role !== 'system') {
	          const normalized = normalizeHistoryLineBreaks(content, role);
	          const speaker = role === 'assistant' ? name2 : name1;
	          finalContent = withSpeakerPrefix(normalized, speaker);
	        }
	        out.push({
	          role,
	          content: finalContent,
	          depth: Number(item?.depth) || 0,
	          _seq: Number.isFinite(Number(item?._seq)) ? item._seq : idx,
	        });
	      });
  return out;
};

const parseTemplateInjectTags = (comment = '') => {
  const raw = String(comment || '');
  if (!raw.includes('[')) return [];
  const out = [];
  const re = /\[(GENERATE|RENDER)\s*:\s*([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(raw))) {
    const stage = String(m[1] || '').toLowerCase();
    const body = String(m[2] || '').trim();
    if (!body) continue;
    const parts = body.split(':').map(s => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (stage === 'generate') {
      if (parts[0].toUpperCase() === 'REGEX') {
        const pattern = parts.slice(1).join(':').trim();
        if (!pattern) continue;
        out.push({ stage, type: 'regex', pattern, mode: 'before' });
        continue;
      }
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        const index = Number(parts[0]);
        const modeRaw = String(parts[1] || '').trim().toLowerCase();
        if (modeRaw === 'before' || modeRaw === 'after') {
          out.push({ stage, type: 'index', index, mode: modeRaw });
        }
        continue;
      }
      const mode = String(parts[0] || '').trim().toLowerCase();
      if (mode === 'before' || mode === 'after') {
        out.push({ stage, type: 'edge', mode });
      }
      continue;
    }
    if (stage === 'render') {
      const mode = String(parts[0] || '').trim().toLowerCase();
      if (mode === 'before' || mode === 'after') {
        out.push({ stage, type: 'edge', mode });
      }
    }
  }
  return out;
};

const buildRegexFromTag = (pattern) => {
  const raw = String(pattern || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    const last = raw.lastIndexOf('/');
    const body = raw.slice(1, last);
    const flags = raw.slice(last + 1) || 'i';
    try {
      return new RegExp(body, flags);
    } catch {
      return null;
    }
  }
  try {
    return new RegExp(raw, 'i');
  } catch {
    return null;
  }
};

const stringifyMessageContent = (content) => {
  if (Array.isArray(content)) {
    return content
      .map(part => (part?.type === 'text' ? String(part.text || '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
};
	    const buildChatGuidePlan = () => {
	      const mode = String(context?.meta?.chatGuideMode || '').trim().toLowerCase();
	      if (Boolean(context?.meta?.disableChatGuide) || mode === 'none') {
	        return { promptContent: '', beforePromptContent: '', depthContent: '', depthMessages: [] };
	      }
	      const summaryOnly = mode === 'summary-only';
	      const promptParts = [];
	      const beforePromptParts = [];
	      const depthParts = [];
	      const historyItems = [];
	      let seq = 0;
	      const pushByPosition = (content, position, depth, role) => {
	        const pos = Number.isFinite(Number(position)) ? Math.trunc(Number(position)) : 0;
	        const trimmed = trimEdgeBlankLines(content);
	        if (!trimmed || pos === -1) return;
	        if (pos === 1) {
	          historyItems.push({ content: trimmed, depth: Number(depth) || 0, role: Number(role) || 0, _seq: seq++ });
	          return;
	        }
	        if (pos === 2) {
	          beforePromptParts.push(trimmed);
	          return;
	        }
	        if (pos === 3) {
	          depthParts.push(trimmed);
	          return;
	        }
	        promptParts.push(trimmed);
	      };
	      const groupSystemHint = '系统消息（我们能解析的这种）：内容';
	      if (!summaryOnly && !isMomentCommentTask && !isGroupChat && dialogueEnabled && dialogueRules) {
	        pushByPosition(dialogueRules, dialoguePosition, dialogueDepth, dialogueRole);
	      }
	      if (!summaryOnly && !isMomentCommentTask && isGroupChat && groupEnabled && groupRules) {
	        const combined = joinPromptBlocks([groupRules, groupSystemHint]);
	        pushByPosition(combined, groupPosition, groupDepth, groupRole);
	      }
	      if (!summaryOnly && !isMomentCommentTask && momentCreateEnabled && momentCreateRules) {
	        pushByPosition(momentCreateRules, momentCreatePosition, momentCreateDepth, momentCreateRole);
	      }
	      if (!summaryOnly && isMomentCommentTask && momentCommentEnabled && momentCommentRules) {
	        pushByPosition(momentCommentRules, momentCommentPosition, momentCommentDepth, momentCommentRole);
	      }
	      if (summaryRules) {
	        pushByPosition(summaryRules, summaryPosition, 1, 0);
	      }
	      return {
	        promptContent: buildChatGuideBlock(promptParts),
	        beforePromptContent: buildChatGuideBlock(beforePromptParts),
	        depthContent: buildChatGuideBlock(depthParts),
	        depthMessages: buildChatGuideHistoryMessages(historyItems),
	      };
	    };

	    const buildMomentCommentDataBlock = () => {
	      if (!isMomentCommentTask) return null;
	      const raw = String(context?.task?.promptData || '').trim();
	      if (!raw) return null;
	      const content = processTextMacrosWithPendingFlag(raw, {
	        user: name1,
	        char: name2,
	        group: groupName || name2,
	        members: membersText,
	      });
	      const rendered = String(content || '').trim();
	      if (!rendered) return null;
	      return { role: 'system', content: rendered };
	    };

	    const buildMomentSummaryBlock = () => {
	      if (Boolean(context?.meta?.disableMomentSummary)) return null;
	      if (!this.momentSummaryStore?.getSummaries) return null;
	      const list = this.momentSummaryStore.getSummaries() || [];
	      const arr = Array.isArray(list) ? list : [];
	      if (!arr.length) return null;
	      const latest = arr.slice(-3);
	      const rows = [];
	      try {
	        const compacted = this.momentSummaryStore.getCompactedSummary?.();
	        const compactedText = String(compacted?.text || '').trim();
	        if (compactedText) rows.push(`- 大总结：${compactedText}`);
	      } catch {}
	      latest.forEach((it, idx) => {
	        const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	        if (!text) return;
	        const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	        const isNewest = idx === latest.length - 1;
	        const when = (isNewest && at) ? formatSinceInParens(at) : '';
	        rows.push(`- ${text}${when ? `（${when}）` : ''}`);
	      });
	      if (!rows.length) return null;
	      return {
	        role: 'system',
	        content: `以下为动态摘要回顾（仅供理解上下文）：\n${rows.join('\n')}`.trim(),
	      };
	    };

	    const buildGroupMemberPrivateSummaryBlock = () => {
	      if (!isGroupChat) return null;
	      const memberIds = groupMemberIds.slice();
	      if (!memberIds.length || !this.chatStore?.getSummaries) return null;
	      const sections = [];
	      for (let i = 0; i < memberIds.length; i++) {
	        const mid = String(memberIds[i] || '').trim();
	        if (!mid) continue;
	        const display = String(groupMemberNames[i] || '') || this.contactsStore?.getContact?.(mid)?.name || mid;
	        const compacted = this.chatStore?.getCompactedSummary?.(mid) || null;
	        const list = this.chatStore.getSummaries(mid) || [];
	        const arrRaw = Array.isArray(list) ? list : [];
	        // A) Group injection rule:
	        // 1) no compacted summary -> latest 3
	        // 2) has compacted summary -> compacted + latest 2
	        const arr = compacted ? arrRaw.slice(-2) : arrRaw.slice(-3);
	        const items = [];
	        if (compacted && String(compacted.text || '').trim()) {
	          items.push(`- 总结：${String(compacted.text).trim()}`);
	        }
	        for (let j = 0; j < arr.length; j++) {
	          const it = arr[j];
	          const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	          if (!text) continue;
	          const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	          const isNewest = j === arr.length - 1;
	          const when = (isNewest && at) ? formatSinceInParens(at) : '';
	          items.push(`- ${text}${when ? `（${when}）` : ''}`);
	        }
	        if (items.length) {
	          sections.push(`${name1}与${display}:\n${items.join('\n')}`);
	        }
	      }
	      if (!sections.length) return null;
	      return {
	        role: 'system',
	        content: [
	          '群聊成员私聊摘要回顾（YAML，仅供理解上下文）：',
	          '（私聊信息默认不对其他成员公开）',
	          ...sections,
	        ].join('\n'),
	      };
	    };

	    const buildPrivateSummaryBlockForTarget = (targetSessionId, displayName) => {
	      const sid = String(targetSessionId || '').trim();
	      if (!sid || !this.chatStore?.getSummaries) return null;
	      const name = String(displayName || '').trim() || sid;
	      const compacted = this.chatStore?.getCompactedSummary?.(sid) || null;
	      const list = this.chatStore.getSummaries(sid) || [];
	      const arrRaw = Array.isArray(list) ? list : [];
	      const arr = compacted ? arrRaw.slice(-2) : arrRaw.slice(-3);
	      const items = [];
	      if (compacted && String(compacted.text || '').trim()) {
	        items.push(`- 总结：${String(compacted.text).trim()}`);
	      }
	      for (let j = 0; j < arr.length; j++) {
	        const it = arr[j];
	        const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	        if (!text) continue;
	        const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	        const isNewest = j === arr.length - 1;
	        const when = (isNewest && at) ? formatSinceInParens(at) : '';
	        items.push(`- ${text}${when ? `（${when}）` : ''}`);
	      }
	      if (!items.length) return null;
	      return {
	        role: 'system',
	        content: [
	          `私聊摘要回顾（YAML，仅供理解上下文）：`,
	          '（私聊信息默认不对第三方公开）',
	          `${name1}与${name}:`,
	          ...items,
	        ].join('\n'),
	      };
	    };

      const buildWorldInjectionPlan = () => {
        const worldBuckets = {
          beforeChar: [],
          afterChar: [],
          beforeScenario: [],
          afterScenario: [],
          beforeExamples: [],
          afterExamples: [],
          defaultPrompt: [],
          depth: [],
        };
        const templateInject = {
          generateBeforeEntries: [],
          generateAfterEntries: [],
          generateIndexEntries: [],
          generateRegexEntries: [],
          hasTemplateTags: false,
        };
        if (!isMomentCommentTask) {
          const worldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
          const strategyRaw = String(worldSettings.insertionStrategy || 'role_first');
          const insertionStrategy = ['role_first', 'global_first', 'even'].includes(strategyRaw) ? strategyRaw : 'role_first';
          const collectEntries = worldId => this.collectWorldEntries(worldId, { matchText, matchContext });
          const isRpMode = String(matchContext?.uiMode || '').trim().toLowerCase() === 'rp';
          const pushEntry = entry => {
            const commentRaw = String(entry?.comment || '');
            if (/\[InitialVariables\]/i.test(commentRaw)) {
              try {
                const raw = processTextMacrosWithPendingFlag(entry?.content || '', macroContext);
                const parsed = JSON.parse(String(raw || '').trim() || '{}');
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  Object.entries(parsed).forEach(([key, value]) => {
                    const name = String(key || '').trim();
                    if (!name) return;
                    this.chatStore?.setInitialVariable?.(name, value, sessionId);
                  });
                }
              } catch (err) {
                logger.warn('InitialVariables parse failed', err);
              }
              return;
            }
            const tags = parseTemplateInjectTags(commentRaw);
            if (tags.length) {
              templateInject.hasTemplateTags = true;
              tags.forEach(tag => {
                if (tag.stage !== 'generate') return;
                if (tag.type === 'edge') {
                  if (tag.mode === 'before') templateInject.generateBeforeEntries.push(entry);
                  if (tag.mode === 'after') templateInject.generateAfterEntries.push(entry);
                  return;
                }
                if (tag.type === 'index') {
                  templateInject.generateIndexEntries.push({
                    entry,
                    index: Number(tag.index) || 0,
                    mode: tag.mode === 'after' ? 'after' : 'before',
                  });
                  return;
                }
                if (tag.type === 'regex') {
                  templateInject.generateRegexEntries.push({
                    entry,
                    pattern: String(tag.pattern || ''),
                    mode: tag.mode === 'after' ? 'after' : 'before',
                  });
                }
              });
              return;
            }
            const pos = Number.isFinite(Number(entry?.position)) ? Math.trunc(Number(entry.position)) : 0;
            switch (pos) {
              case 0:
                worldBuckets.beforeChar.push(entry);
                break;
              case 1:
                worldBuckets.afterChar.push(entry);
                break;
              case 2:
                worldBuckets.beforeScenario.push(entry);
                break;
              case 3:
                worldBuckets.afterScenario.push(entry);
                break;
              case 4:
                worldBuckets.depth.push(entry);
                break;
              case 5:
                worldBuckets.beforeExamples.push(entry);
                break;
              case 6:
                worldBuckets.afterExamples.push(entry);
                break;
              default:
                worldBuckets.defaultPrompt.push(entry);
                break;
            }
          };
          const pushEntries = entries => {
            const list = Array.isArray(entries) ? entries : [];
            list.forEach(pushEntry);
          };
          if (!disablePhoneFormat) {
            pushEntries(collectEntries(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID));
          }
          const globalEntries =
            this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
              ? collectEntries(this.globalWorldId)
              : [];
          const sessionEntries = [];
          if (!isRpMode) {
            if (!isGroupChat) {
              (this.currentWorldIds || []).forEach((id) => {
                if (!id) return;
                const list = collectEntries(id);
                if (list.length) sessionEntries.push(...list);
              });
            } else {
              for (const memberSessionId of groupMemberIds) {
                const list = this.normalizeWorldIds(this.worldSessionMap[String(memberSessionId) || '']);
                if (!list.length) continue;
                list.forEach((wid) => {
                  const entries = collectEntries(wid);
                  if (entries.length) sessionEntries.push(...entries);
                });
              }
            }
          }
          const mergedEntries = this.mergeWorldEntries(globalEntries, sessionEntries, insertionStrategy);
          pushEntries(mergedEntries);
        }

        const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
        const buildStickerListBlock = () => {
          const state = stickerPackStore.getState();
          const activeSessionId = String(this.activeSessionId || '').trim();
          const keywords = [];
          const seen = new Set();
          const addKeyword = (value) => {
            const key = String(value || '').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            keywords.push(key);
          };
          if (state.defaultEnabled !== false) {
            listMediaAssets('sticker').forEach((item) => {
              addKeyword(item?.label || item?.id || '');
            });
          }
          (state.packs || []).forEach((pack) => {
            const boundSessions = Array.isArray(pack?.boundSessions)
              ? pack.boundSessions.map(item => String(item || '').trim()).filter(Boolean)
              : [];
            const bound = activeSessionId && boundSessions.includes(activeSessionId);
            if (!pack?.aiEnabled && !bound) return;
            (pack.stickers || []).forEach((sticker) => {
              addKeyword(sticker?.keyword || '');
            });
          });
          return `<表情包列表>\n${keywords.join('\n')}\n</表情包列表>`;
        };
        const stickerListBlock = buildStickerListBlock();
        const injectStickerList = (text) => {
          const raw = String(text || '');
          if (!raw.includes('<表情包列表>')) return raw;
          return raw.replace(/<表情包列表>[\s\S]*?<\/表情包列表>/g, stickerListBlock);
        };
        const formatWorldEntryContent = (entry, { applyRegex = true } = {}) => {
          const raw = processTextMacrosWithPendingFlag(entry?.content || '', macroContext);
          const injected = injectStickerList(raw);
          const trimmed = trimEdgeBlankLines(injected);
          if (!trimmed) return '';
          if (!applyRegex) return trimmed;
          return this.regex.apply(trimmed, this.getRegexContext(), regex_placement.WORLD_INFO, {
            isMarkdown: false,
            isPrompt: true,
            isEdit: false,
            depth: 0,
          });
        };
        const buildWorldMessages = (entries, { forHistory = false } = {}) => {
          const list = Array.isArray(entries) ? entries : [];
          const out = [];
          list.forEach((entry, idx) => {
            const content = formatWorldEntryContent(entry, { applyRegex: true });
            if (!content) return;
            const role = roleMap[entry?.role] || 'system';
            let finalContent = content;
            if (forHistory && role !== 'system') {
              const normalized = normalizeHistoryLineBreaks(content, role);
              const speaker = role === 'assistant' ? name2 : name1;
              finalContent = withSpeakerPrefix(normalized, speaker);
            }
            out.push({
              role,
              content: finalContent,
              depth: Number(entry?.depth) || 0,
              _seq: Number.isFinite(Number(entry?._seq)) ? entry._seq : idx,
            });
          });
          return out;
        };

        const worldPromptDefaultParts = worldBuckets.defaultPrompt
          .map(entry => formatWorldEntryContent(entry, { applyRegex: false }))
          .filter(Boolean);
        const worldPromptDefault = worldPromptDefaultParts.join('\n\n');
        const worldPromptMessages = {
          beforeChar: buildWorldMessages(worldBuckets.beforeChar),
          afterChar: buildWorldMessages(worldBuckets.afterChar),
          beforeScenario: buildWorldMessages(worldBuckets.beforeScenario),
          afterScenario: buildWorldMessages(worldBuckets.afterScenario),
          beforeExamples: buildWorldMessages(worldBuckets.beforeExamples),
          afterExamples: buildWorldMessages(worldBuckets.afterExamples),
        };
        const depthWorldMessages = buildWorldMessages(worldBuckets.depth, { forHistory: true });
        const materializeInjectMessages = (entry) => (
          buildWorldMessages([entry]).map(msg => ({ role: msg.role, content: msg.content }))
        );
        const templateInjectPlan = {
          generateBefore: templateInject.generateBeforeEntries.flatMap(materializeInjectMessages),
          generateAfter: templateInject.generateAfterEntries.flatMap(materializeInjectMessages),
          generateIndex: templateInject.generateIndexEntries.map(item => ({
            index: Math.max(0, Math.trunc(Number(item.index) || 0)),
            mode: item.mode === 'after' ? 'after' : 'before',
            messages: materializeInjectMessages(item.entry),
          })).filter(item => item.messages.length > 0),
          generateRegex: templateInject.generateRegexEntries.map(item => ({
            regex: buildRegexFromTag(item.pattern),
            mode: item.mode === 'after' ? 'after' : 'before',
            messages: materializeInjectMessages(item.entry),
          })).filter(item => item.regex && item.messages.length > 0),
          hasTemplateTags: templateInject.hasTemplateTags,
        };

        return {
          worldPromptDefault,
          worldPromptMessages,
          depthWorldMessages,
          templateInject: templateInjectPlan,
        };
      };

      const cloneWorldPromptMessages = (buckets) => ({
        beforeChar: Array.isArray(buckets?.beforeChar) ? [...buckets.beforeChar] : [],
        afterChar: Array.isArray(buckets?.afterChar) ? [...buckets.afterChar] : [],
        beforeScenario: Array.isArray(buckets?.beforeScenario) ? [...buckets.beforeScenario] : [],
        afterScenario: Array.isArray(buckets?.afterScenario) ? [...buckets.afterScenario] : [],
        beforeExamples: Array.isArray(buckets?.beforeExamples) ? [...buckets.beforeExamples] : [],
        afterExamples: Array.isArray(buckets?.afterExamples) ? [...buckets.afterExamples] : [],
      });

      const chatGuidePlan = buildChatGuidePlan();
      const worldInjectionPlan = buildWorldInjectionPlan();
      const mergeDepthMessages = (...lists) => {
        const out = [];
        let seq = 0;
        lists.forEach(list => {
          const arr = Array.isArray(list) ? list : [];
          arr.forEach(msg => {
            if (!msg) return;
            out.push({ ...msg, _seq: seq++ });
          });
        });
        return out;
      };
      const insertDepthMessages = (history, depthMessages) => {
        const list = Array.isArray(depthMessages) ? depthMessages : [];
        if (!list.length) return;
        const baseLen = history.length;
        const inserts = list
          .map((msg, idx) => {
            const depth = Math.max(0, Math.trunc(Number(msg.depth || 0)));
            return {
              ...msg,
              _seq: Number.isFinite(Number(msg._seq)) ? msg._seq : idx,
              _index: Math.max(0, baseLen - depth),
            };
          })
          .sort((a, b) => {
            if (a._index !== b._index) return a._index - b._index;
            return a._seq - b._seq;
          });
        let offset = 0;
        inserts.forEach(item => {
          history.splice(item._index + offset, 0, { role: item.role, content: item.content });
          offset += 1;
        });
      };

		    if (useOpenAIPreset && openp && openaiOrder && openaiOrder.length) {
      const memoryInserted = new Set();
      const canInsertMemoryAt = (pos) =>
        Boolean(memoryPrompt && memoryPrompt.positions.includes(pos) && !memoryInserted.has(pos));
      const insertMemoryPromptAt = (pos) => {
        if (!canInsertMemoryAt(pos)) return;
        messages.push({ role: memoryPrompt.role, content: memoryPrompt.content });
        memoryInserted.add(pos);
      };
      const insertMemoryPromptIntoHistory = (history) => {
        if (!canInsertMemoryAt('history_depth')) return;
        const depth = Math.max(0, Math.trunc(Number(memoryPrompt?.depth || 0)));
        const idx = Math.max(0, history.length - depth);
        history.splice(idx, 0, { role: memoryPrompt.role, content: memoryPrompt.content });
        memoryInserted.add('history_depth');
      };
      const historyRaw = Array.isArray(context.history) ? context.history.slice() : [];
      // ST promptOnly scripts: apply to outgoing prompt only
      const history = historyRaw.map((m, idx) => {
        const role = m?.role === 'user' ? 'user' : 'assistant';
        const content = String(m?.content ?? '');
        const depth = historyRaw.length - 1 - idx; // 0 = last message
        const placement = role === 'user' ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
        const out = this.regex.apply(content, this.getRegexContext(), placement, {
          isMarkdown: false,
          isPrompt: true,
          isEdit: false,
          depth,
        });
        const speaker = role === 'assistant' && isGroupChat
          ? (String(m?.name || '').trim() || name2)
          : (role === 'user' ? name1 : name2);
        const normalized = normalizeHistoryLineBreaks(out, role);
        return { role, content: withSpeakerPrefix(normalized, speaker) };
      });

      const pendingUserHistoryEntry = (pendingUserPrompt || hasUserAttachments)
        ? { role: 'user', content: pendingUserContent }
        : null;
      let pendingUserInsertIndex = -1;
      const insertPendingUserIntoHistory = () => {
        if (!appendUserToHistory || usedLastUserMessageForPendingInput || !pendingUserHistoryEntry) return;
        if (pendingUserInsertIndex >= 0) return;
        pendingUserInsertIndex = messages.length;
        messages.push(pendingUserHistoryEntry);
        if (hasUserAttachments) attachmentsInserted = true;
      };
      const removePendingUserFromHistory = () => {
        if (pendingUserInsertIndex < 0) return;
        messages.splice(pendingUserInsertIndex, 1);
        pendingUserInsertIndex = -1;
        if (hasUserAttachments) attachmentsInserted = false;
      };

      // 聊天提示词：按位置注入（IN_PROMPT 走 worldInfo marker，SYSTEM_DEPTH_1 在 history 后）。
      // 世界书条目可按 position/@Depth 插入，其余默认仍走 worldInfo marker。

      // Persona Description (SillyTavern-like): AT_DEPTH=4 injects into chat history
      if (personaText && personaPosition === 4) {
        const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
        const role = roleMap[personaRole] || 'system';
        const idx = Math.max(0, history.length - personaDepth);
        history.splice(idx, 0, { role, content: personaText });
      }
      const prompts = Array.isArray(openp.prompts) ? openp.prompts : [];
      const byId = new Map();
      prompts.forEach(p => {
        if (p?.identifier) byId.set(p.identifier, p);
      });

      const formatScenario = processTextMacrosWithPendingFlag(scenarioFormat, macroContext);
      const formatPersonality = processTextMacrosWithPendingFlag(personalityFormat, macroContext);
      const worldPromptDefault = worldInjectionPlan.worldPromptDefault || '';
      const worldPromptMessages = cloneWorldPromptMessages(worldInjectionPlan.worldPromptMessages);
      const depthWorldMessages = Array.isArray(worldInjectionPlan.depthWorldMessages)
        ? [...worldInjectionPlan.depthWorldMessages]
        : [];
      const depthPromptMessages = mergeDepthMessages(depthWorldMessages, chatGuidePlan.depthMessages);
      insertDepthMessages(history, depthPromptMessages);
      insertMemoryPromptIntoHistory(history);

      // WORLD_INFO placement for prompt stage (supports promptOnly scripts)
      const chatGuideContent = chatGuidePlan.promptContent;
      const chatGuideBeforePromptContent = chatGuidePlan.beforePromptContent;
      const chatGuideDepthContent = chatGuidePlan.depthContent;
      let worldForPrompt = joinPromptBlocks([worldPromptDefault, chatGuideContent]);
      if (worldForPrompt) {
        worldForPrompt = this.regex.apply(worldForPrompt, this.getRegexContext(), regex_placement.WORLD_INFO, {
          isMarkdown: false,
          isPrompt: true,
          isEdit: false,
          depth: 0,
        });
      }
      const formatWorld = worldForPrompt ? wiFormat.replace('{0}', worldForPrompt) : '';
      let worldInserted = false;
      let chatGuideAfterHistoryInserted = false;
      const insertChatGuideAfterHistory = () => {
        if (chatGuideAfterHistoryInserted || !chatGuideDepthContent) return;
        messages.push({ role: 'system', content: chatGuideDepthContent });
        chatGuideAfterHistoryInserted = true;
      };
      const appendWorldBucket = key => {
        const bucket = worldPromptMessages[key];
        if (!bucket || !bucket.length) return;
        bucket.forEach(msg => messages.push({ role: msg.role, content: msg.content }));
        worldPromptMessages[key] = [];
      };

      const resolveMarker = identifier => {
        switch (identifier) {
          case 'worldInfoBefore':
          case 'worldInfoAfter':
            if (!formatWorld || worldInserted) return '';
            worldInserted = true;
            return formatWorld;
          case 'charDescription':
            return processTextMacrosWithPendingFlag(context?.character?.description || '', macroContext);
          case 'charPersonality':
            return formatPersonality || '';
          case 'scenario':
            return formatScenario || '';
          case 'personaDescription':
            return personaPosition === 0 ? personaText : '';
          // dialogueExamples/chatHistory are markers without content here
          default:
            return '';
        }
      };

      let historyInserted = false;
      const sessionSummary = (() => {
        if (!useSummaryMemory) return { compacted: null, summaries: [] };
        try {
          // Group chat requirement: last 10 OR (compacted + last 3).
          // Non-group: keep previous behavior (last 30).
          return getSessionSummaryItems(sessionIdForSummary, {
            limitPlain: 30,
            limitPlainGroup: 10,
            limitWithCompacted: 30, // unused for non-group
            limitWithCompactedGroup: 3,
          });
        } catch {
          return { compacted: null, summaries: [] };
        }
      })();
      const historyRecallBlocks = (() => {
	        const blocks = [];
          if (timeContextBlock) blocks.push(timeContextBlock);
          blocks.push({ role: 'system', content: HISTORY_RECALL_NOTICE });
	        const momentData = buildMomentCommentDataBlock();
	        if (momentData) blocks.push(momentData);
	        if (useSummaryMemory) {
	          const momentSummary = buildMomentSummaryBlock();
	          if (momentSummary) blocks.push(momentSummary);
	          try {
	            const compactedText = String(sessionSummary?.compacted?.text || '').trim();
	            const summaries = Array.isArray(sessionSummary?.summaries) ? sessionSummary.summaries : [];
	            if (isGroupChat) {
	              const rows = [];
	              if (compactedText) rows.push(`- 大总结：${compactedText}`);
	              rows.push(
	                ...summaries
	                  .map(s => String(typeof s === 'string' ? s : s?.text || '').trim())
	                  .filter(Boolean)
	                  .map(t => `- ${t}`),
	              );
	              if (rows.length) {
	                blocks.push({
	                  role: 'system',
	                  content: `以下为该群聊的摘要回顾：\n${rows.join('\n')}`.trim(),
	                });
	              }
	            } else {
	              if (summaries.length) {
	                blocks.push({
	                  role: 'system',
	                  content: `以下为该聊天室的简要摘要回顾：\n${summaries
	                    .map(s => `- ${String(typeof s === 'string' ? s : s?.text || '').trim()}`)
	                    .filter(Boolean)
	                    .join('\n')}`.trim(),
	                });
	              }
	            }
	          } catch {}

            try {
              const groupSummary = buildPrivateChatMemberGroupSummaryBlock();
              if (groupSummary) blocks.push(groupSummary);
            } catch {}
	          const priv = buildGroupMemberPrivateSummaryBlock();
	          if (priv) blocks.push(priv);
	          if (isMomentCommentTask) {
	            const targetId = String(context?.task?.targetSessionId || '').trim();
	            const targetName = String(context?.task?.targetName || '').trim();
	            const t = buildPrivateSummaryBlockForTarget(targetId, targetName);
	            if (t) blocks.push(t);
	          }
	        }
        return blocks;
      })();

      if (chatGuideBeforePromptContent) {
        messages.push({ role: 'system', content: chatGuideBeforePromptContent });
      }

      for (const item of openaiOrder) {
        const identifier = item?.identifier;
        const enabled = item?.enabled !== false;
        if (!identifier || !enabled) continue;

        if (identifier === 'chatHistory') {
          insertMemoryPromptAt('after_persona');
          insertMemoryPromptAt('system_end');
          insertMemoryPromptAt('before_chat');
          messages.push(...historyRecallBlocks);
          if (history.length) messages.push(...history);
          insertPendingUserIntoHistory();
          insertChatGuideAfterHistory();
          historyInserted = true;
          continue;
        }

        const pr = byId.get(identifier);
        const isMarker =
          Boolean(pr?.marker) ||
          [
            'chatHistory',
            'dialogueExamples',
            'worldInfoBefore',
            'worldInfoAfter',
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
          ].includes(identifier);

        if (isMarker) {
          if (identifier === 'charDescription') {
            appendWorldBucket('beforeChar');
            const content = resolveMarker(identifier);
            if (content) messages.push({ role: 'system', content });
            appendWorldBucket('afterChar');
            continue;
          }
          if (identifier === 'scenario') {
            appendWorldBucket('beforeScenario');
            const content = resolveMarker(identifier);
            if (content) messages.push({ role: 'system', content });
            appendWorldBucket('afterScenario');
            continue;
          }
          if (identifier === 'dialogueExamples') {
            appendWorldBucket('beforeExamples');
            const content = resolveMarker(identifier);
            if (content) messages.push({ role: 'system', content });
            appendWorldBucket('afterExamples');
            continue;
          }
          if (identifier === 'personaDescription') {
            const content = resolveMarker(identifier);
            if (content) messages.push({ role: 'system', content });
            insertMemoryPromptAt('after_persona');
            continue;
          }
          const content = resolveMarker(identifier);
          if (content) messages.push({ role: 'system', content });
          continue;
        }

        // Custom/editable prompt block
        let content = typeof pr?.content === 'string' ? pr.content : '';
        // Special case: main prompt fallback
        if (identifier === 'main' && !content) {
          if (useSysprompt && sysp?.content) content = sysp.content;
          else if (context.systemPrompt) content = context.systemPrompt;
        }
        const rawHadLastUser = lastUserMessageRe.test(String(content || ''));
        content = processTextMacrosWithPendingFlag(content, macroContext);
        if (!content) continue;

        const role = String(pr?.role || 'system').toLowerCase();
        const mappedRole = role === 'user' || role === 'assistant' || role === 'system' ? role : 'system';
        if (!usedLastUserMessageForPendingInput && rawHadLastUser) {
          usedLastUserMessageForPendingInput = true;
          removePendingUserFromHistory();
        }
        messages.push({ role: mappedRole, content });
      }

      // Flush any world buckets that didn't find their markers to avoid dropping entries.
      appendWorldBucket('beforeChar');
      appendWorldBucket('afterChar');
      appendWorldBucket('beforeScenario');
      appendWorldBucket('afterScenario');
      appendWorldBucket('beforeExamples');
      appendWorldBucket('afterExamples');

      if (!historyInserted) {
        insertMemoryPromptAt('after_persona');
        insertMemoryPromptAt('system_end');
        insertMemoryPromptAt('before_chat');
        messages.push(...historyRecallBlocks);
        if (history.length) messages.push(...history);
        insertPendingUserIntoHistory();
        insertChatGuideAfterHistory();
      }

	      // 摘要提示词包含在 <chat_guide> 内，与世界书一起注入。

      // Append current user message (unless already injected via {{lastUserMessage}} in prompt blocks)
      const pendingUserInserted = pendingUserInsertIndex >= 0;
      if (!usedLastUserMessageForPendingInput && !pendingUserInserted && (pendingUserPrompt || hasUserAttachments)) {
        messages.push({ role: 'user', content: pendingUserContent });
        if (hasUserAttachments) attachmentsInserted = true;
      }
      if (hasUserAttachments && !attachmentsInserted && attachmentOnlyContent) {
        messages.push({ role: 'user', content: attachmentOnlyContent });
      }
      return messages;
    }

    const memoryInserted = new Set();
    const canInsertMemoryAt = (pos) =>
      Boolean(memoryPrompt && memoryPrompt.positions.includes(pos) && !memoryInserted.has(pos));
    const insertMemoryPromptAt = (pos) => {
      if (!canInsertMemoryAt(pos)) return;
      messages.push({ role: memoryPrompt.role, content: memoryPrompt.content });
      memoryInserted.add(pos);
    };
    const insertMemoryPromptIntoHistory = (history) => {
      if (!canInsertMemoryAt('history_depth')) return;
      const depth = Math.max(0, Math.trunc(Number(memoryPrompt?.depth || 0)));
      const idx = Math.max(0, history.length - depth);
      history.splice(idx, 0, { role: memoryPrompt.role, content: memoryPrompt.content });
      memoryInserted.add('history_depth');
    };
    const chatGuideContent = chatGuidePlan.promptContent;
    const chatGuideBeforePromptContent = chatGuidePlan.beforePromptContent;
    const chatGuideDepthContent = chatGuidePlan.depthContent;
    const worldPromptDefault = worldInjectionPlan.worldPromptDefault || '';
    const worldPromptMessages = cloneWorldPromptMessages(worldInjectionPlan.worldPromptMessages);
    const depthWorldMessages = Array.isArray(worldInjectionPlan.depthWorldMessages)
      ? [...worldInjectionPlan.depthWorldMessages]
      : [];
    const worldPromptCombined = joinPromptBlocks([worldPromptDefault, chatGuideContent]);
    let worldPromptCombinedForPrompt = worldPromptCombined;
    if (worldPromptCombinedForPrompt) {
      worldPromptCombinedForPrompt = this.regex.apply(worldPromptCombinedForPrompt, this.getRegexContext(), regex_placement.WORLD_INFO, {
        isMarkdown: false,
        isPrompt: true,
        isEdit: false,
        depth: 0,
      });
    }
    const renderWorldBucket = (bucket) => {
      const list = Array.isArray(bucket) ? bucket : [];
      return joinPromptBlocks(list.map(msg => msg?.content || ''));
    };
    const consumeWorldBucket = (bucket) => {
      const text = renderWorldBucket(bucket);
      if (Array.isArray(bucket)) bucket.length = 0;
      return text;
    };
    const storyTemplate = useContext && typeof ctxp?.story_string === 'string' ? ctxp.story_string : '';
    const hasDescriptionToken = /{{\s*description\s*}}/i.test(storyTemplate);
    const hasScenarioToken = /{{\s*scenario\s*}}/i.test(storyTemplate);
    const hasExamplesToken = /{{\s*mesExamples(?:Raw)?\s*}}/i.test(storyTemplate);
    const descriptionBase = processTextMacrosWithPendingFlag(context?.character?.description || '', macroContext);
    const descriptionText = hasDescriptionToken
      ? joinPromptBlocks([consumeWorldBucket(worldPromptMessages.beforeChar), descriptionBase, consumeWorldBucket(worldPromptMessages.afterChar)])
      : descriptionBase;
    const personalityText = processTextMacrosWithPendingFlag(personalityFormat, {
      user: name1,
      char: name2,
      group: groupName || name2,
      members: membersText,
      personality: context?.character?.personality || '',
    });
    const scenarioBase = processTextMacrosWithPendingFlag(scenarioFormat, {
      user: name1,
      char: name2,
      group: groupName || name2,
      members: membersText,
      scenario: context?.character?.scenario || '',
    });
    const scenarioText = hasScenarioToken
      ? joinPromptBlocks([consumeWorldBucket(worldPromptMessages.beforeScenario), scenarioBase, consumeWorldBucket(worldPromptMessages.afterScenario)])
      : scenarioBase;
    const mesExamplesBase = '';
    const mesExamplesText = hasExamplesToken
      ? joinPromptBlocks([consumeWorldBucket(worldPromptMessages.beforeExamples), mesExamplesBase, consumeWorldBucket(worldPromptMessages.afterExamples)])
      : mesExamplesBase;

    const vars = {
      user: name1,
      char: name2,
      system: (() => {
        if (useSysprompt && sysp?.content) {
          return processTextMacrosWithPendingFlag(sysp.content, {
            user: name1,
            char: name2,
            group: groupName || name2,
            members: membersText,
          });
        }
        return context.systemPrompt || '';
      })(),
      description: descriptionText,
      personality: personalityText,
      scenario: scenarioText,
      persona: personaPosition === 0 ? personaText : '',
      wiBefore: worldPromptCombinedForPrompt ? wiFormat.replace('{0}', worldPromptCombinedForPrompt) : '',
      wiAfter: '',
      loreBefore: worldPromptCombinedForPrompt ? wiFormat.replace('{0}', worldPromptCombinedForPrompt) : '',
      loreAfter: '',
      anchorBefore: '',
      anchorAfter: '',
      mesExamples: mesExamplesText,
      mesExamplesRaw: mesExamplesText,
      trim: '',
    };
    const worldMessagesBefore = [
      ...(worldPromptMessages.beforeChar || []),
      ...(worldPromptMessages.beforeScenario || []),
      ...(worldPromptMessages.beforeExamples || []),
    ];
    const worldMessagesAfter = [
      ...(worldPromptMessages.afterChar || []),
      ...(worldPromptMessages.afterScenario || []),
      ...(worldPromptMessages.afterExamples || []),
    ];
    const flushWorldMessages = (queue) => {
      const list = Array.isArray(queue) ? queue : [];
      list.forEach(msg => {
        if (!msg?.content) return;
        messages.push({ role: msg.role || 'system', content: msg.content });
      });
      list.length = 0;
    };
    const insertWorldAround = (fn) => {
      flushWorldMessages(worldMessagesBefore);
      fn();
      flushWorldMessages(worldMessagesAfter);
    };

    if (chatGuideBeforePromptContent) {
      messages.push({ role: 'system', content: chatGuideBeforePromptContent });
    }

    // 1) Context preset: render story_string as ST-like template
    const combinedStoryString =
      ctxp?.story_string && useContext
        ? processTextMacrosWithPendingFlag(renderStTemplate(ctxp.story_string, vars), {
            user: name1,
            char: name2,
            group: groupName || name2,
            members: membersText,
          })
        : '';

    // 2) Place story string according to story_string_position
    // ST: extension_prompt_types => IN_PROMPT:0, IN_CHAT:1, BEFORE_PROMPT:2, NONE:-1
    const position = Number(ctxp?.story_string_position ?? 0);
    const injectDepth = Math.max(0, Number(ctxp?.story_string_depth ?? 1));
    const injectRole = Number(ctxp?.story_string_role ?? 0);

    const shouldInsertStoryString = combinedStoryString && (position === 2 || position === 0);
    // BEFORE_PROMPT or IN_PROMPT: keep story_string as a system block, wrap world buckets around it.
    if (shouldInsertStoryString) {
      insertWorldAround(() => {
        messages.push({ role: 'system', content: combinedStoryString });
      });
    }
    if (shouldInsertStoryString) {
      insertMemoryPromptAt('after_persona');
    }

	    // 聊天提示词（私聊/群聊/动态/摘要）统一放入 <chat_guide>，与世界书同位置注入。

    // If context preset disabled, fall back to legacy system prompt building
    if (!useContext) {
      insertWorldAround(() => {
        if (context.systemPrompt) {
          messages.push({ role: 'system', content: context.systemPrompt });
        }
        if (vars.system) {
          messages.push({ role: 'system', content: vars.system });
        }
        if (worldPromptCombinedForPrompt) {
          messages.push({ role: 'system', content: wiFormat.replace('{0}', worldPromptCombinedForPrompt) });
        }
        if (context.character) {
          let characterPrompt = `你正在扮演: ${context.character.name}`;
          if (context.character.description) characterPrompt += `\n\n角色描述:\n${context.character.description}`;
          if (context.character.personality) characterPrompt += `\n\n性格特点:\n${context.character.personality}`;
          messages.push({ role: 'system', content: characterPrompt });
        }
      });
    } else if (!shouldInsertStoryString) {
      // Context preset enabled but no story_string inserted: still flush world buckets to avoid dropping entries.
      flushWorldMessages(worldMessagesBefore);
      flushWorldMessages(worldMessagesAfter);
    }
    insertMemoryPromptAt('after_persona');
    insertMemoryPromptAt('system_end');

    // 3) History
    const stringifyPromptContent = (content) => {
      if (Array.isArray(content)) {
        const parts = content.map((part) => {
          if (!part || typeof part !== 'object') return '';
          if (part.type === 'text') return String(part.text || '');
          if (part.type === 'image_url') return '[图片]';
          if (part.type === 'input_audio') return '[语音]';
          return '';
        });
        return parts.filter(Boolean).join('\n');
      }
      return String(content ?? '');
    };
    const history = Array.isArray(context.history) ? context.history.map(m => ({ ...m })) : [];
    // Prefix speaker names to reduce model confusion (role is still preserved)
    try {
      for (const m of history) {
        if (!m || typeof m !== 'object') continue;
        if (m.role !== 'user' && m.role !== 'assistant') continue;

        const mediaUrl = typeof m.__mediaUrl === 'string' ? m.__mediaUrl.trim() : '';
        let contentText = stringifyPromptContent(m.content);

        // Prevent OOM: Replace heavy Base64 content with placeholders for LLM context
        if (!contentText) contentText = '';
        if (mediaUrl) {
          if (!contentText) contentText = '[图片]';
          if (m.role === 'user') {
            m.__media = { kind: 'image', url: mediaUrl };
          }
        } else if (m.type === 'image' || (typeof contentText === 'string' && contentText.startsWith('data:image'))) {
          contentText = '[图片]';
        } else if (m.type === 'audio' || (typeof contentText === 'string' && contentText.startsWith('data:audio'))) {
          contentText = '[语音]';
        }

        const speaker = m.role === 'assistant' && isGroupChat
          ? (String(m?.name || '').trim() || name2)
          : (m.role === 'user' ? name1 : name2);
        m.content = normalizeHistoryLineBreaks(contentText, m.role);
        m.content = withSpeakerPrefix(m.content, speaker);
      }
    } catch {}

    // Persona Description (SillyTavern-like): AT_DEPTH=4 injects into chat history
    if (personaText && personaPosition === 4) {
      const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
      const role = roleMap[personaRole] || 'system';
      const idx = Math.max(0, history.length - personaDepth);
      history.splice(idx, 0, { role, content: personaText });
    }

    // IN_CHAT: inject story string into history (depth + role)
    if (combinedStoryString && position === 1) {
      const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
      const role = roleMap[injectRole] || 'system';
      const idx = Math.max(0, history.length - injectDepth);
      history.splice(idx, 0, { role, content: combinedStoryString });
    }
    const depthPromptMessages = mergeDepthMessages(depthWorldMessages, chatGuidePlan.depthMessages);
    insertDepthMessages(history, depthPromptMessages);
    insertMemoryPromptIntoHistory(history);
	    // 聊天提示词的 SYSTEM_DEPTH_1 由 <chat_guide> 承载，不落入 <history>。
    const postHistoryRaw = useSysprompt ? sysp?.post_history || '' : '';
    const extraPromptBlocksRaw = Array.isArray(context?.meta?.extraPromptBlocks) ? context.meta.extraPromptBlocks : [];
    const extraHasLastUser = extraPromptBlocksRaw.some(b => hasLastUserMessagePlaceholder(b?.content));
    if (!usedLastUserMessageForPendingInput && (extraHasLastUser || hasLastUserMessagePlaceholder(postHistoryRaw))) {
      usedLastUserMessageForPendingInput = true;
    }

		    insertMemoryPromptAt('before_chat');
        if (timeContextBlock) messages.push(timeContextBlock);
		    messages.push({ role: 'system', content: HISTORY_RECALL_NOTICE });
	    try {
	      const momentData = buildMomentCommentDataBlock();
	      if (momentData) messages.push(momentData);
	    } catch {}
	    if (useSummaryMemory) {
	      try {
	        const momentSummary = buildMomentSummaryBlock();
	        if (momentSummary) messages.push(momentSummary);
	      } catch {}
	      try {
	        const sessionSummary = getSessionSummaryItems(sessionIdForSummary, {
	          limitPlain: 30,
	          limitPlainGroup: 10,
	          limitWithCompacted: 30,
	          limitWithCompactedGroup: 3,
	        });
	        const compactedText = String(sessionSummary?.compacted?.text || '').trim();
	        const summaries = Array.isArray(sessionSummary?.summaries) ? sessionSummary.summaries : [];
	        if (isGroupChat) {
	          const rows = [];
	          if (compactedText) rows.push(`- 大总结：${compactedText}`);
	          rows.push(
	            ...summaries
	              .map(s => String(typeof s === 'string' ? s : s?.text || '').trim())
	              .filter(Boolean)
	              .map(t => `- ${t}`),
	          );
	          if (rows.length) {
	            messages.push({
	              role: 'system',
	              content: `以下为该群聊的摘要回顾：\n${rows.join('\n')}`.trim(),
	            });
	          }
	        } else {
	          if (summaries.length) {
	            messages.push({
	              role: 'system',
	              content: `以下为该聊天室的简要摘要回顾：\n${summaries
	                .map(s => `- ${String(typeof s === 'string' ? s : s?.text || '').trim()}`)
	                .filter(Boolean)
	                .join('\n')}`.trim(),
	            });
	          }
	        }
	      } catch {}
        try {
          const groupSummary = buildPrivateChatMemberGroupSummaryBlock();
          if (groupSummary) messages.push(groupSummary);
        } catch {}
	      try {
	        const priv = buildGroupMemberPrivateSummaryBlock();
	        if (priv) messages.push(priv);
	      } catch {}
	      if (isMomentCommentTask) {
	        try {
	          const targetId = String(context?.task?.targetSessionId || '').trim();
	          const targetName = String(context?.task?.targetName || '').trim();
	          const t = buildPrivateSummaryBlockForTarget(targetId, targetName);
	          if (t) messages.push(t);
	        } catch {}
	      }
	    }
	    if (history.length > 0) {
	      const historyForSend = history.map((msg) => {
	        if (!msg || typeof msg !== 'object') return msg;
	        const media = msg.__media;
	        const mediaUrl = media && typeof media.url === 'string' ? media.url.trim() : '';
	        if (media && media.kind === 'image' && mediaUrl) {
	          const text = String(msg.content || '').trim();
	          const parts = [];
	          if (text) parts.push({ type: 'text', text });
	          else parts.push({ type: 'text', text: '' });
	          parts.push({ type: 'image_url', image_url: { url: mediaUrl } });
	          const { __media, __mediaUrl, __mediaKind, ...rest } = msg;
	          return { ...rest, content: parts };
	        }
	        if ('__mediaUrl' in msg || '__mediaKind' in msg || '__media' in msg) {
	          const { __media, __mediaUrl, __mediaKind, ...rest } = msg;
	          return rest;
	        }
	        return msg;
	      });
	      messages.push(...historyForSend);
	    }
    if (chatGuideDepthContent) {
      messages.push({ role: 'system', content: chatGuideDepthContent });
    }
	    // 摘要提示词包含在 <chat_guide> 内，与世界书一起注入。

    // 4) Post-history instructions (sysprompt.post_history)
    const postHistory = useSysprompt ? sysp?.post_history || '' : '';
    if (postHistory) {
      const phi = processTextMacrosWithPendingFlag(postHistory, { user: name1, char: name2 });
      if (phi) {
        messages.push({ role: 'user', content: phi });
      }
    }

    // Optional extra prompt blocks (appended just before the current user message).
    // Useful for maintenance tasks that want to place content at the {{lastUserMessage}} position.
    try {
      const extra = context?.meta?.extraPromptBlocks;
      const blocks = Array.isArray(extra) ? extra : [];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const raw = String(b.content ?? '').trim();
        if (!raw) continue;
        const roleRaw = String(b.role || 'system').toLowerCase();
        const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
        if (!usedLastUserMessageForPendingInput && lastUserMessageRe.test(raw)) {
          usedLastUserMessageForPendingInput = true;
        }
        const content = processTextMacrosWithPendingFlag(raw, {
          user: name1,
          char: name2,
          group: groupName || name2,
          members: membersText,
        });
        const rendered = String(content || '').trim();
        if (!rendered) continue;
        messages.push({ role, content: rendered });
      }
    } catch {}

    // 5) Current user message
    if (!usedLastUserMessageForPendingInput && (pendingUserPrompt || hasUserAttachments)) {
      messages.push({ role: 'user', content: pendingUserContent });
      if (hasUserAttachments) attachmentsInserted = true;
    }
    if (hasUserAttachments && !attachmentsInserted && attachmentOnlyContent) {
      messages.push({ role: 'user', content: attachmentOnlyContent });
    }
    try {
      const inject = worldInjectionPlan?.templateInject || null;
      if (inject) {
        const findLastUserIndex = () => {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user') return i;
          }
          return -1;
        };
        const insertAt = (idx, list) => {
          if (!list || !list.length) return 0;
          const safe = Math.max(0, Math.min(messages.length, idx));
          messages.splice(safe, 0, ...list);
          return list.length;
        };
        if (Array.isArray(inject.generateBefore) && inject.generateBefore.length) {
          insertAt(0, inject.generateBefore);
        }
        if (Array.isArray(inject.generateAfter) && inject.generateAfter.length) {
          const userIdx = findLastUserIndex();
          const at = userIdx >= 0 ? userIdx + 1 : messages.length;
          insertAt(at, inject.generateAfter);
        }
        if (Array.isArray(inject.generateIndex) && inject.generateIndex.length) {
          const sorted = [...inject.generateIndex].sort((a, b) => (a.index || 0) - (b.index || 0));
          let offset = 0;
          sorted.forEach(item => {
            const base = Math.max(0, Math.trunc(Number(item.index) || 0));
            const mode = item.mode === 'after' ? 'after' : 'before';
            const at = base + offset + (mode === 'after' ? 1 : 0);
            offset += insertAt(at, item.messages || []);
          });
        }
        if (Array.isArray(inject.generateRegex) && inject.generateRegex.length) {
          inject.generateRegex.forEach(item => {
            const re = item.regex;
            if (!re) return;
            const idx = messages.findIndex(msg => {
              if (!msg) return false;
              const text = stringifyMessageContent(msg.content);
              return re.test(text);
            });
            if (idx < 0) return;
            const mode = item.mode === 'after' ? 'after' : 'before';
            const at = idx + (mode === 'after' ? 1 : 0);
            insertAt(at, item.messages || []);
          });
        }
      }
    } catch (err) {
      logger.warn('template inject apply failed', err);
    }
    return messages;
  }

  /**
   * SillyTavern-like generation parameters (from OpenAI preset)
   * We store the full OpenAI preset JSON, but only map common fields into provider options.
   */
  getGenerationOptions() {
    try {
      const state = this.presets?.getState?.();
      if (!state?.enabled?.openai) return {};
      const p = this.presets.getActive('openai');
      if (!p || typeof p !== 'object') return {};

      const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const int = v => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);

      const base = {
        temperature: num(p.temperature),
        top_p: num(p.top_p),
        top_k: int(p.top_k),
        presence_penalty: num(p.presence_penalty),
        frequency_penalty: num(p.frequency_penalty),
        seed: int(p.seed),
        n: int(p.n),
      };

      const maxTokens = int(p.openai_max_tokens);
      const provider = this.config.get()?.provider;

      // Provider-specific mapping
      if (provider === 'gemini' || provider === 'makersuite' || provider === 'vertexai') {
        return {
          temperature: base.temperature,
          top_p: base.top_p,
          top_k: base.top_k,
          maxTokens,
        };
      }

      if (provider === 'anthropic') {
        // our AnthropicProvider expects maxTokens (camelCase), but will pass other fields through
        return {
          temperature: base.temperature,
          top_p: base.top_p,
          top_k: base.top_k,
          maxTokens,
        };
      }

      // openai-like (openai/deepseek/custom)
      const options = {
        temperature: base.temperature,
        top_p: base.top_p,
        presence_penalty: base.presence_penalty,
        frequency_penalty: base.frequency_penalty,
        seed: base.seed,
        n: base.n,
      };
      if (typeof maxTokens === 'number') options.max_tokens = maxTokens;
      return options;
    } catch (err) {
      logger.debug('getGenerationOptions failed', err);
      return {};
    }
  }

  /**
   * 保存到聊天历史
   */
  async saveToHistory(userMessage, assistantMessage) {
    try {
      const messages = [
        {
          role: 'user',
          content: userMessage,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: assistantMessage,
          timestamp: Date.now(),
        },
      ];

      await this.chatStorage.saveMessages(this.currentCharacterId, messages);
      logger.debug('聊天记录已保存');
    } catch (error) {
      logger.error('保存聊天记录失败:', error);
    }
  }

  /**
   * 获取聊天历史
   */
  async getChatHistory(characterId, limit = 50) {
    const messages = await this.chatStorage.getMessages(characterId || this.currentCharacterId, limit);
    return messages;
  }

  /**
   * 清除聊天历史
   */
  async clearChatHistory(characterId) {
    await this.chatStorage.clearMessages(characterId || this.currentCharacterId);
    logger.info('聊天记录已清除');
  }

  /**
   * 获取世界书数据
   */
  async getWorldInfo(characterId) {
    try {
      const id = characterId || this.currentCharacterId;
      if (this.worldStore.ready) {
        await this.worldStore.ready;
      }
      const local = this.worldStore.load(id);
      if (local) return local;

      // 后端佔位（若已實作）
      try {
        const res = await safeInvoke('get_world_info', { characterId: id });
        return res;
      } catch (err) {
        logger.debug('后端世界书命令不可用，使用空白', err);
      }
      return null;
    } catch (error) {
      logger.error('获取世界书失败:', error);
      return {};
    }
  }

  /**
   * 保存世界书数据
   */
  async saveWorldInfo(characterId, data) {
    try {
      const id = characterId || this.currentCharacterId;
      const now = Date.now();
      const base = (data && typeof data === 'object') ? data : { name: id, entries: [] };
      const existing = this.worldStore.load(id);
      const createdAtRaw = Number(base?.createdAt || base?.created_at || existing?.createdAt || existing?.created_at || 0);
      const payload = {
        ...base,
        createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : now,
        updatedAt: now,
      };
      await this.worldStore.save(id, payload);

      // 如果后端支持可同步保存（忽略失败）
      safeInvoke('save_world_info', { characterId: id, data: payload }).catch(() => {});

      logger.debug('世界书已保存', id);
    } catch (error) {
      logger.error('保存世界书失败:', error);
      throw error;
    }
  }

  /**
   * 保存 Persona 角色卡原始数据（独立文件）
   */
  async savePersonaCard(personaId, data) {
    const id = String(personaId || '').trim();
    if (!id) throw new Error('persona id missing');
    return await safeInvoke('save_persona_card', { id, data });
  }

  /**
   * 读取 Persona 角色卡原始数据
   */
  async loadPersonaCard(personaId) {
    const id = String(personaId || '').trim();
    if (!id) return null;
    try {
      const res = await safeInvoke('load_persona_card', { id });
      return res;
    } catch (err) {
      logger.warn('load persona card failed', err);
      return null;
    }
  }

  /**
   * 删除 Persona 角色卡原始数据
   */
  async deletePersonaCard(personaId) {
    const id = String(personaId || '').trim();
    if (!id) return false;
    try {
      return await safeInvoke('delete_persona_card', { id });
    } catch (err) {
      logger.warn('delete persona card failed', err);
      return false;
    }
  }

  async renameWorldInfo(fromId, toId, data) {
    const from = String(fromId || '').trim();
    const to = String(toId || '').trim();
    if (!from || !to) return;
    if (from === to) {
      await this.saveWorldInfo(to, data);
      return;
    }
    if (this.worldStore.ready) {
      await this.worldStore.ready;
    }

    await this.saveWorldInfo(to, { ...(data || {}), name: to });

    let mapChanged = false;
    const map = this.worldSessionMap || {};
    for (const [sid, val] of Object.entries(map)) {
      const list = this.normalizeWorldIds(val);
      if (!list.includes(from)) continue;
      const next = Array.from(new Set(list.map(id => (id === from ? to : id)))).filter(Boolean);
      if (!next.length) {
        delete map[sid];
      } else {
        map[sid] = next;
      }
      mapChanged = true;
    }
    if (mapChanged) this.persistWorldSessionMap();

    let currentChanged = false;
    if (Array.isArray(this.currentWorldIds) && this.currentWorldIds.includes(from)) {
      this.currentWorldIds = Array.from(new Set(this.currentWorldIds.map(id => (id === from ? to : id)))).filter(Boolean);
      this.currentWorldId = this.currentWorldIds[0] || null;
      currentChanged = true;
    }

    let globalChanged = false;
    if (this.globalWorldId === from) {
      this.globalWorldId = to;
      this.persistGlobalWorldId();
      globalChanged = true;
    }

    let regexChanged = false;
    try {
      await this.regex?.ready;
      const sets = this.regex?.state?.local?.sets || null;
      if (sets) {
        for (const s of Object.values(sets)) {
          if (!s || typeof s !== 'object') continue;
          if (s.bind?.type !== 'world') continue;
          if (String(s.bind.worldId || '') !== from) continue;
          s.bind = { ...s.bind, worldId: to };
          s.updatedAt = Date.now();
          regexChanged = true;
        }
        if (regexChanged) await this.regex.persist();
      }
    } catch {}

    let refsChanged = false;
    try {
      if (this.worldStore.ready) {
        await this.worldStore.ready;
      }
      const names = this.worldStore.list();
      for (const wid of names) {
        if (!wid || wid === from) continue;
        const data = this.worldStore.load(wid);
        if (!data || !Array.isArray(data.refs)) continue;
        let changed = false;
        const nextRefs = data.refs.map((ref) => {
          if (!ref || typeof ref !== 'object') return ref;
          const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
          if (sourceId !== from) return ref;
          changed = true;
          return { ...ref, sourceId: to };
        });
        if (!changed) continue;
        await this.saveWorldInfo(wid, { ...(data || {}), refs: nextRefs });
        refsChanged = true;
      }
    } catch {}

    await this.worldStore.remove(from);

    if (mapChanged || currentChanged || globalChanged || refsChanged) {
      window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds, globalWorldId: this.globalWorldId } }));
    }
    if (regexChanged) window.dispatchEvent(new CustomEvent('regex-changed'));
  }

  /**
   * 删除世界书
   */
  async deleteWorldInfo(worldId) {
    try {
      await this.worldStore.remove(worldId);
      if (this.currentWorldId === worldId) {
        this.setCurrentWorld(null);
      }
      if (this.globalWorldId === worldId) {
        this.setGlobalWorld(null);
      }
      logger.debug('世界书已删除', worldId);
    } catch (error) {
      logger.error('删除世界书失败:', error);
      throw error;
    }
  }

  async listWorlds() {
    if (this.worldStore.ready) {
      await this.worldStore.ready;
    }
    return this.worldStore.list();
  }

  setCurrentWorld(worldId, sessionId = this.activeSessionId) {
    const sid = String(sessionId || '').trim();
    const list = this.normalizeWorldIds(worldId);
    if (sid) {
      if (!list.length) delete this.worldSessionMap[sid];
      else this.worldSessionMap[sid] = list;
      this.persistWorldSessionMap();
    }
    this.currentWorldIds = sid === this.activeSessionId ? list : this.currentWorldIds;
    this.currentWorldId = this.currentWorldIds[0] || null;
    this.syncWorldRegexBindings?.();
    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds } }));
  }

  /**
   * Bind a world book to a session without switching the current session world.
   * (Used by group chat to auto-enable member world books.)
   */
  bindWorldToSession(sessionId, worldId, { silent = true } = {}) {
    const sid = String(sessionId || '').trim();
    const list = this.normalizeWorldIds(worldId);
    if (!sid) return;
    if (!list.length) delete this.worldSessionMap[sid];
    else this.worldSessionMap[sid] = list;
    this.persistWorldSessionMap();
    if (!silent && sid === this.activeSessionId) {
      this.currentWorldIds = list;
      this.currentWorldId = this.currentWorldIds[0] || null;
      this.syncWorldRegexBindings?.();
      window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds } }));
    }
  }

  getWorldIdsForSession(sessionId = this.activeSessionId) {
    return this.normalizeWorldIds(this.worldSessionMap[sessionId]);
  }

  setSessionWorldIds(sessionId, worldIds, { silent = true } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const list = this.normalizeWorldIds(worldIds);
    if (!list.length) delete this.worldSessionMap[sid];
    else this.worldSessionMap[sid] = list;
    this.persistWorldSessionMap();
    if (!silent && sid === this.activeSessionId) {
      this.currentWorldIds = list;
      this.currentWorldId = this.currentWorldIds[0] || null;
      this.syncWorldRegexBindings?.();
      window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds } }));
    }
  }

  toggleWorldForSession(sessionId, worldId, { silent = true } = {}) {
    const sid = String(sessionId || '').trim();
    const id = String(worldId || '').trim();
    if (!sid || !id) return;
    const list = this.normalizeWorldIds(this.worldSessionMap[sid]);
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(id);
    this.setSessionWorldIds(sid, list, { silent });
  }

  setGlobalWorld(worldId) {
    this.globalWorldId = worldId || null;
    this.persistGlobalWorldId();
    this.syncWorldRegexBindings?.();
    window.dispatchEvent(
      new CustomEvent('worldinfo-changed', {
        detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds, globalWorldId: this.globalWorldId },
      }),
    );
  }

  getWorldGlobalSettings() {
    return { ...(this.worldGlobalSettings || this.getDefaultWorldGlobalSettings()) };
  }

  setWorldGlobalSettings(next = {}) {
    const merged = { ...(this.worldGlobalSettings || this.getDefaultWorldGlobalSettings()), ...(next || {}) };
    this.worldGlobalSettings = this.normalizeWorldGlobalSettings(merged);
    this.persistWorldGlobalSettings();
    window.dispatchEvent(
      new CustomEvent('worldinfo-changed', {
        detail: { worldId: this.currentWorldId, worldIds: this.currentWorldIds, globalWorldId: this.globalWorldId },
      }),
    );
  }

  getWorldBudgetTokens() {
    const settings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
    const budgetCapRaw = Number(settings.budgetCap);
    if (Number.isFinite(budgetCapRaw) && budgetCapRaw > 0) return Math.max(0, Math.trunc(budgetCapRaw));
    const percentRaw = Number(settings.contextPercent);
    if (!Number.isFinite(percentRaw) || percentRaw <= 0) return null;
    const preset = this.presets?.getActive?.('openai') || {};
    const maxContext = Number(preset?.openai_max_context);
    const maxOut = Number(preset?.openai_max_tokens);
    const ctxTokens = Number.isFinite(maxContext) && maxContext > 0 ? maxContext : 8000;
    const outTokens = Number.isFinite(maxOut) && maxOut > 0 ? maxOut : 0;
    const inputBudgetTokens = Math.max(2000, ctxTokens ? ctxTokens - outTokens - 512 : 8000);
    return Math.max(0, Math.floor(inputBudgetTokens * (percentRaw / 100)));
  }

  warnWorldBudgetOverflow() {
    const now = Date.now();
    if (this.lastWorldBudgetWarningAt && now - this.lastWorldBudgetWarningAt < 5000) return;
    this.lastWorldBudgetWarningAt = now;
    window.toastr?.warning('世界书内容超过预算上限，已截断');
  }

  collectWorldEntries(worldId, label) {
    const id = String(worldId || '').trim();
    if (!id) return [];
    const data = this.worldStore.load(id);
    if (!data || typeof data !== 'object') return [];

    const labelObj = (label && typeof label === 'object') ? label : {};
    const matchContext =
      labelObj && typeof labelObj.matchContext === 'object' && labelObj.matchContext
        ? labelObj.matchContext
        : null;
    const matchTextRaw = labelObj ? String(labelObj.matchText || '') : '';
    const matchText = matchTextRaw;
    const scopeMode = String(matchContext?.uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat';
    const scopeSessionId = String(matchContext?.sessionId || '').trim();
    const scopeSessionName = String(matchContext?.sessionName || '').trim();
    const worldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
    const globalCaseSensitive = worldSettings.caseSensitive === true;
    const globalMatchWholeWords = worldSettings.matchWholeWords === true;
    const globalRecursiveScan = worldSettings.recursiveScan !== false;
    const globalUseGroupScoring = worldSettings.useGroupScoring === true;
    const minActivations = Number.isFinite(Number(worldSettings.minActivations))
      ? Math.max(0, Math.trunc(Number(worldSettings.minActivations)))
      : 0;
    const maxDepthSetting = Number.isFinite(Number(worldSettings.maxDepth))
      ? Math.max(0, Math.trunc(Number(worldSettings.maxDepth)))
      : 0;
    const maxRecursionStepsSetting = Number.isFinite(Number(worldSettings.maxRecursionSteps))
      ? Math.max(0, Math.trunc(Number(worldSettings.maxRecursionSteps)))
      : 0;

    const norm = v => String(v ?? '').trim();
    const normalizeScopeList = (val) => {
      if (Array.isArray(val)) return val.map(norm).filter(Boolean);
      if (typeof val === 'string') {
        return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
      }
      return [];
    };
    const resolveRefEntries = (refs, refFromWorldId) => {
      const list = Array.isArray(refs) ? refs : [];
      if (!list.length) return [];
      const results = [];
      list.forEach((raw) => {
        const ref = raw && typeof raw === 'object' ? raw : {};
        const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
        if (!sourceId) return;
        const source = this.worldStore.load(sourceId);
        const sourceEntries = Array.isArray(source?.entries) ? source.entries : [];
        if (!sourceEntries.length) return;
        const entryIdRaw = String(ref.entryId || ref.entry || '').trim();
        const entryIds = Array.isArray(ref.entryIds)
          ? ref.entryIds.map(val => String(val || '').trim()).filter(Boolean)
          : [];
        const includeAll = ref.includeAll === true || ref.all === true || entryIdRaw === '*' || entryIds.includes('*');
        let picked = sourceEntries;
        if (!includeAll) {
          const idSet = new Set(entryIds);
          if (entryIdRaw) idSet.add(entryIdRaw);
          if (idSet.size) {
            picked = sourceEntries.filter(entry => idSet.has(String(entry?.id ?? entry?.uid ?? '').trim()));
          } else {
            picked = [];
          }
        }
        picked.forEach((entry) => {
          if (!entry) return;
          results.push({
            ...entry,
            _sourceWorldId: sourceId,
            _refWorldId: refFromWorldId,
          });
        });
      });
      return results;
    };
    const normalizeScopeTarget = (value) => norm(value).replace(/\s+/g, '').toLowerCase();
    const isScopeAllowed = () => true;
    const normalizeKeys = e => {
      const keys = Array.isArray(e?.key) ? e.key : Array.isArray(e?.triggers) ? e.triggers : [];
      return keys.map(norm).filter(Boolean);
    };
    const normalizeSecondaryKeys = e => {
      const keys = Array.isArray(e?.keysecondary) ? e.keysecondary : Array.isArray(e?.secondary) ? e.secondary : [];
      return keys.map(norm).filter(Boolean);
    };
    const isRegexLiteral = k =>
      k.length >= 2 && k.startsWith('/') && k.endsWith('/') && k.indexOf('/', 1) === k.length - 1;
    const escapeRegExp = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasCjk = s => /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(s || ''));
    const matchKey = (key, rawText, rawTextLower, caseSensitive, matchWholeWords) => {
      const k = norm(key);
      if (!k) return false;
      if (isRegexLiteral(k)) {
        const body = k.slice(1, -1);
        try {
          const re = new RegExp(body, caseSensitive ? '' : 'i');
          return re.test(rawText);
        } catch {
          return false;
        }
      }
      if (matchWholeWords && !hasCjk(k)) {
        try {
          const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, caseSensitive ? '' : 'i');
          return re.test(rawText);
        } catch {
          return false;
        }
      }
      if (caseSensitive) return rawText.includes(k);
      return rawTextLower.includes(k.toLowerCase());
    };
    const buildMatchTextForEntry = (e, localMatchText, localMatchContext) => {
      if (!localMatchContext) return localMatchText;
      const parts = [];
      const userText = String(localMatchContext.userMessage || '').trim();
      if (userText) parts.push(userText);
      const history = Array.isArray(localMatchContext.history) ? localMatchContext.history : [];
      const scanDepthRaw = e?.scanDepth;
      const scanDepth = Number.isFinite(Number(scanDepthRaw)) ? Math.max(0, Math.trunc(Number(scanDepthRaw))) : null;
      const historySlice = scanDepth == null ? history : history.slice(-scanDepth);
      if (historySlice.length) parts.push(...historySlice);
      const personaText = String(localMatchContext.personaText || '').trim();
      if (e?.matchPersonaDescription && personaText) parts.push(personaText);
      const character = localMatchContext.character || {};
      if (e?.matchCharacterDescription && character.description) parts.push(character.description);
      if (e?.matchCharacterPersonality && character.personality) parts.push(character.personality);
      if (e?.matchCharacterDepthPrompt && character.depthPrompt) parts.push(character.depthPrompt);
      if (e?.matchScenario && character.scenario) parts.push(character.scenario);
      if (e?.matchCreatorNotes && character.creatorNotes) parts.push(character.creatorNotes);
      return parts.join('\n');
    };
    const hasMatchInput = (localMatchText, localMatchContext) => {
      if (String(localMatchText || '').trim()) return true;
      if (!localMatchContext) return false;
      const userText = String(localMatchContext.userMessage || '').trim();
      const history = Array.isArray(localMatchContext.history) ? localMatchContext.history : [];
      if (userText) return true;
      return history.some(line => String(line || '').trim());
    };

    const shouldInclude = (e, { localMatchText, localMatchContext, isRecursivePass = false, recursionStep = 0 } = {}) => {
      if (!e || typeof e !== 'object') return false;
      if (!isScopeAllowed(e.scope)) return false;
      if (Boolean(e.disable)) return false;
      if (!isRecursivePass && Number.isFinite(Number(e.delayUntilRecursion)) && Number(e.delayUntilRecursion) > 0) {
        return false;
      }
      if (isRecursivePass) {
        if (Boolean(e.excludeRecursion)) return false;
        const delay = Number.isFinite(Number(e.delayUntilRecursion)) ? Math.max(0, Math.trunc(Number(e.delayUntilRecursion))) : 0;
        if (delay > 0 && recursionStep < delay) return false;
      }
      // Legacy behavior: when no match text provided, include all enabled entries.
      if (!hasMatchInput(localMatchText, localMatchContext)) return Boolean(e.content);
      const content = String(e.content || '').trim();
      if (!content) return false;
      if (Boolean(e.constant)) return true;
      const keys = normalizeKeys(e);
      if (!keys.length) return false;
      const secondaryKeys = normalizeSecondaryKeys(e);
      const cs = (typeof e.caseSensitive === 'boolean') ? e.caseSensitive : globalCaseSensitive;
      const whole = (typeof e.matchWholeWords === 'boolean') ? e.matchWholeWords : globalMatchWholeWords;
      const entryText = buildMatchTextForEntry(e, localMatchText, localMatchContext);
      if (!entryText) return false;
      const rawText = String(entryText || '');
      const rawTextLower = cs ? rawText : rawText.toLowerCase();
      const primaryMatch = keys.some(k => matchKey(k, rawText, rawTextLower, cs, whole));
      if (!primaryMatch) return false;
      if (!Boolean(e.selective) || secondaryKeys.length === 0) return true;
      const secondaryMatches = secondaryKeys.map(k => matchKey(k, rawText, rawTextLower, cs, whole));
      const anySecondary = secondaryMatches.some(Boolean);
      const allSecondary = secondaryMatches.every(Boolean);
      const logic = Number.isFinite(Number(e.selectiveLogic)) ? Math.trunc(Number(e.selectiveLogic)) : 0;
      switch (logic) {
        case 0:
          return anySecondary;
        case 1:
          return !allSecondary;
        case 2:
          return !anySecondary;
        case 3:
          return allSecondary;
        default:
          return true;
      }
    };

    const rollProbability = e => {
      if (!e || e.useProbability === false) return true;
      const p = Number(e.probability);
      if (!Number.isFinite(p)) return true;
      if (p >= 100) return true;
      if (p <= 0) return false;
      return Math.random() * 100 < p;
    };

    const parseGroups = (val) => {
      if (Array.isArray(val)) return val.map(norm).filter(Boolean);
      return String(val || '')
        .split(/[,，]/)
        .map(norm)
        .filter(Boolean);
    };

    const localEntries = Array.isArray(data.localEntries)
      ? data.localEntries
      : (Array.isArray(data.entries) ? data.entries : []);
    const refEntries = resolveRefEntries(data.refs, id);
    const combinedEntries = [...localEntries, ...refEntries];
    if (!combinedEntries.length) return [];
    const baseEntries = combinedEntries.map((entry, idx) => ({
      ...entry,
      _entryId: String(entry?.id ?? entry?.uid ?? `entry-${idx}`),
      _entryIndex: idx,
      _groups: parseGroups(entry?.group),
      _sourceWorldId: String(entry?._sourceWorldId || id || '').trim(),
      _refWorldId: String(entry?._refWorldId || '').trim(),
    }));

    let effectiveMatchContext = matchContext;
    if (matchContext && minActivations > 0) {
      const fullHistory = Array.isArray(matchContext.fullHistory) ? matchContext.fullHistory : matchContext.history;
      const historyLines = Array.isArray(fullHistory) ? fullHistory : [];
      if (historyLines.length) {
        const maxDepth = maxDepthSetting > 0 ? Math.min(maxDepthSetting, historyLines.length) : historyLines.length;
        let selectedHistory = matchContext.history || [];
        for (let depth = 1; depth <= maxDepth; depth += 1) {
          const candidateHistory = historyLines.slice(-depth);
          const candidateContext = { ...matchContext, history: candidateHistory };
          const matched = baseEntries.filter(e => shouldInclude(e, {
            localMatchText: matchText,
            localMatchContext: candidateContext,
            isRecursivePass: false,
            recursionStep: 0,
          }));
          const uniqueCount = new Set(matched.map(e => e._entryId)).size;
          selectedHistory = candidateHistory;
          if (uniqueCount >= minActivations) break;
        }
        effectiveMatchContext = { ...matchContext, history: selectedHistory };
      }
    }
    const applyProbability = hasMatchInput(matchText, effectiveMatchContext);

    const directMatches = baseEntries
      .filter(e => shouldInclude(e, {
        localMatchText: matchText,
        localMatchContext: effectiveMatchContext,
        isRecursivePass: false,
        recursionStep: 0,
      }))
      .filter(e => (!applyProbability || rollProbability(e)));

    const activeMap = new Map();
    directMatches.forEach(entry => activeMap.set(entry._entryId, entry));

    if (globalRecursiveScan) {
      let newlyActivated = [...directMatches];
      const maxRecursionSteps = minActivations > 0
        ? Number.POSITIVE_INFINITY
        : (maxRecursionStepsSetting > 0 ? maxRecursionStepsSetting : Number.POSITIVE_INFINITY);
      let step = 1;
      while (newlyActivated.length && step <= maxRecursionSteps) {
        const recursionText = newlyActivated
          .filter(e => !Boolean(e.preventRecursion))
          .map(e => String(e.content || '').trim())
          .filter(Boolean)
          .join('\n');
        if (!recursionText) break;
        const recursionMatches = baseEntries
          .filter(e => !activeMap.has(e._entryId))
          .filter(e => shouldInclude(e, {
            localMatchText: recursionText,
            localMatchContext: null,
            isRecursivePass: true,
            recursionStep: step,
          }))
          .filter(e => rollProbability(e));
        if (!recursionMatches.length) break;
        recursionMatches.forEach(entry => activeMap.set(entry._entryId, entry));
        newlyActivated = recursionMatches;
        step += 1;
        if (activeMap.size >= baseEntries.length) break;
      }
    }

    let entries = [...activeMap.values()]
      .sort((a, b) => {
        const oa = Number.isFinite(Number(a?.order))
          ? Number(a.order)
          : Number.isFinite(Number(a?.priority))
          ? Number(a.priority)
          : 0;
        const ob = Number.isFinite(Number(b?.order))
          ? Number(b.order)
          : Number.isFinite(Number(b?.priority))
          ? Number(b.priority)
          : 0;
        return oa - ob;
      });

    const trimEdgeBlankLines = (text) =>
      String(text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');

    // Group scoring: if enabled within a group, keep only highest-weight entries in that group.
    const groupWinners = new Map();
    const groupBuckets = new Map();
    entries.forEach(entry => {
      const groups = Array.isArray(entry?._groups) ? entry._groups : [];
      groups.forEach(g => {
        if (!groupBuckets.has(g)) groupBuckets.set(g, []);
        groupBuckets.get(g).push(entry);
      });
    });
    groupBuckets.forEach((bucket, groupName) => {
      const enabled = globalUseGroupScoring || bucket.some(e => e?.useGroupScoring === true || e?.groupOverride === true);
      if (!enabled) return;
      const override = bucket.filter(e => e?.groupOverride);
      const pool = override.length ? override : bucket;
      let maxWeight = null;
      pool.forEach(e => {
        const w = Number.isFinite(Number(e?.groupWeight)) ? Number(e.groupWeight) : 0;
        if (maxWeight == null || w > maxWeight) maxWeight = w;
      });
      if (maxWeight == null) return;
      const winners = pool.filter(e => {
        const w = Number.isFinite(Number(e?.groupWeight)) ? Number(e.groupWeight) : 0;
        return w === maxWeight;
      });
      if (winners.length) groupWinners.set(groupName, new Set(winners));
    });
    if (groupWinners.size) {
      entries = entries.filter(entry => {
        const groups = Array.isArray(entry?._groups) ? entry._groups : [];
        if (!groups.length) return true;
        return groups.every(g => {
          const winners = groupWinners.get(g);
          if (!winners) return true;
          return winners.has(entry);
        });
      });
    }

    return entries
      .map((e, idx) => {
        const content = trimEdgeBlankLines(e?.content);
        if (!String(content || '').trim()) return null;
        const positionRaw = Number(e?.position);
        const depthRaw = Number(e?.depth);
        const roleRaw = Number(e?.role);
        const orderRaw = Number(e?.order);
        const position = Number.isFinite(positionRaw) ? Math.trunc(positionRaw) : 0;
        const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.trunc(depthRaw)) : 0;
        const role = Number.isFinite(roleRaw) ? Math.max(0, Math.min(2, Math.trunc(roleRaw))) : 0;
        const order = Number.isFinite(orderRaw) ? orderRaw : idx;
        return {
          content,
          position,
          depth,
          role,
          order,
          _seq: idx,
          _entryId: String(e?._entryId || ''),
          _sourceWorldId: String(e?._sourceWorldId || ''),
          _refWorldId: String(e?._refWorldId || ''),
        };
      })
      .filter(Boolean);
  }

  getTemplateRenderInjections({ sessionId, uiMode, content, userName, characterName, groupName, membersText } = {}) {
    const sid = String(sessionId || '').trim();
    const mode = String(uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat';
    const matchContext = {
      uiMode: mode,
      sessionId: sid,
      sessionName: String(groupName || characterName || '').trim(),
    };
    const matchText = String(content ?? '');
    const collectEntries = (worldId) => this.collectWorldEntries(worldId, { matchText, matchContext });
    const worldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
    const strategyRaw = String(worldSettings.insertionStrategy || 'role_first');
    const insertionStrategy = ['role_first', 'global_first', 'even'].includes(strategyRaw) ? strategyRaw : 'role_first';
    const globalEntries =
      this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
        ? collectEntries(this.globalWorldId)
        : [];
    const sessionEntries = [];
    if (mode !== 'rp') {
      const list = this.normalizeWorldIds(this.worldSessionMap[String(sid) || '']);
      list.forEach((id) => {
        if (!id) return;
        const entries = collectEntries(id);
        if (entries.length) sessionEntries.push(...entries);
      });
    }
    const mergedEntries = this.mergeWorldEntries(globalEntries, sessionEntries, insertionStrategy);
    const before = [];
    const after = [];
    const macroContext = {
      user: String(userName || '').trim(),
      char: String(characterName || '').trim(),
      group: String(groupName || '').trim() || String(characterName || '').trim(),
      members: String(membersText || '').trim(),
      uiMode: mode,
    };
    const formatContent = (entry) => {
      const raw = this.processTextMacros(String(entry?.content || ''), {
        ...macroContext,
        sessionId: sid,
      });
      const trimmed = String(raw || '').trim();
      if (!trimmed) return '';
      return this.regex.apply(trimmed, this.getRegexContext(), regex_placement.WORLD_INFO, {
        isMarkdown: true,
        isPrompt: false,
        isEdit: false,
        depth: 0,
      });
    };
    mergedEntries.forEach((entry) => {
      const tags = parseTemplateInjectTags(entry?.comment || '');
      if (!tags.length) return;
      const text = formatContent(entry);
      if (!text) return;
      tags.forEach(tag => {
        if (tag.stage !== 'render' || tag.type !== 'edge') return;
        if (tag.mode === 'before') before.push(text);
        if (tag.mode === 'after') after.push(text);
      });
    });
    return { before, after };
  }

  mergeWorldEntries(globalEntries = [], sessionEntries = [], strategy = 'role_first') {
    const sourceRank = (src) => {
      if (strategy === 'global_first') return src === 'global' ? 0 : 1;
      if (strategy === 'role_first') return src === 'session' ? 0 : 1;
      return 0;
    };
    const g = Array.isArray(globalEntries) ? globalEntries : [];
    const s = Array.isArray(sessionEntries) ? sessionEntries : [];
    const merged = [
      ...g.map((e, i) => ({ ...e, _src: 'global', _srcSeq: i })),
      ...s.map((e, i) => ({ ...e, _src: 'session', _srcSeq: i })),
    ];
    merged.sort((a, b) => {
      const oa = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
      const ob = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
      if (oa !== ob) return oa - ob;
      const sr = sourceRank(a._src) - sourceRank(b._src);
      if (sr !== 0) return sr;
      const sa = Number.isFinite(Number(a?._srcSeq)) ? Number(a._srcSeq) : 0;
      const sb = Number.isFinite(Number(b?._srcSeq)) ? Number(b._srcSeq) : 0;
      return sa - sb;
    });
    const seen = new Set();
    const deduped = merged.filter((entry) => {
      const sourceId = String(entry?._sourceWorldId || '').trim();
      const entryId = String(entry?._entryId || '').trim();
      if (!sourceId || !entryId) return true;
      const key = `${sourceId}::${entryId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const budgetTokens = this.getWorldBudgetTokens?.();
    if (!Number.isFinite(Number(budgetTokens)) || Number(budgetTokens) <= 0) return deduped;
    let used = 0;
    let overflowed = false;
    const filtered = deduped.filter((entry) => {
      const cost = estimateTokens(String(entry?.content || ''), 'rough');
      if (used + cost > budgetTokens) {
        overflowed = true;
        return false;
      }
      used += cost;
      return true;
    });
    if (overflowed) {
      const settings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
      if (settings.alertOnOverflow === true) {
        this.warnWorldBudgetOverflow?.();
      }
    }
    return filtered;
  }

  formatWorldPrompt(worldId, label) {
    const entries = this.collectWorldEntries(worldId, label);
    if (!entries.length) return '';
    return entries.map(e => e.content).join('\n\n');
  }

  /**
   * 生成当前世界书的提示串
   */
  getActiveWorldPrompt() {
    const worldSettings = this.getWorldGlobalSettings?.() || this.worldGlobalSettings || {};
    const strategyRaw = String(worldSettings.insertionStrategy || 'role_first');
    const insertionStrategy = ['role_first', 'global_first', 'even'].includes(strategyRaw) ? strategyRaw : 'role_first';
    const collectEntries = worldId => this.collectWorldEntries(worldId, { matchText: '' });
    const builtinEntries = collectEntries(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
    const builtinPart = builtinEntries.map(e => e.content).join('\n\n');
    const globalEntries =
      this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
        ? collectEntries(this.globalWorldId)
        : [];
    const sessionEntries = [];
    (this.currentWorldIds || []).forEach((id) => {
      if (!id) return;
      const list = collectEntries(id);
      if (list.length) sessionEntries.push(...list);
    });
    const mergedContent = this.mergeWorldEntries(globalEntries, sessionEntries, insertionStrategy)
      .map(e => e.content)
      .join('\n\n');
    return [builtinPart, mergedContent].filter(Boolean).join('\n\n');
  }

  getWorldForSession(sessionId = this.activeSessionId) {
    const val = this.worldSessionMap[sessionId];
    const list = this.normalizeWorldIds(val);
    return list[0] || null;
  }
}

// 创建全局实例
window.appBridge = new AppBridge();

// 兼容层：提供类似 SillyTavern 的全局函数
window.triggerSlash = async command => {
  logger.info('执行命令:', command);
  // TODO: 解析并执行命令
  // 例如: /echo -> 显示消息, /gen -> 生成, /clear -> 清空
};

window.getWorldInfoSettings = async () => {
  return await window.appBridge.getWorldInfo();
};

window.saveWorldInfo = async data => {
  await window.appBridge.saveWorldInfo(window.appBridge.currentCharacterId, data);
};

// 兼容：从 ST world JSON 导入（期望前端读取后调用）
window.importSTWorld = async (jsonObj, name = 'imported') => {
  const simplified = convertSTWorld(jsonObj, name);
  await window.appBridge.saveWorldInfo(name, simplified);
  return simplified;
};

// 初始化
window.appBridge
  .init()
  .then(() => {
    logger.info('✅ App Bridge 初始化完成');
  })
  .catch(error => {
    logger.error('❌ App Bridge 初始化失败:', error);
  });

export { AppBridge };
