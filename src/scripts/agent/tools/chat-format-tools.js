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
} = {}) => [
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

export const registerChatFormatRepairTools = (registry, deps = {}) => {
  const tools = createChatFormatRepairTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
