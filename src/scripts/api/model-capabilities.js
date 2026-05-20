const REASONING_EFFORT_OPTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: 'minimal', label: '极低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'max', label: '最大' },
]);

const OPENAI_GPT51_REASONING_OPTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]);

const OPENAI_GPT5_PRO_REASONING_OPTIONS = Object.freeze([
  { value: 'high', label: '高' },
]);

const GEMINI_LEVEL_REASONING_OPTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'high', label: '高' },
]);

const GEMINI_OPENAI_REASONING_OPTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: 'minimal', label: '极低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]);

const DEEPSEEK_REASONING_OPTIONS = Object.freeze([
  { value: 'high', label: '高' },
  { value: 'max', label: '最大' },
]);

const KNOWN_REASONING_EFFORTS = new Set(
  REASONING_EFFORT_OPTIONS.map((item) => item.value),
);

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const normalizeReasoningEffort = (value, fallback = 'high') => {
  const next = normalizeText(value);
  if (KNOWN_REASONING_EFFORTS.has(next)) return next;
  return KNOWN_REASONING_EFFORTS.has(fallback) ? fallback : 'high';
};

const isOpenAIReasoningModel = (model) => {
  const m = normalizeText(model);
  if (!m) return false;
  return (
    m.startsWith('gpt-5') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4')
  );
};

const isDeepSeekModel = (model) => normalizeText(model).startsWith('deepseek');
const isGeminiModel = (model) => normalizeText(model).includes('gemini');

const isAnthropicThinkingModel = (model) => {
  const m = normalizeText(model);
  if (!m) return false;
  return (
    m.includes('claude-3-7-sonnet') ||
    m.includes('claude-sonnet-4') ||
    m.includes('claude-opus-4')
  );
};

const isGeminiBudgetModel = (model) => normalizeText(model).includes('gemini-2.5');
const isGeminiLevelModel = (model) => normalizeText(model).includes('gemini-3');

const isGpt51Family = (model) => normalizeText(model).startsWith('gpt-5.1');
const isGpt5ProFamily = (model) => normalizeText(model).startsWith('gpt-5-pro');

const isOfficialGeminiOpenAIBaseUrl = (baseUrl) => {
  try {
    const url = new URL(String(baseUrl || '').trim());
    return (
      url.hostname === 'generativelanguage.googleapis.com' &&
      url.pathname.split('/').filter(Boolean).includes('openai')
    );
  } catch (_e) {
    return false;
  }
};

const budgetFromEffort = ({ effort, maxOutputTokens }) => {
  const safeMax = Number.isFinite(Number(maxOutputTokens))
    ? Math.max(1024, Math.trunc(Number(maxOutputTokens)))
    : 8192;
  const normalized = normalizeReasoningEffort(effort, 'high');
  if (normalized === 'auto') return null;
  if (normalized === 'minimal') return 1024;
  if (normalized === 'low') return Math.max(1024, Math.trunc(safeMax * 0.1));
  if (normalized === 'medium') return Math.max(1024, Math.trunc(safeMax * 0.25));
  if (normalized === 'high') return Math.max(1024, Math.trunc(safeMax * 0.5));
  if (normalized === 'xhigh') return Math.max(1024, Math.trunc(safeMax * 0.95));
  return Math.max(1024, Math.trunc(safeMax * 0.5));
};

const geminiLevelFromEffort = (effort) => {
  const normalized = normalizeReasoningEffort(effort, 'high');
  if (normalized === 'auto') return null;
  if (normalized === 'high' || normalized === 'xhigh') return 'high';
  return 'low';
};

const deepSeekEffortFromSetting = (effort) => {
  const normalized = normalizeReasoningEffort(effort, 'high');
  if (normalized === 'max') return 'max';
  return 'high';
};

