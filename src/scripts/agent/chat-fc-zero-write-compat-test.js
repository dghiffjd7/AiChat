import { normalizeChatFcLocalRule } from './chat-fc-local-capability-rules.js';
import {
  buildPrivateChatStructuredTransportInstruction,
  runPrivateChatProviderFcAttempt,
} from '../ui/chat/private-chat-provider-fc.js';
import {
  buildPhoneBatchStructuredTransportInstruction,
  runPhoneBatchProviderFcAttempt,
} from '../ui/chat/phone-batch-provider-fc.js';

const SURFACES = Object.freeze(['private_chat', 'group_chat', 'moment_comment']);

const abortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted === true) throw abortError();
};

const normalizeFixtureToken = (value = '') => {
  const token = String(value ?? '').trim();
  if (!token) return '';
  if (!/^[A-Z0-9][A-Z0-9_-]{0,47}$/u.test(token)) {
    throw new TypeError('fixture_token_invalid');
  }
  return token;
};

const buildExpectedSignal = (base, fixtureToken) => (
  fixtureToken ? `${base} ${fixtureToken}` : base
);

const commonContext = surface => ({
  uiMode: 'chat',
  surface,
  isGroupChat: surface === 'group_chat',
  responseTarget: 'character',
  assistantContinuation: false,
  webSearchEnabled: false,
  hasProviderTools: false,
  hasAssistantPrefill: false,
  usesDefaultPreset: true,
  usesBuiltinFormat: true,
  protocolParserEnabled: true,
  hasUnsupportedSideEffects: false,
  formatProfileEnabled: false,
  compatibilityModeEnabled: false,
});

const privateFixture = (fixtureToken = '') => {
  const target = {
    sessionId: '__fc-zero-write-private__',
    targetName: '兼容测试角色',
    speakerName: '兼容测试角色',
    userName: '测试用户',
  };
  const expectedSignal = buildExpectedSignal('私聊兼容测试通过', fixtureToken);
  return {
    surface: 'private_chat',
    target,
    context: commonContext('private_chat'),
    expectedSignal,
    expectedKind: '',
    expectedSpeakerIds: [],
    expectedCommentAuthorIds: [],
    messages: [
      {
        role: 'system',
        content: buildPrivateChatStructuredTransportInstruction({ allowedItemTypes: ['text'] }),
      },
      { role: 'user', content: `这是零写入兼容测试。请只提交一句“${expectedSignal}”。` },
    ],
  };
};

const groupFixture = (fixtureToken = '') => {
  const target = {
    sessionId: '__fc-zero-write-group__',
    targetName: '兼容测试群',
    mode: 'group_chat',
    members: [{ id: 'contact:fc-probe-a', name: '测试成员' }],
    momentAuthors: [{ id: 'contact:fc-probe-a', name: '测试成员' }],
    tableTargets: [],
  };
  const expectedSignal = buildExpectedSignal('群聊兼容测试通过', fixtureToken);
  return {
    surface: 'group_chat',
    target,
    context: commonContext('group_chat'),
    expectedSignal,
    expectedKind: 'chat',
    expectedSpeakerIds: ['contact:fc-probe-a'],
    expectedCommentAuthorIds: [],
    messages: [
      {
        role: 'system',
        content: buildPhoneBatchStructuredTransportInstruction({
          target,
          capabilities: {},
          allowedItemTypes: ['text'],
        }),
      },
      { role: 'user', content: `这是零写入兼容测试。请由测试成员只提交一句“${expectedSignal}”。` },
    ],
  };
};

const momentFixture = (fixtureToken = '') => {
  const target = {
    sessionId: '__fc-zero-write-moment__',
    targetName: '兼容测试动态',
    mode: 'moment_comment',
    momentId: 'moment:fc-zero-write',
    momentAuthors: [{ id: 'contact:fc-probe-a', name: '测试成员' }],
    privateTargets: [],
    groupTargets: [],
    tableTargets: [],
  };
  const expectedSignal = buildExpectedSignal('动态兼容测试通过', fixtureToken);
  return {
    surface: 'moment_comment',
    target,
    context: commonContext('moment_comment'),
    expectedSignal,
    expectedKind: 'moment_comment',
    expectedSpeakerIds: [],
    expectedCommentAuthorIds: ['contact:fc-probe-a'],
    messages: [
      {
        role: 'system',
        content: buildPhoneBatchStructuredTransportInstruction({
          target,
          capabilities: {},
          allowedItemTypes: ['text'],
        }),
      },
      { role: 'user', content: `这是零写入兼容测试。请只提交一条“${expectedSignal}”的评论。` },
    ],
  };
};

const FIXTURE_BUILDERS = Object.freeze({
  private_chat: privateFixture,
  group_chat: groupFixture,
  moment_comment: momentFixture,
});

const collectSemanticText = (items = []) => items
  .flatMap(item => [
    item?.content,
    ...(Array.isArray(item?.messages) ? item.messages.map(message => message?.content) : []),
    ...(Array.isArray(item?.comments) ? item.comments.map(comment => comment?.content) : []),
  ])
  .map(value => String(value ?? ''))
  .join('\n');

