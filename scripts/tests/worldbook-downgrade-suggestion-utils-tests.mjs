import assert from 'node:assert/strict';

import {
  buildWorldbookDowngradeSuggestion,
  buildWorldbookDowngradeSuggestions,
} from '../../src/scripts/memory/worldbook-downgrade-suggestion-utils.js';

const memoryItems = [
  {
    id: 'row-1',
    tableId: 'important_people',
    tableName: '重要人物表',
    rowText: '姓名: 顾青；身份: 林家旧案的调查员',
    rowSummary: '顾青，林家旧案调查员',
  },
  {
    id: 'row-2',
    tableId: 'relationship',
    tableName: '关系记录',
    rowText: '顾青目前信任用户。',
  },
];

const suggestion = buildWorldbookDowngradeSuggestion({
  entry: {
    worldId: 'world-1',
    entryId: 'entry-1',
    title: '顾青人物设定',
    keys: ['顾青', '林家旧案'],
    constant: true,
  },
  memoryItems,
});
assert.ok(suggestion);
assert.equal(suggestion.coveredRowCount, 2);
assert.ok(suggestion.matchedTerms.includes('顾青'));
assert.match(suggestion.reason, /已被 2 条记忆表格覆盖/);
assert.match(suggestion.recommendation, /不会自动修改/);

assert.equal(buildWorldbookDowngradeSuggestion({
  entry: { title: '顾青', keys: ['顾青'], constant: false },
  memoryItems,
}), null);
assert.equal(buildWorldbookDowngradeSuggestions({
  entries: [
    { title: '顾青', keys: ['顾青'], constant: true },
    { title: '无关人物', keys: ['无关人物'], constant: true },
  ],
  memoryItems,
}).length, 1);

console.log('ok - worldbook downgrade suggestions only flag covered blue-light entries and never mutate them');
