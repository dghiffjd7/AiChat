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
  downloadJsonFile,
  flattenRegexImportRules,
  getRegexImportSetName,
  normalizeRegexScript,
  parseRegexImportText,
  prepareVersionIsolatedPresetRegexSets,
  stripGenericRegexSetName,
} = await import('../../src/scripts/utils/regex-transfer.js');
const {
  REGEX_CUSTOM_PROMPT_PRESET_TYPE,
  buildRegexCustomPromptPresetBind,
  detachRegexPresetBind,
  getRegexCustomPromptPresetBindIds,
  getRegexPresetBindIds,
  listRegexCustomPromptPresetChoices,
  resolveImportedRegexPresetBindTarget,
} = await import('../../src/scripts/ui/regex-preset-binding-utils.js');
const { PresetPanel } = await import('../../src/scripts/ui/preset-panel.js');

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

test('parseRegexImportText accepts ST and TavernHelper standalone single-rule exports', () => {
  const stRule = {
    id: 'st-single',
    scriptName: 'ST 单条',
    findRegex: '/foo/g',
    replaceString: 'bar',
    placement: [2],
  };
  const tavernRule = {
    id: 'helper-single',
    script_name: 'Helper 单条',
    enabled: true,
    find_regex: '/alpha/g',
    replace_string: 'beta',
    source: { ai_output: true },
    destination: { display: true, prompt: false },
  };

  const parsedSt = flattenRegexImportRules(parseRegexImportText(JSON.stringify(stRule)));
  const parsedTavern = flattenRegexImportRules(parseRegexImportText(JSON.stringify(tavernRule)));
  assert.equal(parsedSt.length, 1);
  assert.equal(parsedSt[0].findRegex, '/foo/g');
  assert.equal(parsedTavern.length, 1);
  assert.equal(parsedTavern[0].scriptName, 'Helper 单条');
  assert.deepEqual(parsedTavern[0].placement, [2]);
});

test('legacy regex rules without when default to user input and AI output', () => {
  const rule = normalizeRegexScript({
    name: '旧格式',
    pattern: 'hello',
    flags: 'gi',
    replacement: 'hi',
  });
  assert.deepEqual(rule.placement, [1, 2]);
});

test('preset bundled regex conversion uses the shared snake-case normalizer', () => {
  const panel = new PresetPanel({ store: {} });
  const rules = panel.convertStRegexScriptsToRules([{
    id: 'preset-helper',
    script_name: '预设 Helper',
    enabled: true,
    find_regex: '/state/g',
    replace_string: 'status',
    trim_strings: ['  keep  '],
    source: { ai_output: true, reasoning: true },
    destination: { display: true, prompt: false },
    run_on_edit: true,
    min_depth: 0,
    max_depth: 3,
  }]);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].scriptName, '预设 Helper');
  assert.equal(rules[0].findRegex, '/state/g');
  assert.deepEqual(rules[0].trimStrings, ['  keep  ']);
  assert.deepEqual(rules[0].placement, [2, 6]);
  assert.equal(rules[0].markdownOnly, true);
  assert.equal(rules[0].runOnEdit, true);
  assert.equal(rules[0].minDepth, 0);
  assert.equal(rules[0].maxDepth, 3);
});

test('new preset versions keep a complete independent regex set and only dedupe their own payload', () => {
  const sets = prepareVersionIsolatedPresetRegexSets([
    {
      name: '预设 A 原有正则',
      rules: [
        { scriptName: '旧规则一', findRegex: '/old-one/g', replaceString: 'one', placement: [2] },
        { scriptName: '旧规则二', findRegex: '/old-two/g', replaceString: 'two', placement: [2] },
      ],
    },
    {
      name: '预设 A1.1 新增正则',
      rules: [
        { scriptName: '重复的旧规则一', findRegex: '/old-one/g', replaceString: 'one', placement: [2] },
        { scriptName: '新增规则', findRegex: '/new/g', replaceString: 'new', placement: [2] },
      ],
    },
  ]);

  assert.equal(sets.length, 2);
  assert.deepEqual(sets.map(set => set.rules.map(rule => rule.findRegex)), [
    ['/old-one/g', '/old-two/g'],
    ['/new/g'],
  ]);
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

test('preset regex binding detach preserves other preset owners', () => {
  const bind = {
    type: 'preset',
    presetType: 'openai',
    presetId: 'preset-a',
    presetIds: ['preset-a', 'preset-b'],
  };

  assert.deepEqual(getRegexPresetBindIds(bind, 'openai'), ['preset-a', 'preset-b']);
  assert.deepEqual(detachRegexPresetBind(bind, {
    presetType: 'openai',
    presetId: 'preset-a',
  }), {
    matched: true,
    remainingIds: ['preset-b'],
    bind: {
      type: 'preset',
      presetType: 'openai',
      presetId: 'preset-b',
      presetIds: ['preset-b'],
    },
  });
  assert.deepEqual(detachRegexPresetBind(bind, {
    presetType: 'openai',
    presetId: 'preset-b',
  }), {
    matched: true,
    remainingIds: ['preset-a'],
    bind: {
      type: 'preset',
      presetType: 'openai',
      presetId: 'preset-a',
      presetIds: ['preset-a'],
    },
  });
  assert.deepEqual(detachRegexPresetBind({
    type: 'preset',
    presetType: 'sysprompt',
    presetId: 'preset-a',
  }, {
    presetType: 'sysprompt',
    presetId: 'preset-a',
  }), {
    matched: true,
    remainingIds: [],
    bind: null,
  });
  assert.equal(detachRegexPresetBind(bind, {
    presetType: 'context',
    presetId: 'preset-a',
  }).matched, false);
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

test('parseRegexImportText reads lowercase regexBinding embedded as JSON text', () => {
  const parsed = parseRegexImportText(JSON.stringify({
    metadata: JSON.stringify({
      regexBinding: {
        rules: [
          {
            script_name: '嵌入式 Helper 正则',
            find_regex: '/embedded/g',
            replace_string: 'parsed',
            source: { ai_output: true },
          },
        ],
      },
    }),
  }));

  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.sets[0].rules[0].scriptName, '嵌入式 Helper 正则');
  assert.equal(parsed.sets[0].rules[0].findRegex, '/embedded/g');
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

test('downloadJsonFile publishes Android Tauri exports through the native download command', async () => {
  const originalTauri = globalThis.__TAURI__;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const calls = [];
  globalThis.__TAURI__ = {
    core: {
      invoke: async (command, payload) => {
        calls.push([command, payload]);
        return { path: '/storage/emulated/0/Download/regex.json' };
      },
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Android 15' },
  });

  try {
    const result = await downloadJsonFile({ rules: [] }, 'regex.json');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'export_attachment');
    assert.equal(calls[0][1].fileName, 'regex.json');
    assert.equal(calls[0][1].path, undefined);
    assert.equal(result.path, '/storage/emulated/0/Download/regex.json');
  } finally {
    if (originalTauri === undefined) delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = originalTauri;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});
