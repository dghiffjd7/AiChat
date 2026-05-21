const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const formatList = (items = []) => list(items).join(', ') || '-';

const readLatestEntry = (diagnostics = {}) => {
  const history = Array.isArray(diagnostics?.history) ? diagnostics.history : [];
  return history.find(entry => (
    isPlainObject(entry?.runnerModePlan) ||
    isPlainObject(entry?.realRunnerDebug) ||
    isPlainObject(entry?.loopState)
  )) || null;
};

const readSessionRules = (rules = [], sessionId = '') => {
  const normalizedSessionId = trim(sessionId);
  return (Array.isArray(rules) ? rules : [])
    .filter(rule => isPlainObject(rule))
    .filter(rule => trim(rule.layer) === 'session')
    .filter(rule => {
      const ruleSession = trim(rule.sessionId, '*');
      return ruleSession === '*' || !normalizedSessionId || ruleSession === normalizedSessionId;
    });
};

const summarizeRules = (rules = []) => {
  if (!rules.length) return '0 session rules';
  return rules
    .slice(0, 3)
    .map(rule => `${trim(rule.decision, 'ask')}:${trim(rule.toolName, '*')}/${trim(rule.permission, '*')}`)
    .join(', ') + (rules.length > 3 ? ` +${rules.length - 3}` : '');
};

const summarizeLoopGuard = (snapshot = []) => {
  const entries = Array.isArray(snapshot) ? snapshot : [];
  if (!entries.length) return 'empty';
  const blocked = entries.filter(entry => entry?.blocked === true || entry?.allowed === false).length;
  return blocked ? `${entries.length} tracked / ${blocked} blocked` : `${entries.length} tracked`;
};

const readRunnerMode = (entry = null) => {
  const runnerMode = isPlainObject(entry?.runnerModePlan) ? entry.runnerModePlan : {};
  const realRunner = isPlainObject(entry?.realRunnerDebug) ? entry.realRunnerDebug : {};
  return trim(realRunner.mode || runnerMode.mode, 'read_only_capture');
};

const readNetworkAllowed = (entry = null) => {
  const runnerMode = isPlainObject(entry?.runnerModePlan) ? entry.runnerModePlan : {};
  const realRunner = isPlainObject(entry?.realRunnerDebug) ? entry.realRunnerDebug : {};
  return realRunner.allowRunnerNetwork === true || runnerMode.network === true || runnerMode.allowRunnerNetwork === true;
};

const readWritesChat = (entry = null) => {
  const runnerMode = isPlainObject(entry?.runnerModePlan) ? entry.runnerModePlan : {};
  const realRunner = isPlainObject(entry?.realRunnerDebug) ? entry.realRunnerDebug : {};
  const loopState = isPlainObject(entry?.loopState) ? entry.loopState : {};
  return realRunner.writesChat === true || runnerMode.writesChat === true || loopState.writesChat === true;
};

const buildGate = ({
  key = '',
  label = '',
  value = '',
  tone = 'safe',
  detail = '',
} = {}) => ({
  key: trim(key, label),
  label: trim(label, key),
  value: trim(value, '-'),
  tone: tone === 'warn' || tone === 'danger' ? tone : 'safe',
  detail: trim(detail),
});

