import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  captureRichDetailsOpenStates,
  buildFrameworkGlobalShim,
  buildMvuCompatBridge,
  expandRichImageTokensForHtml,
  getRichDetailsStateKey,
  prepareRichFragmentDisplayHtmlForParsing,
  prepareRichFragmentHtmlForParsing,
  resolveCompatRpGreetingSwipeTarget,
  restoreRichDetailsOpenStates,
  splitFencedCodeBlocks,
} = await import('../../src/scripts/ui/chat/rich-text-renderer.js');

const tests = [];

tests.push({
  name: 'framework shim orders Vue and VueDemi before Pinia',
  fn: () => {
    const html = buildFrameworkGlobalShim({
      iframeId: 'framework-order-test',
      vueMajor: 3,
      appOrigin: 'http://127.0.0.1:1430',
    });
    const vueAt = html.indexOf('data-chatapp-framework="vue"');
    const demiAt = html.indexOf('data-chatapp-framework="vue-demi"');
    const routerAt = html.indexOf('data-chatapp-framework="vue-router"');
    const piniaAt = html.indexOf('data-chatapp-framework="pinia"');
    const readyAt = html.indexOf('data-chatapp-framework="ready"');
    assert.ok(vueAt > 0);
    assert.ok(vueAt < demiAt);
    assert.ok(demiAt < routerAt);
    assert.ok(routerAt < piniaAt);
    assert.ok(piniaAt < readyAt);
    assert.match(html, /window\.__chatappFrameworkCompat\?\.setupVueDemi/);
    assert.match(html, /window\.__chatappFrameworkReady/);
  },
});

tests.push({
  name: 'Vue 2 framework shim does not inject Pinia',
  fn: () => {
    const html = buildFrameworkGlobalShim({
      iframeId: 'framework-vue2-test',
      vueMajor: 2,
      appOrigin: 'http://127.0.0.1:1430',
    });
    assert.match(html, /data-chatapp-framework="vue"/);
    assert.match(html, /data-chatapp-framework="vue-demi"/);
    assert.doesNotMatch(html, /data-chatapp-framework="pinia"/);
  },
});

tests.push({
  name: 'enhanced MVU bridge keeps generated regexes valid and exposes seeded variables',
  fn: async () => {
    const html = buildMvuCompatBridge({
      iframeId: 'mvu-bridge-test',
      sessionId: 'rp:test',
      messageId: 'message-1',
      messageIndex: 0,
      seedVars: {
        stat_data: { '秦素霜.倾心值': 0, 秦素霜: { 倾心值: 0 } },
        variables: { '秦素霜.倾心值': 0, 秦素霜: { 倾心值: 0 } },
        global_variables: {},
        local_variables: {},
      },
    });
    const match = html.match(/^\s*<script>([\s\S]*)<\/script>\s*$/);
    assert.ok(match, 'expected one generated script');
    const script = match[1];
    assert.doesNotThrow(() => new Function(script));
    assert.match(script, /\^https\?:\\\/\\\//);
    assert.match(script, /\(\\S\+\)\\s\+/);

    const fakeWindow = {
      location: { href: 'http://127.0.0.1:1430/' },
      addEventListener: () => {},
      eval: () => {},
    };
    fakeWindow.parent = fakeWindow;
    fakeWindow.top = fakeWindow;
    const fakeDocument = {
      readyState: 'loading',
      addEventListener: () => {},
      querySelectorAll: () => [],
    };
    class FakeElement {}
    class FakeNode {}
    class FakeDomParser {}
    class FakeFormData {}
    const run = new Function(
      'window',
      'document',
      'parent',
      'Element',
      'Node',
      'DOMParser',
      'FormData',
      'fetch',
      'setTimeout',
      'structuredClone',
      'console',
      script,
    );
    run(
      fakeWindow,
      fakeDocument,
      fakeWindow,
      FakeElement,
      FakeNode,
      FakeDomParser,
      FakeFormData,
      async () => ({ ok: false }),
      () => 0,
      globalThis.structuredClone,
      { log: () => {}, warn: () => {}, error: () => {} },
    );
    assert.deepEqual(fakeWindow.getVariables(), {
      '秦素霜.倾心值': 0,
      秦素霜: { 倾心值: 0 },
    });
    assert.equal(fakeWindow.getAllVariables().stat_data['秦素霜.倾心值'], 0);
    assert.equal(fakeWindow.getChatMessages(0)[0].data.stat_data['秦素霜.倾心值'], 0);

    await fakeWindow.Mvu.replaceMvuData({
      stat_data: { '秦素霜.倾心值': 2, 秦素霜: { 倾心值: 2 } },
    });
    assert.equal(fakeWindow.getChatMessages(0)[0].data.stat_data['秦素霜.倾心值'], 2);
  },
});

tests.push({
  name: 'splitFencedCodeBlocks keeps inline backticks inside a single fenced block',
  fn: () => {
    // 重前端面板场景：块内 JS 含行内 ```（正则/字符串字面量），不得截断
    const inner = [
      '<!DOCTYPE html>',
      '<script>',
      "const m = raw.match(/```html([\\s\\S]*?)```/);",
      "const stored = '```html\\n' + finalHtml + '\\n```';",
      '</script>',
      '</html>',
    ].join('\n');
    const text = '```html\n' + inner + '\n```';
    const parts = splitFencedCodeBlocks(text);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'code');
    assert.equal(parts[0].lang, 'html');
    assert.ok(parts[0].code.includes('match(/```html'));
    assert.ok(parts[0].code.endsWith('</html>'));
  },
});

