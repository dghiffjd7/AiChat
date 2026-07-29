import assert from 'node:assert/strict';
import { extractTableEditBlocks, parseTableEditActions, stripTableEditBlocks } from '../../src/scripts/memory/memory-edit-parser.js';
import {
  getChatToMomentsBridgeTableIds,
  getChatToRpBridgeSourceMeta,
  getMomentsToChatBridgeTableIds,
  getRpToMomentsBridgeTableIds,
  resolveChatToMomentsBridgeTableSettings,
  resolveRpToMomentsBridgeTableSettings,
  resolveChatToRpBridgeTableSettings,
  resolveRpToChatBridgeTableSettings,
} from '../../src/scripts/memory/memory-bridge-utils.js';
import { DEFAULT_MEMORY_TEMPLATE } from '../../src/scripts/memory/default-template.js';
import {
  getSummaryTableIdsForContext,
  normalizeMemoryTableUsage,
  tableMatchesMemoryContext,
} from '../../src/scripts/memory/memory-context-utils.js';
import { validateTemplate } from '../../src/scripts/memory/template-schema.js';
import {
  buildMemoryBridgeYamlLines,
  buildMemoryTablePlan,
  estimateTokens,
  formatMemoryRowText,
  getMemoryBridgeTablePromptLabel,
  parseMemoryPromptPositions,
} from '../../src/scripts/memory/memory-prompt-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('parseTableEditActions: json line', () => {
  const input = '{"action":"update","table_id":"relationship","row_index":0,"data":{"relation":"朋友"}}';
  const actions = parseTableEditActions(input);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'update');
  assert.equal(actions[0].tableId, 'relationship');
  assert.equal(actions[0].rowIndex, 0);
  assert.deepEqual(actions[0].data, { relation: '朋友' });
});

test('parseTableEditActions: array + comments + functions', () => {
  const input = [
    '[{"action":"insert","table_id":"profile","data":{"name":"小A"}}]',
    '<!-- updateRow(0, 2, {"x":"y"}) -->',
    'deleteRow(1, 0)',
  ].join('\n');
  const actions = parseTableEditActions(input);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].action, 'insert');
  assert.equal(actions[1].action, 'update');
  assert.equal(actions[1].tableIndex, 0);
  assert.equal(actions[1].rowIndex, 2);
  assert.equal(actions[2].action, 'delete');
});

test('extractTableEditBlocks + stripTableEditBlocks', () => {
  const input = 'hello\n<tableEdit>{"action":"insert","table_id":"t","data":{"a":1}}</tableEdit>\nworld';
  const extracted = extractTableEditBlocks(input);
  assert.equal(extracted.actions.length, 1);
  assert.ok(!extracted.text.includes('<tableEdit'));
  const stripped = stripTableEditBlocks(input);
  assert.ok(!stripped.includes('<tableEdit'));
});

test('extractTableEditBlocks ignores incomplete tableEdit tags', () => {
  const input = 'before\n<tableEdit>\nafter';
  const extracted = extractTableEditBlocks(input);
  assert.equal(extracted.text, input);
  assert.deepEqual(extracted.blocks, []);
  assert.deepEqual(extracted.actions, []);
  assert.equal(stripTableEditBlocks(input), input);
});