export const buildProviderToolSafetyPreflightViewModel = ({
  status = null,
  sessionGate = null,
  diagnostics = null,
  permissionRules = [],
  loopGuard = [],
  sessionId = '',
} = {}) => {
  const experiment = isPlainObject(status) ? status : {};
  const gate = isPlainObject(sessionGate) ? sessionGate : {};
  const latest = readLatestEntry(diagnostics);
  const mode = readRunnerMode(latest);
  const networkAllowed = gate.networkAllowed === true || readNetworkAllowed(latest);
  const writesChat = readWritesChat(latest);
  const sessionGateEnabled = gate.enabled === true;
  const gateTools = list(gate.allowedTools);
  const allowedTools = gateTools.length
    ? gateTools
    : list(experiment.allowedTools || diagnostics?.status?.allowedTools);
  const sessionRules = readSessionRules(permissionRules, sessionId);
  const modelContextPolicy = trim(latest?.realRunnerDebug?.modelContextPolicy, 'allowlist_only');
  const permissionStrategy = isPlainObject(latest?.permissionStrategy)
    ? latest.permissionStrategy
    : (isPlainObject(diagnostics?.providerToolBridgeLoop?.permissionStrategy)
        ? diagnostics.providerToolBridgeLoop.permissionStrategy
        : {});
  const permissionMode = trim(permissionStrategy.mode, 'deferred_message_part');
  const promptModal = permissionStrategy.promptModal === true || permissionMode === 'modal_prompt';
  const rollback = trim(
    gate.rollback || latest?.realRunnerDebug?.rollback,
    'disable providerToolSessionGate for this session',
  );
  const experimentEnabled = experiment.enabled === true;
  const gates = [
    buildGate({
      key: 'killSwitch',
      label: 'Kill Switch',
      value: sessionGateEnabled ? 'session enabled' : 'off',
      tone: sessionGateEnabled ? 'warn' : 'safe',
      detail: sessionGateEnabled ? 'bridge may execute allowed provider tool calls for this session' : 'provider tools are disabled for this session',
    }),
    buildGate({
      key: 'debugExperiment',
      label: 'Debug Experiment',
      value: experimentEnabled ? 'on' : 'off',
      tone: experimentEnabled ? 'warn' : 'safe',
      detail: experimentEnabled ? 'debug runtime is manually enabled' : 'debug runtime stays off unless explicitly requested',
    }),
    buildGate({
      key: 'runnerMode',
      label: 'Runner Mode',
      value: mode,
      tone: mode === 'real_runner' ? 'warn' : 'safe',
      detail: mode === 'real_runner' ? 'real runner still requires injected client and network gate' : 'not using real provider runner',
    }),
    buildGate({
      key: 'network',
      label: 'Network',
      value: networkAllowed ? 'allowed' : 'blocked',
      tone: networkAllowed ? 'warn' : 'safe',
      detail: networkAllowed ? 'only debug runner facade may use network' : 'no provider network continuation',
    }),
    buildGate({
      key: 'chatWrites',
      label: 'Chat Writes',
      value: writesChat ? 'blocked' : 'disabled',
      tone: writesChat ? 'danger' : 'safe',
      detail: writesChat ? 'direct chat write was reported and must stay blocked' : 'runner output does not write chat directly',
    }),
    buildGate({
      key: 'toolAllowlist',
      label: 'Tool Allowlist',
      value: formatList(allowedTools),
      tone: allowedTools.length ? 'safe' : 'warn',
      detail: `${allowedTools.length} tool(s) visible to provider tool experiment`,
    }),
    buildGate({
      key: 'modelContext',
      label: 'Model Context',
      value: modelContextPolicy,
      tone: modelContextPolicy === 'allowlist_only' ? 'safe' : 'warn',
      detail: 'tool results need explicit formatter before entering model context',
    }),
    buildGate({
      key: 'permissionUi',
      label: 'Permission UI',
      value: promptModal ? 'modal prompt' : 'message part',
      tone: promptModal ? 'warn' : 'safe',
      detail: promptModal ? 'modal prompt requires explicit debug request' : 'stream callbacks defer user action into sidecar parts',
    }),
    buildGate({
      key: 'sessionRules',
      label: 'Session Rules',
      value: summarizeRules(sessionRules),
      tone: sessionRules.some(rule => trim(rule.decision) === 'allow') ? 'warn' : 'safe',
      detail: sessionRules.length ? 'remembered rules are scoped to session layer' : 'permission prompts still ask by default',
    }),
    buildGate({
      key: 'loopGuard',
      label: 'Loop Guard',
      value: summarizeLoopGuard(loopGuard),
      tone: 'safe',
      detail: 'repeated identical tool calls are tracked before execution',
    }),
  ];
  return {
    title: 'Provider Tool Safety Preflight',
    summary: 'formal chat integration remains blocked until every gate is visible and reversible',
    sessionId: trim(sessionId, '-'),
    provider: trim(experiment.provider || diagnostics?.status?.provider, '-'),
    model: trim(experiment.model || diagnostics?.status?.model, '-'),
    mode,
    sessionGate: gate,
    sessionGateEnabled,
    experimentEnabled,
    networkAllowed,
    writesChat,
    permissionStrategy: {
      mode: permissionMode,
      promptModal,
      presentation: trim(permissionStrategy.presentation, promptModal ? 'modal' : 'message_part'),
      reason: trim(permissionStrategy.reason),
    },
    allowedTools,
    sessionRules,
    loopGuardCount: Array.isArray(loopGuard) ? loopGuard.length : 0,
    rollback,
    gates,
  };
};

