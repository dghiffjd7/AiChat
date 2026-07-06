const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const truncate = (value = '', max = 4000) => {
  const text = trim(value);
  const limit = Math.max(200, Math.trunc(Number(max || 0)) || 4000);
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
};

const normalizeProviderName = (value = '', fallback = 'duckduckgo') => {
  const raw = trim(value, fallback).toLowerCase().replace(/[\s-]+/g, '_');
  if (['ddg', 'duckduckgo', 'duckduckgo_instant'].includes(raw)) return 'duckduckgo';
  if (['brave', 'brave_search'].includes(raw)) return 'brave';
  if (['tavily'].includes(raw)) return 'tavily';
  if (['serpapi', 'serp_api'].includes(raw)) return 'serpapi';
  if (['bing', 'bing_search'].includes(raw)) return 'bing';
  return fallback;
};

const stripHtml = (html = '', max = 6000) => {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(text, max);
};

const extractTitle = (html = '') => {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return trim(stripHtml(match?.[1] || '', 300));
};

const requestWithFetch = async ({ url, method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) => {
  if (typeof fetch !== 'function') throw new Error('fetch unavailable');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller?.signal,
    });
    const outHeaders = {};
    response.headers?.forEach?.((value, key) => {
      outHeaders[key] = value;
    });
    return {
      status: response.status,
      ok: response.ok,
      headers: outHeaders,
      body: await response.text(),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const readHttpText = async (request, payload = {}) => {
  const response = await request(payload);
  const status = Number(response?.status || 0) || 0;
  if (response?.ok === false || (status && (status < 200 || status >= 300))) {
    throw new Error(`HTTP ${status || 'request failed'}`);
  }
  return String(response?.body || '');
};

const parseJsonBody = (body = '') => {
  try {
    return JSON.parse(String(body || ''));
  } catch (error) {
    const err = new Error(error?.message || 'invalid json response');
    err.code = 'invalid_json_response';
    throw err;
  }
};

const parseDuckDuckGoTopics = (topics = [], out = []) => {
  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    if (Array.isArray(topic?.Topics)) {
      parseDuckDuckGoTopics(topic.Topics, out);
      return;
    }
    const title = trim(topic?.Text || topic?.Result || '');
    const url = trim(topic?.FirstURL || topic?.FirstUrl || '');
    if (!title || !url) return;
    out.push({
      title: title.split(' - ')[0] || title,
      snippet: title,
      url,
      source: 'duckduckgo',
    });
  });
  return out;
};

