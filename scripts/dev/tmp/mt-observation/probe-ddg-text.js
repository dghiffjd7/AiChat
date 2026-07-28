(async () => {
  const invoke = globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INVOKE__
    || globalThis.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return { ok: false, reason: 'tauri_invoke_missing' };
  const query = 'WebView2 remote debugging port';
  const request = async (url, accept) => {
    const response = await invoke('http_request', {
      url,
      method: 'GET',
      headers: {
        accept,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: null,
      timeoutMs: 15000,
    });
    const body = String(response?.body || '');
    return {
      status: response?.status,
      ok: response?.ok,
      contentType: response?.headers?.['content-type'] || '',
      length: body.length,
      title: body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '',
      resultAnchorCount: (body.match(/result__a/g) || []).length,
      snippetCount: (body.match(/result__snippet/g) || []).length,
      uddgCount: (body.match(/uddg=/g) || []).length,
      challenge: /captcha|anomaly|challenge|unusual traffic|机器人|验证/i.test(body),
      sample: body.slice(0, 500).replace(/\s+/g, ' '),
    };
  };
  const instantUrl = new URL('https://api.duckduckgo.com/');
  instantUrl.searchParams.set('q', query);
  instantUrl.searchParams.set('format', 'json');
  instantUrl.searchParams.set('no_html', '1');
  instantUrl.searchParams.set('skip_disambig', '1');
  instantUrl.searchParams.set('kl', 'zh-tw');
  const htmlUrl = new URL('https://html.duckduckgo.com/html/');
  htmlUrl.searchParams.set('q', query);
  const bingRssUrl = new URL('https://www.bing.com/search');
  bingRssUrl.searchParams.set('q', query);
  bingRssUrl.searchParams.set('format', 'rss');
  return {
    instant: await request(instantUrl.toString(), 'application/json'),
    html: await request(htmlUrl.toString(), 'text/html'),
    bingRss: await request(bingRssUrl.toString(), 'application/rss+xml,application/xml,text/xml'),
  };
})()