const clearContainer = (container) => {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
    return;
  }
  container.textContent = '';
  if (Array.isArray(container.children)) container.children.length = 0;
};

const createElement = (documentRef, tagName, {
  text = '',
  style = '',
  className = '',
} = {}) => {
  const el = documentRef.createElement(tagName);
  if (style) el.style.cssText = style;
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
};

export const PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES = Object.freeze({
  container: `
    display:grid;
    gap:8px;
    flex:0 0 auto;
    padding:0 2px 0 0;
    box-sizing:border-box;
  `,
  panel: `
    border:1px solid var(--app-border-default);
    border-radius:8px;
    background:var(--app-surface-card);
    overflow:hidden;
  `,
  header: `
    display:grid;
    grid-template-columns:minmax(0, 1fr) auto;
    gap:10px;
    align-items:center;
    min-height:42px;
    padding:9px 10px;
    background:var(--app-surface-subtle);
    color:var(--app-text-primary);
    box-sizing:border-box;
  `,
  titleWrap: `
    display:grid;
    gap:2px;
    min-width:0;
  `,
  title: `
    font-size:12px;
    font-weight:900;
    line-height:1.25;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  `,
  summary: `
    font-size:11px;
    font-weight:650;
    line-height:1.3;
    color:var(--app-text-muted);
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  `,
  badge: `
    border:1px solid currentColor;
    border-radius:999px;
    padding:2px 8px;
    font-size:11px;
    font-weight:900;
    line-height:1.2;
    white-space:nowrap;
  `,
  headerActions: `
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:6px;
    min-width:0;
  `,
  button: `
    border:1px solid var(--app-border-default);
    border-radius:8px;
    background:var(--app-surface-card);
    color:var(--app-text-primary);
    min-height:24px;
    padding:3px 8px;
    font-size:11px;
    font-weight:850;
    line-height:1.2;
    cursor:pointer;
    white-space:nowrap;
  `,
  body: `
    display:grid;
    gap:8px;
    padding:9px 10px 10px;
    color:var(--app-text-primary);
    font-size:12px;
    line-height:1.35;
    box-sizing:border-box;
  `,
  gateGrid: `
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(128px, 1fr));
    gap:6px;
  `,
  gate: `
    min-width:0;
    border:1px solid var(--app-border-default);
    border-radius:8px;
    padding:6px 8px;
    background:var(--app-surface-subtle);
    box-sizing:border-box;
  `,
  gateLabel: `
    display:block;
    font-size:10px;
    color:var(--app-text-muted);
    line-height:1.2;
  `,
  gateValue: `
    display:block;
    margin-top:2px;
    font-size:12px;
    font-weight:850;
    line-height:1.25;
    overflow-wrap:anywhere;
  `,
  gateDetail: `
    display:block;
    margin-top:3px;
    font-size:10px;
    line-height:1.25;
    color:var(--app-text-muted);
    overflow-wrap:anywhere;
  `,
  details: `
    display:grid;
    gap:3px;
    font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    color:var(--app-text-muted);
    overflow-wrap:anywhere;
  `,
});

