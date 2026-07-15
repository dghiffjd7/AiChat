import assert from 'node:assert/strict';

import {
  applyPresetBlockHunk,
  buildPresetPreviewBlockMap,
  createLatestPreviewBuildQueue,
  presetBlockContentChanged,
} from '../../src/scripts/ui/preset-preview-utils.js';

{
  const content = '  repeated block\n';
  const text = `${content}separator\n${content}`;
  const map = buildPresetPreviewBlockMap({
    messageTexts: [text],
    blocks: [
      { id: 'first', content },
      { id: 'second', content },
    ],
  });

  assert.equal(map.size, 2, '相同正文的两个区块都应映射');
  assert.equal(map.get('first').start, 0);
  assert.equal(map.get('second').start, content.length + 'separator\n'.length);
  assert.equal(map.get('first').len, content.length, '映射范围必须包含边界空白');
  assert.equal(text.slice(map.get('first').start, map.get('first').start + map.get('first').len), content);
  console.log('ok - 重复正文与边界空白映射完整');
}

{
  assert.equal(presetBlockContentChanged('a\r\nb', 'a\nb'), false, '仅换行格式不同不应显示空 diff');
  assert.equal(presetBlockContentChanged('a\nb', 'a\nB'), true);
  console.log('ok - 区块正文比较统一 CRLF/LF');
}

{
  const base = 'one\ntwo\nthree\nfour';
  const draft = 'ONE\ntwo\nthree\nFOUR';
  assert.equal(applyPresetBlockHunk(base, draft, 0, 'accept'), 'ONE\ntwo\nthree\nfour');
  assert.equal(applyPresetBlockHunk(base, draft, 0, 'reject'), 'one\ntwo\nthree\nFOUR');
  console.log('ok - hunk 接受与回滚只影响目标变更');
}

{
  let resolveFirst;
  const calls = [];
  const committed = [];
  const queue = createLatestPreviewBuildQueue({
    build: async ({ marker }) => {
      calls.push(marker);
      if (marker === 'old') await new Promise(resolve => { resolveFirst = resolve; });
      return { marker };
    },
    onResult: result => committed.push(result.marker),
  });

  const running = queue.request({ marker: 'old' });
  await Promise.resolve();
  queue.request({ marker: 'new' });
  resolveFirst();
  await running;

  assert.deepEqual(calls, ['old', 'new'], '进行中的构建结束后应补跑最新请求');
  assert.deepEqual(committed, ['new'], '过期构建不得覆盖最新预览');
  console.log('ok - 预览异步重建保持 latest-wins');
}