test('extractTableEditBlocks keeps prose between a dangling tag and a later block', () => {
  // 创意写作真实形态：thinking 中途出现未闭合 <tableEdit>，消息末尾按预设要求输出完整块。
  // 悬空开标签不得与末尾块的闭合错误配对——中间的 thinking 尾部与正文必须完整保留。
  const input = [
    '<thinking>',
    '需要更新表格：',
    '<tableEdit>',
    'insertRow(0, {"0":"藏经阁"})',
    '（未输出闭合，thinking 继续）',
    '</thinking>',
    '',
    '楚寻踏入藏经阁，檀香扑面而来。',
    '他翻开第一卷《太初真解》。',
    '',
    '<tableEdit>',
    '<!--',
    'updateRow(0, 0, {"1":"主角"})',
    '-->',
    '</tableEdit>',
  ].join('\n');
  const extracted = extractTableEditBlocks(input);
  assert.equal(extracted.text.includes('楚寻踏入藏经阁'), true, '正文必须保留');
  assert.equal(extracted.text.includes('（未输出闭合，thinking 继续）'), true, '悬空块后的散文必须保留');
  assert.equal(extracted.text.includes('</thinking>'), true, 'thinking 结构必须保留');
  assert.equal(extracted.text.includes('insertRow'), false, '悬空块命令行应被提取');
  assert.equal(extracted.blocks.length, 2, '悬空命令前缀与末尾完整块都应提取');
  assert.equal(extracted.actions.length, 2);
});

test('stripTableEditBlocks keeps body when dangling tag has no trailing close', () => {
  const input = [
    '<thinking>推进剧情<tableEdit>',
    'insertRow(0, {"0":"v"})',
    '</thinking>',
    '正文继续。',
  ].join('\n');
  const stripped = stripTableEditBlocks(input);
  assert.equal(stripped.includes('正文继续。'), true);
  assert.equal(stripped.includes('</thinking>'), true);
});

test('extractTableEditBlocks keeps complete but invalid tableEdit blocks', () => {
  const input = 'before <tableEdit>not a valid action</tableEdit> after';
  const extracted = extractTableEditBlocks(input);
  assert.equal(extracted.text, input);
  assert.deepEqual(extracted.blocks, []);
  assert.deepEqual(extracted.actions, []);
  assert.equal(stripTableEditBlocks(input), input);
});

test('validateTemplate: rules fields accepted', () => {
  const template = {
    meta: { id: 'tpl1', name: '模板' },
    tables: [
      {
        id: 'profile',
        name: '档案',
        scope: 'contact',
        columns: [{ id: 'name', name: '姓名', type: 'text' }],
        sourceData: { note: 'note', insertNode: 'insert' },
        updateConfig: { contextDepth: 2 },
        exportConfig: {
          enabled: true,
          splitByRow: false,
          entryName: '档案表',
          keywords: 'name',
          injectionTemplate: '{{tableData}}',
        },
      },
    ],
  };
  const result = validateTemplate(template);
  assert.equal(result.ok, true);
});

test('validateTemplate: latest-user injection positions accepted', () => {
  const template = {
    meta: { id: 'tpl-latest', name: '模板' },
    tables: [],
    injection: {
      position: 'before_latest_user+after_latest_user+history_before+history_after',
    },
  };
  const result = validateTemplate(template);
  assert.equal(result.ok, true);
});

test('default memory template injects dynamic data before latest user', () => {
  assert.equal(DEFAULT_MEMORY_TEMPLATE.injection.position, 'before_latest_user');
});

test('default outline tables expose only user-editable categories', () => {
  const outlineTables = DEFAULT_MEMORY_TEMPLATE.tables.filter(table => table.id.endsWith('_outline'));
  assert.deepEqual(outlineTables.map(table => table.id), [
    'chat_outline',
    'group_outline',
    'moment_outline',
    'rp_outline',
  ]);
  for (const table of outlineTables) {
    const sectionColumn = table.columns.find(column => column.id === 'section');
    assert.equal(sectionColumn?.name, '大纲类别');
    assert.deepEqual(sectionColumn?.options, [
      'current',
      'plot',
      'relationships',
      'open_threads',
    ]);
    assert.equal(sectionColumn?.options?.includes('history'), false);
  }
});

