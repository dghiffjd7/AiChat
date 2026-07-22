import assert from 'node:assert/strict';

import {
  createGuideStartFlowTools,
  MAID_ONBOARDING_FLOW_IDS,
} from '../../src/scripts/agent/tools/guide-start-flow-tools.js';

const started = [];
const [tool] = createGuideStartFlowTools({ startFlow: flowId => started.push(flowId) });
assert.equal(tool.name, 'guide.start_flow');
assert.deepEqual(tool.schema.properties.flowId.enum, MAID_ONBOARDING_FLOW_IDS);
assert.equal((await tool.execute({ flowId: 'setup-api' })).ok, true);
assert.deepEqual(started, ['setup-api']);
assert.deepEqual(await tool.execute({ flowId: 'unknown' }), {
  ok: false,
  started: false,
  flowId: 'unknown',
  reason: 'unsupported_flow',
});
assert.match(tool.description, /prefer this guide/i);
console.log('ok - guide.start_flow validates the built-in flow whitelist and starts the runtime');
