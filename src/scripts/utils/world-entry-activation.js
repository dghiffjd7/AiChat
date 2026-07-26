const norm = (value) => String(value ?? '').trim();

const parseGroups = (value) => {
  if (Array.isArray(value)) return value.map(norm).filter(Boolean);
  return String(value || '')
    .split(/[,，]/)
    .map(norm)
    .filter(Boolean);
};

export const normalizeWorldEntryKeys = (entry) => {
  const keys = Array.isArray(entry?.key) ? entry.key : Array.isArray(entry?.triggers) ? entry.triggers : [];
  return keys.map(norm).filter(Boolean);
};

export const normalizeWorldEntrySecondaryKeys = (entry) => {
  const keys = Array.isArray(entry?.keysecondary) ? entry.keysecondary : Array.isArray(entry?.secondary) ? entry.secondary : [];
  return keys.map(norm).filter(Boolean);
};

const isRegexLiteral = (key) =>
  key.length >= 2 && key.startsWith('/') && key.endsWith('/') && key.indexOf('/', 1) === key.length - 1;

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasCjk = (value) => /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(value || ''));

const matchKey = (key, rawText, rawTextLower, caseSensitive, matchWholeWords) => {
  const token = norm(key);
  if (!token) return false;
  if (isRegexLiteral(token)) {
    const body = token.slice(1, -1);
    try {
      const re = new RegExp(body, caseSensitive ? '' : 'i');
      return re.test(rawText);
    } catch {
      return false;
    }
  }
  if (matchWholeWords && !hasCjk(token)) {
    try {
      const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, caseSensitive ? '' : 'i');
      return re.test(rawText);
    } catch {
      return false;
    }
  }
  if (caseSensitive) return rawText.includes(token);
  return rawTextLower.includes(token.toLowerCase());
};

const buildMatchTextForEntry = (entry, matchText, matchContext) => {
  if (!matchContext) return matchText;
  const parts = [];
  const sessionName = String(matchContext.sessionName || '').trim();
  if (sessionName) parts.push(sessionName);
  const groupMemberNames = Array.isArray(matchContext.groupMemberNames)
    ? matchContext.groupMemberNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  if (groupMemberNames.length) parts.push(...groupMemberNames);
  const userText = String(matchContext.userMessage || '').trim();
  if (userText) parts.push(userText);
  const history = Array.isArray(matchContext.history) ? matchContext.history : [];
  const scanDepthRaw = entry?.scanDepth;
  const scanDepth = Number.isFinite(Number(scanDepthRaw)) ? Math.max(0, Math.trunc(Number(scanDepthRaw))) : null;
  const historySlice = scanDepth == null ? history : history.slice(-scanDepth);
  if (historySlice.length) parts.push(...historySlice);
  const personaText = String(matchContext.personaText || '').trim();
  if (entry?.matchPersonaDescription && personaText) parts.push(personaText);
  const character = matchContext.character || {};
  if (entry?.matchCharacterDescription && character.description) parts.push(character.description);
  if (entry?.matchCharacterPersonality && character.personality) parts.push(character.personality);
  if (entry?.matchCharacterDepthPrompt && character.depthPrompt) parts.push(character.depthPrompt);
  if (entry?.matchScenario && character.scenario) parts.push(character.scenario);
  if (entry?.matchCreatorNotes && character.creatorNotes) parts.push(character.creatorNotes);
  return parts.join('\n');
};

export const hasWorldMatchInput = (matchText, matchContext) => {
  if (String(matchText || '').trim()) return true;
  if (!matchContext) return false;
  const groupMemberNames = Array.isArray(matchContext.groupMemberNames)
    ? matchContext.groupMemberNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  if (groupMemberNames.length) return true;
  const userText = String(matchContext.userMessage || '').trim();
  const history = Array.isArray(matchContext.history) ? matchContext.history : [];
  if (userText) return true;
  return history.some((line) => String(line || '').trim());
};

