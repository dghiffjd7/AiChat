// Phase B 真实计量：把 provider 返回的 usage 经 out-of-band 回调交给调用方，
// 不改各 provider 的 chat/streamChat 返回契约（仍返回文本/流）。
// usage 缺失时上报 token 为 null（调用方据此标 unknown，绝不估算）。
const toNullableTokenCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
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
      promptTokens: usage ? toNullableTokenCount(usage.prompt_tokens ?? usage.input_tokens) : null,
      completionTokens: usage ? toNullableTokenCount(usage.completion_tokens ?? usage.output_tokens) : null,
      totalTokens: usage ? toNullableTokenCount(usage.total_tokens) : null,
    });
  } catch {}
};
