import assert from 'node:assert/strict';

import { evaluateInApp } from '../dev/cdp-client.mjs';

const result = await evaluateInApp(String.raw`(async () => {
  const isolatedDocument = document.implementation.createHTMLDocument('format-repair-smoke');
  const windowStub = {
    addEventListener() {},
    confirm() { return true; },
  };
  const [
    { createCodeViewerUiRuntime },
    { createContextMenuActionButton },
    {
      buildFormatRepairTurnMeta,
      resolveLatestFormatRepairTarget,
      tagMessageWithFormatRepairTurn,
    },
  ] = await Promise.all([
    import('./scripts/ui/chat/code-viewer-ui-utils.js'),
    import('./scripts/ui/chat/context-menu-dom-utils.js'),
    import('./scripts/ui/chat/format-repair-target-utils.js'),
  ]);

  const runtime = createCodeViewerUiRuntime({
    documentLike: isolatedDocument,
    windowLike: windowStub,
    schedule: callback => callback(),
  });
  const message = { id: 'assistant-smoke', role: 'assistant', content: 'rendered' };
  const overlay = runtime.openCodeViewer(null, {
    message,
    text: '<rule1>\n<content>正文</content>\n</rul',
    canSave: true,
  });
  const editState = {
    mode: overlay.__chatappMode,
    gutter: overlay.__chatappRefs.gutter.textContent,
    saveVisible: overlay.__chatappRefs.saveBtn.style.display,
    reviewVisible: overlay.__chatappRefs.reviewBody.style.display,
  };

  const review = runtime.openPatchReview(overlay, {
    message,
    originalText: '<rule1>\n<content>正文</content>\n</rul',
    linePatches: [{
      startLine: 3,
      endLine: 3,
      originalLines: ['</rul'],
      replacementLines: ['</rule1>'],
      reason: '补全闭合标签',
    }],
    summary: '修复 1 处标签',
    formatSources: ['private_chat', 'customFormatGuide'],
    warning: '正文疑似截断，可考虑重新生成',
    validateCandidate: async () => ({
      canApply: true,
      statusText: '已通过本地复查',
    }),
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const reviewState = {
    mode: overlay.__chatappMode,
    summary: overlay.__chatappRefs.reviewSummary.textContent,
    hunkCount: overlay.__chatappRefs.reviewHunks.children.length,
    removedLine: overlay.__chatappRefs.reviewHunks.textContent.includes('- </rul'),
    addedLine: overlay.__chatappRefs.reviewHunks.textContent.includes('+ </rule1>'),
    status: overlay.__chatappRefs.reviewStatus.textContent,
    applyDisabled: overlay.__chatappRefs.applyReviewBtn.disabled,
  };
  runtime.hideViewer(overlay, { force: true });
  const cancelledReview = await review.promise;

  const action = createContextMenuActionButton({
    documentLike: isolatedDocument,
    action: { key: 'check-format', label: '检查格式' },
  });
  const icon = action.querySelector('svg');
  const iconState = {
    svgCount: action.querySelectorAll('svg').length,
    pathCount: action.querySelectorAll('svg path').length,
    viewBox: icon?.getAttribute('viewBox') || '',
    stroke: icon?.getAttribute('stroke') || '',
    textFallback: action.querySelector('.chat-context-menu-action-icon')?.textContent || '',
  };

  const turnMeta = buildFormatRepairTurnMeta({
    turnId: 'turn-smoke',
    sourceSessionId: 'private:smoke',
    sourceMessageIds: ['assistant-smoke'],
  });
  const taggedMessage = tagMessageWithFormatRepairTurn(message, turnMeta);
  const rawText = '<MiPhone>\n<message>完整原始回复</message>\n</MiPhone>';
  const target = await resolveLatestFormatRepairTarget({
    message: taggedMessage,
    sessionId: 'private:smoke',
    uiMode: 'chat',
    getLastRawResponseEnvelope: () => ({
      turnId: 'turn-smoke',
      text: rawText,
      sourceMessageIds: ['assistant-smoke'],
      targetSessionIds: ['private:smoke'],
      truncated: false,
    }),
  });

  return {
    appReady: document.readyState === 'complete' && Boolean(window.appBridge),
    editState,
    reviewState,
    cancelledReview,
    iconState,
    target: {
      ok: target.ok,
      sourceKind: target.sourceKind,
      sourceText: target.sourceText,
      sourceMessageIds: target.sourceMessageIds,
    },
  };
})()`, { timeoutMs: 30000 });

assert.equal(result.appReady, true);
assert.deepEqual(result.editState, {
  mode: 'edit',
  gutter: '1\n2\n3',
  saveVisible: 'inline-block',
  reviewVisible: 'none',
});
assert.equal(result.reviewState.mode, 'review');
assert.match(result.reviewState.summary, /私聊场景/);
assert.match(result.reviewState.summary, /自定义格式规范/);
assert.match(result.reviewState.summary, /正文疑似截断/);
assert.equal(result.reviewState.hunkCount, 1);
assert.equal(result.reviewState.removedLine, true);
assert.equal(result.reviewState.addedLine, true);
assert.equal(result.reviewState.status, '已通过本地复查');
assert.equal(result.reviewState.applyDisabled, false);
assert.equal(result.cancelledReview.confirmed, false);
assert.deepEqual(result.iconState, {
  svgCount: 1,
  pathCount: 4,
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  textFallback: '',
});
assert.deepEqual(result.target, {
  ok: true,
  sourceKind: 'social_turn_raw',
  sourceText: '<MiPhone>\n<message>完整原始回复</message>\n</MiPhone>',
  sourceMessageIds: ['assistant-smoke'],
});

console.log('ok - dev WebView format repair editor, review, SVG, and full-raw target smoke');
