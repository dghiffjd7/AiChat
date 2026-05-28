import assert from 'node:assert/strict';

import {
  getAgentFailureSeenAt,
  markAgentFailuresSeen,
} from '../../src/scripts/ui/agent-failure-read-state.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
};

{
  const storage = createStorage();
  assert.equal(getAgentFailureSeenAt({ storage }), 0);
  assert.equal(markAgentFailuresSeen({ at: 100, storage }), 100);
  assert.equal(getAgentFailureSeenAt({ storage }), 100);
  assert.equal(markAgentFailuresSeen({ at: 50, storage }), 100);
  assert.equal(getAgentFailureSeenAt({ storage }), 100);
  console.log('ok - agent failure read state records monotonic global seen time');
}

{
  const storage = createStorage();
  markAgentFailuresSeen({ surface: 'moments', at: 90, storage });
  assert.equal(getAgentFailureSeenAt({ surface: 'moments', storage }), 90);
  assert.equal(getAgentFailureSeenAt({ surface: 'chat', storage }), 0);
  markAgentFailuresSeen({ at: 120, storage });
  assert.equal(getAgentFailureSeenAt({ surface: 'moments', storage }), 120);
  assert.equal(getAgentFailureSeenAt({ surface: 'chat', storage }), 120);
  console.log('ok - agent failure read state combines scoped and global seen time');
}