const openAIReasoningEffortFromSetting = ({ model, effort }) => {
  const normalized = normalizeReasoningEffort(effort, 'high');
  if (normalized === 'auto') return null;
  if (isGpt5ProFamily(model)) return 'high';
  if (isGpt51Family(model)) {
    if (normalized === 'minimal' || normalized === 'xhigh') return 'high';
    return normalized;
  }
  return normalized;
};

const geminiOpenAIReasoningEffortFromSetting = (effort) => {
  const normalized = normalizeReasoningEffort(effort, 'high');
  if (normalized === 'auto') return null;
  if (normalized === 'minimal') return 'minimal';
  if (normalized === 'low') return 'low';
  if (normalized === 'medium') return 'medium';
  return 'high';
};

export const getReasoningCapability = ({ provider, model, baseUrl } = {}) => {
  const p = normalizeText(provider);
  const m = normalizeText(model);

  if (p === 'anthropic' && isAnthropicThinkingModel(m)) {
    return {
      supported: true,
      strategy: 'anthropic-budget',
      requestControl: true,
      effortControl: true,
      effortOptions: REASONING_EFFORT_OPTIONS,
      hint: '会从最大输出中划出一部分给推理预算：极低 1024，低 10%，中 25%，高 50%，极高 95%，最低 1024；自动则不额外请求推理。',
    };
  }

  if ((p === 'gemini' || p === 'makersuite' || p === 'vertexai') && isGeminiBudgetModel(m)) {
    return {
      supported: true,
      strategy: 'gemini-budget',
      requestControl: true,
      effortControl: true,
      effortOptions: REASONING_EFFORT_OPTIONS,
      hint: 'Gemini 2.5 使用 thinkingBudget；极低 1024，低 10%，中 25%，高 50%，极高 95%，自动则不额外请求推理预算。',
    };
  }

  if ((p === 'gemini' || p === 'makersuite' || p === 'vertexai') && isGeminiLevelModel(m)) {
    return {
      supported: true,
      strategy: 'gemini-level',
      requestControl: true,
      effortControl: true,
      effortOptions: GEMINI_LEVEL_REASONING_OPTIONS,
      hint: 'Gemini 3 使用 thinkingLevel，目前只支持低 / 高两档。',
    };
  }

  if (p === 'deepseek' && isDeepSeekModel(m)) {
    return {
      supported: true,
      strategy: 'deepseek-thinking',
      requestControl: true,
      effortControl: true,
      effortOptions: DEEPSEEK_REASONING_OPTIONS,
      hint: 'DeepSeek 推理强度：高（默认）/ 最大；low/medium 会被映射为 high。思考模式下 temperature 等采样参数会被忽略。',
    };
  }

  if (p === 'openai' && isOpenAIReasoningModel(m)) {
    return {
      supported: true,
      strategy: 'openai-effort',
      requestControl: true,
      effortControl: true,
      effortOptions: isGpt5ProFamily(m)
        ? OPENAI_GPT5_PRO_REASONING_OPTIONS
        : isGpt51Family(m)
          ? OPENAI_GPT51_REASONING_OPTIONS
          : REASONING_EFFORT_OPTIONS,
      hint: 'OpenAI 推理模型会映射到 reasoning_effort。',
    };
  }

  if (p === 'custom') {
    if (isDeepSeekModel(m)) {
      return {
        supported: true,
        strategy: 'deepseek-thinking',
        requestControl: true,
        effortControl: true,
        effortOptions: DEEPSEEK_REASONING_OPTIONS,
        hint: 'DeepSeek 推理强度：高（默认）/ 最大；思考模式下 temperature 等采样参数会被忽略。',
      };
    }
    if (isGeminiModel(m) && isOfficialGeminiOpenAIBaseUrl(baseUrl)) {
      return {
        supported: true,
        strategy: 'gemini-openai-effort',
        requestControl: true,
        effortControl: true,
        effortOptions: GEMINI_OPENAI_REASONING_OPTIONS,
        hint: '自定义 Gemini OpenAI 兼容端点按 reasoning_effort 发送；不要同时发送 thinkingLevel/thinkingBudget。',
      };
    }
    if (isOpenAIReasoningModel(m)) {
      return {
        supported: true,
        strategy: 'openai-effort',
        requestControl: true,
        effortControl: true,
        effortOptions: isGpt5ProFamily(m)
          ? OPENAI_GPT5_PRO_REASONING_OPTIONS
          : isGpt51Family(m)
            ? OPENAI_GPT51_REASONING_OPTIONS
            : REASONING_EFFORT_OPTIONS,
        hint: '自定义 OpenAI 兼容端点当前按 reasoning_effort 发送。',
      };
    }
  }

  return {
    supported: false,
    strategy: 'none',
    requestControl: false,
    effortControl: false,
    effortOptions: [],
    hint: '',
  };
};

