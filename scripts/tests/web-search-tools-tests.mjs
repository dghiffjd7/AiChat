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
  const result = await research.execute({
    query: 'research topic',
    target: 'Readable source',
    targetAliases: ['Fetched'],
    limit: 2,
    fetchTop: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].title, 'Fetched');
  assert.match(result.documents[0].text, /Readable source text/);
  assert.equal(result.targetCheck.checked, true);
  assert.equal(result.targetCheck.relevantSourceCount, 1);
  assert.equal(result.sources[0].targetRelevant, true);
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

{
  const { createWebSearchAgentTools } = await import('../../src/scripts/agent/tools/web-search-tools.js');
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      requests.push(url);
      if (url.includes('api.duckduckgo.com')) {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify({ AbstractText: '', RelatedTopics: [] }) };
      }
      if (url.includes('html.duckduckgo.com')) {
        return {
          status: 200, ok: true, headers: {},
          body: '<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Ftifa">Tifa Lockhart</a><a class="result__snippet" href="#">FF7 heroine profile</a>',
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await tools.find(t => t.name === 'web.search').execute({ query: 'Tifa Lockhart' });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].url, 'https://example.com/tifa');
  assert.equal(result.results[0].source, 'duckduckgo_html');
  assert.ok(requests.some(u => u.includes('html.duckduckgo.com')), 'Instant Answer 空结果应回落 HTML 版');
  console.log('ok - web.search 在 Instant Answer 空结果时回落 DDG HTML 版');
}

{
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      requests.push(url);
      if (url.includes('api.duckduckgo.com')) {
        return {
          status: 200,
          ok: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ AbstractText: '', RelatedTopics: [], Results: [] }),
        };
      }
      if (url.includes('html.duckduckgo.com')) {
        return {
          status: 202,
          ok: true,
          headers: { 'content-type': 'text/html' },
          body: '<html><title>DuckDuckGo</title><body>anomaly challenge</body></html>',
        };
      }
      if (url.includes('www.bing.com/search')) {
        return {
          status: 200,
          ok: true,
          headers: { 'content-type': 'text/xml' },
          body: '<?xml version="1.0"?><rss><channel><item><title>WebView2 debugging</title><link>https://learn.microsoft.com/webview2/debug</link><description>Remote debugging port &amp; DevTools.</description></item><item><title>CDP guide</title><link>https://example.com/cdp</link><description><![CDATA[Second <b>source</b>.]]></description></item></channel></rss>',
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await getTool(tools, 'web.search').execute({
    query: 'WebView2 remote debugging port',
    limit: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'bing_rss');
  assert.equal(result.requestedProvider, 'duckduckgo');
  assert.deepEqual(result.attemptedProviders, [
    'duckduckgo_instant',
    'duckduckgo_html',
    'bing_rss',
  ]);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].url, 'https://learn.microsoft.com/webview2/debug');
  assert.equal(result.results[0].snippet, 'Remote debugging port & DevTools.');
  assert.equal(result.results[1].snippet, 'Second source.');
  assert.ok(requests.some(url => url.includes('www.bing.com/search') && url.includes('format=rss')));
  console.log('ok - DDG challenge/空结果时回落免 key Bing RSS');
}

