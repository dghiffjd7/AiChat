export const PHONE_FORMAT_PROMPT_DEFAULT_POSITION = 'history_before';
export const PHONE_FORMAT_PROMPT_DEFAULT_DEPTH = 1;
export const PHONE_FORMAT_PROMPT_MAX_DEPTH = 100;

export const PHONE_FORMAT_PROMPT_POSITIONS = Object.freeze([
  'after_persona',
  'system_end',
  'history_before',
  'history_depth',
]);

const POSITION_SET = new Set(PHONE_FORMAT_PROMPT_POSITIONS);

export const normalizePhoneFormatPromptPosition = (value) => {
  const token = String(value || '').trim().toLowerCase();
  return POSITION_SET.has(token) ? token : PHONE_FORMAT_PROMPT_DEFAULT_POSITION;
};

export const normalizePhoneFormatPromptDepth = (value) => {
  // null/''/纯空白等「字段存在但为空」与缺字段同样落默认值，避免导入档把 depth 静默归零
  if (value === null || value === undefined || String(value).trim() === '') {
    return PHONE_FORMAT_PROMPT_DEFAULT_DEPTH;
  }
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return PHONE_FORMAT_PROMPT_DEFAULT_DEPTH;
  return Math.max(0, Math.min(PHONE_FORMAT_PROMPT_MAX_DEPTH, numeric));
};
