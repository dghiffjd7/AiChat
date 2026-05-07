import assert from 'node:assert/strict';

import {
  hideMentionDropdownCore,
  resolveMentionKeyAction,
  resolveMentionQueryContext,
} from '../../src/scripts/ui/chat/mention-input-ui-utils.js';

{
  assert.deepEqual(resolveMentionQueryContext('hello @Alice', 12), {
    mentionStartPos: 6,
    query: 'alice',
  });
  assert.equal(resolveMentionQueryContext('hello@Alice', 11), null);
  assert.equal(resolveMentionQueryContext('hello world', 11), null);
  console.log('ok - resolveMentionQueryContext finds standalone mention queries before cursor');
}

{
  assert.deepEqual(resolveMentionKeyAction({
    key: 'ArrowDown',
    selectedIndex: 0,
    itemCount: 3,
  }), {
    type: 'move',
    selectedIndex: 1,
  });
  assert.deepEqual(resolveMentionKeyAction({
    key: 'ArrowUp',
    selectedIndex: 0,
    itemCount: 3,
  }), {
    type: 'move',
    selectedIndex: 0,
  });
  assert.deepEqual(resolveMentionKeyAction({
    key: 'Enter',
    shiftKey: false,
    selectedIndex: 2,
    itemCount: 3,
  }), {
    type: 'select',
    selectedIndex: 2,
  });
  assert.deepEqual(resolveMentionKeyAction({
    key: 'Escape',
    selectedIndex: 1,
    itemCount: 3,
  }), {
    type: 'hide',
    selectedIndex: 1,
  });
  assert.deepEqual(resolveMentionKeyAction({
    key: 'Enter',
    shiftKey: true,
    selectedIndex: 1,
    itemCount: 3,
  }), {
    type: 'noop',
    selectedIndex: 1,
  });
  console.log('ok - resolveMentionKeyAction normalizes move select hide and noop keyboard routes');
}

{
  const dropdown = { style: { display: 'block' } };
  const next = hideMentionDropdownCore(dropdown);
  assert.equal(dropdown.style.display, 'none');
  assert.deepEqual(next, {
    mentionStartPos: -1,
    mentionQuery: '',
    mentionSelectedIndex: 0,
  });
  console.log('ok - hideMentionDropdownCore hides popup and returns reset mention state');
}