{
  const { createWebSearchAgentTools } = await import('../../src/scripts/agent/tools/web-search-tools.js');
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      if (url.includes('bing.com/images/search')) {
        const meta = JSON.stringify({ murl: 'https://img.example.com/tifa-bing.jpg', turl: 'https://img.example.com/t.jpg', t: 'Tifa art', purl: 'https://page.example.com' }).replace(/"/g, '&quot;');
        return { status: 200, ok: true, headers: {}, body: `<title>Tifa Lockhart avatar - Search Images</title><a class="iusc" m="${meta}"></a>` };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await tools.find(t => t.name === 'web.search_images').execute({ query: 'Tifa Lockhart avatar' });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'bing_images');
  assert.equal(result.images[0].imageUrl, 'https://img.example.com/tifa-bing.jpg');
  console.log('ok - web.search_images 优先 Bing HTML 解析 murl');
}

{
  // Bing 限流降级：页面 title 与查询无关时判定降级，不把无关图当结果
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      if (url.includes('bing.com/images/search')) {
        const meta = JSON.stringify({ murl: 'https://img.example.com/junk.jpg', t: '物理化学文章' }).replace(/"/g, '&quot;');
        return { status: 200, ok: true, headers: {}, body: `<title>Bing</title><a class="iusc" m="${meta}"></a>` };
      }
      if (url.includes('duckduckgo.com')) {
        return { status: 403, ok: false, headers: {}, body: '' };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await tools.find(t => t.name === 'web.search_images').execute({ query: 'Tifa Lockhart avatar' });
  assert.equal(result.ok, false, '降级页应判失败');
  assert.equal((result.images || []).length, 0, '降级时不返回无关图');
  console.log('ok - Bing 限流降级检测（title 与查询无关）');
}

{
  const { createWebSearchAgentTools } = await import('../../src/scripts/agent/tools/web-search-tools.js');
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      if (url.includes('bing.com')) throw new Error('HTTP 403');
      if (url.includes('duckduckgo.com/i.js')) {
        assert.ok(url.includes('vqd=123-456'), 'i.js 请求应带 vqd');
        return {
          status: 200, ok: true, headers: {},
          body: JSON.stringify({ results: [
            { title: 'Tifa art', image: 'https://img.example.com/tifa.jpg', thumbnail: 'https://img.example.com/t.jpg', width: 800, height: 1200, url: 'https://page.example.com' },
            { title: 'bad', image: 'not-a-url' },
          ] }),
        };
      }
      if (url.includes('duckduckgo.com/?q=')) {
        return { status: 200, ok: true, headers: {}, body: 'window.vqd="123-456";' };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await tools.find(t => t.name === 'web.search_images').execute({ query: 'Tifa Lockhart avatar' });
  assert.equal(result.ok, true);
  assert.equal(result.images.length, 1, '非法 imageUrl 应被过滤');
  assert.equal(result.images[0].imageUrl, 'https://img.example.com/tifa.jpg');
  assert.equal(result.images[0].width, 800);
  console.log('ok - web.search_images Bing 失败时回落 DDG vqd 流程并过滤非法 URL');
}

{
  // 多源网关：动漫头像走 Safebooru；壁纸走 Wallhaven；photo 走 Openverse；全空回落 Bing
  const calls = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      calls.push(new URL(url).hostname);
      if (url.includes('safebooru.org')) {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify([
          { id: 1, directory: 'aa/bb', image: 'rem.jpg', tags: 'rem_(re:zero) blue_hair', width: 800, height: 1200 },
        ]) };
      }
      if (url.includes('wallhaven.cc')) {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify({ data: [
          { id: 'w1', path: 'https://w.wallhaven.cc/full/x1.jpg', thumbs: { small: 'https://th.wallhaven.cc/small/x1.jpg' }, resolution: '2560x1440', dimension_x: 2560, dimension_y: 1440, url: 'https://wallhaven.cc/w/x1' },
        ] }) };
      }
      if (url.includes('api.openverse.org')) {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify({ results: [
          { title: 'Mountain', url: 'https://img.example.com/mt.jpg', thumbnail: 'https://img.example.com/mt_t.jpg', width: 2000, height: 1200, foreign_landing_url: 'https://example.com/mt' },
        ] }) };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const searchImages = tools.find(t => t.name === 'web.search_images');

  const anime = await searchImages.execute({ query: 'Rem ReZero', tags: 'rem_(re:zero)', style: 'anime', purpose: 'avatar' });
  assert.equal(anime.provider, 'safebooru');
  assert.match(anime.images[0].imageUrl, /safebooru\.org\/images\/aa\/bb\/rem\.jpg/);

  const wallpaper = await searchImages.execute({ query: 'Rem ReZero', purpose: 'wallpaper' });
  assert.equal(wallpaper.provider, 'wallhaven');
  assert.equal(wallpaper.images[0].width, 2560);

  const photo = await searchImages.execute({ query: 'mountain sunrise', style: 'photo' });
  assert.equal(photo.provider, 'openverse');
  console.log('ok - 多源图搜网关按 purpose/style 路由（safebooru/wallhaven/openverse）');
}

{
  // 专用源全空/失败时回落 Bing
  const tools = createWebSearchAgentTools({
    httpRequest: async ({ url }) => {
      if (url.includes('safebooru.org') || url.includes('danbooru.donmai.us') || url.includes('api.openverse.org')) {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify([]) };
      }
      if (url.includes('bing.com/images/search')) {
        const meta = JSON.stringify({ murl: 'https://img.example.com/fallback.jpg', t: 'Rem fallback art' }).replace(/"/g, '&quot;');
        return { status: 200, ok: true, headers: {}, body: `<title>Rem - Search Images</title><a class="iusc" m="${meta}"></a>` };
      }
      throw new Error(`unexpected url ${url}`);
    },
    getSearchConfig: () => ({}),
  });
  const result = await tools.find(t => t.name === 'web.search_images').execute({ query: 'Rem obscure pose' });
  assert.equal(result.provider, 'bing_images');
  assert.ok(result.attemptedProviders.includes('safebooru'), '应记录尝试链');
  console.log('ok - 专用源无结果时回落 Bing 并记录尝试链');
}

{
  // 2026-07-17 搜图 403 排查回归：逗号/顿号 tags 归一化为 booru 空格分隔；
  // 失败信息按源逐个汇报，不把个别源的 403 汇总成"全部 403"
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(payload);
      const url = String(payload.url || '');
      if (url.includes('safebooru.org')) {
        return { ok: true, status: 200, headers: {}, body: '[]' }; // 无结果
      }
      if (url.includes('danbooru.donmai.us')) {
        return { ok: false, status: 403, headers: {}, body: 'blocked' }; // IP 级 403
      }
      return { ok: false, status: 403, headers: {}, body: '' };
    },
  });
  const searchImages = getTool(tools, 'web.search_images');
  const result = await searchImages.execute({
    query: 'ojou-sama tsundere anime girl',
    tags: 'OJOU-SAMA, BLONDE、TwinTails，Large Breasts',
    style: 'anime',
    limit: 6,
  });

  const sbUrl = decodeURIComponent(String(requests.find(r => String(r.url).includes('safebooru'))?.url || ''));
  assert.match(sbUrl, /tags=ojou-sama\+blonde\+twintails\+large_breasts\+sort:score:desc/, '逗号/顿号/中文逗号分隔与词内空格全部归一化');
  assert.doesNotMatch(sbUrl, /,|，|、/, '发出的 booru 请求不含任何逗号');

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.providerOutcomes) && result.providerOutcomes.length >= 2, '按源汇报结果');
  assert.match(result.message, /safebooru:无结果/, '主源空结果如实呈现');
  assert.match(result.message, /danbooru:HTTP 403/, '次源 403 单独标注');
  assert.match(result.message, /blonde_hair twintails 1girl/, '失败信息附标签格式示例供模型自我修正');
  console.log('ok - 图搜网关 booru 标签归一化与按源失败汇报');
}

