export const WEB_SEARCH_ROUTES = Object.freeze({
  disabled: 'disabled',
  openrouter: 'openrouter_native',
  gemini: 'gemini_native',
  anthropic: 'anthropic_native',
  toolFallback: 'tool_fallback',
});

const FALLBACK_PROVIDER_NAMES = Object.freeze({
  'web.search': 'web_search',
  'web.research': 'web_research',
  'web.fetch_url': 'web_fetch',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const normalizeUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
};

const fallbackTitleFromUrl = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || url;
  } catch {
    return url;
  }
};

const toSourceCandidate = (source = {}, defaultProvider = '') => {
  const src = isPlainObject(source) ? source : {};
  const citation = isPlainObject(src.url_citation) ? src.url_citation : {};
  const web = isPlainObject(src.web) ? src.web : {};
  const url = normalizeUrl(
    src.url
    || src.uri
    || src.link
    || citation.url
    || citation.uri
    || web.url
    || web.uri,
  );
  if (!url) return null;
  const title = trim(
    src.title
    || src.name
    || citation.title
    || web.title,
    fallbackTitleFromUrl(url),
  ).slice(0, 300);
  const snippet = trim(
    src.snippet
    || src.content
    || src.cited_text
    || src.citedText
    || citation.content,
  ).slice(0, 800);
  const provider = trim(src.provider || src.source, defaultProvider).slice(0, 80);
  return {
    url,
    title,
    ...(snippet ? { snippet } : {}),
    ...(provider ? { provider } : {}),
  };
};

export const normalizeWebSources = (sources = [], {
  provider = '',
  maxSources = 20,
} = {}) => {
  const input = Array.isArray(sources) ? sources : [sources];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    const source = toSourceCandidate(item, provider);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    out.push(source);
    if (out.length >= Math.max(1, Math.trunc(Number(maxSources)) || 20)) break;
  }
  return out;
};

export const mergeWebSources = (...groups) => normalizeWebSources(groups.flatMap(group => (
  Array.isArray(group) ? group : (group ? [group] : [])
)));

export const resolveWebSearchRoute = ({ enabled = false, provider = '' } = {}) => {
  if (enabled !== true) return WEB_SEARCH_ROUTES.disabled;
  const value = trim(provider).toLowerCase();
  if (value === 'openrouter') return WEB_SEARCH_ROUTES.openrouter;
  if (value === 'gemini' || value === 'makersuite' || value === 'vertexai') {
    return WEB_SEARCH_ROUTES.gemini;
  }
  if (value === 'anthropic') return WEB_SEARCH_ROUTES.anthropic;
  return WEB_SEARCH_ROUTES.toolFallback;
};

const collectExistingTools = (existingOptions = []) => {
  const sources = Array.isArray(existingOptions) ? existingOptions : [existingOptions];
  const tools = [];
  const seen = new Set();
  sources.forEach((source) => {
    if (!isPlainObject(source) || !Array.isArray(source.tools)) return;
    source.tools.forEach((tool) => {
      if (!isPlainObject(tool)) return;
      const key = JSON.stringify([
        trim(tool.type),
        trim(tool.name || tool.function?.name),
        Object.keys(tool).sort(),
      ]);
      if (seen.has(key)) return;
      seen.add(key);
      tools.push(clone(tool));
    });
  });
  return tools;
};

const appendUniqueTool = (tools, tool, matcher) => {
  if (!tools.some(existing => matcher(existing))) tools.push(tool);
  return tools;
};

const normalizeFallbackDefinitions = (definitions = []) => {
  const byProviderName = {};
  const tools = [];
  (Array.isArray(definitions) ? definitions : [])
    .filter(definition => isPlainObject(definition))
    .forEach((definition) => {
      const internalName = trim(definition.name);
      const providerName = FALLBACK_PROVIDER_NAMES[internalName];
      if (!providerName || byProviderName[providerName]) return;
      byProviderName[providerName] = internalName;
      tools.push({
        type: 'function',
        function: {
          name: providerName,
          description: trim(definition.description || definition.title, internalName),
          parameters: isPlainObject(definition.schema)
            ? clone(definition.schema)
            : { type: 'object', additionalProperties: false, properties: {} },
        },
      });
    });
  return { tools, byProviderName };
};

