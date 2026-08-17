import { estimateTokens } from '../memory/memory-prompt-utils.js';
import {
  TEXT_PROTOCOL_PATTERN,
  containsTextProtocol,
} from '../utils/text-protocol-marker-utils.js';

export const GLOBAL_SEMANTIC_PROMPT_LIBRARY_KIND = 'agent_center_global_semantic_prompt_library';
export const GLOBAL_SEMANTIC_PROMPT_LIBRARY_SCHEMA_VERSION = 1;
export const GLOBAL_SEMANTIC_PROMPT_BUDGET_VERSION = 1;
export const GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT = 2000;
export const GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT = 6000;

export const GLOBAL_SEMANTIC_PROMPT_SCOPES = Object.freeze({
  chat: 'chat',
  maid: 'maid',
});

export const GLOBAL_SEMANTIC_PROMPT_ANCHORS = Object.freeze({
  semanticHeader: 'semantic_header',
  afterCharacter: 'after_character',
  beforeHistory: 'before_history',
  beforeLatestUser: 'before_latest_user',
});

const VALID_SCOPES = new Set(Object.values(GLOBAL_SEMANTIC_PROMPT_SCOPES));
const VALID_ANCHORS = new Set(Object.values(GLOBAL_SEMANTIC_PROMPT_ANCHORS));
const CHAT_TASK_TYPES = new Set([
  '',
  'chat',
  'private_chat',
  'group_chat',
  'moment',
  'moments',
  'moment_comment',
  'moment_publish',
  'moment_post',
]);

export const GLOBAL_SEMANTIC_PROMPT_PROTOCOL_PATTERN = TEXT_PROTOCOL_PATTERN;

const OUTPUT_CONTRACT_PATTERN = /(?:(?:必须|务必|只能|仅能|请|需要|严格).{0,24}(?:按照|遵循|使用|以).{0,24}(?:JSON|XML|schema|格式|协议|标签|模板).{0,24}(?:输出|回复|返回|生成)|(?:输出|回复|返回).{0,24}(?:必须|务必|只能|严格).{0,24}(?:JSON|XML|schema|格式|协议|标签|模板))/iu;

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toTimestamp = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : now;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
  } catch {
    return Date.now();
  }
};

