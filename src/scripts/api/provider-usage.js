// Phase B 真实计量：把 provider 返回的 usage 经 out-of-band 回调交给调用方，
// 不改各 provider 的 chat/streamChat 返回契约（仍返回文本/流）。
// usage 缺失时上报 token 为 null（调用方据此标 unknown，绝不估算）。
const toNullableTokenCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

export const resolveProviderPromptTokens = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = toNullableTokenCount(usage.prompt_tokens);
  if (promptTokens !== null) return promptTokens;
  const inputTokens = toNullableTokenCount(usage.input_tokens);
  if (inputTokens === null) return null;
  const hasAnthropicCacheShape = (
    Object.prototype.hasOwnProperty.call(usage, 'cache_read_input_tokens')
    || Object.prototype.hasOwnProperty.call(usage, 'cache_creation_input_tokens')
  );
  if (!hasAnthropicCacheShape) return inputTokens;
  const cacheRead = toNullableTokenCount(usage.cache_read_input_tokens) || 0;
  const cacheCreation = toNullableTokenCount(usage.cache_creation_input_tokens) || 0;
  return inputTokens + cacheRead + cacheCreation;
};

export const reportProviderUsage = (options, meta) => {
  const cb = options?.onProviderUsage;
  if (typeof cb !== 'function') return;
  const { body, model, provider, finishReason } = (meta && typeof meta === 'object') ? meta : {};
  const usage = body?.usage && typeof body.usage === 'object' ? body.usage : null;
  try {
    cb({
      provider: String(provider || ''),
      model: String(model || ''),
      finishReason: String(finishReason || ''),
      promptTokens: resolveProviderPromptTokens(usage),
      completionTokens: usage ? toNullableTokenCount(usage.completion_tokens ?? usage.output_tokens) : null,
      totalTokens: usage ? toNullableTokenCount(usage.total_tokens) : null,
    });
  } catch {}
};
