import assert from 'node:assert/strict';

import {
  buildContextMenuActions,
  positionContextMenu,
  resolveViewCodeText,
} from '../../src/scripts/ui/chat/context-menu-ui-utils.js';

{
  const actions = buildContextMenuActions(
    { role: 'assistant', type: 'image' },
    { hasCode: true, isThreadingEnabled: true },
  );
  assert.deepEqual(actions.map(item => item.key), ['reply', 'view-code', 'download', 'generate-image', 'copy-text', 'regenerate', 'delete']);
  console.log('ok - buildContextMenuActions composes assistant actions with reply code and download entries');
}

{
  const actions = buildContextMenuActions(
    { role: 'user', status: 'pending', meta: {} },
    { hasCode: false, isThreadingEnabled: false },
  );
  assert.deepEqual(actions.map(item => item.key), ['send-to-here', 'copy-text', 'delete']);
  console.log('ok - buildContextMenuActions preserves pending-user specific actions');
}

{
  const actions = buildContextMenuActions(
    { role: 'assistant', type: 'text', meta: { generatedMedia: { status: 'running' } } },
    { hasCode: false, isThreadingEnabled: false },
  );
  assert.deepEqual(actions.map(item => item.key), ['cancel-media-generation']);
  console.log('ok - buildContextMenuActions exposes cancel action for running media generation');
}

{
  const text = resolveViewCodeText({
    content: 'fallback',
    raw: 'raw',
    rawSource: 'raw-source',
    meta: {
      activeSwipe: 1,
      swipes: [
        { raw: 'swipe-0' },
        { rawOriginal: 'swipe-1-original' },
      ],
    },
  });
  assert.equal(text, 'swipe-1-original');
  console.log('ok - resolveViewCodeText prefers active swipe raw payload before message fallbacks');
}

{
  const menu = {
    style: {},
    offsetWidth: 240,
    offsetHeight: 120,
  };
  positionContextMenu(menu, {
    x: 380,
    y: 620,
    windowLike: { innerWidth: 400, innerHeight: 640 },
  });
  assert.equal(menu.style.display, 'block');
  assert.equal(menu.style.visibility, 'visible');
  assert.equal(menu.style.left, '152px');
  assert.equal(menu.style.top, '512px');
  console.log('ok - positionContextMenu clamps menu within viewport bounds');
}
