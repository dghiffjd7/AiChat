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

const extractArrow = (name, nextName, sandbox = {}) => {
  const marker = `  const ${name} = `;
  const nextMarker = `\n\n  const ${nextName} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const expressionStart = start + marker.length;
  const end = source.indexOf(nextMarker, expressionStart);
  assert.ok(end > expressionStart, `missing end marker for ${name}`);
  const expression = source.slice(expressionStart, end).trim().replace(/;$/, '');
  return vm.runInNewContext(`(${expression})`, sandbox);
};

// 可选元素存在性检查是重前端卡常用的 feature detection。宿主不得把任意
// 缺失 ID 伪造成 truthy 元素；需要的酒馆宿主节点应通过明确的 DOM proxy 提供。
assert.doesNotMatch(source, /Document\.prototype\.getElementById\s*=/);
assert.match(source, /textarea\.id = 'send_textarea'/);
assert.match(source, /sendButton\.id = 'send_but'/);

const normalizeExecutableScriptSource = (code) => {
  const lines = String(code || '').replace(/\r\n?/g, '\n').split('\n');
  const normalized = [];
  let previousNonEmpty = '';
  let hasOpenTemplateLiteral = false;
  const countUnescapedBackticks = (line) => {
    const value = String(line || '');
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== '`') continue;
      let slashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
        slashCount += 1;
      }
      if (slashCount % 2 === 0) count += 1;
    }
    return count;
  };
  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    const closesOpenTemplateLiteral = hasOpenTemplateLiteral && trimmed.startsWith('`');
    if (trimmed && riskyStartRe.test(trimmed) && previousNonEmpty && !closesOpenTemplateLiteral) {
      const prev = previousNonEmpty.replace(/\s+$/, '');
      if (!safePrevEndRe.test(prev) && !keywordPrevRe.test(prev)) {
        normalized.push(';');
      }
    }
    normalized.push(line);
    if (countUnescapedBackticks(line) % 2 === 1) {
      hasOpenTemplateLiteral = !hasOpenTemplateLiteral;
    }
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
  const code = [
    'const messagesData = `',
    '群聊|测试群聊|有一条新消息|10:20|2',
    '私聊|测试角色|稍后联系|10:22|0',
    '`;',
  ].join('\n');
  assert.equal(normalizeExecutableScriptSource(code), code);
  assert.equal(
    vm.runInNewContext(`${normalizeExecutableScriptSource(code)}\nmessagesData.trim()`),
    [
      '群聊|测试群聊|有一条新消息|10:20|2',
      '私聊|测试角色|稍后联系|10:22|0',
    ].join('\n'),
  );
}

{
  const code = [
    'runSetup()',
    '`next template`',
  ].join('\n');
  assert.equal(
    normalizeExecutableScriptSource(code),
    [
      'runSetup()',
      ';',
      '`next template`',
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

{
  let directLoadCalls = 0;
  const snapshot = {
    worldbookId: 'book-a',
    exists: true,
    revision: 7,
    generation: 2,
    data: { name: 'book-a', entries: [{ id: 'a' }] },
  };
  const getStoredLorebookSnapshot = extractArrow('getStoredLorebookSnapshot', 'getStoredLorebook', {
    getParentBridge: () => ({
      getWorldInfoSnapshot: async () => snapshot,
      worldStore: { load: () => { directLoadCalls += 1; } },
    }),
  });
  assert.deepEqual(await getStoredLorebookSnapshot('book-a'), snapshot);
  assert.equal(directLoadCalls, 0);
  console.log('ok - iframe lorebook reads prefer a revision-bearing bridge snapshot');
}

{
  const calls = [];
  let directSaveCalls = 0;
  const saveStoredLorebook = extractArrow('saveStoredLorebook', 'listLorebookNames', {
    getParentBridge: () => ({
      saveWorldInfo: async (...args) => {
        calls.push(args);
        return { ok: false, conflict: true, reason: 'worldbook_revision_conflict' };
      },
      worldStore: { save: () => { directSaveCalls += 1; } },
    }),
  });
  await assert.rejects(
    () => saveStoredLorebook('book-a', { name: 'book-a', entries: [] }, {
      exists: true,
      revision: 7,
      generation: 2,
    }),
    error => error?.code === 'worldbook_revision_conflict',
  );
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0][2] }, {
    expectedRevision: 7,
    expectedGeneration: 2,
    expectedExists: true,
    conflictMode: 'return',
  });
  assert.equal(directSaveCalls, 0);
  console.log('ok - iframe lorebook writes surface CAS conflicts without direct-store fallback');
}

{
  let saveCalls = 0;
  const saveStoredLorebook = extractArrow('saveStoredLorebook', 'listLorebookNames', {
    getParentBridge: () => ({
      saveWorldInfo: async () => { saveCalls += 1; },
    }),
  });
  await assert.rejects(
    () => saveStoredLorebook('book-a', { name: 'book-a', entries: [] }, {
      exists: true,
      revision: null,
      generation: null,
    }),
    error => error?.code === 'worldbook_snapshot_unavailable',
  );
  assert.equal(saveCalls, 0);
  console.log('ok - iframe lorebook writes fail closed when no revision snapshot is available');
}

console.log('iframe-host-normalize-tests passed');
