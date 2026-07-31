// 女仆失败分类共享枚举（计划 16.8）。
// run trace、修复循环和 UI 展示统一引用这里，不允许各处手写分类字符串。

export const MAID_FAILURE_CODES = Object.freeze({
  userAborted: 'user_aborted',
  invalidArgs: 'invalid_args',
  targetNotFound: 'target_not_found',
  permissionDenied: 'permission_denied',
  safetyDenied: 'safety_denied',
  writeIntentRequired: 'write_intent_required',
  toolUnavailable: 'tool_unavailable',
  verificationFailed: 'verification_failed',
  modelInvalidDecision: 'model_invalid_decision',
  repeatedToolFailure: 'repeated_tool_failure',
  maxStepsReached: 'max_steps_reached',
  protocolRejected: 'protocol_rejected',
  repairFailed: 'repair_failed',
  blockedByConfig: 'blocked_by_config',
  generationFailed: 'generation_failed',
  unknown: 'unknown',
});

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const TOOL_ERROR_CODE_MAP = Object.freeze({
  user_aborted: MAID_FAILURE_CODES.userAborted,
  agent_tool_args_invalid: MAID_FAILURE_CODES.invalidArgs,
  agent_tool_not_found: MAID_FAILURE_CODES.toolUnavailable,
  agent_tool_denied: MAID_FAILURE_CODES.permissionDenied,
  agent_tool_permission_required: MAID_FAILURE_CODES.permissionDenied,
  agent_tool_permission: MAID_FAILURE_CODES.permissionDenied,
  agent_tool_write_intent_required: MAID_FAILURE_CODES.writeIntentRequired,
  agent_tool_safety: MAID_FAILURE_CODES.safetyDenied,
  agent_tool_safety_required: MAID_FAILURE_CODES.safetyDenied,
  agent_tool_safety_confirmation_required: MAID_FAILURE_CODES.safetyDenied,
  agent_tool_safety_fallback_args_invalid: MAID_FAILURE_CODES.safetyDenied,
  protocol_rejected: MAID_FAILURE_CODES.protocolRejected,
  repair_failed: MAID_FAILURE_CODES.repairFailed,
  blocked_by_config: MAID_FAILURE_CODES.blockedByConfig,
  generation_failed: MAID_FAILURE_CODES.generationFailed,
});

const MODEL_DECISION_REASONS = new Set([
  'invalid_model_plan',
  'invalid_model_react_decision',
  'missing_final_message',
  'invalid_react_action',
  'feature_not_found',
  'tool_not_allowed',
]);

// 按错误码优先、消息模式兜底，分类单个工具步骤的失败。
export const classifyMaidToolFailure = ({
  errorCode = '',
  message = '',
  result = null,
} = {}) => {
  const code = trim(errorCode);
  if (code && TOOL_ERROR_CODE_MAP[code]) return TOOL_ERROR_CODE_MAP[code];
  const resultCode = trim(result?.failureCode || result?.reason);
  if (resultCode && TOOL_ERROR_CODE_MAP[resultCode]) return TOOL_ERROR_CODE_MAP[resultCode];
  if (result && result.skipped === true) return MAID_FAILURE_CODES.safetyDenied;
  if (result?.cancelled === true) return MAID_FAILURE_CODES.userAborted;
  const text = trim(message || result?.reason || result?.message).toLowerCase();
  if (!text) return MAID_FAILURE_CODES.unknown;
  if (/is required|is not allowed|must be|expected |args invalid|参数(错误|无效|缺失)/.test(text)) {
    return MAID_FAILURE_CODES.invalidArgs;
  }
  if (/not found|不存在|找不到|没有找到|no such/.test(text)) {
    return MAID_FAILURE_CODES.targetNotFound;
  }
  if (/permission|denied|权限|拒绝/.test(text)) {
    return MAID_FAILURE_CODES.permissionDenied;
  }
  if (/用户(点击了?)?(中止|停止|取消)|user[_ ](aborted|stopped|declined|cancelled)|aborted by user|stopped by user|generation (stopped|aborted)/.test(text)) {
    return MAID_FAILURE_CODES.userAborted;
  }
  if (/destructive|未确认|危险操作|cancelled by user/.test(text)) {
    return MAID_FAILURE_CODES.safetyDenied;
  }
  if (/tool (not |un)avai|工具(不可用|未注册)/.test(text)) {
    return MAID_FAILURE_CODES.toolUnavailable;
  }
  return MAID_FAILURE_CODES.unknown;
};

// 分类一次女仆 run 的整体失败原因。
export const classifyMaidRunFailure = (result = {}) => {
  if (result?.ok === true) return '';
  const reason = trim(result?.reason);
  if (reason === 'repeated_tool_failure') return MAID_FAILURE_CODES.repeatedToolFailure;
  if (reason === 'max_steps_reached') return MAID_FAILURE_CODES.maxStepsReached;
  if (MODEL_DECISION_REASONS.has(reason)) return MAID_FAILURE_CODES.modelInvalidDecision;
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const lastFailed = [...steps].reverse().find(step => step?.status === 'failed');
  if (lastFailed) {
    if (trim(lastFailed.metadata?.verificationFor)) return MAID_FAILURE_CODES.verificationFailed;
    if (trim(lastFailed.failureCode)) return trim(lastFailed.failureCode);
    return classifyMaidToolFailure({
      message: lastFailed.errorMessage || lastFailed.summary,
      result: lastFailed.output,
    });
  }
  return MAID_FAILURE_CODES.unknown;
};
