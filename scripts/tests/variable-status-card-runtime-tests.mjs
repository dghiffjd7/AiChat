import assert from 'node:assert/strict';

import { buildVariableStatusSnapshot } from '../../src/scripts/ui/variable-status-card.js';

const disabledStore = {
  getSessionSettings: () => ({ variableRuntimeEnabled: false }),
  listVariableSchemas: () => {
    throw new Error('disabled runtime must not read variable schemas');
  },
  listVariables: () => {
    throw new Error('disabled runtime must not read variable values');
  },
};

assert.equal(
  buildVariableStatusSnapshot({
    chatStore: disabledStore,
    sessionId: 'session-disabled',
    inline: true,
  }),
  null,
  'disabled runtime should suppress existing status placeholders without touching stored data',
);

console.log('variable status card runtime tests passed');