const normalizeSearchResults = (data = {}, limit = 5) => {
  const max = Math.max(1, Math.min(10, Math.trunc(Number(limit || 0)) || 5));
  const results = [];
  if (trim(data?.AbstractText) && trim(data?.AbstractURL)) {
    results.push({
      title: trim(data?.Heading, 'Instant Answer'),
      snippet: trim(data.AbstractText),
      url: trim(data.AbstractURL),
      source: trim(data?.AbstractSource, 'duckduckgo'),
    });
  }
  (Array.isArray(data?.Results) ? data.Results : []).forEach((item) => {
    const title = trim(item?.Text || item?.Result || '');
    const url = trim(item?.FirstURL || item?.FirstUrl || '');
    if (title && url) {
      results.push({
        title: title.split(' - ')[0] || title,
        snippet: title,
        url,
        source: 'duckduckgo',
      });
    }
  });
  parseDuckDuckGoTopics(data?.RelatedTopics, results);
  const seen = new Set();
  return results
    .filter((item) => {
      const key = trim(item.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
};

const normalizeGenericResults = (items = [], {
  limit = 5,
  provider = '',
  map = item => item,
} = {}) => {
  const max = Math.max(1, Math.min(10, Math.trunc(Number(limit || 0)) || 5));
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(map)
    .map(item => ({
      title: truncate(item?.title || item?.name || item?.url || '', 220),
      snippet: truncate(item?.snippet || item?.description || item?.content || '', 900),
      url: trim(item?.url || item?.link),
      source: trim(item?.source || provider),
    }))
    .filter((item) => {
      const key = trim(item.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
};

const getSearchConfigValue = (config = {}, keys = [], fallback = '') => {
  for (const key of keys) {
    const value = trim(config?.[key]);
    if (value) return value;
  }
  return fallback;
};

const resolveSearchConfig = ({
  args = {},
  baseConfig = {},
  searchProvider = 'duckduckgo',
  apiKey = '',
} = {}) => {
  const provider = normalizeProviderName(
    args.provider ||
    baseConfig.webSearchProvider ||
    baseConfig.provider ||
    searchProvider,
    'duckduckgo',
  );
  const key = getSearchConfigValue(baseConfig, [
    'webSearchApiKey',
    `${provider}ApiKey`,
    `${provider}SearchApiKey`,
    provider === 'brave' ? 'braveSearchApiKey' : '',
    provider === 'tavily' ? 'tavilyApiKey' : '',
    provider === 'serpapi' ? 'serpApiKey' : '',
    provider === 'bing' ? 'bingSearchApiKey' : '',
  ].filter(Boolean), apiKey);
  return {
    provider,
    apiKey: key,
    locale: trim(args.locale || baseConfig.webSearchLocale || baseConfig.locale, 'zh-tw'),
    endpoint: trim(baseConfig.webSearchEndpoint || baseConfig.endpoint),
  };
};

const requireApiKey = (provider, apiKey) => {
  if (trim(apiKey)) return null;
  return {
    ok: false,
    provider,
    reason: 'missing_api_key',
    message: `${provider} 搜索需要先配置 API key。`,
    results: [],
  };
};

// DDG HTML 版全文搜索（服务端渲染，免 key）：Instant Answer 空结果时的回落。
// 链接是 /l/?uddg=<编码URL> 重定向格式，需解码。
const decodeDuckDuckGoRedirect = (href = '') => {
  const raw = trim(href);
  const match = raw.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return '';
    }
  }
  return /^https?:\/\//i.test(raw) ? raw : '';
};

const parseDuckDuckGoHtmlResults = (html = '', limit = 5) => {
  const out = [];
  const source = String(html || '');
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>)?/g;
  let match = pattern.exec(source);
  while (match && out.length < Math.max(1, Math.min(10, limit))) {
    const url = decodeDuckDuckGoRedirect(match[1]);
    const title = trim(stripHtml(match[2] || '', 220));
    const snippet = trim(stripHtml(match[3] || '', 500));
    if (url && title && !out.some(item => item.url === url)) {
      out.push({ title, snippet: snippet || title, url, source: 'duckduckgo_html' });
    }
    match = pattern.exec(source);
  }
  return out;
};

const performDuckDuckGoHtmlSearch = async (request, { query = '', limit = 5 } = {}) => {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: null,
    timeoutMs: 15000,
  });
  return parseDuckDuckGoHtmlResults(body, limit);
};

const performDuckDuckGoSearch = async (request, { query = '', limit = 5, locale = 'zh-tw' } = {}) => {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');
  url.searchParams.set('kl', locale);
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
    body: null,
    timeoutMs: 12000,
  });
  const results = normalizeSearchResults(parseJsonBody(body), limit);
  if (results.length) return results;
  // Instant Answer 是知识卡 API，实体/长尾查询常为空；回落 HTML 版全文搜索。
  try {
    return await performDuckDuckGoHtmlSearch(request, { query, limit });
  } catch {
    return results;
  }
};

// Bing 图片搜索（免 key，服务端渲染）：解析 iusc 元素 m 属性里的 JSON（murl=原图）。
const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'");