export const buildWorldEntryMatchReport = (
  entry,
  {
    matchText = '',
    matchContext = null,
    isRecursivePass = false,
    recursionStep = 0,
    globalCaseSensitive = false,
    globalMatchWholeWords = false,
    evaluateEntryWhen = null,
  } = {},
) => {
  const report = {
    passed: false,
    reasons: [],
    matchedPrimaryKeys: [],
    matchedSecondaryKeys: [],
    entryText: '',
    hasMatchInput: hasWorldMatchInput(matchText, matchContext),
    selectivePassed: true,
    variableConditionConfigured: false,
    variableConditionPassed: true,
    variableConditionExplanation: null,
  };
  if (!entry || typeof entry !== 'object') {
    report.reasons.push('条目不存在');
    return report;
  }
  if (Boolean(entry.disable)) {
    report.reasons.push('条目已禁用');
    return report;
  }
  if (entry.when && typeof entry.when === 'object' && typeof evaluateEntryWhen === 'function') {
    report.variableConditionConfigured = true;
    try {
      const evaluated = evaluateEntryWhen(entry.when, entry);
      if (evaluated && typeof evaluated === 'object') {
        report.variableConditionConfigured = evaluated.configured !== false;
        report.variableConditionPassed = evaluated.passed === true;
        report.variableConditionExplanation = evaluated.explanation || null;
      } else {
        report.variableConditionPassed = evaluated === true;
      }
    } catch {
      report.variableConditionPassed = false;
    }
    if (report.variableConditionConfigured && !report.variableConditionPassed) {
      report.reasons.push('被条目级变量条件挡住');
      return report;
    }
  }
  if (!isRecursivePass && Number.isFinite(Number(entry.delayUntilRecursion)) && Number(entry.delayUntilRecursion) > 0) {
    report.reasons.push(`需在递归第 ${Math.max(0, Math.trunc(Number(entry.delayUntilRecursion)))} 轮后才参与`);
    return report;
  }
  if (isRecursivePass) {
    if (Boolean(entry.excludeRecursion)) {
      report.reasons.push('条目被设置为不参与递归');
      return report;
    }
    const delay = Number.isFinite(Number(entry.delayUntilRecursion))
      ? Math.max(0, Math.trunc(Number(entry.delayUntilRecursion)))
      : 0;
    if (delay > 0 && recursionStep < delay) {
      report.reasons.push(`递归轮次不足，当前第 ${recursionStep} 轮，需要第 ${delay} 轮`);
      return report;
    }
  }
  const content = String(entry.content || '').trim();
  const blockHasContent = Array.isArray(entry?.promptBlocks)
    ? entry.promptBlocks.some((block) => String(block?.content || '').trim().length > 0)
    : false;
  if (!report.hasMatchInput) {
    report.passed = Boolean(content || blockHasContent);
    if (!report.passed) report.reasons.push('条目和分页内容都为空');
    else report.reasons.push('当前没有匹配输入，因此按“有内容即参与”处理');
    return report;
  }
  if (!content && !blockHasContent) {
    report.reasons.push('条目和分页内容都为空');
    return report;
  }
  if (Boolean(entry.constant)) {
    report.passed = true;
    report.reasons.push('常驻条目，跳过关键词匹配');
    return report;
  }
  const keys = normalizeWorldEntryKeys(entry);
  if (!keys.length) {
    report.reasons.push('未设置主关键词');
    return report;
  }
  const secondaryKeys = normalizeWorldEntrySecondaryKeys(entry);
  const caseSensitive =
    typeof entry.caseSensitive === 'boolean' ? entry.caseSensitive : globalCaseSensitive;
  const matchWholeWords =
    typeof entry.matchWholeWords === 'boolean' ? entry.matchWholeWords : globalMatchWholeWords;
  const entryText = buildMatchTextForEntry(entry, matchText, matchContext);
  report.entryText = entryText;
  if (!entryText) {
    report.reasons.push('当前上下文没有可用于匹配的文本');
    return report;
  }
  const rawText = String(entryText || '');
  const rawTextLower = caseSensitive ? rawText : rawText.toLowerCase();
  report.matchedPrimaryKeys = keys.filter((key) => matchKey(key, rawText, rawTextLower, caseSensitive, matchWholeWords));
  if (!report.matchedPrimaryKeys.length) {
    report.reasons.push('主关键词未命中当前上下文');
    return report;
  }
  if (!Boolean(entry.selective) || secondaryKeys.length === 0) {
    report.passed = true;
    report.reasons.push('主关键词已命中');
    return report;
  }
  report.matchedSecondaryKeys = secondaryKeys.filter((key) =>
    matchKey(key, rawText, rawTextLower, caseSensitive, matchWholeWords),
  );
  const anySecondary = report.matchedSecondaryKeys.length > 0;
  const allSecondary = report.matchedSecondaryKeys.length === secondaryKeys.length;
  const logic = Number.isFinite(Number(entry.selectiveLogic)) ? Math.trunc(Number(entry.selectiveLogic)) : 0;
  switch (logic) {
    case 0:
      report.selectivePassed = anySecondary;
      break;
    case 1:
      report.selectivePassed = !allSecondary;
      break;
    case 2:
      report.selectivePassed = !anySecondary;
      break;
    case 3:
      report.selectivePassed = allSecondary;
      break;
    default:
      report.selectivePassed = true;
      break;
  }
  report.passed = report.selectivePassed;
  if (report.selectivePassed) report.reasons.push('主关键词和副关键词逻辑均通过');
  else report.reasons.push('副关键词逻辑未通过');
  return report;
};

