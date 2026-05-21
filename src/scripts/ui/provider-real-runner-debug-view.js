const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const formatList = (items = []) => (
  (Array.isArray(items) ? items : [items])
    .map(item => trim(item))
    .filter(Boolean)
    .join(', ') || '-'
);

const readLatestRealRunnerEntry = (snapshot = {}) => {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  return history.find(entry => (
    isPlainObject(entry?.realRunnerDebug) ||
    isPlainObject(entry?.runnerFacade?.runnerBoundary) ||
    isPlainObject(entry?.runnerModePlan)
  )) || null;
};

const boolLabel = (value, on = 'on', off = 'off') => (value === true ? on : off);

const buildGate = ({
  key = '',
  label = '',
  value = '',
  ok = false,
  required = true,
} = {}) => ({
  key: trim(key, label),
  label: trim(label, key),
  value: trim(value, '-'),
  ok: ok === true,
  required: required !== false,
});

export const buildProviderRealRunnerDebugViewModel = (snapshot = {}) => {
  const status = isPlainObject(snapshot?.status) ? snapshot.status : {};
  const entry = readLatestRealRunnerEntry(snapshot);
  const debug = isPlainObject(entry?.realRunnerDebug) ? entry.realRunnerDebug : {};
  const runnerMode = isPlainObject(entry?.runnerModePlan) ? entry.runnerModePlan : {};
  const runnerFacade = isPlainObject(entry?.runnerFacade) ? entry.runnerFacade : {};
  const boundary = isPlainObject(runnerFacade?.runnerBoundary) ? runnerFacade.runnerBoundary : {};
  const capability = isPlainObject(boundary?.capability) ? boundary.capability : {};
  const nativeContract = isPlainObject(boundary?.nativeRunnerContract) ? boundary.nativeRunnerContract : {};
  const debugStatus = trim(debug.status, entry ? 'blocked' : 'idle');
  const mode = trim(debug.mode || runnerMode.mode, 'read_only_capture');
  const armed = debugStatus === 'armed';
  const runnerSource = debug.llmClientInjected === true
    ? 'llmClient'
    : (debug.providerClientInjected === true
        ? 'providerClient'
        : (debug.providerRunnerInjected === true ? 'runner' : 'none'));
  const tools = Array.isArray(debug.allowedTools) ? debug.allowedTools : status.allowedTools;
  const title = armed ? 'Real Runner Armed' : (entry ? 'Real Runner Locked' : 'Real Runner Idle');
  const summary = armed
    ? 'debug-only runner is armed; chat generation still does not auto-create or attach it'
    : trim(debug.reason || runnerMode.reason, entry ? 'real runner gates are not all enabled' : 'no real runner diagnostics yet');
  const gates = [
    buildGate({
      key: 'experiment',
      label: 'Experiment',
      value: boolLabel(debug.experimentEnabled === true || status.enabled === true),
      ok: debug.experimentEnabled === true || status.enabled === true,
    }),
    buildGate({
      key: 'mode',
      label: 'Mode',
      value: mode,
      ok: mode === 'real_runner',
    }),
    buildGate({
      key: 'facade',
      label: 'Facade',
      value: boolLabel(debug.runnerFacadeEnabled === true || runnerMode.runnerFacadeEnabled === true),
      ok: debug.runnerFacadeEnabled === true || runnerMode.runnerFacadeEnabled === true,
    }),
    buildGate({
      key: 'adapter',
      label: 'Adapter',
      value: boolLabel(debug.adapterEnabled === true),
      ok: debug.adapterEnabled === true,
    }),
    buildGate({
      key: 'runner',
      label: 'Runner',
      value: runnerSource,
      ok: debug.providerRunnerInjected === true,
    }),
    buildGate({
      key: 'network',
      label: 'Network',
      value: boolLabel(debug.allowRunnerNetwork === true, 'allowed', 'blocked'),
      ok: debug.allowRunnerNetwork === true,
    }),
    buildGate({
      key: 'writesChat',
      label: 'Chat Writes',
      value: debug.writesChat === true ? 'blocked by facade' : 'disabled',
      ok: debug.writesChat !== true,
    }),
  ];
  return {
    hasData: Boolean(entry),
    status: debugStatus,
    armed,
    title,
    summary,
    mode,
    provider: trim(entry?.provider || status.provider, '-'),
    model: trim(entry?.model || status.model, '-'),
    sessionId: trim(entry?.sessionId, '-'),
    runnerSource,
    runnerFacadeStatus: trim(runnerFacade.status, '-'),
    runnerBoundaryStatus: trim(boundary.status, '-'),
    runnerCapability: trim(capability.runnerKind, '-'),
    nativeContract: trim(nativeContract.contractKind, '-'),
    network: debug.network === true || runnerFacade.network === true,
    writesChat: debug.writesChat === true || runnerFacade.writesChat === true,
    modelContextPolicy: trim(debug.modelContextPolicy, 'allowlist_only'),
    allowedTools: formatList(tools),
    rollback: trim(debug.rollback, 'set runnerMode=read_only_capture or remove providerRunner/providerClient'),
    gates,
  };
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

const clearContainer = (container) => {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
    return;
  }
  container.textContent = '';
  if (Array.isArray(container.children)) container.children.length = 0;
};