{
  // query 回退：自然词组拆成独立 tag（整句转单 tag 必然无结果）
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(payload);
      return { ok: true, status: 200, headers: {}, body: '[]' };
    },
  });
  const searchImages = getTool(tools, 'web.search_images');
  await searchImages.execute({ query: 'Anime Rich Girl', style: 'anime', limit: 4 });
  const sbUrl = decodeURIComponent(String(requests.find(r => String(r.url).includes('safebooru'))?.url || ''));
  assert.match(sbUrl, /tags=anime\+rich\+girl\+sort:score:desc/, 'query 回退按词拆 tag 且小写化');
  console.log('ok - 图搜 query 回退拆词');
}

{
  const safebooruRequests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      const url = String(payload.url || '');
      if (!url.includes('safebooru.org')) throw new Error(`unexpected url ${url}`);
      safebooruRequests.push(payload);
      if (safebooruRequests.length === 1) throw new Error('temporary network failure');
      return {
        ok: true,
        status: 200,
        headers: {},
        body: JSON.stringify([
          { id: 7, directory: 'aa/bb', image: 'retry.jpg', tags: 'tag_one tag_two', width: 640, height: 960 },
        ]),
      };
    },
  });
  const result = await getTool(tools, 'web.search_images').execute({
    query: 'fallback query',
    tags: 'TAG ONE, TAG TWO, TAG THREE',
    style: 'anime',
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'safebooru');
  assert.equal(safebooruRequests.length, 2, '瞬时网络错误后应继续尝试较宽松标签');
  assert.match(decodeURIComponent(safebooruRequests[1].url), /tags=tag_one\+tag_two\+sort:score:desc/);
  console.log('ok - Safebooru 瞬时网络错误继续逐级降级');
}

{
  // 仅 tags：booru 用 tags，通用图源用 tags 还原的自然词组当 query
  const requests = [];
  const tools = createWebSearchAgentTools({
    httpRequest: async (payload) => {
      requests.push(String(payload.url || ''));
      return {
        ok: true,
        status: 200,
        headers: {},
        body: JSON.stringify([
          { id: 3, directory: 'cc/dd', image: 'tags-only.jpg', tags: 'blonde_hair 1girl', width: 640, height: 960 },
        ]),
      };
    },
  });
  const result = await getTool(tools, 'web.search_images').execute({
    query: '   ',
    tags: 'BLONDE_HAIR, 1girl',
    style: 'anime',
  });
  assert.equal(result.ok, true, '空白 query + 有效 tags 应可正常搜索');
  assert.equal(result.provider, 'safebooru');
  assert.equal(result.query, 'blonde hair 1girl', '通用图源 query 应由 tags 还原为自然词组');
  assert.match(decodeURIComponent(requests[0]), /tags=blonde_hair\+1girl\+sort:score:desc/);
  console.log('ok - 图搜仅 tags 时正常走 booru 并还原 query');
}

{
  let requestCount = 0;
  const tools = createWebSearchAgentTools({
    httpRequest: async () => {
      requestCount += 1;
      return { ok: true, status: 200, headers: {}, body: '[]' };
    },
  });
  const result = await getTool(tools, 'web.search_images').execute({
    query: '   ',
    tags: '  ',
    style: 'anime',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'image_search_query_missing');
  assert.equal(requestCount, 0, 'query 与 tags 均空白不得触发外部请求');
  console.log('ok - 图搜拒绝全空输入且不触发外部请求');
}
