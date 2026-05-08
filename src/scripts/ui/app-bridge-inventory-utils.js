export const BRIDGE_CONTRACT_REGISTER_DOMAINS = Object.freeze({
  registerPromptInjectionBridgeContract: 'prompt-injection',
  registerPromptProcessingBridgeContract: 'prompt-processing',
  registerPersonaBridgeContract: 'persona',
  registerSessionStateBridgeContract: 'session-state',
  registerRoleWorldBridgeContract: 'role-world',
  registerWorldStoreBridgeContract: 'world-store',
  registerWorldSessionBridgeContract: 'world-session',
  registerConfigRuntimeBridgeContract: 'config-runtime',
  registerPresetStoreBridgeContract: 'preset-store',
  registerScriptRuntimeBridgeContract: 'script-runtime',
  registerGenerationBridgeContract: 'generation',
  registerRegexTransformBridgeContract: 'regex-transform',
  registerRegexStoreBridgeContract: 'regex-store',
  registerSharedSessionBridgeContract: 'shared-session',
  registerRuntimeServiceBridgeContract: 'runtime-service',
  registerTurnCheckpointBridgeContract: 'turn-checkpoint',
  registerMemoryUpdateBridgeContract: 'memory-update',
  registerMemoryStoreBridgeContract: 'memory-store',
  registerMessageActionBridgeContract: 'message-action',
  registerChatUiBridgeContract: 'chat-ui',
  registerUiUtilityBridgeContract: 'ui-utility',
});

export const APP_BRIDGE_GAP_STATUS = Object.freeze({
  shouldContract: 'should-contract',
  eventCandidate: 'event-candidate',
  storeAdapter: 'store-adapter',
  runtimeState: 'runtime-state',
  legacyMethod: 'legacy-method',
  diagnostics: 'diagnostics',
  unclassified: 'unclassified',
});

