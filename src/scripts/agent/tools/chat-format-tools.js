const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

// 女仆格式修复工具（格式修复触发与自定义格式计划 §4.2）。
// 实际修复由 app.js 注入的 repairMessageFormat 执行：guardian 手动检查 + 强制模型复核
// （formatHint 作为 customFormatGuide 拼入修复 prompt）→ 修复候选 → 行级 diff 确认 → 写回。
// 用户在 diff 弹窗取消时返回 ok:true + applied:false，模型不得重试。
export const createChatFormatRepairTools = ({
  repairMessageFormat = null,
} = {}) => [
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
