import { safeInvoke } from '../utils/tauri.js';
import { estimateTokens } from '../memory/memory-prompt-utils.js';

export const MAID_CONVERSATION_STORE_KEY = 'maid_conversation_store_v1';
export const MAID_CONVERSATION_STORE_VERSION = 1;
export const MAID_CONTEXT_COMPACTION_THRESHOLD_TOKENS = 100000;
export const MAID_CONTEXT_RECENT_TURN_LIMIT = 12;
export const MAID_CONTEXT_RECENT_TOKEN_LIMIT = 6000;
export const MAID_CONTEXT_MEMORY_ROW_LIMIT = 80;
export const MAID_CONTEXT_KEEP_RECENT_AFTER_COMPACT = 8;
export const MAID_CONTEXT_MAX_TURNS = 120;
export const MAID_CONTEXT_MAX_MEMORY_ROWS = 240;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const safeNow = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  } catch {
    return Date.now();
  }
};

const readLocalJson = (storage, key = '') => {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (storage, key = '', value = {}) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const loadKvDefault = async (key = '') => safeInvoke('load_kv', { name: key });

const saveKvDefault = async (key = '', value = {}) => safeInvoke('save_kv', { name: key, data: value });

const truncate = (value = '', max = 1200) => {
  const text = trim(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const normalizeId = (value = '', fallback = '') => {
  const text = trim(value);
  return text || fallback;
};

const normalizeTurn = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const at = Number(src.at || safeNow(now)) || safeNow(now);
  const id = normalizeId(src.id, `turn_${at}_${Math.random().toString(36).slice(2, 8)}`);
  const plan = isPlainObject(src.plan) ? src.plan : {};
  const output = isPlainObject(src.output) ? src.output : {};
  return {
    id,
    at,
    input: truncate(src.input, 2000),
    status: trim(src.status || src.resultStatus),
    responseType: trim(src.responseType),
    message: truncate(src.message || src.response || src.reason, 2400),
    toolName: trim(src.toolName || plan.toolName || output.toolName),
    featureId: trim(src.featureId || plan.featureId),
    title: trim(src.title || plan.title),
    compacted: src.compacted === true,
    context: isPlainObject(src.context) ? clone(src.context) : {},
  };
};

const normalizeMemoryRow = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const at = Number(src.at || safeNow(now)) || safeNow(now);
  const id = normalizeId(src.id, `memory_${at}_${Math.random().toString(36).slice(2, 8)}`);
  const tags = Array.isArray(src.tags)
    ? src.tags.map(tag => trim(tag)).filter(Boolean).slice(0, 12)
    : [];
  const sourceTurnIds = Array.isArray(src.sourceTurnIds)
    ? src.sourceTurnIds.map(idValue => trim(idValue)).filter(Boolean).slice(0, 80)
    : [];
  const content = truncate(src.content, 8000);
  return {
    id,
    at,
    title: truncate(src.title, 160),
    content,
    tags,
    sourceTurnIds,
    tokenCount: Number(src.tokenCount || estimateTokens(content, 'rough')) || 0,
  };
};

export const normalizeMaidConversationState = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const updatedAt = Number(src.updatedAt || safeNow(now)) || safeNow(now);
  const turns = Array.isArray(src.turns)
    ? src.turns.map(turn => normalizeTurn(turn, { now })).filter(turn => trim(turn.input) || trim(turn.message))
    : [];
  const memoryRows = Array.isArray(src.memoryRows)
    ? src.memoryRows.map(row => normalizeMemoryRow(row, { now })).filter(row => trim(row.content))
    : [];
  return {
    version: MAID_CONVERSATION_STORE_VERSION,
    updatedAt,
    threadId: trim(src.threadId, 'maid_default'),
    threadTitle: trim(src.threadTitle, '女仆对话'),
    totalInjectedTokens: Number(src.totalInjectedTokens || 0) || 0,
    pendingInjectedTokens: Number(src.pendingInjectedTokens || 0) || 0,
    compactionCount: Number(src.compactionCount || 0) || 0,
    lastCompactionAt: Number(src.lastCompactionAt || 0) || 0,
    turns: turns.slice(-MAID_CONTEXT_MAX_TURNS),
    memoryRows: memoryRows.slice(-MAID_CONTEXT_MAX_MEMORY_ROWS),
  };
};

