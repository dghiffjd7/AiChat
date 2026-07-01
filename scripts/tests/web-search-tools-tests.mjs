import assert from 'node:assert/strict';

import { createWebSearchAgentTools } from '../../src/scripts/agent/tools/web-search-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

{
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(payload);
      return {
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Heading: '测试主题',
          AbstractText: '这是摘要。',
          AbstractURL: 'https://example.com/topic',
          AbstractSource: 'Example',
          RelatedTopics: [
            { Text: '相关结果 - 说明', FirstURL: 'https://example.com/related' },
          ],
        }),
      };
    },
  });
  const search = getTool(tools, 'web.search');
  const result = await search.execute({ query: '测试主题', limit: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'duckduckgo');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].url, 'https://example.com/topic');
  assert.match(requests[0].url, /api\.duckduckgo\.com/);
  assert.match(requests[0].url, /q=/);
  assert.equal(search.capabilities.network, true);
  assert.equal(search.permissions.length, 0);
  console.log('ok - web search tool parses search results without requiring permission gate');
}

{
  const requests = [];
  const tools = createWebSearchAgentTools({
    getSearchConfig: () => ({
      webSearchProvider: 'brave',
      webSearchApiKey: 'brave-key',
      webSearchLocale: 'zh-tw',
    }),
    httpRequest: async (payload) => {
      requests.push(payload);
      return {
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          web: {
            results: [
              { title: 'Brave Result', description: 'Brave snippet', url: 'https://example.com/brave' },
            ],
          },
        }),
      };
    },
  });
  const search = getTool(tools, 'web.search');
  const result = await search.execute({ query: 'provider gateway', limit: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'brave');
  assert.equal(result.results[0].url, 'https://example.com/brave');
  assert.match(requests[0].url, /api\.search\.brave\.com/);
  assert.equal(requests[0].headers['X-Subscription-Token'], 'brave-key');
  console.log('ok - web search tool supports configurable provider gateway');
}

{
  const tools = createWebSearchAgentTools({
    httpRequest: async () => ({
      ok: true,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><head><title>页面标题</title><style>.x{}</style></head><body><h1>标题</h1><script>bad()</script><p>正文 &amp; 更多</p></body></html>',
    }),
  });
  const fetchUrl = getTool(tools, 'web.fetch_url');
  const result = await fetchUrl.execute({ url: 'https://example.com/page', maxTextLength: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.title, '页面标题');
  assert.match(result.text, /标题/);
  assert.match(result.text, /正文 & 更多/);
  assert.doesNotMatch(result.text, /bad/);
  console.log('ok - web fetch tool extracts readable page text');
}

{
  const tools = createWebSearchAgentTools();
  const fetchUrl = getTool(tools, 'web.fetch_url');
  const result = await fetchUrl.execute({ url: 'file:///tmp/a.txt' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported_url');
  console.log('ok - web fetch tool rejects non-http urls');
}

{
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(payload);
      if (String(payload.url).includes('api.duckduckgo.com')) {
        return {
          ok: true,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            Results: [
              { Text: 'Result A', FirstURL: 'https://example.com/a' },
              { Text: 'Result B', FirstURL: 'https://example.com/b' },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Fetched</title></head><body><main>Readable source text</main></body></html>',
      };
    },
  });
  const research = getTool(tools, 'web.research');
  const result = await research.execute({ query: 'research topic', limit: 2, fetchTop: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].title, 'Fetched');
  assert.match(result.documents[0].text, /Readable source text/);
  assert.equal(requests.length, 2);
  console.log('ok - web research tool searches and fetches readable source text');
}

{
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(payload);
      return {
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Results: [
            { Text: 'Result A', FirstURL: 'https://example.com/a' },
          ],
        }),
      };
    },
  });
  const research = getTool(tools, 'web.research');
  const result = await research.execute({ query: 'search only', limit: 1, fetchTop: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.documents.length, 0);
  assert.equal(requests.length, 1);
  console.log('ok - web research tool preserves fetchTop zero as search-only');
}
