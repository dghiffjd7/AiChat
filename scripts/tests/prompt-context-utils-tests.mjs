import assert from 'node:assert/strict';

import {
  buildPresetContext,
  buildReplyPromptHint,
  createPresetRuntime,
  resolveEnabledPreset,
  resolveResolvedPreset,
} from '../../src/scripts/ui/chat/prompt-context-utils.js';

{
  assert.deepEqual(buildPresetContext({ sessionId: ' s1 ', uiMode: '' }), {
    sessionId: 's1',
    uiMode: 'chat',
  });
  console.log('ok - buildPresetContext normalizes session id and ui mode fallback');
}

{
  const appBridge = {
    presets: {
      getResolvedActive(type, context) {
        return {
          preset: { type, context },
        };
      },
    },
  };
  assert.deepEqual(resolveResolvedPreset(appBridge, 'openai', { sessionId: 's1' }), {
    type: 'openai',
    context: { sessionId: 's1' },
  });
  assert.deepEqual(resolveResolvedPreset({}, 'reasoning', { sessionId: 's1' }), {});
  console.log('ok - resolveResolvedPreset reads preset state and tolerates missing bridge');
}

{
  const appBridge = {
    presets: {
      getState() {
        return { enabled: { sysprompt: true, openai: false } };
      },
      getResolvedActive(type) {
        return { preset: { type, ok: true } };
      },
    },
  };
  assert.deepEqual(resolveEnabledPreset(appBridge, 'sysprompt', { sessionId: 's1' }), {
    type: 'sysprompt',
    ok: true,
  });
  assert.deepEqual(resolveEnabledPreset(appBridge, 'openai', { sessionId: 's1' }), {});
  assert.deepEqual(resolveEnabledPreset({}, 'sysprompt', { sessionId: 's1' }), {});
  console.log('ok - resolveEnabledPreset requires enabled state before resolving preset');
}

{
  const runtime = createPresetRuntime({
    appBridge: {
      config: {
        get() {
          return { provider: 'openai', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' };
        },
      },
      presets: {
        getResolvedActive(type, context) {
          if (type === 'openai') return { preset: { type, context, continue_prefill: true } };
          return { preset: { type, context } };
        },
      },
    },
    getSessionId: () => ' s1 ',
    getUiMode: () => '',
    isDeepSeekRequest: ({ provider, model }) => provider === 'openai' && model === 'deepseek-chat',
  });
  assert.deepEqual(runtime.getPresetContext(), { sessionId: 's1', uiMode: 'chat' });
  assert.deepEqual(runtime.getOpenAIPreset(), {
    type: 'openai',
    context: { sessionId: 's1', uiMode: 'chat' },
    continue_prefill: true,
  });
  assert.deepEqual(runtime.getReasoningPreset(), {
    type: 'reasoning',
    context: { sessionId: 's1', uiMode: 'chat' },
  });
  assert.equal(runtime.canUseDeepSeekPrefixCompletion(), true);
  assert.equal(runtime.canUseDeepSeekContinuePrefill(), true);
  console.log('ok - createPresetRuntime exposes dynamic preset accessors and deepseek gating');
}

{
  assert.equal(buildReplyPromptHint([]), '');
  assert.equal(
    buildReplyPromptHint([
      {
        userMessage: '你好',
        replyTo: { author: '助手', content: '早上好' },
      },
    ]),
    '你好（回复了助手：早上好）',
  );
  assert.equal(
    buildReplyPromptHint([
      {
        userMessage: 'A',
        replyTo: { author: '甲', content: '1' },
      },
      {
        userMessage: 'B',
        replyTo: { author: '乙', content: '2' },
      },
    ]),
    '1. A（回复了甲：1）；2. B（回复了乙：2）',
  );
  console.log('ok - buildReplyPromptHint formats single and multiple reply contexts');
}
