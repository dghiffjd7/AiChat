import assert from 'node:assert/strict';

import {
  buildMvuVarsPayload,
  createMvuEventRuntime,
} from '../../src/scripts/ui/chat/mvu-event-runtime-utils.js';

{
  const payload = buildMvuVarsPayload({
    sessionId: ' s1 ',
    listVariables: sid => ({ sid, localOnly: 1 }),
    listGlobalVariables: () => ({ globalOnly: 2 }),
    isSharedVariableSession: () => false,
    buildVariableContextFn: ({ baseVars, globalVars, localVars }) => ({
      variableContext: { baseVars, globalVars, localVars },
    }),
  });
  assert.deepEqual(payload, {
    baseVars: { sid: 's1', localOnly: 1 },
    globalVars: { globalOnly: 2 },
    localVars: { sid: 's1', localOnly: 1 },
  });

  const sharedPayload = buildMvuVarsPayload({
    getCurrentSessionId: () => 's2',
    listVariables: () => ({ localOnly: 1 }),
    listGlobalVariables: () => ({ globalOnly: 2 }),
    isSharedVariableSession: () => true,
    buildVariableContextFn: ({ baseVars }) => ({ variableContext: baseVars }),
  });
  assert.deepEqual(sharedPayload, { globalOnly: 2 });
  console.log('ok - buildMvuVarsPayload resolves local and shared/global variable payloads');
}

{
  const events = [];
  const runtime = createMvuEventRuntime({
    scriptRuntime: {
      hasListener(name) {
        return name !== 'missing';
      },
      dispatchEvent(name, payload, options) {
        events.push({ name, payload, options });
        return Promise.resolve();
      },
    },
    logger: {
      warn() {},
    },
    buildVarsPayload(sessionId, { useGlobal } = {}) {
      return { sessionId, useGlobal: Boolean(useGlobal), value: 1 };
    },
  });

  assert.equal(runtime.shouldEmitMvuEvent('mag_variable_initialized'), true);
  assert.equal(runtime.emitInitialized('s1', 3, { useGlobal: true }), true);
  assert.equal(runtime.emitStarted('s1', { hp: 1 }, { useGlobal: false }), true);
  assert.equal(runtime.emitEnded('s1', { useGlobal: true }), true);
  assert.deepEqual(events, [
    {
      name: 'mag_variable_initialized',
      payload: {
        scope: 'global',
        variables: { sessionId: 's1', useGlobal: true, value: 1 },
        args: [{ sessionId: 's1', useGlobal: true, value: 1 }, 3],
      },
      options: { allowMutate: false },
    },
    {
      name: 'mag_variable_update_started',
      payload: {
        scope: 'chat',
        updates: { hp: 1 },
        args: [{ scope: 'chat', updates: { hp: 1 } }],
      },
      options: { allowMutate: false },
    },
    {
      name: 'mag_variable_update_ended',
      payload: {
        scope: 'global',
        variables: { sessionId: 's1', useGlobal: true, value: 1 },
        args: [{ sessionId: 's1', useGlobal: true, value: 1 }],
      },
      options: { allowMutate: false },
    },
    {
      name: 'mag_variable_update_ended_for_zod',
      payload: {
        scope: 'global',
        variables: { sessionId: 's1', useGlobal: true, value: 1 },
        args: [{ sessionId: 's1', useGlobal: true, value: 1 }],
      },
      options: { allowMutate: false },
    },
  ]);
  console.log('ok - createMvuEventRuntime dispatches initialized started and ended events with immutable payloads');
}

{
  const runtime = createMvuEventRuntime({
    scriptRuntime: {
      hasListener() {
        return false;
      },
      dispatchEvent() {
        throw new Error('should not dispatch');
      },
    },
    buildVarsPayload() {
      return null;
    },
  });
  assert.equal(runtime.emitInitialized('s1'), false);
  assert.equal(runtime.emitStarted('s1', {}), false);
  assert.equal(runtime.emitEnded('s1'), false);
  console.log('ok - createMvuEventRuntime skips emission when listeners or payloads are unavailable');
}
