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