const createBlockId = () => {
  try {
    if (typeof globalThis?.crypto?.randomUUID === 'function') {
      return `global-prompt-${globalThis.crypto.randomUUID()}`;
    }
  } catch {}
  return `global-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const freezeDeep = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const normalizeScope = value => (
  VALID_SCOPES.has(trim(value).toLowerCase())
    ? trim(value).toLowerCase()
    : GLOBAL_SEMANTIC_PROMPT_SCOPES.chat
);

const normalizeAnchor = value => (
  VALID_ANCHORS.has(trim(value).toLowerCase())
    ? trim(value).toLowerCase()
    : GLOBAL_SEMANTIC_PROMPT_ANCHORS.semanticHeader
);

export const estimateGlobalSemanticPromptTokens = content => (
  Math.max(0, Math.trunc(Number(estimateTokens(String(content ?? ''), 'rough')) || 0))
);

export const detectGlobalSemanticPromptGuard = (content = '') => {
  const text = String(content ?? '').trim();
  const blocked = Boolean(
    text
    && (containsTextProtocol(text) || OUTPUT_CONTRACT_PATTERN.test(text))
  );
  return {
    blocked,
    code: blocked ? 'format_protocol_instruction' : '',
    message: blocked ? '检测到回复格式指令；请放入会话预设' : '',
  };
};

export const normalizeGlobalSemanticPromptBlock = (block = {}, index = 0) => {
  const src = isPlainObject(block) ? block : {};
  const createdAt = Number(src.createdAt || 0) || 0;
  const updatedAt = Number(src.updatedAt || 0) || createdAt;
  const content = typeof src.content === 'string' ? src.content : '';
  return {
    id: trim(src.id, `global-prompt-${index + 1}`),
    name: trim(src.name, `全局提示词 ${index + 1}`),
    enabled: src.enabled === true,
    content,
    scope: normalizeScope(src.scope),
    anchor: normalizeAnchor(src.anchor),
    role: 'system',
    order: Number.isFinite(Number(src.order)) ? Number(src.order) : index,
    createdAt,
    updatedAt,
  };
};

export const normalizeGlobalSemanticPromptLibrary = (library = {}) => {
  const src = isPlainObject(library) ? library : {};
  const seen = new Set();
  const blocks = (Array.isArray(src.blocks) ? src.blocks : [])
    .map((block, index) => normalizeGlobalSemanticPromptBlock(block, index))
    .filter((block) => {
      if (!block.id || seen.has(block.id)) return false;
      seen.add(block.id);
      return true;
    })
    .sort((left, right) => {
      const order = Number(left.order || 0) - Number(right.order || 0);
      return order || left.id.localeCompare(right.id);
    })
    .map((block, index) => ({ ...block, order: index }));
  return {
    schemaVersion: GLOBAL_SEMANTIC_PROMPT_LIBRARY_SCHEMA_VERSION,
    budgetVersion: GLOBAL_SEMANTIC_PROMPT_BUDGET_VERSION,
    blocks,
  };
};

export const validateGlobalSemanticPromptBlock = (block = {}, {
  library = null,
  ignoreBlockId = '',
} = {}) => {
  const normalized = normalizeGlobalSemanticPromptBlock(block);
  const estimatedTokens = estimateGlobalSemanticPromptTokens(normalized.content);
  const guard = detectGlobalSemanticPromptGuard(normalized.content);
  let code = '';
  let message = '';
  if (!normalized.content.trim()) {
    code = 'empty_content';
    message = '请先填写提示词内容';
  } else if (guard.blocked) {
    code = guard.code;
    message = guard.message;
  } else if (estimatedTokens > GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT) {
    code = 'block_budget_exceeded';
    message = `单块最多 ${GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`;
  }

  const normalizedLibrary = normalizeGlobalSemanticPromptLibrary(library || {});
  const scopeEnabledTokens = normalizedLibrary.blocks.reduce((total, current) => {
    if (current.id === trim(ignoreBlockId || normalized.id)) return total;
    if (!current.enabled || current.scope !== normalized.scope) return total;
    return total + estimateGlobalSemanticPromptTokens(current.content);
  }, 0);
  const scopeTotalTokens = scopeEnabledTokens + estimatedTokens;
  if (!code && scopeTotalTokens > GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT) {
    code = 'scope_budget_exceeded';
    message = `同一范围启用总量最多 ${GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`;
  }
  return {
    ok: !code,
    code,
    message,
    estimatedTokens,
    scopeEnabledTokens,
    scopeTotalTokens,
    blockTokenLimit: GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT,
    scopeTokenLimit: GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT,
  };
};

export const upsertGlobalSemanticPromptBlock = (library = {}, patch = {}, {
  now = Date.now,
  createId = createBlockId,
} = {}) => {
  const current = normalizeGlobalSemanticPromptLibrary(library);
  const requestedId = trim(patch?.id);
  const existingIndex = requestedId
    ? current.blocks.findIndex(block => block.id === requestedId)
    : -1;
  const existing = existingIndex >= 0 ? current.blocks[existingIndex] : null;
  const timestamp = toTimestamp(now);
  const id = requestedId || trim(createId?.(), createBlockId());
  const candidate = normalizeGlobalSemanticPromptBlock({
    ...(existing || {}),
    ...(isPlainObject(patch) ? patch : {}),
    id,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    order: existing?.order ?? current.blocks.length,
  }, existing?.order ?? current.blocks.length);
  const validation = validateGlobalSemanticPromptBlock(candidate, {
    library: current,
    ignoreBlockId: id,
  });
  const block = {
    ...candidate,
    enabled: candidate.enabled === true && validation.ok,
  };
  const blocks = current.blocks.slice();
  if (existingIndex >= 0) blocks[existingIndex] = block;
  else blocks.push(block);
  return {
    library: normalizeGlobalSemanticPromptLibrary({ ...current, blocks }),
    block,
    validation,
    forcedDisabled: candidate.enabled === true && !validation.ok,
  };
};

export const removeGlobalSemanticPromptBlock = (library = {}, blockId = '') => {
  const current = normalizeGlobalSemanticPromptLibrary(library);
  const id = trim(blockId);
  return normalizeGlobalSemanticPromptLibrary({
    ...current,
    blocks: current.blocks.filter(block => block.id !== id),
  });
};

export const reorderGlobalSemanticPromptBlocks = (library = {}, orderedIds = []) => {
  const current = normalizeGlobalSemanticPromptLibrary(library);
  const ids = Array.isArray(orderedIds) ? orderedIds.map(trim).filter(Boolean) : [];
  const rank = new Map(ids.map((id, index) => [id, index]));
  const offset = ids.length;
  const blocks = current.blocks
    .slice()
    .sort((left, right) => (
      (rank.has(left.id) ? rank.get(left.id) : offset + left.order)
      - (rank.has(right.id) ? rank.get(right.id) : offset + right.order)
    ))
    .map((block, index) => ({ ...block, order: index }));
  return normalizeGlobalSemanticPromptLibrary({
    ...current,
    blocks,
  });
};

export const exportGlobalSemanticPromptLibrary = (library = {}, {
  now = Date.now,
} = {}) => ({
  kind: GLOBAL_SEMANTIC_PROMPT_LIBRARY_KIND,
  schemaVersion: GLOBAL_SEMANTIC_PROMPT_LIBRARY_SCHEMA_VERSION,
  exportedAt: new Date(toTimestamp(now)).toISOString(),
  library: normalizeGlobalSemanticPromptLibrary(library),
});

export const importGlobalSemanticPromptLibrary = (payload = {}, {
  now = Date.now,
} = {}) => {
  const src = isPlainObject(payload) ? payload : {};
  if (trim(src.kind) !== GLOBAL_SEMANTIC_PROMPT_LIBRARY_KIND) {
    return { ok: false, reason: 'invalid_kind', message: '这不是全局提示词库文件' };
  }
  if (Number(src.schemaVersion) !== GLOBAL_SEMANTIC_PROMPT_LIBRARY_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported_schema_version', message: '暂不支持这个全局提示词库版本' };
  }
  const sourceLibrary = normalizeGlobalSemanticPromptLibrary(src.library);
  let next = normalizeGlobalSemanticPromptLibrary();
  const warnings = [];
  sourceLibrary.blocks.forEach((rawBlock) => {
    const mutation = upsertGlobalSemanticPromptBlock(next, {
      ...rawBlock,
      createdAt: rawBlock.createdAt || toTimestamp(now),
      enabled: rawBlock.enabled === true,
    }, { now, createId: () => rawBlock.id });
    next = mutation.library;
    if (mutation.forcedDisabled) {
      warnings.push({
        blockId: mutation.block.id,
        blockName: mutation.block.name,
        code: mutation.validation.code,
        message: mutation.validation.message,
      });
    }
  });
  return { ok: true, library: next, warnings };
};

const formatIsoTime = (date) => [
  String(date.getHours()).padStart(2, '0'),
  String(date.getMinutes()).padStart(2, '0'),
  String(date.getSeconds()).padStart(2, '0'),
].join(':');

const formatIsoDate = date => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const renderGlobalSemanticPromptMacros = (content = '', {
  user = 'user',
  char = 'assistant',
  now = new Date(),
} = {}) => {
  const date = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(now);
  return String(content ?? '')
    .replace(/{{user}}/gi, String(user ?? 'user'))
    .replace(/{{char}}/gi, String(char ?? 'assistant'))
    .replace(/{{time}}/gi, date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/{{date}}/gi, date.toLocaleDateString())
    .replace(/{{weekday}}/gi, date.toLocaleDateString(undefined, { weekday: 'long' }))
    .replace(/{{isotime}}/gi, formatIsoTime(date))
    .replace(/{{isodate}}/gi, formatIsoDate(date));
};

export const isGlobalSemanticPromptScopeEligible = ({
  scope = 'chat',
  taskType = '',
  uiMode = 'chat',
  rootPlanner = true,
} = {}) => {
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope === GLOBAL_SEMANTIC_PROMPT_SCOPES.maid) return rootPlanner === true;
  if (trim(uiMode).toLowerCase() === 'rp') return false;
  return CHAT_TASK_TYPES.has(trim(taskType).toLowerCase());
};

export const resolveGlobalSemanticPromptPlan = (library = {}, {
  scope = 'chat',
  taskType = '',
  uiMode = 'chat',
  rootPlanner = true,
  hasCustomChatPreset = false,
  user = 'user',
  char = 'assistant',
  now = new Date(),
  renderMacros = renderGlobalSemanticPromptMacros,
} = {}) => {
  const normalized = normalizeGlobalSemanticPromptLibrary(library);
  const normalizedScope = normalizeScope(scope);
  const eligible = isGlobalSemanticPromptScopeEligible({
    scope: normalizedScope,
    taskType,
    uiMode,
    rootPlanner,
  });
  const byAnchor = Object.fromEntries(
    Object.values(GLOBAL_SEMANTIC_PROMPT_ANCHORS).map(anchor => [anchor, []]),
  );
  const injected = [];
  const skipped = [];
  let totalEstimatedTokens = 0;
  let macroExecutionCount = 0;

  normalized.blocks.forEach((block) => {
    if (!block.enabled || block.scope !== normalizedScope) return;
    const estimatedTokens = estimateGlobalSemanticPromptTokens(block.content);
    let reason = '';
    let message = '';
    if (!eligible) {
      reason = 'request_scope_excluded';
      message = normalizedScope === GLOBAL_SEMANTIC_PROMPT_SCOPES.maid
        ? '只会加入女仆主规划请求'
        : '这个请求不属于聊天模式';
    } else {
      const guard = detectGlobalSemanticPromptGuard(block.content);
      if (guard.blocked) {
        reason = guard.code;
        message = guard.message;
      } else if (estimatedTokens > GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT) {
        reason = 'block_budget_exceeded';
        message = `单块超过 ${GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`;
      } else if (totalEstimatedTokens + estimatedTokens > GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT) {
        reason = 'scope_budget_exceeded';
        message = `启用总量超过 ${GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`;
      } else if (
        normalizedScope === GLOBAL_SEMANTIC_PROMPT_SCOPES.chat
        && hasCustomChatPreset === true
        && block.anchor !== GLOBAL_SEMANTIC_PROMPT_ANCHORS.semanticHeader
      ) {
        reason = 'custom_chat_preset_anchor_skipped';
        message = '该会话使用自定义预设，此位置未注入';
      }
    }
    if (reason) {
      skipped.push({
        id: block.id,
        name: block.name,
        scope: block.scope,
        anchor: block.anchor,
        estimatedTokens,
        reason,
        message,
      });
      return;
    }

    const renderedContent = String(renderMacros(block.content, {
      user,
      char,
      now,
    }) ?? '').trim();
    macroExecutionCount += 1;
    if (!renderedContent) {
      skipped.push({
        id: block.id,
        name: block.name,
        scope: block.scope,
        anchor: block.anchor,
        estimatedTokens: 0,
        reason: 'empty_after_macro_render',
        message: '宏处理后没有可注入内容',
      });
      return;
    }
    const renderedTokens = estimateGlobalSemanticPromptTokens(renderedContent);
    const renderedGuard = detectGlobalSemanticPromptGuard(renderedContent);
    if (renderedGuard.blocked) {
      skipped.push({
        id: block.id,
        name: block.name,
        scope: block.scope,
        anchor: block.anchor,
        estimatedTokens: renderedTokens,
        reason: renderedGuard.code,
        message: renderedGuard.message,
      });
      return;
    }
    if (renderedTokens > GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT) {
      skipped.push({
        id: block.id,
        name: block.name,
        scope: block.scope,
        anchor: block.anchor,
        estimatedTokens: renderedTokens,
        reason: 'rendered_block_budget_exceeded',
        message: `宏处理后单块超过 ${GLOBAL_SEMANTIC_PROMPT_BLOCK_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`,
      });
      return;
    }
    if (totalEstimatedTokens + renderedTokens > GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT) {
      skipped.push({
        id: block.id,
        name: block.name,
        scope: block.scope,
        anchor: block.anchor,
        estimatedTokens: renderedTokens,
        reason: 'rendered_scope_budget_exceeded',
        message: `宏处理后启用总量超过 ${GLOBAL_SEMANTIC_PROMPT_SCOPE_TOKEN_LIMIT.toLocaleString('zh-CN')} estimated tokens`,
      });
      return;
    }
    totalEstimatedTokens += renderedTokens;
    const resolved = {
      id: block.id,
      name: block.name,
      scope: block.scope,
      anchor: block.anchor,
      role: 'system',
      content: renderedContent,
      estimatedTokens: renderedTokens,
      order: block.order,
    };
    byAnchor[block.anchor].push(resolved);
    injected.push(resolved);
  });

  return freezeDeep({
    schemaVersion: GLOBAL_SEMANTIC_PROMPT_LIBRARY_SCHEMA_VERSION,
    budgetVersion: GLOBAL_SEMANTIC_PROMPT_BUDGET_VERSION,
    scope: normalizedScope,
    eligible,
    taskType: trim(taskType).toLowerCase(),
    uiMode: trim(uiMode, 'chat').toLowerCase(),
    hasCustomChatPreset: hasCustomChatPreset === true,
    byAnchor,
    totalEstimatedTokens,
    macroExecutionCount,
    injected,
    skipped,
  });
};

export const buildGlobalSemanticPromptInjectionAudit = (plan = null) => {
  const source = isPlainObject(plan) ? plan : {};
  const injected = Array.isArray(source.injected) ? source.injected : [];
  const skipped = Array.isArray(source.skipped) ? source.skipped : [];
  return {
    version: 1,
    segmentId: 'global_prompt_library',
    label: '全局提示词',
    scope: trim(source.scope),
    usedTokens: injected.reduce(
      (sum, block) => sum + Math.max(0, Math.trunc(Number(block?.estimatedTokens) || 0)),
      0,
    ),
    messageCount: injected.length,
    injected: injected.map(block => ({ ...block })),
    skipped: skipped.map(block => ({ ...block })),
    macroExecutionCount: Math.max(0, Math.trunc(Number(source.macroExecutionCount) || 0)),
  };
};

export const buildGlobalSemanticPromptExtraBlocks = (plan = null, {
  firstOrder = 1200,
} = {}) => {
  const injected = Array.isArray(plan?.injected) ? plan.injected : [];
  return injected.map((block, index) => ({
    content: String(block?.content || ''),
    role: 'system',
    position: block?.anchor === GLOBAL_SEMANTIC_PROMPT_ANCHORS.afterCharacter
      ? 'after_persona'
      : block?.anchor === GLOBAL_SEMANTIC_PROMPT_ANCHORS.beforeHistory
        ? 'history_before'
        : block?.anchor === GLOBAL_SEMANTIC_PROMPT_ANCHORS.beforeLatestUser
          ? 'before_latest_user'
          : GLOBAL_SEMANTIC_PROMPT_ANCHORS.semanticHeader,
    promptOrder: Math.trunc(Number(firstOrder) || 1200) + index,
    promptSeq: index,
    source: 'global_semantic_prompt',
    preRendered: true,
    globalPromptId: String(block?.id || ''),
    globalPromptName: String(block?.name || ''),
  }));
};