tests.push({
  name: 'splitFencedCodeBlocks splits normal blocks and keeps surrounding text',
  fn: () => {
    const text = 'before\n```js\nconst a = 1;\n```\nmiddle\n```\nplain\n```\nafter';
    const parts = splitFencedCodeBlocks(text);
    assert.deepEqual(parts.map(p => p.type), ['text', 'code', 'text', 'code', 'text']);
    assert.equal(parts[1].lang, 'js');
    assert.equal(parts[1].code, 'const a = 1;');
    assert.equal(parts[3].code, 'plain');
    assert.ok(parts[4].text.includes('after'));
  },
});

tests.push({
  name: 'splitFencedCodeBlocks extends unclosed fence to end (streaming)',
  fn: () => {
    const text = 'intro\n```html\n<div>partial';
    const parts = splitFencedCodeBlocks(text);
    assert.equal(parts.length, 2);
    assert.equal(parts[1].type, 'code');
    assert.equal(parts[1].code, '<div>partial');
  },
});

tests.push({
  name: 'splitFencedCodeBlocks ignores non-line-start fence markers',
  fn: () => {
    const text = 'inline ```notafence``` text without real blocks';
    const parts = splitFencedCodeBlocks(text);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'text');
  },
});

const test = (name, fn) => tests.push({ name, fn });

test('keeps iframe diagnostic regex escapes inside generated srcdoc script', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/scripts/ui/chat/rich-text-renderer.js'), 'utf8');
  assert.ok(source.includes("replace(/\\\\s+/g, ' ').trim()"));
  assert.ok(source.includes('const contentHasBr = /<br\\\\s*\\\\/?>/i.test(contentHtml) ? 1 : 0;'));
  assert.ok(source.includes("match(/\\\\[旁白\\\\]\\\\|/g)"));
  assert.match(source, /else if \(!directBodyLoadUrl\) \{\s*\/\/ direct-load/);
  assert.equal((source.match(/const nodes = Array\.from\(body\.children \|\| \[\]\);/g) || []).length, 2);
  assert.doesNotMatch(source, /const nodes = body\.querySelectorAll\('\*'\);/);
  assert.ok(source.includes("hasOwnProperty.call(item, 'swipe_id')"));
  assert.ok(source.includes('fields.swipe_id = item.swipe_id'));
  assert.match(source, /\*, \*::before, \*::after \{ box-sizing: border-box; min-width: 0 !important; \}/);
  assert.doesNotMatch(source, /\*, \*::before, \*::after \{[^}]*max-width/i);
});

test('maps Tavern swipe_id to RP alternate greetings without card-specific rules', () => {
  const greetingState = {
    greetings: [
      { id: 'greeting_1', title: '开场白' },
      { id: 'greeting_2', title: '开场白 2' },
    ],
    activeId: 'greeting_1',
    locked: false,
  };
  assert.deepEqual(resolveCompatRpGreetingSwipeTarget({
    sessionId: 'rp:persona_test',
    message: { meta: { isGreeting: true } },
    swipeId: 1,
    greetingState,
  }), {
    ok: true,
    greetingId: 'greeting_2',
    swipeId: 1,
    swipeCount: 2,
    unchanged: false,
  });
  assert.equal(resolveCompatRpGreetingSwipeTarget({
    sessionId: 'rp:persona_test',
    message: { meta: { isGreeting: true } },
    swipeId: 2,
    greetingState,
  }).reason, 'swipe-out-of-range');
  assert.equal(resolveCompatRpGreetingSwipeTarget({
    sessionId: 'normal-chat',
    message: { meta: { isGreeting: true } },
    swipeId: 1,
    greetingState,
  }).reason, 'unsupported-swipe-target');
  assert.equal(resolveCompatRpGreetingSwipeTarget({
    sessionId: 'rp:persona_test',
    message: { meta: { isGreeting: true } },
    swipeId: 1,
    greetingState: { ...greetingState, locked: true },
  }).reason, 'greeting-locked');
});

