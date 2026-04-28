import assert from 'node:assert/strict';
import {
  detectPlainTextRichRoute,
  detectRichCodeBlockRoute,
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