const toneColor = (tone = 'safe') => {
  if (tone === 'danger') return '#e57373';
  if (tone === 'warn') return '#d9b45f';
  return '#5fd08a';
};

export const refreshProviderToolSafetyPreflightView = ({
  container = null,
  status = null,
  diagnostics = null,
  permissionRules = [],
  loopGuard = [],
  sessionId = '',
  sessionGate = null,
  onSetSessionGate = null,
  documentRef = globalThis.document,
} = {}) => {
  const model = buildProviderToolSafetyPreflightViewModel({
    status,
    sessionGate,
    diagnostics,
    permissionRules,
    loopGuard,
    sessionId,
  });
  if (!container || !documentRef?.createElement) return { model };
  if (container.style) container.style.cssText = PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.container;
  clearContainer(container);

  const badgeTone = model.sessionGateEnabled || model.experimentEnabled || model.networkAllowed ? 'warn' : 'safe';
  const badgeColor = toneColor(badgeTone);
  const panel = createElement(documentRef, 'section', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.panel,
  });
  const header = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.header,
  });
  const titleWrap = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.titleWrap,
  });
  titleWrap.appendChild(createElement(documentRef, 'div', {
    text: model.title,
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.title,
  }));
  titleWrap.appendChild(createElement(documentRef, 'div', {
    text: model.summary,
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.summary,
  }));
  header.appendChild(titleWrap);
  const actions = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.headerActions,
  });
  actions.appendChild(createElement(documentRef, 'span', {
    text: model.sessionGateEnabled ? 'session on' : 'default off',
    style: `${PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.badge}color:${badgeColor};`,
  }));
  if (typeof onSetSessionGate === 'function') {
    const button = createElement(documentRef, 'button', {
      text: model.sessionGateEnabled ? 'Disable' : 'Enable',
      style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.button,
    });
    button.type = 'button';
    button.title = model.sessionGateEnabled
      ? 'Disable provider tool execution for this session'
      : 'Enable provider tool execution gate for this session';
    button.addEventListener?.('click', async () => {
      button.disabled = true;
      try {
        await onSetSessionGate({
          enabled: !model.sessionGateEnabled,
          sessionId: model.sessionId,
          model,
        });
      } finally {
        button.disabled = false;
      }
    });
    actions.appendChild(button);
  }
  header.appendChild(actions);
  panel.appendChild(header);

  const body = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.body,
  });
  const gates = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.gateGrid,
  });
  model.gates.forEach((gate) => {
    const color = toneColor(gate.tone);
    const gateEl = createElement(documentRef, 'div', {
      style: `${PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.gate}border-color:${color};`,
    });
    gateEl.appendChild(createElement(documentRef, 'span', {
      text: gate.label,
      style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.gateLabel,
    }));
    gateEl.appendChild(createElement(documentRef, 'span', {
      text: gate.value,
      style: `${PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.gateValue}color:${color};`,
    }));
    if (gate.detail) {
      gateEl.appendChild(createElement(documentRef, 'span', {
        text: gate.detail,
        style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.gateDetail,
      }));
    }
    gates.appendChild(gateEl);
  });
  body.appendChild(gates);
  const details = createElement(documentRef, 'div', {
    style: PROVIDER_TOOL_SAFETY_PREFLIGHT_VIEW_STYLES.details,
  });
  [
    `sessionId: ${model.sessionId}`,
    `provider/model: ${model.provider} / ${model.model}`,
    `rollback: ${model.rollback}`,
  ].forEach(line => details.appendChild(createElement(documentRef, 'div', { text: line })));
  body.appendChild(details);
  panel.appendChild(body);
  container.appendChild(panel);
  return { model };
};
