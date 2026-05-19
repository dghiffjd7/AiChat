const SOURCE_KIND_LABEL = {
  builtin: '内置',
  global: '全局',
  role: '角色',
  session: '会话',
};

export const buildWorldDebugLocatorCandidates = (worldDebug = null) => {
  if (!worldDebug || typeof worldDebug !== 'object') return [];
  const sections = [
    { key: 'injectedEntries', label: '实际注入' },
    { key: 'templateEntries', label: '模板注入' },
    { key: 'initialVariableEntries', label: '仅变量初始化' },
    { key: 'trimmedEntries', label: '预算裁剪' },
    { key: 'mergedEntries', label: '合并后条目' },
  ];
  const seen = new Set();
  const output = [];
  sections.forEach((section) => {
    const list = Array.isArray(worldDebug?.[section.key]) ? worldDebug[section.key] : [];
    list.forEach((entry) => {
      const worldId = String(entry?.worldId || '').trim();
      const entryId = String(entry?.entryId || '').trim();
      if (!worldId || !entryId) return;
      const blockId = String(entry?.blockId || 'legacy').trim() || 'legacy';
      const blockTitle = String(entry?.blockTitle || '').trim();
      const focusNodeId = String(entry?.focusNodeId || '').trim();
      const key = `${worldId}::${entryId}::${blockId}`;
      if (seen.has(key)) return;
      seen.add(key);
      output.push({
        key,
        sectionLabel: section.label,
        worldId,
        entryId,
        blockId,
        blockTitle,
        focusNodeId,
        title: String(entry?.title || '').trim() || entryId,
        sourceKind: String(entry?.sourceKind || '').trim() || 'session',
        sourceKindLabel: SOURCE_KIND_LABEL[String(entry?.sourceKind || '').trim()] || String(entry?.sourceKind || '').trim() || '未知',
        positionLabel: String(entry?.positionLabel || '').trim() || '默认 Prompt',
        role: String(entry?.role || 'system').trim() || 'system',
      });
    });
  });
  return output;
};

