import assert from 'node:assert/strict';

import { getChatUI } from '../../src/scripts/ui/chat-ui-runtime-utils.js';

{
  const chatUI = { id: 'ui-contract' };
  const bridge = {
    chatUI: { id: 'ui-field' },
    getChatUI: () => chatUI,
  };
  assert.equal(getChatUI(bridge), chatUI);
  console.log('ok - chat ui runtime helper prefers explicit contract getter');
}

{
  const chatUI = { id: 'ui-field' };
  assert.equal(getChatUI({ chatUI }), chatUI);
  console.log('ok - chat ui runtime helper keeps legacy field fallback');
}

{
  const previousWindow = globalThis.window;
  const chatUI = { id: 'ui-window' };
  try {
    globalThis.window = {
      appBridge: {
        getChatUI: () => chatUI,
      },
    };
    assert.equal(getChatUI(), chatUI);
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
  console.log('ok - chat ui runtime helper resolves default window bridge');
}

{
  assert.equal(getChatUI(null), null);
  console.log('ok - chat ui runtime helper tolerates missing bridge');
}