test('validateTemplate: invalid field types', () => {
  const template = {
    meta: { id: 'tpl2', name: '模板' },
    tables: [
      {
        id: 'bad',
        name: '错误表',
        columns: [],
        sourceData: 'oops',
      },
    ],
  };
  const result = validateTemplate(template);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('parseMemoryPromptPositions + estimateTokens', () => {
  const positions = parseMemoryPromptPositions('system_end+before_chat,history_depth,before_latest_user,after_latest_user');
  assert.deepEqual(positions, ['system_end', 'before_chat', 'history_depth', 'before_latest_user', 'after_latest_user']);
  assert.equal(estimateTokens('abcd', 'rough'), 1);
  assert.equal(estimateTokens('abcd', 'strict'), 4);
});

test('memory bridge yaml uses concise table labels', () => {
  assert.equal(getMemoryBridgeTablePromptLabel('character_profile'), '角色档案');
  assert.equal(getMemoryBridgeTablePromptLabel('group_consensus'), '群聊共识');
  assert.equal(getMemoryBridgeTablePromptLabel('moment_outline'), '大纲');
  assert.equal(getMemoryBridgeTablePromptLabel('rp_tasks'), '任务');
  assert.deepEqual(buildMemoryBridgeYamlLines({
    header: '【动态】',
    tables: [
      { label: '摘要', rows: ['第1轮：发了晚安动态'] },
      { label: '大纲', rows: ['公开互动偏轻松'] },
    ],
  }), [
    '"【动态】":',
    '  - "摘要":',
    '      - "第1轮：发了晚安动态"',
    '  - "大纲":',
    '      - "公开互动偏轻松"',
  ]);
});

test('moment memory context only matches dynamic global tables', () => {
  assert.equal(normalizeMemoryTableUsage('moments'), 'moments');
  assert.deepEqual(getSummaryTableIdsForContext({
    uiMode: 'moments',
    contextType: 'global',
  }), {
    summaryTableId: 'moment_summary',
    outlineTableId: 'moment_outline',
  });
  const dynamicTables = DEFAULT_MEMORY_TEMPLATE.tables.filter(table => tableMatchesMemoryContext(table, {
    uiMode: 'moments',
    contextType: 'global',
    sessionId: 'moments',
  }));
  assert.deepEqual(dynamicTables.map(table => table.id), ['moment_summary', 'moment_outline']);
  assert.deepEqual(dynamicTables.map(table => table.columns.map(col => col.id)), [['summary', 'keywords'], ['section', 'outline']]);
});

test('buildMemoryTablePlan: pinned first + max_rows', () => {
  const tableById = new Map([
    ['profile', { id: 'profile', name: '档案', columns: [{ id: 'name', name: '姓名', type: 'text' }] }],
    ['relationship', { id: 'relationship', name: '关系', columns: [{ id: 'relation', name: '关系', type: 'text' }] }],
  ]);
  const rows = [
    { id: 'r1', table_id: 'relationship', row_data: { relation: '朋友' }, is_pinned: true, priority: 0, updated_at: 10, contact_id: 'c1' },
    { id: 'r2', table_id: 'profile', row_data: { name: '小A' }, is_pinned: false, priority: 5, updated_at: 20, contact_id: 'c1' },
    { id: 'r3', table_id: 'relationship', row_data: { relation: '同事' }, is_pinned: false, priority: 1, updated_at: 30, contact_id: 'c1' },
  ];
  const plan = buildMemoryTablePlan({
    rows,
    tableById,
    tableOrder: ['profile', 'relationship'],
    autoExtract: true,
    maxRows: 2,
    tokenBudgetData: 999,
    tokenMode: 'rough',
  });
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].id, 'r1');
  assert.equal(plan.items[1].id, 'r2');
  assert.equal(plan.truncated.length, 1);
  assert.equal(plan.truncated[0].reason, 'max_rows');
  assert.equal(plan.rowIndexMap.relationship[0], 'r1');
});