const parseBingImageResults = (html = '', limit = 6) => {
  const out = [];
  const source = String(html || '');
  const pattern = /class="iusc"[^>]*\bm="([^"]+)"/g;
  const max = Math.max(1, Math.min(12, Math.trunc(Number(limit || 0)) || 6));
  let match = pattern.exec(source);
  while (match && out.length < max) {
    try {
      const meta = JSON.parse(decodeHtmlEntities(match[1]));
      const imageUrl = trim(meta?.murl);
      if (/^https?:\/\//i.test(imageUrl) && !out.some(item => item.imageUrl === imageUrl)) {
        out.push({
          title: truncate(meta?.t || '', 160),
          imageUrl,
          thumbnailUrl: trim(meta?.turl),
          width: 0,
          height: 0,
          sourceUrl: trim(meta?.purl),
        });
      }
    } catch {}
    match = pattern.exec(source);
  }
  return out;
};

const performBingImageSearch = async (request, { query = '', limit = 6 } = {}) => {
  const url = new URL('https://www.bing.com/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('form', 'HDRSC2');
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
    body: null,
    timeoutMs: 20000,
  });
  const images = parseBingImageResults(body, limit);
  // 高频请求会触发 Bing 限流降级（返回非搜索结果页，iusc 里是无关推荐内容）。
  // 正常结果页 <title> 含查询词；不含则标记降级，避免把无关图当结果用。
  const pageTitle = String(body.match(/<title>([^<]*)/)?.[1] || '');
  const queryHead = trim(query).split(/\s+/)[0] || '';
  const degraded = images.length > 0 && queryHead
    && !pageTitle.toLowerCase().includes(queryHead.toLowerCase());
  return {
    ok: images.length > 0 && !degraded,
    images: degraded ? [] : images,
    provider: 'bing_images',
    ...(degraded ? {
      degraded: true,
      message: '图片搜索服务疑似限流降级（返回了与查询无关的页面），请稍后再试或换用其他方式获取图片。',
    } : {}),
  };
};

// DDG 图片搜索（免 key）：先取 vqd token，再调 i.js 拿图片 JSON。
const extractDuckDuckGoVqd = (html = '') => {
  const source = String(html || '');
  const match = source.match(/vqd=["']?([\d-]+)["']?/) || source.match(/vqd=([\d-]+)&/);
  return trim(match?.[1] || '');
};

const performDuckDuckGoImageSearch = async (request, { query = '', limit = 6 } = {}) => {
  const tokenUrl = new URL('https://duckduckgo.com/');
  tokenUrl.searchParams.set('q', query);
  tokenUrl.searchParams.set('iax', 'images');
  tokenUrl.searchParams.set('ia', 'images');
  const tokenHtml = await readHttpText(request, {
    url: tokenUrl.toString(),
    method: 'GET',
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: null,
    timeoutMs: 15000,
  });
  const vqd = extractDuckDuckGoVqd(tokenHtml);
  if (!vqd) {
    return { ok: false, reason: 'image_search_token_missing', message: '图片搜索初始化失败（vqd token 未获取）。', images: [] };
  }
  const searchUrl = new URL('https://duckduckgo.com/i.js');
  searchUrl.searchParams.set('l', 'us-en');
  searchUrl.searchParams.set('o', 'json');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('vqd', vqd);
  const body = await readHttpText(request, {
    url: searchUrl.toString(),
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      referer: 'https://duckduckgo.com/',
    },
    body: null,
    timeoutMs: 15000,
  });
  const data = parseJsonBody(body);
  const max = Math.max(1, Math.min(12, Math.trunc(Number(limit || 0)) || 6));
  const images = (Array.isArray(data?.results) ? data.results : [])
    .map(item => ({
      title: truncate(item?.title || '', 160),
      imageUrl: trim(item?.image),
      thumbnailUrl: trim(item?.thumbnail),
      width: Number(item?.width || 0) || 0,
      height: Number(item?.height || 0) || 0,
      sourceUrl: trim(item?.url),
    }))
    .filter(item => /^https?:\/\//i.test(item.imageUrl))
    .slice(0, max);
  return { ok: images.length > 0, images, provider: 'duckduckgo_images' };
};

const performBraveSearch = async (request, { query = '', limit = 5, locale = 'zh-tw', apiKey = '' } = {}) => {
  const missing = requireApiKey('brave', apiKey);
  if (missing) return missing;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.max(1, Math.min(10, limit))));
  if (locale) url.searchParams.set('search_lang', locale.split('-')[0] || locale);
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    body: null,
    timeoutMs: 12000,
  });
  const data = parseJsonBody(body);
  return normalizeGenericResults(data?.web?.results || [], {
    limit,
    provider: 'brave',
    map: item => ({
      title: item?.title,
      snippet: item?.description,
      url: item?.url,
      source: 'brave',
    }),
  });
};