export const buildReasoningRequestOptions = ({
  provider,
  model,
  baseUrl,
  requestReasoning,
  reasoningEffort,
  maxOutputTokens,
} = {}) => {
  const capability = getReasoningCapability({ provider, model, baseUrl });
  if (!capability.supported || requestReasoning !== true) return {};

  switch (capability.strategy) {
    case 'openai-effort': {
      const effort = openAIReasoningEffortFromSetting({ model, effort: reasoningEffort });
      return effort ? { reasoning_effort: effort } : {};
    }
    case 'gemini-openai-effort': {
      const effort = geminiOpenAIReasoningEffortFromSetting(reasoningEffort);
      return effort ? { reasoning_effort: effort } : {};
    }
    case 'anthropic-budget': {
      const budget = budgetFromEffort({ effort: reasoningEffort, maxOutputTokens });
      return budget ? { thinking: { type: 'enabled', budget_tokens: budget } } : {};
    }
    case 'gemini-budget': {
      const budget = budgetFromEffort({ effort: reasoningEffort, maxOutputTokens });
      return budget ? { thinkingBudget: budget } : {};
    }
    case 'gemini-level': {
      const thinkingLevel = geminiLevelFromEffort(reasoningEffort);
      return thinkingLevel ? { thinkingLevel } : {};
    }
    case 'deepseek-thinking': {
      const dsEffort = deepSeekEffortFromSetting(reasoningEffort);
      return { thinking: { type: 'enabled' }, reasoning_effort: dsEffort };
    }
    default:
      return {};
  }
};

export const getReasoningSamplerPolicy = ({
  provider,
  model,
  baseUrl,
  requestReasoning,
} = {}) => {
  const p = normalizeText(provider);
  const capability = getReasoningCapability({ provider, model, baseUrl });
  const openAIRestrictedSampling = p === 'openai' && capability.strategy === 'openai-effort';
  const active = (capability.supported && requestReasoning === true) || openAIRestrictedSampling;
  const disabledFields = new Set();

  if (!active) {
    return { active: false, disabledFields: [] };
  }

  // ST-style, provider-aware rules:
  // - Claude extended thinking is not compatible with temperature/top_k modifications,
  //   and top_p is constrained to a narrow range, so we disable these controls together.
  // - OpenAI reasoning models are treated as managed reasoning requests and hide classic
  //   sampling controls while reasoning is requested.
  // - Google thinking models keep their sampling controls.
  // - DeepSeek thinking mode ignores temperature/top_p/presence_penalty/frequency_penalty.
  if (capability.strategy === 'anthropic-budget' || capability.strategy === 'openai-effort' || capability.strategy === 'deepseek-thinking') {
    disabledFields.add('temperature');
    disabledFields.add('top_p');
    disabledFields.add('top_k');
  }
  if (openAIRestrictedSampling) {
    disabledFields.add('presence_penalty');
    disabledFields.add('frequency_penalty');
    disabledFields.add('seed');
    disabledFields.add('n');
  }

  return {
    active: disabledFields.size > 0,
    disabledFields: Array.from(disabledFields),
  };
};