export const prepareWorldEntries = ({ worldId = '', data = null, loadWorld = null } = {}) => {
  const id = String(worldId || '').trim();
  const worldData = data && typeof data === 'object' ? data : null;
  if (!id || !worldData) return [];

  const resolveRefEntries = (refs, refFromWorldId) => {
    const list = Array.isArray(refs) ? refs : [];
    if (!list.length || typeof loadWorld !== 'function') return [];
    const results = [];
    list.forEach((raw) => {
      const ref = raw && typeof raw === 'object' ? raw : {};
      const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
      if (!sourceId) return;
      const source = loadWorld(sourceId);
      const sourceEntries = Array.isArray(source?.entries) ? source.entries : [];
      if (!sourceEntries.length) return;
      const entryIdRaw = String(ref.entryId || ref.entry || '').trim();
      const entryIds = Array.isArray(ref.entryIds)
        ? ref.entryIds.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      const includeAll = ref.includeAll === true || ref.all === true || entryIdRaw === '*' || entryIds.includes('*');
      let picked = sourceEntries;
      if (!includeAll) {
        const idSet = new Set(entryIds);
        if (entryIdRaw) idSet.add(entryIdRaw);
        picked = idSet.size
          ? sourceEntries.filter((entry) => idSet.has(String(entry?.id ?? entry?.uid ?? '').trim()))
          : [];
      }
      picked.forEach((entry) => {
        if (!entry) return;
        results.push({
          ...entry,
          _sourceWorldId: sourceId,
          _refWorldId: refFromWorldId,
        });
      });
    });
    return results;
  };

  const localEntries = Array.isArray(worldData.localEntries)
    ? worldData.localEntries
    : (Array.isArray(worldData.entries) ? worldData.entries : []);
  const refEntries = resolveRefEntries(worldData.refs, id);
  const combinedEntries = [...localEntries, ...refEntries];
  return combinedEntries.map((entry, index) => ({
    ...entry,
    _entryId: String(entry?.id ?? entry?.uid ?? `entry-${index}`),
    _entryIndex: index,
    _groups: parseGroups(entry?.group),
    _sourceWorldId: String(entry?._sourceWorldId || id || '').trim(),
    _refWorldId: String(entry?._refWorldId || '').trim(),
  }));
};

