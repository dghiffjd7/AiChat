import assert from 'node:assert/strict';

import { createMaidGuideFlowEngine } from '../../src/scripts/ui/maid-guide-flow-engine.js';

const flows = new Map([
  ['demo', {
    id: 'demo',
    steps: [
      { action: 'observe' },
      { action: 'click', canAdvance: (event, payload) => event === 'clicked' && payload?.id === 'target' },
      { action: 'wait-event', canAdvance: event => event === 'saved' },
    ],
  }],
]);

{
  const changes = [];
  const engine = createMaidGuideFlowEngine({
    getFlow: id => flows.get(id),
    onStateChange: state => changes.push(state),
  });

  assert.deepEqual(engine.getState(), { flowId: '', idx: 0, phase: 'idle' });
  assert.equal(engine.start('missing'), false);
  assert.equal(engine.start('demo'), true);
  assert.deepEqual(engine.getState(), { flowId: 'demo', idx: 0, phase: 'steps' });
  assert.equal(engine.emit('clicked', { id: 'target' }), false, 'observe steps only advance explicitly');
  assert.equal(engine.next(), true);
  assert.equal(engine.emit('clicked', { id: 'wrong' }), false);
  assert.equal(engine.getState().idx, 1);
  assert.equal(engine.emit('clicked', { id: 'target' }), true);
  assert.equal(engine.getState().idx, 2);
  assert.equal(engine.emit('saved'), true);
  assert.deepEqual(engine.getState(), { flowId: 'demo', idx: 2, phase: 'done' });
  assert.equal(engine.emit('saved'), false, 'done state ignores events');
  assert.ok(changes.length >= 4);
  console.log('ok - maid guide flow engine gates advancement by event and payload');
}

{
  const fallbacks = [];
  const engine = createMaidGuideFlowEngine({
    getFlow: id => flows.get(id),
    onFallback: payload => fallbacks.push(payload),
  });
  engine.start('demo');
  assert.equal(engine.prev(), false, 'first step has no previous step');
  engine.next();
  assert.equal(engine.prev(), true);
  assert.equal(engine.getState().idx, 0);
  assert.equal(engine.runFallback(), true);
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0].flow.id, 'demo');
  assert.equal(fallbacks[0].index, 0);
  assert.equal(engine.skip(), true);
  assert.deepEqual(engine.getState(), { flowId: '', idx: 0, phase: 'idle' });
  assert.equal(engine.skip(), false);
  assert.equal(engine.next(), false, 'idle state ignores manual advancement');
  console.log('ok - maid guide flow engine handles fallback, previous-step boundaries, and skip');
}
