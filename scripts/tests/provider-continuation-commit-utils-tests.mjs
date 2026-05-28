import assert from 'node:assert/strict';

import {
  PROVIDER_CONTINUATION_COMMIT_STRATEGIES,
  buildProviderContinuationCommitPlan,
  commitProviderContinuationToMessage,
  extractProviderContinuationFinalText,
  normalizeProviderContinuationCommitStrategy,
} from '../../src/scripts/ui/chat/provider-continuation-commit-utils.js';

{
  assert.equal(
    normalizeProviderContinuationCommitStrategy('append_to_previous_bubble'),
    PROVIDER_CONTINUATION_COMMIT_STRATEGIES.appendToPreviousBubble,
  );
  assert.equal(
    normalizeProviderContinuationCommitStrategy('unknown'),
    PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly,
  );
  console.log('ok - provider continuation commit normalizes supported strategies');
}

{
  const finalText = extractProviderContinuationFinalText({
    runnerFacade: {
      events: [
        { type: 'provider_stream_delta', accumulatedText: 'partial' },
        { type: 'provider_stream_end', finalText: 'final text' },
      ],
    },
  });
  assert.equal(finalText, 'final text');

  const partText = extractProviderContinuationFinalText({
    parts: [
      { metadata: { finalText: 'from part' } },
    ],
    runnerFacade: {
      events: [{ finalText: 'from event' }],
    },
  });
  assert.equal(partText, 'from part');
  console.log('ok - provider continuation commit extracts final text from parts before events');
}

{
  const plan = buildProviderContinuationCommitPlan({
    strategy: 'preview_only',
    continuationResult: {
      parts: [{ metadata: { finalText: 'continued' } }],
    },
    targetMessage: { id: 'm1' },
  });
  assert.deepEqual(plan, {
    ok: true,
    status: 'preview_only',
    strategy: 'preview_only',
    writesChat: false,
    finalText: 'continued',
    reason: '',
  });
  console.log('ok - provider continuation commit plan keeps preview-only as non-writing');
}

{
  const blocked = buildProviderContinuationCommitPlan({
    strategy: 'append_to_previous_bubble',
    continuationResult: {
      parts: [{ metadata: { finalText: '' } }],
    },
    targetMessage: { id: 'm1' },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.writesChat, false);
  assert.equal(blocked.reason, 'provider continuation returned no text to append');
  console.log('ok - provider continuation commit blocks append without final text');
}

{
  const messages = new Map([
    ['m1', {
      id: 'm1',
      sessionId: 's1',
      content: 'First half',
      raw: 'First half',
      meta: { existing: true },
    }],
  ]);
  let uiUpdate = null;
  const result = commitProviderContinuationToMessage({
    strategy: 'append_to_previous_bubble',
    continuationResult: {
      pendingPermissionId: 'pending-1',
      parts: [{ metadata: { finalText: ' second half' } }],
    },
    targetMessage: { id: 'm1', sessionId: 's1' },
    sessionId: 's1',
    chatStore: {
      findMessage: (messageId) => messages.get(messageId) || null,
      updateMessage: (messageId, payload) => {
        const saved = { ...messages.get(messageId), ...payload };
        messages.set(messageId, saved);
        return saved;
      },
    },
    isSessionActive: sid => sid === 's1',
    updateUiMessage: (messageId, message) => {
      uiUpdate = { messageId, message };
    },
    now: () => 1234,
  });

  assert.equal(result.status, 'committed');
  assert.equal(result.writesChat, true);
  assert.equal(result.message.content, 'First half second half');
  assert.equal(result.message.raw, 'First half second half');
  assert.deepEqual(result.message.meta.providerContinuationCommits, [{
    strategy: 'append_to_previous_bubble',
    pendingPermissionId: 'pending-1',
    committedAt: 1234,
    chars: 12,
  }]);
  assert.equal(uiUpdate.messageId, 'm1');
  assert.equal(uiUpdate.message.content, 'First half second half');
  console.log('ok - provider continuation commit appends final text to the previous bubble');
}
