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

export const createWebSearchAgentTools = ({
  httpRequest = requestWithFetch,
} = {}) => {
  const request = typeof httpRequest === 'function' ? httpRequest : requestWithFetch;
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
        },
      },
      execute: async (args = {}) => {
        const query = trim(args.query);
        const limit = Math.max(1, Math.min(10, Math.trunc(Number(args.limit || 0)) || 5));
        const locale = trim(args.locale, 'zh-tw');
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
        let data = {};
        try {
          data = JSON.parse(body);
        } catch (error) {
          return {
            ok: false,
            query,
            reason: 'invalid_search_response',
            message: error?.message || 'search response parse failed',
          };
        }
        const results = normalizeSearchResults(data, limit);
        return {
          ok: results.length > 0,
          query,
          provider: 'duckduckgo',
          results: clone(results),
          message: results.length ? '' : '没有找到可用的网页搜索结果。',
        };
      },
      summarizeResult: result => result?.ok === false
        ? `web search failed: ${trim(result?.reason || result?.message, 'no_results')}`
        : `web search results=${Number(result?.results?.length || 0)} query=${trim(result?.query, '-')}`,
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
        const url = trim(args.url);
        if (!/^https?:\/\//i.test(url)) {
          return { ok: false, url, reason: 'unsupported_url', message: '只支持 http/https 网页。' };
        }
        const body = await readHttpText(request, {
          url,
          method: 'GET',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
            'user-agent': 'Mozilla/5.0 ChatApp Maid Assistant',
          },
          body: null,
          timeoutMs: 12000,
        });
        const maxTextLength = Math.max(500, Math.min(12000, Math.trunc(Number(args.maxTextLength || 0)) || 5000));
        return {
          ok: true,
          url,
          title: extractTitle(body),
          text: stripHtml(body, maxTextLength),
        };
      },
      summarizeResult: result => result?.ok === false
        ? `web fetch failed: ${trim(result?.reason, 'failed')}`
        : `web fetch ${trim(result?.title || result?.url, 'page')}`,
    },
  ];
};

export const registerWebSearchAgentTools = (registry, deps = {}) => {
  const tools = createWebSearchAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
