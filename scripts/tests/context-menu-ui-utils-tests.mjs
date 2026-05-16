import assert from 'node:assert/strict';

import {
  buildContextMenuActions,
  canDeleteCurrentSwipe,
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
  const actions = buildContextMenuActions(
    { role: 'assistant', type: 'text', meta: { renderRich: true } },
    { hasCode: false, isThreadingEnabled: false },
  );
  assert.deepEqual(actions.map(item => item.key), ['view-code', 'generate-image', 'copy-text', 'regenerate', 'delete']);
  console.log('ok - buildContextMenuActions exposes raw editor for creative assistant messages');
}

{
  const message = {
    role: 'assistant',
    type: 'text',
    meta: {
      activeSwipe: 1,
      swipes: [
        { content: 'first' },
        { content: 'second' },
      ],
    },
  };
  const actions = buildContextMenuActions(message, {
    hasCode: false,
    isThreadingEnabled: false,
  });
  assert.equal(canDeleteCurrentSwipe(message), true);
  assert.deepEqual(actions.map(item => item.key), ['generate-image', 'copy-text', 'regenerate', 'delete-current-swipe', 'delete']);
  assert.equal(buildContextMenuActions({
    ...message,
    meta: { ...message.meta, swipes: [{ content: 'only' }] },
  }).some(action => action.key === 'delete-current-swipe'), false);
  console.log('ok - buildContextMenuActions exposes current swipe deletion only for multi-swipe assistant messages');
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
  const text = resolveViewCodeText({
    rawOriginal: '<image_prompt>old</image_prompt>',
    rawSource: 'current [img-C:\\\\tmp\\\\generated.png]',
    meta: { renderRich: true },
  });
  assert.equal(text, 'current [img-C:\\\\tmp\\\\generated.png]');
  console.log('ok - resolveViewCodeText prefers current rich source so generated image tokens survive edits');
}

{
  const text = resolveViewCodeText({
    rawSource: 'message current [img-C:\\\\tmp\\\\generated.png]',
    meta: {
      renderRich: true,
      activeSwipe: 0,
      swipes: [
        { rawSource: 'stale branch source', rawOriginal: '<image_prompt>old</image_prompt>' },
      ],
    },
  });
  assert.equal(text, 'message current [img-C:\\\\tmp\\\\generated.png]');
  console.log('ok - resolveViewCodeText avoids stale swipe sources when message source has image tokens');
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