export const PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES = Object.freeze({
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
    grid-template-columns:10px minmax(0, 1fr) auto;
    gap:10px;
    align-items:center;
    min-height:42px;
    padding:9px 10px;
    background:var(--app-surface-subtle);
    color:var(--app-text-primary);
    box-sizing:border-box;
  `,
  dot: `
    width:9px;
    height:9px;
    border-radius:999px;
    box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
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
    grid-template-columns:repeat(auto-fit, minmax(116px, 1fr));
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
  details: `
    display:grid;
    gap:3px;
    font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    color:var(--app-text-muted);
    overflow-wrap:anywhere;
  `,
  empty: `
    border:1px dashed var(--app-border-default);
    border-radius:8px;
    padding:9px 10px;
    color:var(--app-text-muted);
    font-size:12px;
  `,
});

export const refreshProviderRealRunnerDebugView = ({
  container = null,
  diagnostics = null,
  documentRef = globalThis.document,
} = {}) => {
  if (!container || !documentRef?.createElement) return { model: buildProviderRealRunnerDebugViewModel(diagnostics) };
  const model = buildProviderRealRunnerDebugViewModel(diagnostics);
  if (container.style) container.style.cssText = PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.container;
  clearContainer(container);
  if (!model.hasData) {
    container.appendChild(createElement(documentRef, 'div', {
      text: 'Real runner: no diagnostics yet',
      style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.empty,
    }));
    return { model };
  }

  const accent = model.armed ? '#5fd08a' : '#d9b45f';
  const panel = createElement(documentRef, 'section', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.panel,
  });
  const header = createElement(documentRef, 'div', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.header,
  });
  header.appendChild(createElement(documentRef, 'span', {
    style: `${PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.dot}color:${accent};background:${accent};`,
  }));
  const titleWrap = createElement(documentRef, 'div', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.titleWrap,
  });
  titleWrap.appendChild(createElement(documentRef, 'div', {
    text: model.title,
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.title,
  }));
  titleWrap.appendChild(createElement(documentRef, 'div', {
    text: model.summary,
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.summary,
  }));
  header.appendChild(titleWrap);
  header.appendChild(createElement(documentRef, 'span', {
    text: model.status,
    style: `${PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.badge}color:${accent};`,
  }));
  panel.appendChild(header);

  const body = createElement(documentRef, 'div', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.body,
  });
  const gates = createElement(documentRef, 'div', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.gateGrid,
  });
  model.gates.forEach((gate) => {
    const gateAccent = gate.ok ? '#5fd08a' : '#d9b45f';
    const gateEl = createElement(documentRef, 'div', {
      style: `${PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.gate}border-color:${gateAccent};`,
    });
    gateEl.appendChild(createElement(documentRef, 'span', {
      text: gate.label,
      style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.gateLabel,
    }));
    gateEl.appendChild(createElement(documentRef, 'span', {
      text: gate.value,
      style: `${PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.gateValue}color:${gateAccent};`,
    }));
    gates.appendChild(gateEl);
  });
  body.appendChild(gates);
  const details = createElement(documentRef, 'div', {
    style: PROVIDER_REAL_RUNNER_DEBUG_VIEW_STYLES.details,
  });
  [
    `provider/model: ${model.provider} / ${model.model}`,
    `sessionId: ${model.sessionId}`,
    `runner: ${model.runnerSource} | facade=${model.runnerFacadeStatus} | boundary=${model.runnerBoundaryStatus}`,
    `capability: ${model.runnerCapability} | nativeContract=${model.nativeContract}`,
    `policy: tools=${model.allowedTools} | modelContext=${model.modelContextPolicy} | rollback=${model.rollback}`,
  ].forEach(line => details.appendChild(createElement(documentRef, 'div', { text: line })));
  body.appendChild(details);
  panel.appendChild(body);
  container.appendChild(panel);
  return { model };
};
