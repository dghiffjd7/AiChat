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
  getRegexImportSetName,
  normalizeRegexScript,
  parseRegexImportText,
  stripGenericRegexSetName,
} = await import('../../src/scripts/utils/regex-transfer.js');
const {
  REGEX_CUSTOM_PROMPT_PRESET_TYPE,
  buildRegexCustomPromptPresetBind,
  getRegexCustomPromptPresetBindIds,
  listRegexCustomPromptPresetChoices,
  resolveImportedRegexPresetBindTarget,
} = await import('../../src/scripts/ui/regex-preset-binding-utils.js');

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

test('regex preset binding choices only expose custom prompt presets', () => {
  const store = {
    list(type) {
      if (type === 'context') return [{ id: 'ctx', name: '上下文模板' }];
      if (type === REGEX_CUSTOM_PROMPT_PRESET_TYPE) {
        return [
          { id: 'openai-a', name: '自定义 A' },
          { id: 'openai-b', name: '自定义 B' },
        ];
      }
      return [];
    },
  };

  assert.deepEqual(listRegexCustomPromptPresetChoices(store), [
    { id: 'openai-a', name: '自定义 A' },
    { id: 'openai-b', name: '自定义 B' },
  ]);
  assert.deepEqual(buildRegexCustomPromptPresetBind('openai-a'), {
    type: 'preset',
    presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    presetId: 'openai-a',
  });
  assert.deepEqual(buildRegexCustomPromptPresetBind(['openai-a', 'openai-b', 'openai-a', '']), {
    type: 'preset',
    presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    presetId: 'openai-a',
    presetIds: ['openai-a', 'openai-b'],
  });
  assert.deepEqual(getRegexCustomPromptPresetBindIds({
    type: 'preset',
    presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    presetId: 'openai-a',
    presetIds: ['openai-b', 'openai-a'],
  }), ['openai-b', 'openai-a']);
});

test('imported preset regex binding targets the imported custom prompt preset directly', () => {
  const store = {
    list(type) {
      if (type !== REGEX_CUSTOM_PROMPT_PRESET_TYPE) return [];
      return [{ id: 'imported-openai', name: '导入预设' }];
    },
  };

  assert.deepEqual(resolveImportedRegexPresetBindTarget({
    importType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    presetId: 'imported-openai',
    presetStore: store,
  }), {
    presetId: 'imported-openai',
    bind: {
      type: 'preset',
      presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
      presetId: 'imported-openai',
    },
  });
  assert.equal(resolveImportedRegexPresetBindTarget({
    importType: 'context',
    presetId: 'ctx',
    presetStore: store,
  }), null);
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

test('getRegexImportSetName removes RegexBinding and Regex Scripts generic names', () => {
  const rules = [
    {
      scriptName: '状态栏清理',
      findRegex: '/<status>[\\s\\S]*?<\\/status>/g',
      replaceString: '',
      placement: [2],
    },
  ];

  assert.equal(stripGenericRegexSetName('RegexBinding: 状态栏清理'), '状态栏清理');
  assert.equal(getRegexImportSetName('RegexBinding (Regex Scripts)', rules, '导入正则'), '状态栏清理');
  assert.equal(getRegexImportSetName('Regex Scripts - 状态栏清理', [], '导入正则'), '状态栏清理');
  assert.equal(getRegexImportSetName('导入正则 1', rules, '导入正则'), '状态栏清理');
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