const disabledPlan = ({ route = WEB_SEARCH_ROUTES.disabled, reason = 'disabled' } = {}) => ({
  enabled: false,
  route,
  native: false,
  fallback: false,
  requestOptions: {},
  fallbackToolNames: {},
  diagnostics: { enabled: false, route, reason },
});

export const buildWebSearchRequestPlan = ({
  enabled = false,
  provider = '',
  model = '',
  existingOptions = [],
  fallbackToolDefinitions = [],
} = {}) => {
  const route = resolveWebSearchRoute({ enabled, provider });
  if (route === WEB_SEARCH_ROUTES.disabled) return disabledPlan({ route, reason: 'profile switch is disabled' });
  const existingTools = collectExistingTools(existingOptions);

  if (route === WEB_SEARCH_ROUTES.openrouter) {
    const tools = existingTools.slice();
    appendUniqueTool(tools, {
      type: 'openrouter:web_search',
      parameters: {
        max_results: 3,
        max_total_results: 6,
      },
    }, tool => trim(tool?.type) === 'openrouter:web_search');
    // 服务端抓取工具：模型可直接读取用户给出的网址（服务端执行，无需客户端处理）
    appendUniqueTool(tools, {
      type: 'openrouter:web_fetch',
      parameters: {
        max_uses: 2,
        max_content_tokens: 6000,
      },
    }, tool => trim(tool?.type) === 'openrouter:web_fetch');
    return {
      enabled: true,
      route,
      native: true,
      fallback: false,
      requestOptions: { tools, max_tool_calls: 3 },
      fallbackToolNames: {},
      diagnostics: {
        enabled: true,
        route,
        reason: '',
        maxResults: 3,
        maxToolCalls: 3,
      },
    };
  }

  if (route === WEB_SEARCH_ROUTES.gemini) {
    const tools = existingTools.slice();
    // Gemini 3 支持组合工具，但当前客户端的无状态 continuation 尚未完整保留
    // server-side tool invocation id/signature；在该合同补齐前仍须拒绝，不能静默发出坏请求。
    const hasFunctionTools = tools.some(tool => (
      Array.isArray(tool?.functionDeclarations)
      || Array.isArray(tool?.function_declarations)
      || trim(tool?.type) === 'function'
    ));
    if (hasFunctionTools) {
      const isGemini3 = /^gemini-3(?:[.\-]|$)/i.test(trim(model));
      return disabledPlan({
        route,
        reason: isGemini3
          ? 'gemini 3 combined tools require continuation id/signature support that is not available yet'
          : 'gemini native search conflicts with existing function tools for this model',
      });
    }
    const isVertex = trim(provider).toLowerCase() === 'vertexai';
    const nativeTool = isVertex ? { googleSearch: {} } : { google_search: {} };
    appendUniqueTool(
      tools,
      nativeTool,
      tool => isPlainObject(tool?.googleSearch) || isPlainObject(tool?.google_search),
    );
    return {
      enabled: true,
      route,
      native: true,
      fallback: false,
      requestOptions: { tools },
      fallbackToolNames: {},
      diagnostics: { enabled: true, route, reason: '' },
    };
  }

  if (route === WEB_SEARCH_ROUTES.anthropic) {
    const tools = existingTools.slice();
    appendUniqueTool(tools, {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,
    }, tool => trim(tool?.name) === 'web_search' && trim(tool?.type).startsWith('web_search_'));
    return {
      enabled: true,
      route,
      native: true,
      fallback: false,
      requestOptions: { tools },
      fallbackToolNames: {},
      diagnostics: { enabled: true, route, reason: '', maxUses: 3 },
    };
  }

  const fallback = normalizeFallbackDefinitions(fallbackToolDefinitions);
  if (!fallback.tools.length) {
    return disabledPlan({ route, reason: 'web tool runtime is unavailable' });
  }
  const tools = existingTools.slice();
  fallback.tools.forEach(tool => appendUniqueTool(
    tools,
    tool,
    existing => trim(existing?.function?.name) === trim(tool?.function?.name),
  ));
  return {
    enabled: true,
    route,
    native: false,
    fallback: true,
    requestOptions: {
      tools,
      tool_choice: 'auto',
    },
    fallbackToolNames: fallback.byProviderName,
    diagnostics: {
      enabled: true,
      route,
      reason: '',
      internalToolNames: Object.values(fallback.byProviderName),
      maxToolCalls: 2,
      maxContinuationTurns: 1,
    },
  };
};

