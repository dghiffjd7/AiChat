import assert from 'node:assert/strict';

import {
  buildFullPromptDocument,
  buildPromptOverviewView,
} from '../../src/scripts/ui/chat/prompt-preview-view-utils.js';

const request = {
  at: Date.UTC(2026, 7, 1, 3, 4, 5),
  requestId: 'request-42',
  provider: 'custom',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.example.test/v1',
  stream: true,
  session: { id: 'session-1', name: '测试聊天室', isGroup: false },
  configProfile: { id: 'profile-1', source: 'session', bound: true },
  options: { temperature: 0.7, maxTokens: 2048 },
  requestOptions: {
    temperature: 0.6,
    tools: [{ name: 'must-not-expand-tool-schema', description: 'very large schema' }],
  },
  messages: [
    { role: 'system', content: '# 规则\n<format>保持角色</format>' },
    { role: 'user', content: 'OVERVIEW_MUST_NOT_REPEAT_THIS_MESSAGE' },
  ],
  responsePrefix: '<assistant_prefill>',
  injectionAudit: {
    totalEstimateTokens: 1234,
    inputBudgetTokens: 8192,
    segments: [{ id: 'fixed', label: '固定提示词', usedTokens: 1234 }],
  },
  responseDiagnostics: {
    latencyMs: 3100,
    firstTokenLatencyMs: 700,
    outputDurationMs: 2400,
    tokensPerSecond: 50,
    promptTokens: 1200,
    completionTokens: 120,
    systemFingerprint: 'fp_2026_08_01_alpha',
  },
};

{
  const view = buildPromptOverviewView(request, {
    injectionAuditHtml: '<section data-memory-injection-audit>audit</section>',
    injectionAuditText: '注入总量：约 1234 token',
  });
  assert.equal(view.html.includes('OVERVIEW_MUST_NOT_REPEAT_THIS_MESSAGE'), false);
  assert.equal(view.plain.includes('OVERVIEW_MUST_NOT_REPEAT_THIS_MESSAGE'), false);
  assert.equal(view.html.includes('must-not-expand-tool-schema'), false);
  assert.match(view.html, /本次注入构成/);
  assert.match(view.html, /请求配置/);
  assert.match(view.html, /首字延迟/);
  assert.match(view.html, /700 ms/);
  assert.match(view.html, /50\.0 tok\/s/);
  assert.match(view.html, /fp_2026_08_01_alpha/);
  assert.match(view.html, /2 条消息/);
  assert.match(view.plain, /system fingerprint: fp_2026_08_01_alpha/);
  console.log('ok - prompt overview summarizes request diagnostics without repeating message bodies');
}

{
  const doc = buildFullPromptDocument(request);
  assert.match(doc.html, /data-prompt-line-number="1"/);
  assert.match(doc.html, /data-prompt-role="system"/);
  assert.match(doc.html, /data-prompt-role="user"/);
  assert.match(doc.html, /prompt-inline-tag/);
  assert.match(doc.html, /data-prompt-wrap-toggle/);
  assert.match(doc.html, /data-prompt-copy-all/);
  assert.match(doc.plain, /\[system\] #1/);
  assert.match(doc.plain, /OVERVIEW_MUST_NOT_REPEAT_THIS_MESSAGE/);
  assert.match(doc.plain, /\[assistant prefill\]/);
  assert.equal(doc.messageCount, 3);
  assert.ok(doc.lineCount >= 7);
  assert.ok(doc.charCount > 0);
  console.log('ok - full prompt document preserves roles, line numbers, prompt text and prefill');
}

{
  const doc = buildFullPromptDocument({
    messages: [{ role: 'user', content: '<script>alert("x")</script>' }],
  });
  assert.equal(doc.html.includes('<script>'), false);
  assert.match(doc.html, /&lt;script&gt;/);
  console.log('ok - full prompt document escapes prompt content before inline highlighting');
}

{
  const view = buildPromptOverviewView({
    stream: true,
    messages: [{ role: 'user', content: 'hello' }],
    responseDiagnostics: {
      latencyMs: null,
      firstTokenLatencyMs: null,
      tokensPerSecond: null,
      completionTokens: null,
    },
  });
  assert.match(view.plain, /total latency: —/);
  assert.match(view.plain, /first token latency: 未记录/);
  assert.match(view.plain, /output speed: —/);
  assert.match(view.plain, /completion tokens: —/);
  assert.doesNotMatch(view.plain, /0(?:\.0)? (?:ms|tok\/s)/);
  console.log('ok - prompt overview preserves unavailable diagnostics instead of coercing null to zero');
}