export const formatMaidHistoryContextText = ({
  turns = [],
  maxTurns = MAID_CONTEXT_RECENT_TURN_LIMIT,
  maxTokens = MAID_CONTEXT_RECENT_TOKEN_LIMIT,
} = {}) => {
  const available = (Array.isArray(turns) ? turns : [])
    .filter(turn => !turn?.compacted)
    .slice(-Math.max(1, Number(maxTurns) || MAID_CONTEXT_RECENT_TURN_LIMIT));
  const selected = [];
  let used = 0;
  for (let i = available.length - 1; i >= 0; i -= 1) {
    const turn = available[i];
    const lines = [
      `- 时间: ${new Date(Number(turn.at || 0) || Date.now()).toISOString()}`,
      `  用户: ${trim(turn.input, '-')}`,
      turn.toolName ? `  工具: ${turn.toolName}` : '',
      turn.featureId ? `  功能: ${turn.featureId}` : '',
      turn.status ? `  状态: ${turn.status}` : '',
      turn.message ? `  结果: ${turn.message}` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    const cost = estimateTokens(text, 'rough');
    if (selected.length && used + cost > maxTokens) break;
    selected.unshift(text);
    used += cost;
  }
  return selected.join('\n');
};

export const formatMaidMemoryTableText = ({
  rows = [],
  maxRows = MAID_CONTEXT_MEMORY_ROW_LIMIT,
} = {}) => (
  (Array.isArray(rows) ? rows : [])
    .slice(-Math.max(1, Number(maxRows) || MAID_CONTEXT_MEMORY_ROW_LIMIT))
    .map((row, index) => [
      `| ${index + 1} | ${trim(row.title, '上下文记忆')} |`,
      `| 内容 | ${trim(row.content, '-') .replace(/\n+/g, ' / ')} |`,
      row.tags?.length ? `| 标签 | ${row.tags.join(', ')} |` : '',
    ].filter(Boolean).join('\n'))
    .join('\n')
);

const buildMemoryRowFromTurns = (turns = [], {
  at = Date.now(),
  compactionIndex = 1,
} = {}) => {
  const selected = (Array.isArray(turns) ? turns : []).filter(turn => !turn?.compacted);
  if (!selected.length) return null;
  const content = selected.map((turn, index) => [
    `${index + 1}. 用户请求：${trim(turn.input, '-')}`,
    turn.toolName ? `   工具：${turn.toolName}` : '',
    turn.featureId ? `   功能：${turn.featureId}` : '',
    turn.status ? `   状态：${turn.status}` : '',
    turn.message ? `   结果：${turn.message}` : '',
  ].filter(Boolean).join('\n')).join('\n');
  return normalizeMemoryRow({
    id: `maid_memory_${at}_${compactionIndex}`,
    at,
    title: `女仆上下文摘要 ${compactionIndex}`,
    content,
    tags: ['女仆上下文', '自动压缩'],
    sourceTurnIds: selected.map(turn => turn.id),
    tokenCount: estimateTokens(content, 'rough'),
  });
};

export class MaidConversationStore {
  constructor({
    storage = globalThis?.localStorage || null,
    loadKv = loadKvDefault,
    saveKv = saveKvDefault,
    now = Date.now,
    compactionThresholdTokens = MAID_CONTEXT_COMPACTION_THRESHOLD_TOKENS,
  } = {}) {
    this.storage = storage;
    this.loadKv = typeof loadKv === 'function' ? loadKv : null;
    this.saveKv = typeof saveKv === 'function' ? saveKv : null;
    this.now = typeof now === 'function' ? now : Date.now;
    this.compactionThresholdTokens = Number(compactionThresholdTokens) || MAID_CONTEXT_COMPACTION_THRESHOLD_TOKENS;
    this.loaded = false;
    this.state = normalizeMaidConversationState({}, { now: this.now });
  }

  async load() {
    const localRaw = readLocalJson(this.storage, MAID_CONVERSATION_STORE_KEY) || {};
    let kvRaw = null;
    try {
      kvRaw = await this.loadKv?.(MAID_CONVERSATION_STORE_KEY);
    } catch {}
    const localState = normalizeMaidConversationState(localRaw, { now: this.now });
    const kvState = isPlainObject(kvRaw) && !kvRaw._tooLarge
      ? normalizeMaidConversationState(kvRaw, { now: this.now })
      : null;
    this.state = kvState && Number(kvState.updatedAt || 0) >= Number(localState.updatedAt || 0)
      ? kvState
      : localState;
    this.loaded = true;
    return this.exportState();
  }

  ensureLoaded() {
    if (!this.loaded) {
      this.state = normalizeMaidConversationState(readLocalJson(this.storage, MAID_CONVERSATION_STORE_KEY) || {}, {
        now: this.now,
      });
      this.loaded = true;
    }
  }

  async write() {
    this.ensureLoaded();
    this.state.updatedAt = safeNow(this.now);
    const payload = this.exportState();
    let kvSaved = false;
    try {
      await this.saveKv?.(MAID_CONVERSATION_STORE_KEY, payload);
      kvSaved = Boolean(this.saveKv);
    } catch {}
    const localSaved = writeLocalJson(this.storage, MAID_CONVERSATION_STORE_KEY, payload);
    return kvSaved || localSaved;
  }

  getContextSnapshot(options = {}) {
    this.ensureLoaded();
    const historyText = formatMaidHistoryContextText({
      turns: this.state.turns,
      maxTurns: options.maxTurns,
      maxTokens: options.maxHistoryTokens,
    });
    const memoryText = formatMaidMemoryTableText({
      rows: this.state.memoryRows,
      maxRows: options.maxMemoryRows,
    });
    const tokenCount = estimateTokens([historyText, memoryText].filter(Boolean).join('\n'), 'rough');
    return {
      threadId: this.state.threadId,
      threadTitle: this.state.threadTitle,
      historyText,
      memoryText,
      tokenCount,
      turnCount: this.state.turns.filter(turn => !turn.compacted).length,
      memoryCount: this.state.memoryRows.length,
      totalInjectedTokens: this.state.totalInjectedTokens,
      pendingInjectedTokens: this.state.pendingInjectedTokens,
      compactionThresholdTokens: this.compactionThresholdTokens,
    };
  }

  getHistoryContextText() {
    return trim(this.getContextSnapshot().historyText, '尚未记录女仆历史上下文。');
  }

  getMemoryTableText() {
    return trim(this.getContextSnapshot().memoryText, '尚未生成女仆记忆表格。');
  }

  async appendTurn(turn = {}) {
    this.ensureLoaded();
    this.state.turns.push(normalizeTurn({
      ...turn,
      id: turn.id || `turn_${safeNow(this.now)}_${this.state.turns.length + 1}`,
      at: turn.at || safeNow(this.now),
    }, { now: this.now }));
    this.state.turns = this.state.turns.slice(-MAID_CONTEXT_MAX_TURNS);
    await this.write();
    return this.exportState();
  }

  compactHistoryToMemory({ force = false } = {}) {
    this.ensureLoaded();
    const activeTurns = this.state.turns.filter(turn => !turn.compacted);
    const compactableCount = force ? activeTurns.length : Math.max(0, activeTurns.length - MAID_CONTEXT_KEEP_RECENT_AFTER_COMPACT);
    if (!compactableCount) {
      if (this.state.pendingInjectedTokens >= this.compactionThresholdTokens) {
        this.state.pendingInjectedTokens %= this.compactionThresholdTokens;
      }
      return null;
    }
    const compactableIds = new Set(activeTurns.slice(0, compactableCount).map(turn => turn.id));
    const at = safeNow(this.now);
    const nextIndex = Number(this.state.compactionCount || 0) + 1;
    const row = buildMemoryRowFromTurns(
      this.state.turns.filter(turn => compactableIds.has(turn.id)),
      { at, compactionIndex: nextIndex },
    );
    if (!row) return null;
    this.state.turns = this.state.turns.map(turn => (
      compactableIds.has(turn.id) ? { ...turn, compacted: true } : turn
    ));
    this.state.memoryRows.push(row);
    this.state.memoryRows = this.state.memoryRows.slice(-MAID_CONTEXT_MAX_MEMORY_ROWS);
    this.state.compactionCount = nextIndex;
    this.state.lastCompactionAt = at;
    this.state.pendingInjectedTokens = Math.max(0, Number(this.state.pendingInjectedTokens || 0) - this.compactionThresholdTokens);
    return row;
  }

  async recordContextInjection(tokenCount = 0) {
    this.ensureLoaded();
    const count = Math.max(0, Number(tokenCount) || 0);
    if (!count) return null;
    this.state.totalInjectedTokens += count;
    this.state.pendingInjectedTokens += count;
    let row = null;
    if (this.state.pendingInjectedTokens >= this.compactionThresholdTokens) {
      row = this.compactHistoryToMemory();
    }
    await this.write();
    return row;
  }

  exportState() {
    this.ensureLoaded();
    return clone(this.state);
  }
}