test('buildMemoryTablePlan: max_tokens truncation', () => {
  const tableById = new Map([
    ['profile', { id: 'profile', name: '档案', columns: [{ id: 'note', name: '备注', type: 'text' }] }],
  ]);
  const rows = [
    { id: 'a1', table_id: 'profile', row_data: { note: 'x'.repeat(30) }, is_pinned: false, priority: 0, updated_at: 10, contact_id: 'c1' },
    { id: 'a2', table_id: 'profile', row_data: { note: 'y'.repeat(30) }, is_pinned: false, priority: 0, updated_at: 9, contact_id: 'c1' },
  ];
  const plan = buildMemoryTablePlan({
    rows,
    tableById,
    tableOrder: ['profile'],
    autoExtract: true,
    maxRows: 10,
    tokenBudgetData: 60,
    tokenMode: 'strict',
  });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.truncated.length, 1);
  assert.equal(plan.truncated[0].reason, 'max_tokens');
});

test('buildMemoryTablePlan: summary rows use round-first text and oldest-to-newest order', () => {
  const tableById = new Map([
    ['chat_summary', {
      id: 'chat_summary',
      name: '私聊摘要',
      columns: [
        { id: 'time', name: '时间/轮次', type: 'text' },
        { id: 'summary', name: '摘要', type: 'multiline' },
      ],
    }],
  ]);
  const rows = [
    {
      id: 'sum_3',
      table_id: 'chat_summary',
      row_data: { time: '第6轮 2026/04/16 15:35', summary: '第六轮摘要' },
      is_pinned: false,
      priority: 0,
      updated_at: 30,
      contact_id: 'c1',
    },
    {
      id: 'sum_2',
      table_id: 'chat_summary',
      row_data: { time: '第5轮 2026/04/16 10:42', summary: '第五轮摘要' },
      is_pinned: false,
      priority: 0,
      updated_at: 20,
      contact_id: 'c1',
    },
    {
      id: 'sum_1',
      table_id: 'chat_summary',
      row_data: { time: '第4轮 2026/04/16 10:40', summary: '第四轮摘要' },
      is_pinned: false,
      priority: 0,
      updated_at: 10,
      contact_id: 'c1',
    },
  ];
  const plan = buildMemoryTablePlan({
    rows,
    tableById,
    tableOrder: ['chat_summary'],
    autoExtract: true,
    maxRows: 10,
    tokenBudgetData: 999,
    tokenMode: 'rough',
  });
  assert.match(plan.tableData, /- \[0\] 第4轮：第四轮摘要/);
  assert.match(plan.tableData, /- \[1\] 第5轮：第五轮摘要/);
  assert.match(plan.tableData, /- \[2\] 第6轮：第六轮摘要/);
  assert.deepEqual(plan.rowIndexMap.chat_summary, ['sum_1', 'sum_2', 'sum_3']);
});

test('formatMemoryRowText keeps interval labels for compacted summary rows', () => {
  const columns = [{ id: 'time', name: '时间' }, { id: 'summary', name: '摘要' }, { id: 'keywords', name: '关键词' }];
  assert.equal(
    formatMemoryRowText({ time: '第1-40轮', summary: '大总结' }, columns, 'chat_summary'),
    '第1-40轮：大总结',
  );
  assert.equal(
    formatMemoryRowText({ time: '第40轮', summary: '单轮摘要' }, columns, 'chat_summary'),
    '第40轮：单轮摘要',
  );
});

test('formatMemoryRowText never injects keywords as summary body', () => {
  const columns = [{ id: 'time', name: '时间' }, { id: 'summary', name: '摘要' }, { id: 'keywords', name: '关键词' }];
  assert.equal(
    formatMemoryRowText({ time: '第3轮', summary: '', keywords: '林昭, 死敌' }, columns, 'chat_summary'),
    '第3轮',
  );
});

test('getChatToRpBridgeSourceMeta: empty source defaults to all_social', () => {
  const meta = getChatToRpBridgeSourceMeta('');
  assert.deepEqual(meta, {
    sourceMode: 'all_social',
    sourceId: '',
    sourceIsGroup: false,
  });
});

