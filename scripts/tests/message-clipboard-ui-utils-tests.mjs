import assert from 'node:assert/strict';

import { createMessageClipboardUiRuntime } from '../../src/scripts/ui/chat/message-clipboard-ui-utils.js';

{
  const runtime = createMessageClipboardUiRuntime();
  assert.deepEqual(runtime.getPoint({ clientX: 12, clientY: 34 }), { x: 12, y: 34 });
  assert.deepEqual(runtime.getPoint({ touches: [{ clientX: 56, clientY: 78 }] }), { x: 56, y: 78 });
  console.log('ok - getPoint resolves mouse and touch coordinates');
}

{
  const writes = [];
  const runtime = createMessageClipboardUiRuntime({
    navigatorLike: {
      clipboard: {
        async writeText(text) {
          writes.push(text);
        },
      },
    },
  });
  const ok = await runtime.copyToClipboard('hello');
  assert.equal(ok, true);
  assert.deepEqual(writes, ['hello']);
  console.log('ok - copyToClipboard prefers navigator clipboard when available');
}

{
  const bodyChildren = [];
  const runtime = createMessageClipboardUiRuntime({
    documentLike: {
      body: {
        appendChild(node) {
          bodyChildren.push(node);
        },
      },
      createElement() {
        return {
          style: {},
          setAttribute() {},
          select() {},
          remove() {
            bodyChildren.pop();
          },
        };
      },
    },
    execCopyCommand: command => command === 'copy',
  });
  const ok = await runtime.copyToClipboard('fallback');
  assert.equal(ok, true);
  assert.equal(bodyChildren.length, 0);
  console.log('ok - copyToClipboard falls back to detached textarea copy path');
}

{
  const removed = [];
  const runtime = createMessageClipboardUiRuntime();
  const wrapper = {
    querySelector(selector) {
      if (selector !== '.QQ_chat_msgdiv') return null;
      return {
        cloneNode() {
          return {
            textContent: 'line1\n\n\nline2',
            querySelectorAll() {
              return [{ remove: () => removed.push('code') }];
            },
          };
        },
      };
    },
  };
  const text = runtime.getBubbleCopyText(wrapper);
  assert.equal(text, 'line1\n\nline2');
  assert.deepEqual(removed, ['code']);
  console.log('ok - getBubbleCopyText strips code-like nodes and normalizes blank lines');
}
