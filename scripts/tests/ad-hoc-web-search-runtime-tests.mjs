import assert from 'node:assert/strict';

import {
  AD_HOC_WEB_SEARCH_NOTICE_KEY,
  buildAdHocWebSearchRuntime,
  confirmAdHocWebSearchToggle,
  consumeAdHocWebSearchToggle,
  createAdHocWebSearchToggleRuntime,
  renderAdHocWebSources,
} from '../../src/scripts/ui/chat/ad-hoc-web-search-runtime.js';

const client = { chat: async () => 'plain' };
const definitions = Object.fromEntries(['web.search', 'web.research', 'web.fetch_url'].map(name => [name, {
  name,
  description: name,
  schema: { type: 'object', additionalProperties: false },
}]));
const toolRuntime = {
  getTool: name => definitions[name] || null,
  executeTool: async () => ({ status: 'succeeded', result: { ok: true } }),
};

{
  const built = buildAdHocWebSearchRuntime({
    client,
    config: { provider: 'deepseek', model: 'deepseek-chat' },
    enabled: false,
    requestOptions: { temperature: 0.6 },
    toolRuntime,
  });
  assert.equal(built.client, client);
  assert.deepEqual(built.requestOptions, { temperature: 0.6 });
  assert.equal(built.plan.enabled, false);
}

{
  const toggle = { checked: true };
  let resolveConfirmation;
  let confirms = 0;
  const toggleRuntime = createAdHocWebSearchToggleRuntime({
    toggleEl: toggle,
    storage: { getItem: () => null, setItem() {} },
    confirm: () => {
      confirms += 1;
      return new Promise(resolve => { resolveConfirmation = resolve; });
    },
  });
  const first = toggleRuntime.confirmEnabled();
  const consumed = toggleRuntime.consume();
  assert.equal(confirms, 1);
  resolveConfirmation(true);
  assert.equal(await first, true);
  assert.equal(await consumed, true);
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggleRuntime.reset();
  assert.equal(toggle.checked, false);
}

{
  const statuses = [];
  const sourceSnapshots = [];
  const built = buildAdHocWebSearchRuntime({
    client,
    config: { provider: 'openrouter', model: 'openai/gpt-5' },
    enabled: true,
    requestOptions: { temperature: 0.4 },
    toolRuntime: null,
    onStatus: status => statuses.push(status),
    onSources: sources => sourceSnapshots.push(sources),
  });
  assert.equal(built.client, client);
  assert.equal(built.requestOptions.temperature, 0.4);
  assert.equal(built.requestOptions.tools[0].type, 'openrouter:web_search');
  built.requestOptions.onProviderSources([
    { url: 'https://example.com/a#part', title: 'A' },
    { url: 'javascript:alert(1)', title: 'bad' },
  ]);
  assert.deepEqual(sourceSnapshots.at(-1), [{ url: 'https://example.com/a', title: 'A' }]);
  assert.deepEqual(statuses.map(item => item.state), ['ready', 'done']);
}

{
  const built = buildAdHocWebSearchRuntime({
    client,
    config: { provider: 'deepseek', model: 'deepseek-chat' },
    enabled: true,
    requestOptions: { temperature: 0.2 },
    toolRuntime,
  });
  assert.notEqual(built.client, client);
  assert.equal(built.plan.fallback, true);
  assert.equal(built.requestOptions.temperature, 0.2);
  assert.equal(built.requestOptions.tool_choice, 'auto');
  assert.deepEqual(built.requestOptions.tools.map(item => item.function.name), [
    'web_search',
    'web_research',
    'web_fetch',
  ]);
}

{
  const statuses = [];
  const built = buildAdHocWebSearchRuntime({
    client,
    config: { provider: 'deepseek', model: 'deepseek-chat' },
    enabled: true,
    requestOptions: { temperature: 0.1 },
    toolRuntime: null,
    onStatus: status => statuses.push(status),
  });
  assert.equal(built.client, client);
  assert.deepEqual(built.requestOptions, { temperature: 0.1 });
  assert.equal(built.plan.enabled, false);
  assert.equal(statuses[0].state, 'unavailable');
}

{
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const toggle = { checked: true };
  let confirms = 0;
  assert.equal(await confirmAdHocWebSearchToggle({
    toggleEl: toggle,
    storage,
    confirm: async () => { confirms += 1; return true; },
  }), true);
  assert.equal(values.get(AD_HOC_WEB_SEARCH_NOTICE_KEY), '1');
  assert.equal(await confirmAdHocWebSearchToggle({
    toggleEl: toggle,
    storage,
    confirm: async () => { confirms += 1; return true; },
  }), true);
  assert.equal(confirms, 1);
  assert.equal(consumeAdHocWebSearchToggle(toggle), true);
  assert.equal(toggle.checked, false);
  assert.equal(consumeAdHocWebSearchToggle(toggle), false);

  const cancelledToggle = { checked: true };
  assert.equal(await confirmAdHocWebSearchToggle({
    toggleEl: cancelledToggle,
    storage: { getItem: () => null, setItem() {} },
    confirm: async () => false,
  }), false);
  assert.equal(cancelledToggle.checked, false);
}

{
  const children = [];
  const container = {
    hidden: false,
    replaceChildren: () => { children.length = 0; },
    appendChild: child => children.push(child),
  };
  const documentRef = {
    createElement: tagName => ({ tagName, className: '', textContent: '', href: '', target: '', rel: '', title: '' }),
  };
  const sources = renderAdHocWebSources(container, [
    { url: 'https://safe.example/doc', title: '<img src=x>' },
    { url: 'data:text/html,bad', title: 'bad' },
  ], { documentRef });
  assert.equal(sources.length, 1);
  assert.equal(children[1].textContent, '<img src=x>');
  assert.equal(children[1].href, 'https://safe.example/doc');
  assert.equal(children[1].rel, 'noopener noreferrer');
}

console.log('ok - ad-hoc web search is one-shot, provider-aware, and renders safe sources');
