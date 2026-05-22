import assert from 'node:assert/strict';

import {
  buildMemoryImpactText,
  formatMemoryImpactScopeLabel,
} from '../../src/scripts/ui/memory-impact-utils.js';

{
  assert.equal(
    formatMemoryImpactScopeLabel({ contextType: 'contact', contactId: 'chat:alice' }),
    '聊天室「chat:alice」记忆',
  );
  assert.equal(
    formatMemoryImpactScopeLabel({ contextType: 'group', groupId: 'group:team' }),
    '群聊「group:team」记忆',
  );
  assert.equal(
    formatMemoryImpactScopeLabel({ scope: 'global', sessionId: 'chat:alice' }),
    '全局记忆（所有会话可共享）',
  );
  assert.equal(
    formatMemoryImpactScopeLabel({ contextType: 'global', sessionId: 'chat:alice' }),
    '全局记忆（所有会话可共享）',
  );
  console.log('ok - memory impact scope labels separate contact group and global targets');
}

{
  const text = buildMemoryImpactText({
    contextType: 'contact',
    contactId: 'chat:alice',
    action: 'edit',
  });
  assert.match(text, /影响范围：聊天室「chat:alice」记忆/);
  assert.match(text, /保存会立即写入记忆表格/);
  assert.match(text, /后续提示词注入/);
  assert.match(text, /取消或关闭不会保存/);
  console.log('ok - memory edit impact describes write scope and cancellation');
}

{
  const text = buildMemoryImpactText({
    scope: 'global',
    action: 'import',
  });
  assert.match(text, /全局记忆/);
  assert.match(text, /批量写入记忆数据/);
  assert.match(text, /建议先导出备份/);
  assert.match(text, /取消确认不会写入/);
  console.log('ok - memory import impact warns about bulk writes and backups');
}

{
  const text = buildMemoryImpactText({
    contextType: 'rp',
    contactId: 'rp:persona',
    action: 'export_worldbook',
  });
  assert.match(text, /创意写作\/RP「rp:persona」记忆/);
  assert.match(text, /追加到目标世界书/);
  assert.match(text, /后续消息可能被世界书条目触发/);
  console.log('ok - memory worldbook export impact describes cross-surface effects');
}