const visitObjects = (value, visitor, depth = 0, seen = new Set()) => {
  if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    value.forEach(item => visitObjects(item, visitor, depth + 1, seen));
    return;
  }
  Object.values(value).forEach(item => visitObjects(item, visitor, depth + 1, seen));
};

const extractOpenRouterSources = (payload, provider) => {
  const candidates = [];
  visitObjects(payload, (value) => {
    if (!isPlainObject(value)) return;
    if (trim(value.type) === 'url_citation') {
      candidates.push({ ...(isPlainObject(value.url_citation) ? value.url_citation : value), provider });
    }
  });
  return normalizeWebSources(candidates, { provider });
};

const extractGeminiSources = (payload, provider) => {
  const candidates = [];
  const responseCandidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  responseCandidates.forEach((candidate) => {
    const metadata = candidate?.groundingMetadata || candidate?.grounding_metadata || {};
    const chunks = metadata?.groundingChunks || metadata?.grounding_chunks || [];
    (Array.isArray(chunks) ? chunks : []).forEach((chunk) => {
      const web = chunk?.web || chunk?.retrievedContext || chunk?.retrieved_context;
      if (isPlainObject(web)) candidates.push({ ...web, provider });
    });
  });
  return normalizeWebSources(candidates, { provider });
};

const extractAnthropicSources = (payload, provider) => {
  const candidates = [];
  visitObjects(payload, (value) => {
    if (!isPlainObject(value)) return;
    const type = trim(value.type);
    if (type === 'web_search_result' || type === 'web_search_result_location') {
      candidates.push({ ...value, provider });
    }
    const citation = isPlainObject(value.citation) ? value.citation : null;
    if (citation && trim(citation.type) === 'web_search_result_location') {
      candidates.push({ ...citation, provider });
    }
  });
  return normalizeWebSources(candidates, { provider });
};

export const extractProviderWebSources = (payload, { provider = '' } = {}) => {
  if (!payload || typeof payload !== 'object') return [];
  const normalizedProvider = trim(provider).toLowerCase();
  if (normalizedProvider === 'openrouter') return extractOpenRouterSources(payload, normalizedProvider);
  if (normalizedProvider === 'gemini' || normalizedProvider === 'makersuite' || normalizedProvider === 'vertexai') {
    return extractGeminiSources(payload, normalizedProvider);
  }
  if (normalizedProvider === 'anthropic') return extractAnthropicSources(payload, normalizedProvider);
  return normalizeWebSources([], { provider: normalizedProvider });
};

export const extractToolResultWebSources = (output = {}, { provider = '' } = {}) => {
  const source = isPlainObject(output?.result) ? output.result : (isPlainObject(output) ? output : {});
  const groups = [source.sources, source.results, source.documents]
    .filter(Array.isArray)
    .map(items => items.map(item => ({ ...item, provider: trim(provider || source.provider) })));
  // web.fetch_url 单页结果没有列表字段，抓取页本身就是来源
  if (!groups.length && trim(source.url)) {
    groups.push([{ url: source.url, title: source.title, provider: trim(provider || source.provider) }]);
  }
  return mergeWebSources(...groups);
};

export const reportProviderWebSources = (options, payload, { provider = '' } = {}) => {
  const callback = options?.onProviderSources;
  if (typeof callback !== 'function') return [];
  const sources = extractProviderWebSources(payload, { provider });
  if (!sources.length) return sources;
  try {
    callback(sources, { provider: trim(provider) });
  } catch {}
  return sources;
};
