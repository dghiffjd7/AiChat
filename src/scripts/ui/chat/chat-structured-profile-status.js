import {
  resolveChatProviderFcRelease,
  resolveChatStructuredThinkingPreference,
} from '../../agent/provider-fc-transport.js';
import {
  CHAT_STRUCTURED_ROUTE_MODES,
  resolveChatStructuredRoute,
} from '../../agent/chat-structured-route-evidence.js';
import {
  buildChatStructuredRequestEvidenceIdentity,
  resolveChatStructuredTextTransport,
} from '../../agent/chat-structured-route-request.js';

const trim = value => String(value ?? '').trim();

export const formatChatStructuredThinkingDisclosure = (thinkingPlan = {}) => {
  if (thinkingPlan?.switchesRequestMode === true) {
    return '开启思考将切换聊天请求模式，格式稳定性可能略降；追求最稳格式请关闭思考。';
  }
  if (trim(thinkingPlan?.thinkingOverrideReason) === 'user_prefers_stable_format') {
    return '已选择优先稳定格式；聊天请求会暂不启用思考。';
  }
  return '';
};

export const formatChatStructuredProfileStatus = ({
  routeDecision = {},
  thinkingPlan = {},
  compatibilityModeEnabled = false,
} = {}) => {
  const mode = trim(routeDecision.mode);
  const reason = trim(routeDecision.reason);
  if (mode === CHAT_STRUCTURED_ROUTE_MODES.providerFc) {
    const stable = routeDecision.layer === 'verified_native_fc'
      || routeDecision.layer === 'local_observed_compatible';
    return stable
      ? { state: 'stable', label: '聊天格式：✅ 稳定结构', detail: '' }
      : {
          state: 'conditional',
          label: '聊天格式：🟡 结构化（按当前设置）',
          detail: thinkingPlan.thinkingOverrideReason === 'user_prefers_stable_format'
            ? '当前设置优先格式稳定'
            : '当前模型使用兼容结构',
        };
  }
  if (mode === CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal) {
    return {
      state: 'conditional',
      label: '聊天格式：🟡 结构化（按当前设置）',
      detail: thinkingPlan.switchesRequestMode === true
        ? '当前设置保留思考'
        : '当前模型使用兼容结构',
    };
  }
  return {
    state: 'legacy',
    label: '聊天格式：⚠️ 已切换传统模式（点击重试）',
    detail: compatibilityModeEnabled === true
      ? '当前已开启兼容模式'
      : (reason.includes('circuit') || reason.includes('negative_capability')
          ? '当前精确组合连续失败'
          : '当前组合暂无可用结构化路径'),
  };
};

export const resolveChatStructuredProfileStatus = ({
  config = {},
  thinkingEnabled = false,
  reasoningOptions = {},
  thinkingPreference = 'preserve',
  compatibilityModeEnabled = false,
  evidenceStore = null,
  releaseResolver = resolveChatProviderFcRelease,
  now = Date.now,
} = {}) => {
  const thinkingPlan = resolveChatStructuredThinkingPreference({
    config,
    thinkingEnabled,
    reasoningOptions,
    preference: thinkingPreference,
  });
  const release = releaseResolver(config) || {};
  const fcTransport = resolveChatStructuredTextTransport(config, { preferProviderFc: true });
  const jsonTransport = resolveChatStructuredTextTransport(config);
  const identityInput = {
    adapter: 'private_reply',
    surface: 'private_chat',
    capabilities: {},
  };
  const fcIdentity = buildChatStructuredRequestEvidenceIdentity({
    config,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    transport: fcTransport,
    ...identityInput,
  });
  const jsonIdentity = buildChatStructuredRequestEvidenceIdentity({
    config,
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
    transport: jsonTransport,
    ...identityInput,
  });
  const routeDecision = resolveChatStructuredRoute({
    enabled: compatibilityModeEnabled !== true,
    hardBoundaryReason: compatibilityModeEnabled ? 'compatibility_mode' : '',
    verifiedFc: {
      ...release,
      enabled: release.enabled === true
        && thinkingPlan.probation?.reason !== 'thinking_preservation_requires_json',
    },
    fcProbation: thinkingPlan.probation || {},
    jsonTerminal: {
      eligible: jsonTransport.supported === true,
      reason: jsonTransport.reason,
    },
    fcEvidence: fcIdentity.ok
      ? evidenceStore?.get?.(fcIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc)
      : null,
    jsonEvidence: jsonIdentity.ok
      ? evidenceStore?.get?.(jsonIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal)
      : null,
    fcHalfOpenLeaseAvailable: fcIdentity.ok
      ? evidenceStore?.getHalfOpenAvailability?.(
          fcIdentity.identity,
          CHAT_STRUCTURED_ROUTE_MODES.providerFc,
        )?.reason !== 'half_open_busy'
      : true,
    jsonHalfOpenLeaseAvailable: jsonIdentity.ok
      ? evidenceStore?.getHalfOpenAvailability?.(
          jsonIdentity.identity,
          CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
        )?.reason !== 'half_open_busy'
      : true,
    now,
  });
  return {
    ...formatChatStructuredProfileStatus({
      routeDecision,
      thinkingPlan,
      compatibilityModeEnabled,
    }),
    routeDecision,
    thinkingPlan,
    scope: 'current_profile.basic_private_chat.current_thinking',
  };
};
