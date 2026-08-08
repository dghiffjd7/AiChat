import assert from 'node:assert/strict';

import {
  WEB_SEARCH_ROUTES,
  buildWebSearchRequestPlan,
  extractProviderWebSources,
  extractToolResultWebSources,
  mergeWebSources,
  normalizeWebSources,
  resolveWebSearchRoute,
} from '../../src/scripts/api/web-search-runtime.js';

assert.equal(resolveWebSearchRoute({ enabled: false, provider: 'openrouter' }), WEB_SEARCH_ROUTES.disabled);
assert.equal(resolveWebSearchRoute({ enabled: true, provider: 'openrouter' }), WEB_SEARCH_ROUTES.openrouter);
assert.equal(resolveWebSearchRoute({ enabled: true, provider: 'makersuite' }), WEB_SEARCH_ROUTES.gemini);
assert.equal(resolveWebSearchRoute({ enabled: true, provider: 'vertexai' }), WEB_SEARCH_ROUTES.gemini);
assert.equal(resolveWebSearchRoute({ enabled: true, provider: 'anthropic' }), WEB_SEARCH_ROUTES.anthropic);
assert.equal(resolveWebSearchRoute({ enabled: true, provider: 'deepseek' }), WEB_SEARCH_ROUTES.toolFallback);
console.log('ok - web search route stays disabled by default and selects native providers first');

{
  const plan = buildWebSearchRequestPlan({
    enabled: true,
    provider: 'openrouter',
    existingOptions: [{
      tools: [{ type: 'function', function: { name: 'existing', parameters: { type: 'object' } } }],
    }],
  });
  assert.equal(plan.enabled, true);
  assert.equal(plan.native, true);
  assert.equal(plan.requestOptions.tools.length, 3);
  assert.equal(plan.requestOptions.tools[1].type, 'openrouter:web_search');
  assert.deepEqual(plan.requestOptions.tools[1].parameters, { max_results: 3, max_total_results: 6 });
  assert.equal(plan.requestOptions.tools[2].type, 'openrouter:web_fetch');
  assert.deepEqual(plan.requestOptions.tools[2].parameters, { max_uses: 2, max_content_tokens: 6000 });
  assert.equal(plan.requestOptions.max_tool_calls, 3);
}

{
  const aiStudio = buildWebSearchRequestPlan({ enabled: true, provider: 'makersuite' });
  const vertex = buildWebSearchRequestPlan({ enabled: true, provider: 'vertexai' });
  assert.deepEqual(aiStudio.requestOptions.tools, [{ google_search: {} }]);
  assert.deepEqual(vertex.requestOptions.tools, [{ googleSearch: {} }]);
}

{
  // Gemini 原生搜索与既有 function 工具混用会被拒绝：存在 functionDeclarations 时放弃搜索
  const conflicted = buildWebSearchRequestPlan({
    enabled: true,
    provider: 'gemini',
    existingOptions: [{ tools: [{ functionDeclarations: [{ name: 'existing' }] }] }],
  });
  assert.equal(conflicted.enabled, false);
  assert.equal(conflicted.route, 'gemini_native');
  assert.match(conflicted.diagnostics.reason, /function tools/);

  const gemini3 = buildWebSearchRequestPlan({
    enabled: true,
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    existingOptions: [{ tools: [{ functionDeclarations: [{ name: 'existing' }] }] }],
  });
  assert.equal(gemini3.enabled, false);
  assert.match(gemini3.diagnostics.reason, /id\/signature support/);
}

{
  const plan = buildWebSearchRequestPlan({ enabled: true, provider: 'anthropic' });
  assert.deepEqual(plan.requestOptions.tools, [{
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 3,
  }]);
}

{
  const definitions = [
    { name: 'web.search', description: 'Search', schema: { type: 'object', required: ['query'] } },
    { name: 'web.research', description: 'Research', schema: { type: 'object', required: ['query'] } },
    { name: 'web.fetch_url', description: 'Fetch page', schema: { type: 'object', required: ['url'] } },
  ];
  const plan = buildWebSearchRequestPlan({
    enabled: true,
    provider: 'deepseek',
    fallbackToolDefinitions: definitions,
  });
  assert.equal(plan.fallback, true);
  assert.equal(plan.requestOptions.tool_choice, 'auto');
  assert.deepEqual(plan.requestOptions.tools.map(item => item.function.name), ['web_search', 'web_research', 'web_fetch']);
  assert.deepEqual(plan.fallbackToolNames, {
    web_search: 'web.search',
    web_research: 'web.research',
    web_fetch: 'web.fetch_url',
  });
}
console.log('ok - web search request plans preserve existing tools and use current provider-native schemas');

{
  const normalized = normalizeWebSources([
    { url: 'https://example.com/a#section', title: 'Example A', snippet: 'one', provider: 'x' },
    { uri: 'https://example.com/a', title: 'duplicate' },
    { url: 'javascript:alert(1)', title: 'bad' },
    { link: 'https://example.org/b', name: 'Example B' },
  ]);
  assert.deepEqual(normalized, [
    { url: 'https://example.com/a', title: 'Example A', snippet: 'one', provider: 'x' },
    { url: 'https://example.org/b', title: 'Example B' },
  ]);
  assert.equal(mergeWebSources(normalized, [{ url: 'https://example.net/c', title: 'C' }]).length, 3);
}

{
  const openrouter = extractProviderWebSources({
    choices: [{
      message: {
        annotations: [{
          type: 'url_citation',
          url_citation: { url: 'https://or.example/a', title: 'OR source', content: 'excerpt' },
        }],
      },
    }],
  }, { provider: 'openrouter' });
  assert.deepEqual(openrouter, [{
    url: 'https://or.example/a',
    title: 'OR source',
    snippet: 'excerpt',
    provider: 'openrouter',
  }]);

  const gemini = extractProviderWebSources({
    candidates: [{
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://gemini.example/a', title: 'Gemini source' } }],
      },
    }],
  }, { provider: 'makersuite' });
  assert.deepEqual(gemini, [{
    url: 'https://gemini.example/a',
    title: 'Gemini source',
    provider: 'makersuite',
  }]);

  const anthropic = extractProviderWebSources({
    content: [
      {
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', url: 'https://claude.example/a', title: 'Claude source' }],
      },
      {
        type: 'text',
        text: 'answer',
        citations: [{
          type: 'web_search_result_location',
          url: 'https://claude.example/a',
          title: 'Claude source',
          cited_text: 'cited',
        }],
      },
    ],
  }, { provider: 'anthropic' });
  assert.deepEqual(anthropic, [{
    url: 'https://claude.example/a',
    title: 'Claude source',
    provider: 'anthropic',
  }]);
}
console.log('ok - provider citation payloads normalize into one safe source contract');

{
  // web.fetch_url 单页结果：抓取页本身作为来源
  const fetched = extractToolResultWebSources({
    result: { ok: true, url: 'https://page.example/doc', title: 'Doc', text: 'body text' },
  }, { provider: 'web.fetch_url' });
  assert.deepEqual(fetched, [{
    url: 'https://page.example/doc',
    title: 'Doc',
    provider: 'web.fetch_url',
  }]);
}
console.log('ok - fetched single pages surface as their own source');