const performTavilySearch = async (request, { query = '', limit = 5, apiKey = '' } = {}) => {
  const missing = requireApiKey('tavily', apiKey);
  if (missing) return missing;
  const body = await readHttpText(request, {
    url: 'https://api.tavily.com/search',
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: Math.max(1, Math.min(10, limit)),
      include_answer: false,
    }),
    timeoutMs: 15000,
  });
  const data = parseJsonBody(body);
  return normalizeGenericResults(data?.results || [], {
    limit,
    provider: 'tavily',
    map: item => ({
      title: item?.title,
      snippet: item?.content,
      url: item?.url,
      source: 'tavily',
    }),
  });
};

const performSerpApiSearch = async (request, { query = '', limit = 5, apiKey = '', locale = 'zh-tw' } = {}) => {
  const missing = requireApiKey('serpapi', apiKey);
  if (missing) return missing;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('num', String(Math.max(1, Math.min(10, limit))));
  if (locale) url.searchParams.set('hl', locale.split('-')[0] || locale);
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: { accept: 'application/json' },
    body: null,
    timeoutMs: 12000,
  });
  const data = parseJsonBody(body);
  return normalizeGenericResults(data?.organic_results || [], {
    limit,
    provider: 'serpapi',
    map: item => ({
      title: item?.title,
      snippet: item?.snippet,
      url: item?.link,
      source: item?.source || 'serpapi',
    }),
  });
};

const performBingSearch = async (request, { query = '', limit = 5, apiKey = '', locale = 'zh-tw' } = {}) => {
  const missing = requireApiKey('bing', apiKey);
  if (missing) return missing;
  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.max(1, Math.min(10, limit))));
  if (locale) url.searchParams.set('mkt', locale);
  const body = await readHttpText(request, {
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    body: null,
    timeoutMs: 12000,
  });
  const data = parseJsonBody(body);
  return normalizeGenericResults(data?.webPages?.value || [], {
    limit,
    provider: 'bing',
    map: item => ({
      title: item?.name,
      snippet: item?.snippet,
      url: item?.url,
      source: 'bing',
    }),
  });
};

const performSearch = async (request, {
  provider = 'duckduckgo',
  query = '',
  limit = 5,
  locale = 'zh-tw',
  apiKey = '',
} = {}) => {
  if (provider === 'brave') return performBraveSearch(request, { query, limit, locale, apiKey });
  if (provider === 'tavily') return performTavilySearch(request, { query, limit, apiKey });
  if (provider === 'serpapi') return performSerpApiSearch(request, { query, limit, locale, apiKey });
  if (provider === 'bing') return performBingSearch(request, { query, limit, locale, apiKey });
  return performDuckDuckGoSearch(request, { query, limit, locale });
};

const normalizeSearchOutput = ({ query = '', provider = '', results = [] } = {}) => {
  if (results?.ok === false) {
    return {
      ...results,
      query,
      provider: trim(results.provider, provider),
    };
  }
  const listResults = Array.isArray(results) ? results : [];
  return {
    ok: listResults.length > 0,
    query,
    provider,
    results: clone(listResults),
    sources: listResults.map(item => ({
      title: trim(item.title || item.url),
      url: trim(item.url),
      source: trim(item.source, provider),
    })),
    message: listResults.length ? '' : '没有找到可用的网页搜索结果。',
  };
};