export const formatPromptWorldDebug = (worldDebug) => {
  if (!worldDebug || typeof worldDebug !== 'object') return '';
  const listOf = (value) => Array.isArray(value) ? value : [];
  const previewOf = (entry) => String(entry?.contentPreview || '').trim();
  const entryLabel = (entry) => {
    const title = String(entry?.title || '').trim();
    const worldId = String(entry?.worldId || '').trim() || 'unknown';
    const entryId = String(entry?.entryId || '').trim() || 'unknown';
    const blockId = String(entry?.blockId || '').trim() || 'legacy';
    const blockTitle = String(entry?.blockTitle || '').trim();
    const blockLabel = blockTitle && blockTitle !== blockId ? `${blockTitle}(${blockId})` : blockId;
    return `${title} [${worldId} / ${entryId} / ${blockLabel}]`;
  };
  const sectionLines = [];
  const pushSection = (title, rows) => {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!list.length) return;
    sectionLines.push(title);
    sectionLines.push(...list);
  };
  const renderEntryRows = (entries, {
    includePosition = false,
    includeTags = false,
    emptyText = '',
  } = {}) => {
    const list = listOf(entries);
    if (!list.length) return emptyText ? [`- ${emptyText}`] : [];
    return list.map((entry) => {
      const src = SOURCE_KIND_LABEL[String(entry?.sourceKind || '').trim()] || String(entry?.sourceKind || '').trim() || '未知';
      const parts = [
        `- ${src}`,
        entryLabel(entry),
        `${String(entry?.role || 'system')}`,
      ];
      if (includePosition) {
        const pos = String(entry?.positionLabel || '').trim() || '默认 Prompt';
        const depth = Number.isFinite(Number(entry?.depth)) ? Number(entry.depth) : 0;
        parts.push(pos);
        if (depth > 0) parts.push(`depth=${depth}`);
      }
      if (includeTags) {
        const tags = listOf(entry?.tags)
          .map((tag) => {
            const stage = String(tag?.stage || '').trim();
            const type = String(tag?.type || '').trim();
            const mode = String(tag?.mode || '').trim();
            const index = Number.isFinite(Number(tag?.index)) ? `:${Number(tag.index)}` : '';
            const pattern = String(tag?.pattern || '').trim();
            if (type === 'regex' && pattern) return `${stage}:${type}:${pattern}`;
            return `${stage}:${type}${index}${mode ? `:${mode}` : ''}`;
          })
          .filter(Boolean);
        if (tags.length) parts.push(tags.join(', '));
      }
      const triggerName = String(entry?.triggerSourceName || '').trim();
      const triggerReason = String(entry?.triggerReason || '').trim();
      if (triggerName || triggerReason) {
        parts.push(`触发=${[triggerName, triggerReason].filter(Boolean).join(':')}`);
      }
      const trimReason = String(entry?.trimReason || '').trim();
      if (trimReason) parts.push(`裁剪=${trimReason}`);
      const preview = previewOf(entry);
      return `${parts.join(' | ')}${preview ? ` | ${preview}` : ''}`;
    });
  };

  const builtinEntries = listOf(worldDebug?.builtinEntries);
  const globalEntries = listOf(worldDebug?.globalEntries);
  const roleEntries = listOf(worldDebug?.roleEntries);
  const sessionEntries = listOf(worldDebug?.sessionEntries);
  const injectedEntries = listOf(worldDebug?.injectedEntries);
  const templateEntries = listOf(worldDebug?.templateEntries);
  const initialVariableEntries = listOf(worldDebug?.initialVariableEntries);
  const trimmedEntries = listOf(worldDebug?.trimmedEntries);
  const mergedEntries = listOf(worldDebug?.mergedEntries);
  const dynamicWorld = worldDebug?.dynamicWorld && typeof worldDebug.dynamicWorld === 'object'
    ? worldDebug.dynamicWorld
    : null;
  const dynamicProfiles = worldDebug?.dynamicProfiles && typeof worldDebug.dynamicProfiles === 'object'
    ? worldDebug.dynamicProfiles
    : null;
  const dynamicCandidates = listOf(dynamicWorld?.candidates);
  const dynamicSelected = listOf(dynamicWorld?.selectedSources);
  const profileCandidates = listOf(dynamicProfiles?.candidates);
  const profileSelected = listOf(dynamicProfiles?.selectedSources);
  const profileInjectedRows = listOf(dynamicProfiles?.injectedRows);

  const budgetTokens = Number.isFinite(Number(worldDebug?.budgetTokens)) ? Number(worldDebug.budgetTokens) : null;
  const usedTokens = Number.isFinite(Number(worldDebug?.usedTokens)) ? Number(worldDebug.usedTokens) : 0;
  const strategy = String(worldDebug?.insertionStrategy || '').trim() || 'role_first';
  const variableStrategyRaw = String(worldDebug?.variableDefineStrategy || '').trim();
  const variableStrategy = (() => {
    if (variableStrategyRaw === 'first_hit') return 'first_hit（命中后建立）';
    if (variableStrategyRaw === 'off') return 'off（关闭自动建立）';
    return 'legacy_eager（请求前建立）';
  })();

  const header = [
    '[世界书调试]',
    `- 插入策略: ${strategy}`,
    `- 变量自动建立: ${variableStrategy}`,
    `- 激活命中: 内置 ${builtinEntries.length} / 全局 ${globalEntries.length} / 角色 ${roleEntries.length} / 会话 ${sessionEntries.length}`,
    `- 合并后条目: ${mergedEntries.length}（预算前）`,
    `- 实际注入: 普通 ${injectedEntries.length} / 模板 ${templateEntries.length} / 仅变量初始化 ${initialVariableEntries.length}`,
    budgetTokens != null
      ? `- 预算: ${usedTokens}/${budgetTokens} tokens${worldDebug?.overflowed ? `，裁掉 ${trimmedEntries.length} 条` : ''}`
      : '- 预算: 未限制',
  ];
  if (dynamicWorld?.enabled) {
    const sessionBudgetTokens = Number.isFinite(Number(dynamicWorld?.sessionBudgetTokens))
      ? Number(dynamicWorld.sessionBudgetTokens)
      : null;
    const sessionUsedTokens = Number.isFinite(Number(dynamicWorld?.sessionUsedTokens))
      ? Number(dynamicWorld.sessionUsedTokens)
      : 0;
    header.push(
      sessionBudgetTokens != null
        ? `- 动态强触发: 候选 ${dynamicCandidates.length} / 注入来源 ${dynamicSelected.length} / 会话世界书预算 ${sessionUsedTokens}/${sessionBudgetTokens} tokens${dynamicWorld?.overflowed ? `，裁掉 ${Number(dynamicWorld?.sessionTrimmedCount) || 0} 条` : ''}`
        : `- 动态强触发: 候选 ${dynamicCandidates.length} / 注入来源 ${dynamicSelected.length}`,
    );
  }
  if (dynamicProfiles?.enabled) {
    header.push(
      `- 动态弱触发: 候选 ${profileCandidates.length} / 命中 ${profileSelected.length} / 注入记忆行 ${profileInjectedRows.length}${dynamicProfiles?.promptInjected ? '' : '（未注入）'}`,
    );
  }

  pushSection('动态强触发来源', dynamicSelected.map((source) => {
    const name = String(source?.name || source?.sessionId || '').trim() || '未知对象';
    const sessionId = String(source?.sessionId || '').trim();
    const reasons = listOf(source?.reasons).join(',');
    const worldIds = listOf(source?.worldIds).join(',');
    return `- ${name}${sessionId ? ` (${sessionId})` : ''}${reasons ? ` | ${reasons}` : ''}${worldIds ? ` | ${worldIds}` : ''}`;
  }));

  pushSection('动态弱触发画像/记忆', profileCandidates.map((source) => {
    const name = String(source?.name || source?.contactId || '').trim() || '未知联系人';
    const contactId = String(source?.contactId || '').trim();
    const score = Number.isFinite(Number(source?.score)) ? Number(source.score) : 0;
    const status = String(source?.status || '').trim() || 'unknown';
    const reason = String(source?.blockedReason || '').trim();
    const terms = listOf(source?.matchedTerms).join(',');
    const rows = listOf(source?.matchedRows)
      .map(row => String(row?.rowSummary || row?.id || '').trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ');
    return `- ${name}${contactId ? ` (${contactId})` : ''} | ${status} | score=${score}${reason ? ` | ${reason}` : ''}${terms ? ` | ${terms}` : ''}${rows ? ` | ${rows}` : ''}`;
  }));

  pushSection('激活条目', [
    ...renderEntryRows(builtinEntries, { emptyText: '无内置命中' }),
    ...renderEntryRows(globalEntries, { emptyText: '无全局命中' }),
    ...renderEntryRows(roleEntries, { emptyText: '无角色命中' }),
    ...renderEntryRows(sessionEntries, { emptyText: '无会话命中' }),
  ]);
  pushSection('合并后（预算前）', renderEntryRows(mergedEntries, { includePosition: true, emptyText: '无合并条目' }));
  pushSection('实际注入', renderEntryRows(injectedEntries, { includePosition: true, emptyText: '无普通注入内容' }));
  pushSection('模板注入', renderEntryRows(templateEntries, { includePosition: true, includeTags: true, emptyText: '无模板注入内容' }));
  pushSection('仅变量初始化', renderEntryRows(initialVariableEntries, { emptyText: '无 InitialVariables 条目' }));
  pushSection('预算裁掉', renderEntryRows(trimmedEntries, { includePosition: true, emptyText: '无预算裁剪' }));

  return [...header, '', ...sectionLines].join('\n').trim();
};
