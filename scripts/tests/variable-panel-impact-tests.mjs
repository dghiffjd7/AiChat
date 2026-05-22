import assert from 'node:assert/strict';

import {
  buildVariableScopeImpactText,
  formatVariableScopeLabel,
} from '../../src/scripts/ui/variable-panel.js';

{
  assert.equal(
    formatVariableScopeLabel({ scope: 'session', sessionId: 'chat:alice' }),
    '当前会话「chat:alice」',
  );
  assert.equal(
    formatVariableScopeLabel({ scope: 'global', sessionId: 'chat:alice' }),
    '全局变量（所有会话共享）',
  );
  console.log('ok - variable impact scope labels separate session and global targets');
}

{
  const text = buildVariableScopeImpactText({
    scope: 'session',
    sessionId: 'chat:alice',
    action: 'import',
  });
  assert.match(text, /影响范围：当前会话「chat:alice」/);
  assert.match(text, /合并导入/);
  assert.match(text, /覆盖导入/);
  assert.match(text, /关闭窗口或取消确认不会写入/);
  console.log('ok - variable import impact describes write scope and cancellation');
}

{
  const text = buildVariableScopeImpactText({
    scope: 'session',
    sessionId: 'chat:alice',
    action: 'rules',
  });
  assert.match(text, /自动修改变量/);
  assert.match(text, /切换角色/);
  assert.match(text, /停用或删除规则/);
  console.log('ok - variable rule impact describes later automatic effects');
}

{
  const text = buildVariableScopeImpactText({
    scope: 'global',
    action: 'clear',
  });
  assert.match(text, /全局变量/);
  assert.match(text, /清空会删除当前范围内的变量值/);
  assert.match(text, /建议先导出备份/);
  console.log('ok - variable clear impact warns about backup for global scope');
}
