export const CHAT_BODY_QUALITY_STATUSES = Object.freeze({
  ready: 'ready',
  minorIssues: 'minor_issues',
  needsReview: 'needs_review',
  invalid: 'invalid',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const compactWhitespace = value => String(value ?? '').trim().replace(/\s+/g, ' ');

const truncate = (value = '', maxLength = 180) => {
  const text = compactWhitespace(value);
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 180));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const normalizeConfidence = (value, fallback = 0.75) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

const normalizeIssue = (issue = {}) => {
  const src = isPlainObject(issue) ? issue : {};
  return {
    id: trim(src.id, 'body_quality_issue'),
    severity: ['info', 'warning', 'error'].includes(src.severity) ? src.severity : 'warning',
    title: trim(src.title, '正文质量问题'),
    summary: trim(src.summary),
    confidence: normalizeConfidence(src.confidence),
    risk: ['low', 'medium', 'high'].includes(src.risk) ? src.risk : 'medium',
    patchable: src.patchable === true,
  };
};

const normalizePatchCandidate = (candidate = null) => {
  if (!candidate || !candidate.available) return null;
  return {
    available: true,
    id: trim(candidate.id, 'body_quality_patch'),
    title: trim(candidate.title, '正文优化候选'),
    summary: trim(candidate.summary),
    risk: ['low', 'medium', 'high'].includes(candidate.risk) ? candidate.risk : 'low',
    confidence: normalizeConfidence(candidate.confidence, 0.82),
    replacementText: String(candidate.replacementText ?? ''),
    preview: truncate(candidate.preview || candidate.replacementText, 220),
    operations: Array.isArray(candidate.operations) ? candidate.operations.slice() : [],
  };
};

export const resolveChatBodyQualityInputText = (message = {}) => {
  const candidates = [
    ['rawOriginal', message?.rawOriginal],
    ['rawSource', message?.rawSource],
    ['raw_source', message?.raw_source],
    ['raw', message?.raw],
    ['content', message?.content],
    ['text', message?.text],
  ];
  const rawOriginalText = String(message?.rawOriginal ?? '');
  const displayText = String(message?.content ?? message?.text ?? '').trim();
  for (const [source, value] of candidates) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) {
      return {
        text,
        source,
        displayText,
        hasRawOriginal: Boolean(rawOriginalText.trim()),
      };
    }
  }
  return {
    text: '',
    source: '',
    displayText,
    hasRawOriginal: Boolean(rawOriginalText.trim()),
  };
};

const collapseConsecutiveDuplicateLines = (text = '') => {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let lastMeaningful = '';
  let removed = 0;
  lines.forEach((line) => {
    const normalized = compactWhitespace(line);
    if (normalized && normalized === lastMeaningful) {
      removed += 1;
      return;
    }
    output.push(line);
    lastMeaningful = normalized || '';
  });
  return {
    text: output.join('\n').trim(),
    removed,
  };
};

const limitExcessBlankLines = (text = '') => {
  const next = String(text ?? '').replace(/\n{4,}/g, '\n\n\n').trim();
  return {
    text: next,
    changed: next !== String(text ?? '').trim(),
  };
};

const buildDeterministicPatchCandidate = (text = '') => {
  const duplicate = collapseConsecutiveDuplicateLines(text);
  const blankLines = limitExcessBlankLines(duplicate.text);
  const replacementText = blankLines.text;
  const operations = [];
  if (duplicate.removed > 0) {
    operations.push({
      type: 'collapse_consecutive_duplicate_lines',
      count: duplicate.removed,
    });
  }
  if (blankLines.changed) {
    operations.push({
      type: 'limit_excess_blank_lines',
      maxBlankLines: 2,
    });
  }
  if (!operations.length || !replacementText || replacementText === String(text ?? '').trim()) return null;
  return normalizePatchCandidate({
    available: true,
    id: 'body_quality_deterministic_cleanup',
    title: '清理重复正文',
    summary: operations
      .map(operation => (operation.type === 'collapse_consecutive_duplicate_lines'
        ? `移除 ${operation.count} 行连续重复`
        : '压缩过多空行'))
      .join('；'),
    risk: 'low',
    confidence: 0.9,
    replacementText,
    preview: replacementText,
    operations,
  });
};

const detectMetaNarration = (text = '') => {
  const patterns = [
    { id: 'ai_disclaimer', pattern: /作为(?:一个)?\s*AI(?:\s*语言模型)?/i, title: 'AI 身份说明泄漏' },
    { id: 'refusal_narration', pattern: /我(?:无法|不能|不可以)(?:继续|参与|扮演|满足)/, title: '拒绝式旁白泄漏' },
    { id: 'draft_preface', pattern: /(?:以下是|下面是)(?:修改后|优化后|续写|回复)/, title: '草稿说明混入正文' },
    { id: 'reader_closing', pattern: /希望你(?:喜欢|满意)/, title: '面向读者的结尾说明' },
  ];
  return patterns
    .filter(item => item.pattern.test(text))
    .map(item => normalizeIssue({
      id: item.id,
      severity: 'warning',
      title: item.title,
      summary: '正文中出现可能脱离角色或打断剧情沉浸的说明性语句，需要用户确认是否重写或手动修正。',
      confidence: 0.78,
      risk: 'medium',
      patchable: false,
    }));
};