const fetchReadableUrl = async (request, {
  url = '',
  maxTextLength = 5000,
} = {}) => {
  const target = trim(url);
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, url: target, reason: 'unsupported_url', message: '只支持 http/https 网页。' };
  }
  const body = await readHttpText(request, {
    url: target,
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      'user-agent': 'Mozilla/5.0 ChatApp Maid Assistant',
    },
    body: null,
    timeoutMs: 12000,
  });
  const max = Math.max(500, Math.min(12000, Math.trunc(Number(maxTextLength || 0)) || 5000));
  return {
    ok: true,
    url: target,
    title: extractTitle(body),
    text: stripHtml(body, max),
  };
};

export const createWebSearchAgentTools = ({
  httpRequest = requestWithFetch,
  getSearchConfig = null,
  searchProvider = 'duckduckgo',
  apiKey = '',
} = {}) => {
  const request = typeof httpRequest === 'function' ? httpRequest : requestWithFetch;
  const readConfig = () => {
    try {
      return typeof getSearchConfig === 'function' ? (getSearchConfig() || {}) : {};
    } catch {
      return {};
    }
  };
  return [
    {
      name: 'web.search',
      title: 'Search the web',
      description: 'Search public web information when the user asks for current or external facts. Do not use it for private APP data.',
      source: 'maid-web',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: true,
        cost: 'variable',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['query'],
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 240 },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
          locale: { type: 'string', maxLength: 20 },
          provider: { type: 'string', maxLength: 40 },
        },
      },
      execute: async (args = {}) => {
        const query = trim(args.query);
        const limit = Math.max(1, Math.min(10, Math.trunc(Number(args.limit || 0)) || 5));
        const config = resolveSearchConfig({
          args,
          baseConfig: readConfig(),
          searchProvider,
          apiKey,
        });
        try {
          const results = await performSearch(request, {
            ...config,
            query,
            limit,
          });
          return normalizeSearchOutput({
            query,
            provider: config.provider,
            results,
          });
        } catch (error) {
          return {
            ok: false,
            query,
            provider: config.provider,
            reason: error?.code || 'search_request_failed',
            message: error?.message || '搜索请求失败。',
            results: [],
          };
        }
      },
      summarizeResult: result => result?.ok === false
        ? `web search failed: ${trim(result?.reason || result?.message, 'no_results')}`
        : `web search results=${Number(result?.results?.length || 0)} query=${trim(result?.query, '-')}`,
    },
    {
      name: 'web.search_images',
      title: 'Search web images',
      description: 'Search public web images (e.g. avatars, wallpapers) and return image URLs. Follow with media.fetch_image to download one.',
      source: 'maid-web',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: true,
        cost: 'variable',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['query'],
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 240 },
          limit: { type: 'integer', minimum: 1, maximum: 12 },
        },
      },
      execute: async (args = {}) => {
        const query = trim(args.query);
        const limit = Math.max(1, Math.min(12, Math.trunc(Number(args.limit || 0)) || 6));
        // Bing HTML 优先（免 key 且稳定）；失败或空结果回落 DDG i.js。
        let result = null;
        try {
          result = await performBingImageSearch(request, { query, limit });
        } catch {
          result = { ok: false, images: [] };
        }
        if (!result?.ok) {
          try {
            result = await performDuckDuckGoImageSearch(request, { query, limit });
          } catch (error) {
            return {
              ok: false,
              query,
              provider: 'bing_images+duckduckgo_images',
              reason: error?.code || 'image_search_failed',
              message: error?.message || '图片搜索请求失败。',
              images: [],
            };
          }
        }
        return {
          ok: result.ok !== false && (result.images || []).length > 0,
          query,
          provider: result.provider || 'bing_images',
          ...(result.reason ? { reason: result.reason, message: result.message } : {}),
          images: result.images || [],
        };
      },
      summarizeResult: result => result?.ok === false
        ? `image search failed: ${trim(result?.reason || result?.message, 'no_results')}`
        : `image search results=${Number(result?.images?.length || 0)} query=${trim(result?.query, '-')}`,
    },
    {
      name: 'web.fetch_url',
      title: 'Fetch web page',
      description: 'Fetch and extract readable text from a public URL returned by search or provided by the user.',
      source: 'maid-web',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: true,
        cost: 'variable',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['url'],
        additionalProperties: false,
        properties: {
          url: { type: 'string', minLength: 8, maxLength: 1000 },
          maxTextLength: { type: 'integer', minimum: 500, maximum: 12000 },
        },
      },
      execute: async (args = {}) => {
        const maxTextLength = Math.max(500, Math.min(12000, Math.trunc(Number(args.maxTextLength || 0)) || 5000));
        return fetchReadableUrl(request, {
          url: args.url,
          maxTextLength,
        });
      },
      summarizeResult: result => result?.ok === false
        ? `web fetch failed: ${trim(result?.reason, 'failed')}`
        : `web fetch ${trim(result?.title || result?.url, 'page')}`,
    },
    {
      name: 'web.research',
      title: 'Search and read web sources',
      description: 'Search public web information and fetch readable text from top results in one controlled tool call. Use it for current public facts that need citations.',
      source: 'maid-web',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: true,
        cost: 'variable',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['query'],
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 240 },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
          fetchTop: { type: 'integer', minimum: 0, maximum: 5 },
          locale: { type: 'string', maxLength: 20 },
          provider: { type: 'string', maxLength: 40 },
          maxTextLength: { type: 'integer', minimum: 500, maximum: 12000 },
        },
      },
      execute: async (args = {}) => {
        const query = trim(args.query);
        const limit = Math.max(1, Math.min(10, Math.trunc(Number(args.limit || 0)) || 5));
        const hasFetchTop = Object.prototype.hasOwnProperty.call(args, 'fetchTop');
        const rawFetchTop = hasFetchTop ? Number(args.fetchTop) : NaN;
        const fetchTop = hasFetchTop && Number.isFinite(rawFetchTop)
          ? Math.max(0, Math.min(5, Math.trunc(rawFetchTop)))
          : 2;
        const maxTextLength = Math.max(500, Math.min(12000, Math.trunc(Number(args.maxTextLength || 0)) || 4000));
        const config = resolveSearchConfig({
          args,
          baseConfig: readConfig(),
          searchProvider,
          apiKey,
        });
        const search = await (async () => {
          try {
            const results = await performSearch(request, {
              ...config,
              query,
              limit,
            });
            return normalizeSearchOutput({ query, provider: config.provider, results });
          } catch (error) {
            return {
              ok: false,
              query,
              provider: config.provider,
              reason: error?.code || 'search_request_failed',
              message: error?.message || '搜索请求失败。',
              results: [],
            };
          }
        })();
        const documents = [];
        if (search.ok && fetchTop > 0) {
          for (const result of search.results.slice(0, fetchTop)) {
            try {
              const document = await fetchReadableUrl(request, {
                url: result.url,
                maxTextLength,
              });
              documents.push({
                ok: document.ok,
                title: trim(document.title || result.title),
                url: result.url,
                source: trim(result.source, config.provider),
                text: trim(document.text),
                reason: trim(document.reason),
              });
            } catch (error) {
              documents.push({
                ok: false,
                title: trim(result.title),
                url: result.url,
                source: trim(result.source, config.provider),
                reason: error?.message || 'fetch_failed',
                text: '',
              });
            }
          }
        }
        return {
          ...search,
          documents,
          sources: search.sources || search.results?.map(item => ({
            title: trim(item.title || item.url),
            url: trim(item.url),
            source: trim(item.source, config.provider),
          })) || [],
        };
      },
      summarizeResult: result => result?.ok === false
        ? `web research failed: ${trim(result?.reason || result?.message, 'no_results')}`
        : `web research results=${Number(result?.results?.length || 0)} documents=${Number(result?.documents?.length || 0)} query=${trim(result?.query, '-')}`,
    },
  ];
};

export const registerWebSearchAgentTools = (registry, deps = {}) => {
  const tools = createWebSearchAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
