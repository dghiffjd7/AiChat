import assert from 'node:assert/strict';

import {
  formatChatStructuredThinkingDisclosure,
  formatChatStructuredProfileStatus,
  resolveChatStructuredProfileStatus,
} from '../../src/scripts/ui/chat/chat-structured-profile-status.js';

{
  assert.deepEqual(formatChatStructuredProfileStatus({
    routeDecision: { mode: 'provider_fc', layer: 'verified_native_fc' },
  }), {
    state: 'stable',
    label: '聊天格式：✅ 稳定结构',
    detail: '',
  });
  assert.equal(formatChatStructuredProfileStatus({
    routeDecision: { mode: 'json_terminal' },
    thinkingPlan: { switchesRequestMode: true },
  }).detail, '当前设置保留思考');
  assert.equal(formatChatStructuredProfileStatus({
    routeDecision: { mode: 'legacy_text', reason: 'json_circuit_open' },
  }).state, 'legacy');
  console.log('ok - profile status exposes three human states without claiming whole-model capability');
}

{
  const status = resolveChatStructuredProfileStatus({
    config: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'future-profile-model',
    },
    thinkingEnabled: true,
    thinkingPreference: 'preserve',
    releaseResolver: () => ({ enabled: false, reason: 'not_verified' }),
  });
  assert.equal(status.state, 'conditional');
  assert.equal(status.detail, '当前设置保留思考');
  assert.equal(status.scope, 'current_profile.basic_private_chat.current_thinking');
  console.log('ok - status resolution is scoped to the active profile, basic private chat, and current thinking preference');
}

{
  assert.equal(formatChatStructuredThinkingDisclosure({}), '');
  const preserving = formatChatStructuredThinkingDisclosure({ switchesRequestMode: true });
  assert.match(preserving, /开启思考将切换聊天请求模式/u);
  assert.doesNotMatch(preserving, /FC|JSON|熔断/iu);
  const stable = formatChatStructuredThinkingDisclosure({
    thinkingOverrideReason: 'user_prefers_stable_format',
  });
  assert.match(stable, /优先稳定格式/u);
  assert.doesNotMatch(stable, /FC|JSON|熔断/iu);
  console.log('ok - thinking disclosure is conditional and keeps user-facing copy free of transport jargon');
}

console.log('chat-structured-profile-status-tests passed');
