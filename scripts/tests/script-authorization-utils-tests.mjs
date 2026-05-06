import assert from 'node:assert/strict';

import {
  buildScriptAuthorizationMessage,
  buildScriptPermissionLines,
} from '../../src/scripts/ui/script-authorization-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildScriptPermissionLines reflects settings toggles', () => {
  assert.deepEqual(
    buildScriptPermissionLines({
      scriptAllowReadMessages: true,
      scriptAllowModifyVariables: false,
      scriptAllowNetwork: true,
    }),
    [
      '读取聊天记录：允许',
      '修改变量：禁用',
      '访问网络：允许',
    ],
  );
});

test('buildScriptAuthorizationMessage composes intro text and bullet list', () => {
  assert.equal(
    buildScriptAuthorizationMessage({
      leadText: '已导入 2 条绑定脚本。',
      settings: {
        scriptAllowReadMessages: false,
        scriptAllowModifyVariables: true,
        scriptAllowNetwork: false,
      },
    }),
    '已导入 2 条绑定脚本。\n脚本可能需要权限：\n- 读取聊天记录：禁用\n- 修改变量：允许\n- 访问网络：禁用',
  );
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