test('keeps balanced style scaffolds intact', () => {
  const input = '<style>.pf-wrap{display:block}</style><details><summary>cot</summary><div>body</div></details>';
  assert.equal(prepareRichFragmentHtmlForParsing(input), input);
});

test('escapes literal unclosed style mentions inside rich fragments', () => {
  const input = [
    '<style>.pf-wrap{display:block}</style>',
    '<details class="pf-wrap"><summary>cot</summary><div>',
    '同时根据<style>中的Baseline_Anchors，保持中景镜头。',
    '</div></details>',
    '<p>正文仍应显示</p>',
  ].join('');
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /^<style>\.pf-wrap/);
  assert.match(output, /根据&lt;style&gt;中的Baseline_Anchors/);
  assert.match(output, /<p>正文仍应显示<\/p>/);
});

test('escapes unsupported protocol tags as text in rich fragments', () => {
  const input = '<details><summary>cot</summary><div>正文用<content></content>包裹，末尾有<ztl>状态</ztl></div></details>';
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /正文用&lt;content&gt;&lt;\/content&gt;包裹/);
  assert.match(output, /末尾有&lt;ztl&gt;状态&lt;\/ztl&gt;/);
});

test('hides creative content wrapper before rich fragment display parsing', () => {
  const input = '<content><details><summary>cot</summary><div>正文</div></details></content>';
  const output = prepareRichFragmentDisplayHtmlForParsing(input);
  assert.equal(output, '<details><summary>cot</summary><div>正文</div></details>');
});

test('hides escaped creative content wrapper before display fallback', () => {
  const input = '&lt;content type=&quot;story&quot;&gt;正文&lt;/content&gt;';
  const output = prepareRichFragmentDisplayHtmlForParsing(input);
  assert.equal(output, '正文');
});

test('expands generated image tokens in sandbox html text nodes', () => {
  const imagePath = String.raw`C:\tmp\generated.png`;
  const scriptPath = String.raw`C:\tmp\script-only.png`;
  const input = `<body><section>正文 [img-${imagePath}]</section><script>const token="[img-${scriptPath}]"</script></body>`;
  const output = expandRichImageTokensForHtml(input);
  assert.match(output, /<img\b/);
  assert.match(output, /src="file:\/\/\/C:\/tmp\/generated\.png"/);
  assert.match(output, /data-inline-image-ref="C:\\tmp\\generated\.png"/);
  assert.match(output, /<script>const token="\[img-C:\\tmp\\script-only\.png\]"<\/script>/);
});

test('does not let a stray raw-text tag claim a later valid block', () => {
  const input = '说明<script>只是字面量<style>.x{color:red}</style><div>尾部</div>';
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /说明&lt;script&gt;只是字面量/);
  assert.match(output, /<style>\.x\{color:red\}<\/style>/);
  assert.match(output, /<div>尾部<\/div>/);
});

const fakeDetails = ({ summary = '', open = false, attrs = {} } = {}) => ({
  tagName: 'DETAILS',
  open,
  getAttribute: name => attrs[name] || '',
  children: [{ tagName: 'SUMMARY', textContent: summary }],
});

const fakeDetailsContainer = details => ({
  querySelectorAll: selector => (selector === 'details' ? details : []),
});

test('builds stable details state keys from explicit ids before summary text', () => {
  const details = fakeDetails({
    summary: '  推理   请求  ',
    attrs: { 'data-rich-details-key': 'reasoning-request' },
  });
  assert.equal(getRichDetailsStateKey(details, 4), 'id:reasoning-request');
  assert.equal(getRichDetailsStateKey(fakeDetails({ summary: '  推理   请求  ' }), 4), 'idx:4|summary:推理 请求');
});

test('restores user details open state across rich streaming rerenders', () => {
  const state = { openByKey: new Map() };
  captureRichDetailsOpenStates(
    fakeDetailsContainer([fakeDetails({ summary: '推理请求', open: true })]),
    state,
  );

  const rerendered = fakeDetails({ summary: '推理请求', open: false });
  restoreRichDetailsOpenStates(fakeDetailsContainer([rerendered]), state);

  assert.equal(rerendered.open, true);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