const sortWorldEntries = (entries = []) =>
  entries.slice().sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order))
      ? Number(a.order)
      : Number.isFinite(Number(a?.priority))
      ? Number(a.priority)
      : 0;
    const orderB = Number.isFinite(Number(b?.order))
      ? Number(b.order)
      : Number.isFinite(Number(b?.priority))
      ? Number(b.priority)
      : 0;
    return orderA - orderB;
  });

const applyWorldGroupScoring = (entries = [], { globalUseGroupScoring = false } = {}) => {
  let activeEntries = sortWorldEntries(entries);
  const beforeGroupEntryIds = new Set(activeEntries.map((entry) => String(entry?._entryId || '')));
  const groupWinners = new Map();
  const groupBuckets = new Map();
  activeEntries.forEach((entry) => {
    const groups = Array.isArray(entry?._groups) ? entry._groups : [];
    groups.forEach((groupName) => {
      if (!groupBuckets.has(groupName)) groupBuckets.set(groupName, []);
      groupBuckets.get(groupName).push(entry);
    });
  });
  groupBuckets.forEach((bucket, groupName) => {
    const enabled = globalUseGroupScoring || bucket.some((entry) => entry?.useGroupScoring === true || entry?.groupOverride === true);
    if (!enabled) return;
    const override = bucket.filter((entry) => entry?.groupOverride);
    const pool = override.length ? override : bucket;
    let maxWeight = null;
    pool.forEach((entry) => {
      const weight = Number.isFinite(Number(entry?.groupWeight)) ? Number(entry.groupWeight) : 0;
      if (maxWeight == null || weight > maxWeight) maxWeight = weight;
    });
    if (maxWeight == null) return;
    const winners = pool.filter((entry) => {
      const weight = Number.isFinite(Number(entry?.groupWeight)) ? Number(entry.groupWeight) : 0;
      return weight === maxWeight;
    });
    if (winners.length) groupWinners.set(groupName, new Set(winners));
  });
  if (groupWinners.size) {
    activeEntries = activeEntries.filter((entry) => {
      const groups = Array.isArray(entry?._groups) ? entry._groups : [];
      if (!groups.length) return true;
      return groups.every((groupName) => {
        const winners = groupWinners.get(groupName);
        if (!winners) return true;
        return winners.has(entry);
      });
    });
  }
  return {
    activeEntries,
    beforeGroupEntryIds,
  };
};

const resolveEffectiveMatchContext = ({
  baseEntries = [],
  matchText = '',
  matchContext = null,
  minActivations = 0,
  maxDepthSetting = 0,
  evaluateEntry,
} = {}) => {
  let effectiveMatchContext = matchContext;
  if (!matchContext || minActivations <= 0) return effectiveMatchContext;
  const fullHistory = Array.isArray(matchContext.fullHistory) ? matchContext.fullHistory : matchContext.history;
  const historyLines = Array.isArray(fullHistory) ? fullHistory : [];
  if (!historyLines.length) return effectiveMatchContext;
  const maxDepth = maxDepthSetting > 0 ? Math.min(maxDepthSetting, historyLines.length) : historyLines.length;
  let selectedHistory = matchContext.history || [];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const candidateHistory = historyLines.slice(-depth);
    const candidateContext = { ...matchContext, history: candidateHistory };
    const matched = baseEntries.filter((entry) => evaluateEntry(entry, {
      matchText,
      matchContext: candidateContext,
      isRecursivePass: false,
      recursionStep: 0,
    }).passed);
    const uniqueCount = new Set(matched.map((entry) => entry._entryId)).size;
    selectedHistory = candidateHistory;
    if (uniqueCount >= minActivations) break;
  }
  effectiveMatchContext = { ...matchContext, history: selectedHistory };
  return effectiveMatchContext;
};

const shouldKeepByProbability = (entry, randomFn = Math.random) => {
  if (!entry || entry.useProbability === false) return true;
  const probability = Number(entry.probability);
  if (!Number.isFinite(probability)) return true;
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return randomFn() * 100 < probability;
};

