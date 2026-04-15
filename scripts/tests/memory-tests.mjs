import assert from 'node:assert/strict';
import { extractTableEditBlocks, parseTableEditActions, stripTableEditBlocks } from '../../src/scripts/memory/memory-edit-parser.js';
import {
  getChatToRpBridgeSourceMeta,
  resolveChatToRpBridgeTableSettings,
  resolveRpToChatBridgeTableSettings,
} from '../../src/scripts/memory/memory-bridge-utils.js';
import { validateTemplate } from '../../src/scripts/memory/template-schema.js';
import { buildMemoryTablePlan, estimateTokens, parseMemoryPromptPositions } from '../../src/scripts/memory/memory-prompt-utils.js';

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
  const positions = parseMemoryPromptPositions('system_end+before_chat,history_depth');
  assert.deepEqual(positions, ['system_end', 'before_chat', 'history_depth']);
  assert.equal(estimateTokens('abcd', 'rough'), 1);
  assert.equal(estimateTokens('abcd', 'strict'), 4);
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
