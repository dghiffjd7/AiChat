const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

// 女仆消息质量工具（格式修复 §4.2 + 正文优化机制层）。
// 实际执行由 app.js 注入：repairMessageFormat（guardian 修复候选）/ optimizeMessage
// （优化模型产出替换文本）；两者都经行级 diff 确认后写回。
// 用户在 diff 弹窗取消时返回 ok:true + applied:false，模型不得重试。
export const createChatFormatRepairTools = ({
  repairMessageFormat = null,
  optimizeMessage = null,
  formatProfileStore = null,
  resolveSessionId = null,
} = {}) => {
  const resolveSid = (args = {}) => {
    if (typeof resolveSessionId === 'function') {
      return trim(resolveSessionId({
        sessionId: trim(args.sessionId),
        sessionName: trim(args.sessionName || args.target),
      }));
    }
    return trim(args.sessionId);
  };
  return [
  {
    name: 'chat.save_format_profile',
    title: 'Save session format profile',
    description: 'Cache the custom format spec found for a session (from regex/worldbook/persona investigation) so future repairs use it automatically.',
    source: 'maid-chat-format',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: false,
      network: false,
      cost: 'none',
      undo: 'manual',
      modelContext: 'allowlist',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      required: ['guide'],
      additionalProperties: false,
      properties: {
        guide: { type: 'string', minLength: 8, maxLength: 6000 },
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', maxLength: 40 },
              ref: { type: 'string', maxLength: 160 },
            },
          },
        },
      },
    },
    execute: async (args = {}) => {
      if (!formatProfileStore || typeof formatProfileStore.set !== 'function') {
        return { ok: false, reason: 'format_profile_store_unavailable' };
      }
      const sid = resolveSid(args);
      if (!sid) return { ok: false, reason: 'session_not_found', message: '没有找到目标会话。' };
      const saved = formatProfileStore.set(sid, {
        guide: trim(args.guide),
        sources: Array.isArray(args.sources) ? args.sources : [],
      });
      if (!saved) return { ok: false, reason: 'format_profile_invalid', message: '格式规范内容为空或无效。' };
      return {
        ok: true,
        sessionId: saved.sessionId,
        guidePreview: saved.guide.slice(0, 120),
        sourceCount: saved.sources.length,
        message: `已保存「${saved.sessionId}」的格式画像，之后修复该会话格式时会自动使用。`,
      };
    },
    summarizeResult: result => (result?.ok === false
      ? `format profile save failed: ${trim(result?.reason, 'unknown')}`
      : `format profile saved for ${trim(result?.sessionId)}`),
  },
  {
    name: 'chat.read_format_profile',
    title: 'Read session format profile',
    description: 'Read the cached custom format spec of a session; check this before investigating regex/worldbook for format definitions.',
    source: 'maid-chat-format',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: false,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'allowlist',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
      },
    },
    execute: async (args = {}) => {
      if (!formatProfileStore || typeof formatProfileStore.get !== 'function') {
        return { ok: false, reason: 'format_profile_store_unavailable' };
      }
      const sid = resolveSid(args);
      if (!sid) return { ok: false, reason: 'session_not_found', message: '没有找到目标会话。' };
      const profile = formatProfileStore.get(sid);
      return {
        ok: true,
        sessionId: sid,
        hasProfile: Boolean(profile),
        profile: profile || null,
        message: profile ? '已读取该会话的格式画像。' : '该会话还没有保存过格式画像。',
      };
    },
    summarizeResult: result => (result?.ok === false
      ? `format profile read failed: ${trim(result?.reason, 'unknown')}`
      : `format profile ${result?.hasProfile ? 'found' : 'absent'} for ${trim(result?.sessionId)}`),
  },
  {
    name: 'chat.optimize_message',
    title: 'Optimize assistant message text',
    description: 'Rewrite an assistant reply per the user instruction (polish, dedupe, adjust style); the user confirms a line diff before anything is written back.',
    source: 'maid-chat-format',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'variable',
      undo: 'manual',
      modelContext: 'allowlist',
      confirmation: 'required',
    },
    safety: {
      operationType: 'write',
      destructive: false,
      description: '写回前必须经用户在行级 diff 弹窗确认；取消即不写入。',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        messageId: { type: 'string', maxLength: 120 },
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        instruction: { type: 'string', maxLength: 2000 },
      },
    },
    execute: async (args = {}) => {
      if (typeof optimizeMessage !== 'function') {
        return { ok: false, reason: 'body_optimize_unavailable' };
      }
      return optimizeMessage({
        messageId: trim(args.messageId),
        sessionId: trim(args.sessionId),
        sessionName: trim(args.sessionName || args.target),
        instruction: trim(args.instruction),
        source: 'maid',
      });
    },
    summarizeResult: (result) => {
      if (result?.ok === false) return `body optimize failed: ${trim(result?.reason, 'unknown')}`;
      if (result?.applied === true) return `body optimize applied (+${Number(result?.added || 0)}/-${Number(result?.removed || 0)})`;
      if (result?.userDecision === 'cancelled') return 'body optimize cancelled by user in diff preview';
      return trim(result?.message, 'body optimize finished without changes');
    },
  },
  {
    name: 'chat.repair_message_format',
    title: 'Repair assistant message format',
    description: 'Repair a format-broken assistant reply via the format guardian; the user confirms a line diff before anything is written back.',
    source: 'maid-chat-format',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'variable',
      undo: 'manual',
      modelContext: 'allowlist',
      confirmation: 'required',
    },
    safety: {
      operationType: 'write',
      destructive: false,
      description: '写回前必须经用户在行级 diff 弹窗确认；取消即不写入。',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        messageId: { type: 'string', maxLength: 120 },
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        formatHint: { type: 'string', maxLength: 4000 },
      },
    },
    execute: async (args = {}) => {
      if (typeof repairMessageFormat !== 'function') {
        return { ok: false, reason: 'format_repair_unavailable' };
      }
      return repairMessageFormat({
        messageId: trim(args.messageId),
        sessionId: trim(args.sessionId),
        sessionName: trim(args.sessionName || args.target),
        formatHint: trim(args.formatHint),
        source: 'maid',
      });
    },
    summarizeResult: (result) => {
      if (result?.ok === false) return `format repair failed: ${trim(result?.reason, 'unknown')}`;
      if (result?.applied === true) return `format repair applied (+${Number(result?.added || 0)}/-${Number(result?.removed || 0)})`;
      if (result?.userDecision === 'cancelled') return 'format repair cancelled by user in diff preview';
      return trim(result?.message, 'format repair finished without changes');
    },
  },
  ];
};

export const registerChatFormatRepairTools = (registry, deps = {}) => {
  const tools = createChatFormatRepairTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