const buildFormatReportIssues = (formatReport = null) => {
  if (!isPlainObject(formatReport)) return [];
  const errors = list(formatReport.errors);
  const warnings = list(formatReport.warnings);
  const issues = [];
  if (errors.length) {
    issues.push(normalizeIssue({
      id: 'format_errors_present',
      severity: 'error',
      title: '格式错误未解决',
      summary: errors.slice(0, 3).join('；'),
      confidence: 0.95,
      risk: 'high',
      patchable: false,
    }));
  }
  if (warnings.length) {
    issues.push(normalizeIssue({
      id: 'format_warnings_present',
      severity: 'warning',
      title: '格式警告未解决',
      summary: warnings.slice(0, 3).join('；'),
      confidence: 0.9,
      risk: 'medium',
      patchable: false,
    }));
  }
  return issues;
};

const resolveStatus = ({ text = '', issues = [], patchCandidate = null } = {}) => {
  if (!trim(text)) return CHAT_BODY_QUALITY_STATUSES.invalid;
  if (issues.some(issue => issue.severity === 'error')) return CHAT_BODY_QUALITY_STATUSES.needsReview;
  if (patchCandidate?.available && issues.every(issue => issue.patchable || issue.risk === 'low')) {
    return CHAT_BODY_QUALITY_STATUSES.minorIssues;
  }
  if (issues.length) return CHAT_BODY_QUALITY_STATUSES.needsReview;
  return CHAT_BODY_QUALITY_STATUSES.ready;
};

const buildRecommendedActions = ({ status = '', patchCandidate = null } = {}) => {
  if (status === CHAT_BODY_QUALITY_STATUSES.ready) return [];
  if (status === CHAT_BODY_QUALITY_STATUSES.minorIssues && patchCandidate?.available) {
    return [
      {
        id: 'preview_patch',
        label: '预览优化',
        enabled: true,
        description: '查看低风险正文 patch，确认后再写回。',
      },
    ];
  }
  if (status === CHAT_BODY_QUALITY_STATUSES.invalid) {
    return [
      {
        id: 'retry_generation',
        label: '重试生成',
        enabled: true,
        description: '正文为空或不可用，建议重新生成。',
      },
    ];
  }
  return [
    {
      id: 'review_issues',
      label: '查看问题',
      enabled: true,
      description: '查看正文质量问题，再决定手动修正、右滑或重试。',
    },
    {
      id: 'retry_generation',
      label: '重试生成',
      enabled: true,
      description: '问题可能影响剧情或角色一致性时，建议生成新候选。',
    },
  ];
};

export const analyzeChatBodyQuality = ({
  message = null,
  rawAssistantText = '',
  displayText = '',
  formatReport = null,
  maxIssues = 8,
} = {}) => {
  const input = message ? resolveChatBodyQualityInputText(message) : {
    text: String(rawAssistantText ?? '').trim(),
    source: rawAssistantText ? 'rawAssistantText' : '',
    displayText: String(displayText ?? '').trim(),
    hasRawOriginal: false,
  };
  const text = trim(rawAssistantText, input.text);
  const currentDisplayText = trim(displayText, input.displayText);
  const issues = [];
  if (!text) {
    issues.push(normalizeIssue({
      id: 'empty_body',
      severity: 'error',
      title: '正文为空',
      summary: '没有可检查的 AI 回复正文。',
      confidence: 1,
      risk: 'high',
      patchable: false,
    }));
  }

  const duplicate = collapseConsecutiveDuplicateLines(text);
  if (duplicate.removed > 0) {
    issues.push(normalizeIssue({
      id: 'consecutive_duplicate_lines',
      severity: 'warning',
      title: '连续重复句段',
      summary: `发现 ${duplicate.removed} 行连续重复正文，可生成低风险清理 patch。`,
      confidence: 0.9,
      risk: 'low',
      patchable: true,
    }));
  }
  if (/\n{4,}/.test(text)) {
    issues.push(normalizeIssue({
      id: 'excess_blank_lines',
      severity: 'info',
      title: '空行过多',
      summary: '正文中存在过多连续空行，可压缩以改善阅读。',
      confidence: 0.86,
      risk: 'low',
      patchable: true,
    }));
  }
  issues.push(...detectMetaNarration(text));
  issues.push(...buildFormatReportIssues(formatReport));

  const patchCandidate = buildDeterministicPatchCandidate(text);
  const status = resolveStatus({ text, issues, patchCandidate });
  const limitedIssues = issues.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 8)));
  return {
    ok: status === CHAT_BODY_QUALITY_STATUSES.ready || status === CHAT_BODY_QUALITY_STATUSES.minorIssues,
    status,
    sourceTextKind: input.source,
    hasRawOriginal: input.hasRawOriginal === true,
    textPreview: truncate(text),
    displayPreview: truncate(currentDisplayText),
    issueCount: issues.length,
    issues: limitedIssues,
    patchCandidate,
    recommendedActions: buildRecommendedActions({ status, patchCandidate }),
  };
};