const sanitizeAttempt = (fixture, attempt = {}) => {
  const surface = fixture.surface;
  const ir = attempt?.ir && typeof attempt.ir === 'object' ? attempt.ir : {};
  const items = Array.isArray(ir?.items) ? ir.items : [];
  const privateSurface = surface === 'private_chat';
  const messages = privateSurface
    ? items
    : items.flatMap(item => Array.isArray(item?.messages) ? item.messages : []);
  const comments = items.flatMap(item => Array.isArray(item?.comments) ? item.comments : []);
  const speakerIds = messages.map(message => String(message?.speaker?.id || '').trim()).filter(Boolean);
  const commentAuthorIds = comments.map(comment => String(comment?.author?.id || '').trim()).filter(Boolean);
  const expectedSpeakerIds = fixture.expectedSpeakerIds || [];
  const expectedCommentAuthorIds = fixture.expectedCommentAuthorIds || [];
  const toolCallCount = Math.max(
    0,
    Number(attempt?.diagnostics?.toolCallCount || attempt?.toolCallCount) || 0,
  );
  const responseChars = Math.max(0, Number(attempt?.diagnostics?.responseChars) || 0);
  const checks = {
    exactKinds: privateSurface
      ? ir?.surface === 'private_chat' && items.length === 1
      : items.length === 1
        && items[0]?.kind === fixture.expectedKind
        && (surface !== 'group_chat' || items[0]?.surface === 'group_chat'),
    targetCorrect: privateSurface
      ? ir?.target?.sessionId === fixture.target.sessionId
      : ir?.context?.sessionId === fixture.target.sessionId
        && (surface !== 'moment_comment' || ir?.context?.momentId === fixture.target.momentId),
    typesCorrect: surface === 'moment_comment'
      ? comments.length === 1
      : messages.length === 1 && messages.every(message => String(message?.type || 'text') === 'text'),
    speakersCorrect: expectedSpeakerIds.length === 0
      || (speakerIds.length === expectedSpeakerIds.length
        && expectedSpeakerIds.every(id => speakerIds.includes(id))),
    commentAuthorsCorrect: expectedCommentAuthorIds.length === 0
      || (commentAuthorIds.length === expectedCommentAuthorIds.length
        && expectedCommentAuthorIds.every(id => commentAuthorIds.includes(id))),
    signalsCorrect: collectSemanticText(items).includes(fixture.expectedSignal),
    oneToolCall: toolCallCount === 1,
    noLeakedText: responseChars === 0,
  };
  const providerFcAccepted = attempt?.ok === true;
  const strictSemanticPass = providerFcAccepted && Object.values(checks).every(Boolean);
  return {
    surface,
    ok: strictSemanticPass,
    providerFcAccepted,
    strictSemanticPass,
    attempted: attempt?.attempted === true,
    reason: providerFcAccepted && !strictSemanticPass
      ? 'semantic_contract_failed'
      : String(attempt?.reason || ''),
    toolCallCount,
    responseChars,
    validationErrorCodes: Array.isArray(attempt?.diagnostics?.validationErrorCodes)
      ? attempt.diagnostics.validationErrorCodes.slice(0, 12)
      : [],
    checks,
  };
};

export const buildChatFcZeroWriteTestPlan = ({ rule = {} } = {}) => {
  const normalized = normalizeChatFcLocalRule(rule);
  if (!normalized.ok) {
    return {
      ok: false,
      reason: normalized.reason,
      surfaces: [],
      modelCallCount: 0,
      persistentWriteCount: 0,
      billingNotice: '',
    };
  }
  return {
    ok: true,
    reason: '',
    surfaces: [...SURFACES],
    modelCallCount: SURFACES.length,
    persistentWriteCount: 0,
    billingNotice: `将依序发送 ${SURFACES.length} 次模型请求（私聊、群聊、动态各 1 次），服务商可能计费；不会创建或修改聊天、动态、记忆、变量及世界书。`,
  };
};

export const runChatFcZeroWriteCompatibilityTest = async ({
  client = null,
  config = {},
  rule = {},
  fixtureToken = '',
  signal = null,
  onProgress = null,
} = {}) => {
  const plan = buildChatFcZeroWriteTestPlan({ rule });
  if (!plan.ok) {
    return {
      ...plan,
      results: [],
      writeOperations: [],
    };
  }
  if (!client || typeof client.chat !== 'function') {
    return {
      ok: false,
      reason: 'provider_client_unavailable',
      modelCallCount: 0,
      persistentWriteCount: 0,
      writeOperations: [],
      results: [],
    };
  }
  throwIfAborted(signal);
  const normalizedFixtureToken = normalizeFixtureToken(fixtureToken);

  const results = [];
  let modelCallCount = 0;
  const countedClient = {
    chat(...args) {
      modelCallCount += 1;
      return client.chat(...args);
    },
  };
  for (const [index, surface] of plan.surfaces.entries()) {
    throwIfAborted(signal);
    const fixture = FIXTURE_BUILDERS[surface](normalizedFixtureToken);
    try {
      onProgress?.({ phase: 'request', surface, index, total: plan.surfaces.length });
    } catch {}
    const common = {
      enabled: true,
      client: countedClient,
      config: { ...config, webSearchEnabled: false, stream: false },
      messages: fixture.messages,
      context: fixture.context,
      target: fixture.target,
      capabilities: {},
      allowedItemTypes: ['text'],
      allowedStickerKeywords: [],
      thinkingEnabled: false,
      temperature: 0,
      maxTokens: 700,
      signal,
      streamPreviewEnabled: false,
      localRuleOverride: rule,
    };
    const attempt = surface === 'private_chat'
      ? await runPrivateChatProviderFcAttempt(common)
      : await runPhoneBatchProviderFcAttempt(common);
    const inspected = sanitizeAttempt(fixture, attempt);
    results.push(inspected);
    try {
      onProgress?.({ phase: inspected.ok ? 'passed' : 'failed', surface, index, total: plan.surfaces.length });
    } catch {}
    if (!inspected.ok) {
      return {
        ok: false,
        reason: inspected.reason || 'compatibility_test_failed',
        modelCallCount,
        persistentWriteCount: 0,
        writeOperations: [],
        results,
      };
    }
  }
  return {
    ok: true,
    reason: '',
    modelCallCount,
    persistentWriteCount: 0,
    writeOperations: [],
    results,
  };
};