export const analyzeWorldEntryActivation = ({
  baseEntries = [],
  matchText = '',
  matchContext = null,
  settings = {},
  targetEntryId = '',
  applyProbability = false,
  random = Math.random,
  evaluateEntryWhen = null,
} = {}) => {
  const {
    globalCaseSensitive = false,
    globalMatchWholeWords = false,
    globalRecursiveScan = true,
    globalUseGroupScoring = false,
    minActivations = 0,
    maxDepthSetting = 0,
    maxRecursionStepsSetting = 0,
  } = settings || {};
  const evaluateEntry = (entry, options = {}) =>
    buildWorldEntryMatchReport(entry, {
      globalCaseSensitive,
      globalMatchWholeWords,
      evaluateEntryWhen,
      ...options,
    });
  const effectiveMatchContext = resolveEffectiveMatchContext({
    baseEntries,
    matchText,
    matchContext,
    minActivations,
    maxDepthSetting,
    evaluateEntry,
  });
  const targetId = String(targetEntryId || '').trim();
  const targetEntry = targetId
    ? baseEntries.find((entry) => String(entry?._entryId || '').trim() === targetId) || null
    : null;
  const directExplain = targetEntry
    ? evaluateEntry(targetEntry, {
      matchText,
      matchContext: effectiveMatchContext,
      isRecursivePass: false,
      recursionStep: 0,
    })
    : null;
  const hasInputForProbability = hasWorldMatchInput(matchText, effectiveMatchContext);
  const probabilityEnabled = applyProbability && hasInputForProbability;
  const directMatches = baseEntries
    .filter((entry) => evaluateEntry(entry, {
      matchText,
      matchContext: effectiveMatchContext,
      isRecursivePass: false,
      recursionStep: 0,
    }).passed)
    .filter((entry) => (!probabilityEnabled || shouldKeepByProbability(entry, random)));
  const activeMap = new Map();
  const activationMeta = new Map();
  directMatches.forEach((entry) => {
    activeMap.set(entry._entryId, entry);
    activationMeta.set(entry._entryId, { source: 'direct', recursionStep: 0 });
  });

  if (globalRecursiveScan) {
    let newlyActivated = [...directMatches];
    const maxRecursionSteps = minActivations > 0
      ? Number.POSITIVE_INFINITY
      : (maxRecursionStepsSetting > 0 ? maxRecursionStepsSetting : Number.POSITIVE_INFINITY);
    let step = 1;
    while (newlyActivated.length && step <= maxRecursionSteps) {
      const recursionText = newlyActivated
        .filter((entry) => !Boolean(entry.preventRecursion))
        .map((entry) => String(entry.content || '').trim())
        .filter(Boolean)
        .join('\n');
      if (!recursionText) break;
      const recursionMatches = baseEntries
        .filter((entry) => !activeMap.has(entry._entryId))
        .filter((entry) => evaluateEntry(entry, {
          matchText: recursionText,
          matchContext: null,
          isRecursivePass: true,
          recursionStep: step,
        }).passed)
        .filter((entry) => (!probabilityEnabled || shouldKeepByProbability(entry, random)));
      if (!recursionMatches.length) break;
      recursionMatches.forEach((entry) => {
        activeMap.set(entry._entryId, entry);
        activationMeta.set(entry._entryId, { source: 'recursive', recursionStep: step });
      });
      newlyActivated = recursionMatches;
      step += 1;
      if (activeMap.size >= baseEntries.length) break;
    }
  }

  const { activeEntries, beforeGroupEntryIds } = applyWorldGroupScoring([...activeMap.values()], {
    globalUseGroupScoring,
  });
  return {
    baseEntries,
    targetEntry,
    directExplain,
    directMatches,
    effectiveMatchContext,
    activeEntries,
    beforeGroupEntryIds,
    activationMeta,
  };
};
