import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

globalThis.setTimeout = () => 0;

const {
  flattenRegexImportRules,
  normalizeRegexScript,
  parseRegexImportText,
} = await import('../../src/scripts/utils/regex-transfer.js');

test('normalizeRegexScript accepts JS-Slash Runner tavern regex shape', () => {
  const rule = normalizeRegexScript({
    id: 'r1',
    script_name: '显示状态',
    enabled: true,
    find_regex: '/<status>([\\s\\S]*?)<\\/status>/g',
    replace_string: '$1',
    source: {
      user_input: false,
      ai_output: true,
      slash_command: false,
      world_info: true,
    },
    destination: {
      display: true,
      prompt: false,
    },
    run_on_edit: true,
    min_depth: 0,
    max_depth: 4,
  });

  assert.equal(rule.scriptName, '显示状态');
  assert.equal(rule.findRegex, '/<status>([\\s\\S]*?)<\\/status>/g');
  assert.equal(rule.replaceString, '$1');
  assert.deepEqual(rule.placement, [2, 5]);
  assert.equal(rule.disabled, false);
  assert.equal(rule.markdownOnly, true);
  assert.equal(rule.promptOnly, false);
  assert.equal(rule.runOnEdit, true);
  assert.equal(rule.minDepth, 0);
  assert.equal(rule.maxDepth, 4);
});

test('parseRegexImportText reads character card extension regex scripts', () => {
  const parsed = parseRegexImportText(JSON.stringify({
    name: '角色卡',
    extensions: {
      regex_scripts: [
        {
          scriptName: '角色正则',
          findRegex: '/foo/g',
          replaceString: 'bar',
          placement: [1],
        },
      ],
    },
  }));

  const rules = flattenRegexImportRules(parsed);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].scriptName, '角色正则');
  assert.equal(rules[0].findRegex, '/foo/g');
});

test('parseRegexImportText reads ST RegexBinding from preset extensions', () => {
  const parsed = parseRegexImportText(JSON.stringify({
    extensions: {
      SPreset: {
        RegexBinding: {
          regexes: [
            {
              scriptName: '替换状态栏',
              findRegex: '/alpha/g',
              replaceString: 'beta',
              placement: [2],
            },
          ],
        },
      },
    },
  }));

  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.sets[0].name, '替换状态栏');
  assert.equal(parsed.sets[0].rules[0].scriptName, '替换状态栏');
});

test('parseRegexImportText replaces generic source names with regex script names', () => {
  const parsed = parseRegexImportText(JSON.stringify({
    sets: [
      {
        name: 'Regex scripts',
        rules: [
          {
            scriptName: '显示好感度',
            findRegex: '/affection/g',
            replaceString: '好感度',
            placement: [2],
          },
        ],
      },
    ],
  }));

  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.sets[0].name, '显示好感度');
});

test('parseRegexImportText preserves exported bound regex sets', () => {
  const parsed = parseRegexImportText(JSON.stringify({
    boundRegexSets: [
      {
        name: '预设正则',
        enabled: false,
        rules: [
          {
            scriptName: '旧格式',
            pattern: 'hello',
            flags: 'gi',
            replacement: 'hi',
            when: 'both',
          },
        ],
      },
    ],
  }));

  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.sets[0].enabled, false);
  assert.equal(parsed.sets[0].rules[0].findRegex, '/hello/gi');
  assert.deepEqual(parsed.sets[0].rules[0].placement, [1, 2]);
});
