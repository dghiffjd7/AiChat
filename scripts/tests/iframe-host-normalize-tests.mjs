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

console.log('iframe-host-normalize-tests passed');