export const APP_BRIDGE_GAP_POLICY = Object.freeze({
  activeSessionId: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'high',
    recommendation: 'Prefer an injected session runtime getter before moving more callers.',
  },
  chatStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'high',
    recommendation: 'Keep temporarily, but new callers should receive chatStore through runtime deps.',
  },
  contactsStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'high',
    recommendation: 'Keep temporarily, but settings/import flows should converge on injected deps.',
  },
  config: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'high',
    recommendation: 'Config mutation should get a contract before config-panel refactors.',
  },
  client: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'high',
    recommendation: 'LLM client replacement should be routed through a runtime service contract.',
  },
  worldStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'high',
    recommendation: 'Worldbook callers should migrate toward role-world/world-store adapters.',
  },
  getWorldInfo: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'high',
    recommendation: 'Worldbook read callers need an explicit world-store contract before editor/panel extraction.',
  },
  saveWorldInfo: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'high',
    recommendation: 'Worldbook write callers need an explicit world-store contract before editor/panel extraction.',
  },
  listWorlds: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Worldbook listing should join the explicit world-store contract.',
  },
  deleteWorldInfo: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Worldbook deletion should join the explicit world-store lifecycle contract.',
  },
  renameWorldInfo: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Worldbook rename should stay paired with lifecycle propagation tests.',
  },
  bindWorldToSession: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Session/world binding writes should move behind a role-world contract.',
  },
  persistWorldSessionMap: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'World session map persistence should be owned by a world binding runtime.',
  },
  explainWorldEntryActivation: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'World activation diagnostics should be exposed as a debug/world contract.',
  },
  regex: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'medium',
    recommendation: 'Regex store access is broad; keep visible until preset/world binding is separated.',
  },
  presets: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'medium',
    recommendation: 'Preset store access should become explicit prompt/config runtime dependency.',
  },
  memoryTableStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'medium',
    recommendation: 'Memory table access is accepted during session/memory lifecycle extraction.',
  },
  memoryTemplateStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'medium',
    recommendation: 'Memory template access is accepted during settings/import extraction.',
  },
  scriptStore: {
    status: APP_BRIDGE_GAP_STATUS.storeAdapter,
    priority: 'medium',
    recommendation: 'Script store access should become an explicit script/import runtime dependency.',
  },
  scriptRuntime: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'Script runtime access should be exposed through a plugin/script lifecycle contract.',
  },
  chatUI: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'Chat UI access should remain visible until UI adapters are injected explicitly.',
  },
  setActiveSession: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'high',
    recommendation: 'Active-session mutation should move behind session orchestration contract tests.',
  },
  setPersonaScope: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'Persona scope mutation should be part of persona/session lifecycle contracts.',
  },
  processTextMacros: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'high',
    recommendation: 'Macro processing needs explicit input/output and session-scope contract coverage.',
  },
  backgroundChat: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'high',
    recommendation: 'Background generation should share the generation request/cancel contract surface.',
  },
  applyInputStoredRegex: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Regex transform bridge methods should be grouped under an explicit regex contract.',
  },
  applyOutputStoredRegex: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Regex transform bridge methods should be grouped under an explicit regex contract.',
  },
  applyOutputDisplayRegex: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Regex transform bridge methods should be grouped under an explicit regex contract.',
  },
  applyReasoningDisplayRegex: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'medium',
    recommendation: 'Reasoning regex transforms should be grouped under an explicit regex/reasoning contract.',
  },
  globalWorldId: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'World state should remain visible until world runtime owns binding state.',
  },
  currentWorldId: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'World state should remain visible until world runtime owns binding state.',
  },
  currentWorldIds: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'World state should remain visible until world runtime owns binding state.',
  },
  worldSessionMap: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'Import/export callers should use a world binding adapter before deeper refactors.',
  },
  worldGlobalSettings: {
    status: APP_BRIDGE_GAP_STATUS.runtimeState,
    priority: 'medium',
    recommendation: 'World settings should be exposed through a world runtime contract.',
  },
  lastRequest: {
    status: APP_BRIDGE_GAP_STATUS.diagnostics,
    priority: 'low',
    recommendation: 'Diagnostic read is accepted, but should stay read-only.',
  },
  debugUiRegistry: {
    status: APP_BRIDGE_GAP_STATUS.diagnostics,
    priority: 'low',
    recommendation: 'Debug registry sidecar is intentionally inspected by diagnostics modules.',
  },
  bridgeContractRegistry: {
    status: APP_BRIDGE_GAP_STATUS.diagnostics,
    priority: 'low',
    recommendation: 'Bridge contract registry sidecar is intentionally inspected by diagnostics modules.',
  },
  generate: {
    status: APP_BRIDGE_GAP_STATUS.shouldContract,
    priority: 'high',
    recommendation: 'Generation entrypoints need explicit parameter and cancellation contracts.',
  },
});

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*/;

const isWhitespace = ch => /\s/.test(ch || '');

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildLineStarts = (source = '') => {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
};

const getLineForIndex = (lineStarts, index = 0) => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(1, high + 1);
};

export const maskCommentsAndStrings = (source = '') => {
  const input = String(source || '');
  const out = input.split('');
  let state = 'code';
  let quote = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (state === 'line-comment') {
      if (ch === '\n') state = 'code';
      else out[i] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 1;
        state = 'code';
      } else if (ch !== '\n') {
        out[i] = ' ';
      }
      continue;
    }
    if (state === 'string') {
      if (ch !== '\n') out[i] = ' ';
      if (ch === '\\') {
        if (next && next !== '\n') out[i + 1] = ' ';
        i += 1;
      } else if (ch === quote) {
        state = 'code';
        quote = '';
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      state = 'line-comment';
      continue;
    }
    if (ch === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      state = 'block-comment';
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      out[i] = ' ';
      state = 'string';
      quote = ch;
    }
  }
  return out.join('');
};

const makeReference = ({ field, owner, filePath, index, lineStarts }) => ({
  field,
  owner,
  filePath,
  line: getLineForIndex(lineStarts, index),
});

const findAppBridgeAliases = (maskedSource = '') => {
  const aliases = new Set();
  const patterns = [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.appBridge\b(?!\s*(?:\?\.|\.))/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*this\.appBridge\b(?!\s*(?:\?\.|\.))/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*appBridge\s*\|\|\s*window\.appBridge\b/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^;\n]*window\.appBridge[^;\n]*\)\s*\?\s*window\.appBridge\s*:\s*null\b/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*this\.runtime\?\.bridge\s*\|\|\s*\([^;\n]*window\.appBridge[^;\n]*\)\s*\?\s*window\.appBridge\s*:\s*null\b/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(maskedSource))) {
      const alias = String(match[1] || '').trim();
      if (alias && alias !== 'window' && alias !== 'appBridge') aliases.add(alias);
    }
  }
  return aliases;
};

