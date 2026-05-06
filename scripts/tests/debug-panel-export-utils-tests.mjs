import assert from 'node:assert/strict';

import {
  buildTextDataUrl,
  detectAndroidRuntime,
  exportDebugTextFile,
  hasTauriRuntime,
} from '../../src/scripts/ui/debug-panel-export-utils.js';

{
  assert.equal(hasTauriRuntime({ __TAURI__: true }), true);
  assert.equal(hasTauriRuntime({ __TAURI_INTERNALS__: true }), true);
  assert.equal(hasTauriRuntime({}), false);
  assert.equal(detectAndroidRuntime({ userAgent: 'Mozilla Android 15' }), true);
  assert.equal(detectAndroidRuntime({ userAgent: 'Mozilla Desktop' }), false);
  console.log('ok - debug export runtime helpers detect tauri presence and android user agent');
}

{
  const dataUrl = buildTextDataUrl('abc', {
    encodeToBase64: (binary) => `b64:${binary}`,
  });
  assert.equal(dataUrl, 'data:text/plain;charset=utf-8;base64,b64:abc');
  console.log('ok - buildTextDataUrl encodes plain text into text/plain data URL');
}

{
  const calls = [];
  let appendedLink = null;
  const documentRef = {
    body: {
      appendChild(node) {
        appendedLink = node;
        calls.push(['append', node]);
      },
    },
    createElement() {
      return {
        style: {},
        click() {
          calls.push(['click']);
        },
        remove() {
          calls.push(['remove']);
        },
      };
    },
  };
  const URLRef = {
    createObjectURL() {
      calls.push(['createObjectURL']);
      return 'blob:url';
    },
    revokeObjectURL(url) {
      calls.push(['revoke', url]);
    },
  };
  const result = await exportDebugTextFile({
    text: 'web export',
    filename: 'web.txt',
    successLabel: 'TXT 已导出',
    globalRef: {},
    documentRef,
    URLRef,
    BlobRef: class FakeBlob {
      constructor(parts, options) {
        calls.push(['blob', parts, options]);
      }
    },
    onSuccess: (message) => calls.push(['success', message]),
  });
  assert.equal(result, true);
  assert.equal(appendedLink.href, 'blob:url');
  assert.equal(appendedLink.download, 'web.txt');
  assert.equal(appendedLink.style.display, 'none');
  assert.deepEqual(calls, [
    ['blob', ['web export'], { type: 'text/plain;charset=utf-8' }],
    ['createObjectURL'],
    ['append', appendedLink],
    ['click'],
    ['remove'],
    ['revoke', 'blob:url'],
    ['success', 'TXT 已导出：web.txt'],
  ]);
  console.log('ok - exportDebugTextFile uses browser download path when tauri runtime is absent');
}

{
  const calls = [];
  const result = await exportDebugTextFile({
    text: 'tauri export',
    filename: 'tauri.txt',
    successLabel: 'TXT 已导出',
    globalRef: { __TAURI__: true },
    navigatorRef: { userAgent: 'Desktop' },
    pickSavePath: async () => ({ cancelled: false, fallback: false, path: '/tmp/out.txt' }),
    safeInvokeFn: async (command, payload) => {
      calls.push([command, payload]);
      return { path: '/tmp/out.txt' };
    },
    onSuccess: (message) => calls.push(['success', message]),
  });
  assert.equal(result, true);
  assert.equal(calls[0][0], 'export_attachment');
  assert.equal(calls[0][1].fileName, 'tauri.txt');
  assert.equal(String(calls[0][1].path), '/tmp/out.txt');
  assert.equal(calls[1][0], 'success');
  assert.equal(calls[1][1], 'TXT 已导出：/tmp/out.txt');
  console.log('ok - exportDebugTextFile uses tauri export path and reports saved file path');
}
