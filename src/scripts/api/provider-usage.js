// Phase B 真实计量：把 provider 返回的 usage 经 out-of-band 回调交给调用方，
// 不改各 provider 的 chat/streamChat 返回契约（仍返回文本/流）。
// usage 缺失时上报 token 为 null（调用方据此标 unknown，绝不估算）。
const toNullableTokenCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

// §9.6-⑥ 按字段形态判别，两种形态处理方向相反：
// - 有 prompt_tokens_details（OpenAI 形态）→ prompt_tokens 已含 cached，直接用；再求和=重复计数、系数被推高。
// - 有 cache_read/cache_creation_input_tokens（Anthropic 形态，含经中转改名后基数叫 prompt_tokens 的混合形态）
//   → 基数不含 cache，必须求和；否则系数被压低、预算越用越松。
export const resolveProviderPromptTokens = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = toNullableTokenCount(usage.prompt_tokens);
  const inputTokens = toNullableTokenCount(usage.input_tokens);
  const base = promptTokens !== null ? promptTokens : inputTokens;
  if (base === null) return null;
  const hasOpenAiDetailShape = Boolean(
    usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object',
  );
  if (promptTokens !== null && hasOpenAiDetailShape) return promptTokens;
  const hasAnthropicCacheShape = (
    Object.prototype.hasOwnProperty.call(usage, 'cache_read_input_tokens')
    || Object.prototype.hasOwnProperty.call(usage, 'cache_creation_input_tokens')
  );
  if (!hasAnthropicCacheShape) return base;
  const cacheRead = toNullableTokenCount(usage.cache_read_input_tokens) || 0;
  const cacheCreation = toNullableTokenCount(usage.cache_creation_input_tokens) || 0;
  return base + cacheRead + cacheCreation;
};

export const reportProviderUsage = (options, meta) => {
  const cb = options?.onProviderUsage;
  if (typeof cb !== 'function') return;
  const { body, model, provider, finishReason } = (meta && typeof meta === 'object') ? meta : {};
  const usage = body?.usage && typeof body.usage === 'object' ? body.usage : null;
  try {
    const normalized = {
      provider: String(provider || ''),
      model: String(model || ''),
      finishReason: String(finishReason || ''),
      promptTokens: resolveProviderPromptTokens(usage),
      completionTokens: usage ? toNullableTokenCount(usage.completion_tokens ?? usage.output_tokens) : null,
      totalTokens: usage ? toNullableTokenCount(usage.total_tokens) : null,
    };
    const systemFingerprint = String(
      body?.system_fingerprint
      ?? body?.systemFingerprint
      ?? body?.response_metadata?.system_fingerprint
      ?? '',
    ).trim();
    if (systemFingerprint) normalized.systemFingerprint = systemFingerprint;
    cb(normalized);
  } catch {}
};