export const extractAppBridgeReferencesFromSource = ({
  source = '',
  filePath = '',
} = {}) => {
  const raw = String(source || '');
  const masked = maskCommentsAndStrings(raw);
  const lineStarts = buildLineStarts(masked);
  const references = [];
  const scan = (owner, pattern) => {
    let match;
    while ((match = pattern.exec(masked))) {
      const field = String(match[1] || '').trim();
      if (!field) continue;
      references.push(makeReference({
        field,
        owner,
        filePath,
        index: match.index,
        lineStarts,
      }));
    }
  };
  scan('window.appBridge', /(?<![\w$])window\.appBridge\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g);
  scan('this.appBridge', /(?<![\w$])this\.appBridge\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g);
  scan('appBridge', /(?<![\w$.])appBridge\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g);
  for (const alias of findAppBridgeAliases(masked)) {
    scan(`alias:${alias}`, new RegExp(`(?<![\\w$.])${escapeRegex(alias)}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)`, 'g'));
  }
  const seen = new Set();
  return references.filter((reference) => {
    const key = `${reference.field}\0${reference.owner}\0${reference.filePath}\0${reference.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const findMatchingBrace = (source = '', openIndex = -1) => {
  if (openIndex < 0 || source[openIndex] !== '{') return -1;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const skipSpaces = (source, index, end) => {
  let i = index;
  while (i < end && isWhitespace(source[i])) i += 1;
  return i;
};

const skipPropertyValue = (source, index, end) => {
  let depth = 1;
  for (let i = index; i < end; i += 1) {
    const ch = source[i];
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 1) return i + 1;
  }
  return end;
};

const extractTopLevelObjectKeys = (source = '', openIndex = -1, closeIndex = -1) => {
  const keys = [];
  let i = openIndex + 1;
  while (i > 0 && i < closeIndex) {
    i = skipSpaces(source, i, closeIndex);
    if (source.startsWith('...', i)) {
      i = skipPropertyValue(source, i + 3, closeIndex);
      continue;
    }
    const match = source.slice(i).match(IDENTIFIER_RE);
    if (!match) {
      i += 1;
      continue;
    }
    const name = match[0];
    const afterName = skipSpaces(source, i + name.length, closeIndex);
    const delimiter = source[afterName];
    if (delimiter === ':' || delimiter === ',' || delimiter === '(') {
      keys.push(name);
      i = skipPropertyValue(source, afterName, closeIndex);
      continue;
    }
    i = afterName + 1;
  }
  return [...new Set(keys)];
};

export const extractBridgeContractRegistrationsFromSource = ({
  source = '',
  filePath = '',
} = {}) => {
  const raw = String(source || '');
  const lineStarts = buildLineStarts(raw);
  const pattern = /\b(register[A-Za-z]+BridgeContract)\s*\(\s*window\.appBridge\s*,\s*\{/g;
  const registrations = [];
  let match;
  while ((match = pattern.exec(raw))) {
    const registerFn = match[1];
    const openIndex = raw.indexOf('{', match.index);
    const closeIndex = findMatchingBrace(raw, openIndex);
    if (openIndex < 0 || closeIndex < 0) continue;
    const maskedObject = maskCommentsAndStrings(raw.slice(openIndex, closeIndex + 1));
    const domain = BRIDGE_CONTRACT_REGISTER_DOMAINS[registerFn] || 'app-bridge';
    for (const field of extractTopLevelObjectKeys(maskedObject, 0, maskedObject.length - 1)) {
      registrations.push({
        field,
        domain,
        registerFn,
        filePath,
        line: getLineForIndex(lineStarts, match.index),
      });
    }
  }
  return registrations;
};

const summarizeFields = (references = []) => {
  const map = new Map();
  for (const reference of references) {
    if (!reference?.field) continue;
    if (!map.has(reference.field)) {
      map.set(reference.field, {
        field: reference.field,
        count: 0,
        files: new Set(),
        owners: new Set(),
        first: reference,
      });
    }
    const entry = map.get(reference.field);
    entry.count += 1;
    if (reference.filePath) entry.files.add(reference.filePath);
    if (reference.owner) entry.owners.add(reference.owner);
  }
  return [...map.values()]
    .map(entry => ({
      ...entry,
      files: [...entry.files].sort(),
      owners: [...entry.owners].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.field.localeCompare(right.field));
};

const summarizeRegistrations = (registrations = []) => {
  const map = new Map();
  for (const registration of registrations) {
    if (!registration?.field) continue;
    if (!map.has(registration.field)) {
      map.set(registration.field, {
        field: registration.field,
        domains: new Set(),
        registrations: [],
      });
    }
    const entry = map.get(registration.field);
    entry.domains.add(registration.domain || 'app-bridge');
    entry.registrations.push(registration);
  }
  return [...map.values()]
    .map(entry => ({
      ...entry,
      domains: [...entry.domains].sort(),
    }))
    .sort((left, right) => left.field.localeCompare(right.field));
};

export const buildAppBridgeInventoryReport = ({
  references = [],
  registrations = [],
  gapPolicy = APP_BRIDGE_GAP_POLICY,
} = {}) => {
  const fieldStats = summarizeFields(references);
  const registrationStats = summarizeRegistrations(registrations);
  const registeredFields = new Set(registrationStats.map(entry => entry.field));
  const referencedFields = new Set(fieldStats.map(entry => entry.field));
  const coveredFields = fieldStats.filter(entry => registeredFields.has(entry.field));
  const gapFields = fieldStats
    .filter(entry => !registeredFields.has(entry.field))
    .map(entry => ({
      ...entry,
      policy: gapPolicy[entry.field] || {
        status: APP_BRIDGE_GAP_STATUS.unclassified,
        priority: 'medium',
        recommendation: 'Classify this bridge field before moving more callers.',
      },
    }));
  const highRiskGaps = gapFields.filter(entry => entry.policy?.priority === 'high');
  const registrationOnlyFields = registrationStats.filter(entry => !referencedFields.has(entry.field));
  return {
    references,
    registrations,
    fieldStats,
    registrationStats,
    coveredFields,
    gapFields,
    highRiskGaps,
    registrationOnlyFields,
    summary: {
      references: references.length,
      referencedFields: fieldStats.length,
      registeredFields: registrationStats.length,
      coveredFields: coveredFields.length,
      gapFields: gapFields.length,
      highRiskGaps: highRiskGaps.length,
      registrationOnlyFields: registrationOnlyFields.length,
    },
  };
};

export const buildAppBridgeInventory = ({
  referenceSources = [],
  contractSources = [],
  gapPolicy = APP_BRIDGE_GAP_POLICY,
} = {}) => {
  const references = referenceSources.flatMap(sourceInfo => extractAppBridgeReferencesFromSource(sourceInfo));
  const registrations = contractSources.flatMap(sourceInfo => extractBridgeContractRegistrationsFromSource(sourceInfo));
  return buildAppBridgeInventoryReport({ references, registrations, gapPolicy });
};

export const formatAppBridgeInventoryReport = (report = {}, { limit = 20 } = {}) => {
  const summary = report.summary || {};
  const lines = [
    'AppBridge inventory',
    `references=${summary.references || 0}`,
    `referencedFields=${summary.referencedFields || 0}`,
    `registeredFields=${summary.registeredFields || 0}`,
    `coveredFields=${summary.coveredFields || 0}`,
    `gapFields=${summary.gapFields || 0}`,
    `highRiskGaps=${summary.highRiskGaps || 0}`,
  ];
  const topGaps = (report.gapFields || []).slice(0, limit);
  if (topGaps.length) {
    lines.push('', 'Top gaps:');
    for (const gap of topGaps) {
      lines.push(`- ${gap.field}: refs=${gap.count}, status=${gap.policy?.status || APP_BRIDGE_GAP_STATUS.unclassified}, priority=${gap.policy?.priority || 'medium'}`);
    }
  }
  return lines.join('\n');
};