test('resolveChatToRpBridgeTableSettings: all_social enables both outlines by legacy defaults', () => {
  const settings = resolveChatToRpBridgeTableSettings({
    sessionSettings: {},
    sourceMode: 'all_social',
    fallbackEnabled: true,
    fallbackLimit: 0,
  });
  assert.ok(Object.prototype.hasOwnProperty.call(settings, 'character_profile'));
  assert.ok(Object.prototype.hasOwnProperty.call(settings, 'group_summary'));
  assert.equal(settings.chat_outline.enabled, true);
  assert.equal(settings.group_outline.enabled, true);
  assert.equal(settings.character_profile.enabled, false);
  assert.equal(settings.group_summary.enabled, false);
  assert.equal(settings.chat_outline.limit, 0);
  assert.equal(settings.group_outline.limit, 0);
  assert.equal(settings.character_profile.limit, 0);
});

test('resolveRpToChatBridgeTableSettings: explicit table settings override legacy fields', () => {
  const settings = resolveRpToChatBridgeTableSettings({
    sessionSettings: {
      rpBridgeEnabled: false,
      rpBridgeOutlineLimit: 5,
      rpBridgeTableSettings: {
        rp_outline: { enabled: true, limit: 2 },
      },
    },
    fallbackEnabled: false,
    fallbackLimit: 5,
  });
  assert.ok(Object.prototype.hasOwnProperty.call(settings, 'rp_important_people'));
  assert.ok(Object.prototype.hasOwnProperty.call(settings, 'rp_tasks'));
  assert.ok(Object.prototype.hasOwnProperty.call(settings, 'rp_summary'));
  assert.equal(settings.rp_outline.enabled, true);
  assert.equal(settings.rp_outline.limit, 2);
  assert.equal(settings.rp_important_people.enabled, false);
  assert.equal(settings.rp_tasks.enabled, false);
  assert.equal(settings.rp_summary.enabled, false);
});

test('dynamic memory bridge table ids include summary and outline tables', () => {
  assert.deepEqual(getMomentsToChatBridgeTableIds(), ['moment_summary', 'moment_outline']);
  assert.deepEqual(getChatToMomentsBridgeTableIds(), [
    'character_profile',
    'relationship',
    'events',
    'items',
    'chat_summary',
    'chat_outline',
    'important_people',
    'group_consensus',
    'group_summary',
    'group_outline',
  ]);
  assert.deepEqual(getRpToMomentsBridgeTableIds(), [
    'rp_important_people',
    'rp_tasks',
    'rp_summary',
    'rp_outline',
  ]);
});

test('dynamic memory bridge defaults enable selected profile and writing tables', () => {
  const chatSettings = resolveChatToMomentsBridgeTableSettings({
    settings: {},
    fallbackEnabled: true,
    fallbackLimit: 5,
  });
  assert.equal(chatSettings.character_profile.enabled, true);
  assert.equal(chatSettings.relationship.enabled, true);
  assert.equal(chatSettings.events.enabled, true);
  assert.equal(chatSettings.items.enabled, false);
  assert.equal(chatSettings.important_people.enabled, false);
  assert.equal(chatSettings.group_consensus.enabled, false);
  assert.equal(chatSettings.chat_summary.enabled, true);
  assert.equal(chatSettings.group_outline.enabled, true);
  assert.equal(chatSettings.character_profile.limit, 0);
  assert.equal(chatSettings.relationship.limit, 5);
  assert.equal(chatSettings.items.limit, 0);

  const rpSettings = resolveRpToMomentsBridgeTableSettings({
    settings: {},
    fallbackEnabled: true,
    fallbackLimit: 5,
  });
  assert.equal(rpSettings.rp_important_people.enabled, true);
  assert.equal(rpSettings.rp_tasks.enabled, true);
  assert.equal(rpSettings.rp_summary.enabled, true);
  assert.equal(rpSettings.rp_outline.enabled, true);
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
