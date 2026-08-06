import assert from 'node:assert/strict';
import {
  detectRichScriptExecutionRequirement,
  detectPlainTextRichRoute,
  detectRichCodeBlockRoute,
  isLikelyBlankRichStaticDocument,
  RICH_RENDER_EXECUTION,
  RICH_RENDER_LEVELS,
} from '../../src/scripts/ui/chat/rich-render-routing.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('plain code blocks stay on level0', () => {
  const route = detectRichCodeBlockRoute({
    lang: 'js',
    code: 'const answer = 42;',
    allowScripts: false,
  });
  assert.equal(route.level, RICH_RENDER_LEVELS.SAFE);
  assert.equal(route.execution, RICH_RENDER_EXECUTION.NONE);
});

test('safe html snippets route to level1 cards', () => {
  const route = detectRichCodeBlockRoute({
    lang: 'html',
    code: '<details><summary>More</summary><div>Body</div></details>',
    allowScripts: false,
  });
  assert.equal(route.level, RICH_RENDER_LEVELS.CARD);
  assert.equal(route.execution, RICH_RENDER_EXECUTION.NONE);
});

test('interactive html routes to level2 preview when scripts are disabled', () => {
  const route = detectRichCodeBlockRoute({
    lang: 'html',
    code: '<html><body><script>console.log("x")</script></body></html>',
    allowScripts: false,
  });
  assert.equal(route.level, RICH_RENDER_LEVELS.SANDBOX);
  assert.equal(route.execution, RICH_RENDER_EXECUTION.PREVIEW);
});

test('interactive html routes to level2 execute when scripts are enabled', () => {
  const route = detectRichCodeBlockRoute({
    lang: 'html',
    code: '<html><body><script>console.log("x")</script></body></html>',
    allowScripts: true,
  });
  assert.equal(route.level, RICH_RENDER_LEVELS.SANDBOX);
  assert.equal(route.execution, RICH_RENDER_EXECUTION.EXECUTE);
});

test('script snippets without full html shell still route to level2', () => {
  const route = detectRichCodeBlockRoute({
    lang: 'html',
    code: '<div>card</div><script>window.run = true;</script>',
    allowScripts: false,
  });
  assert.equal(route.level, RICH_RENDER_LEVELS.SANDBOX);
  assert.equal(route.execution, RICH_RENDER_EXECUTION.PREVIEW);
});

test('plain text fragments use level1 only for non-interactive rich fragments', () => {
  const safeRoute = detectPlainTextRichRoute('<details><summary>A</summary><div>B</div></details>');
  assert.equal(safeRoute.level, RICH_RENDER_LEVELS.CARD);

  const interactiveRoute = detectPlainTextRichRoute('<script>alert(1)</script>');
  assert.equal(interactiveRoute.level, RICH_RENDER_LEVELS.SAFE);
});

test('empty app shells driven by executable scripts are high-confidence script requirements', () => {
  const code = '<html><body><div id="app"></div><script>Vue.createApp(App).mount("#app")</script></body></html>';
  const requirement = detectRichScriptExecutionRequirement({ code, allowScripts: false });
  assert.equal(requirement.required, true);
  assert.equal(requirement.blocked, true);
  assert.equal(requirement.hasExecutableScript, true);
  assert.equal(requirement.reason, 'framework-mount');
  assert.equal(isLikelyBlankRichStaticDocument(code), true);
});

test('direct body loaders are treated as required even when they render a loading label first', () => {
  const code = '<body><div>正在加载角色面板…</div><script>$("body").load("https://example.test/card.html")</script></body>';
  const requirement = detectRichScriptExecutionRequirement({ code, allowScripts: false });
  assert.equal(requirement.required, true);
  assert.equal(requirement.reason, 'body-loader');
});

test('static cards with incidental scripts do not trigger the permission guide', () => {
  const code = '<html><body><div>角色资料</div><script>console.log("analytics")</script></body></html>';
  const requirement = detectRichScriptExecutionRequirement({ code, allowScripts: false });
  assert.equal(requirement.required, false);
  assert.equal(requirement.blocked, true);
  assert.equal(isLikelyBlankRichStaticDocument(code), false);
});

test('non-executable data scripts and already-enabled execution never require a guide', () => {
  const dataOnly = '<html><body><div id="app"></div><script type="application/json">{"name":"card"}</script></body></html>';
  assert.equal(detectRichScriptExecutionRequirement({ code: dataOnly, allowScripts: false }).required, false);

  const executable = '<body><script>document.body.textContent = "ready"</script></body>';
  const enabled = detectRichScriptExecutionRequirement({ code: executable, allowScripts: true });
  assert.equal(enabled.required, false);
  assert.equal(enabled.blocked, false);
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
