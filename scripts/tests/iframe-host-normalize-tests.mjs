import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/iframe-host.js'), 'utf8');

const extractRegex = (name) => {
  const line = source
    .split(/\r?\n/)
    .find(item => item.includes(`const ${name} = `));
  assert.ok(line, `missing ${name}`);
  const expr = line.slice(line.indexOf('=') + 1, line.lastIndexOf(';')).trim();
  return vm.runInNewContext(expr);
};

const riskyStartRe = extractRegex('riskyStartRe');
const safePrevEndRe = extractRegex('safePrevEndRe');
const keywordPrevRe = extractRegex('keywordPrevRe');
const loadingOverlaySignalRe = extractRegex('loadingOverlaySignalRe');
const fontAwesomeCdnCssRe = extractRegex('fontAwesomeCdnCssRe');

// 可选元素存在性检查是重前端卡常用的 feature detection。宿主不得把任意
// 缺失 ID 伪造成 truthy 元素；需要的酒馆宿主节点应通过明确的 DOM proxy 提供。
assert.doesNotMatch(source, /Document\.prototype\.getElementById\s*=/);
assert.match(source, /textarea\.id = 'send_textarea'/);
assert.match(source, /sendButton\.id = 'send_but'/);

const normalizeExecutableScriptSource = (code) => {
  const lines = String(code || '').replace(/\r\n?/g, '\n').split('\n');
  const normalized = [];
  let previousNonEmpty = '';
  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (trimmed && riskyStartRe.test(trimmed) && previousNonEmpty) {
      const prev = previousNonEmpty.replace(/\s+$/, '');
      if (!safePrevEndRe.test(prev) && !keywordPrevRe.test(prev)) {
        normalized.push(';');
      }
    }
    normalized.push(line);
    if (trimmed) previousNonEmpty = line;
  });
  return normalized.join('\n');
};

{
  const code = [
    "html = '<div>' +",
    "  (count > 0 ? '<span>' + count + '</span>' : '');",
  ].join('\n');
  assert.equal(normalizeExecutableScriptSource(code), code);
}

{
  const code = [
    'runSetup()',
    '(function init() {})();',
  ].join('\n');
  assert.equal(
    normalizeExecutableScriptSource(code),
    [
      'runSetup()',
      ';',
      '(function init() {})();',
    ].join('\n'),
  );
}

{
  assert.match('loading-screen', loadingOverlaySignalRe);
  assert.match('preloader overlay', loadingOverlaySignalRe);
  assert.match('resource progress', loadingOverlaySignalRe);
  assert.doesNotMatch('unloading-state', loadingOverlaySignalRe);
  assert.doesNotMatch('catalog-panel', loadingOverlaySignalRe);
}

{
  assert.match(
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    fontAwesomeCdnCssRe,
  );
  assert.match(
    'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0-beta3/css/all.min.css',
    fontAwesomeCdnCssRe,
  );
  assert.match(
    'https://unpkg.com/@fortawesome/fontawesome-free@6.0.0-beta3/css/all.css',
    fontAwesomeCdnCssRe,
  );
  assert.doesNotMatch(
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css',
    fontAwesomeCdnCssRe,
  );
  assert.doesNotMatch('https://example.com/font-awesome.css', fontAwesomeCdnCssRe);
}

console.log('iframe-host-normalize-tests passed');
