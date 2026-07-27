export const FORMAT_PATCH_PROTOCOL_VERSION = 'format_patch.v1';
export const FORMAT_PATCH_MAX_PATCHES = 20;
export const FORMAT_PATCH_MAX_CHANGED_LINES = 200;
export const FORMAT_PATCH_MODEL_MAX_TOKENS = 6000;

const FORMAT_PATCH_ALLOWED_STATUSES = new Set([
  'no_change',
  'patch',
  'needs_format_spec',
  'cannot_repair',
]);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const truncate = (value = '', maxLength = 240) => {
  const text = String(value ?? '');
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 240));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const boundRawText = (value = '', maxLength = 12000) => {
  const text = String(value ?? '');
  const limit = Math.max(1000, Math.trunc(Number(maxLength) || 12000));
  return {
    text: text.length > limit ? text.slice(0, limit) : text,
    truncated: text.length > limit,
  };
};

const parseSourceLines = (value = '') => {
  const source = String(value ?? '');
  const lines = [];
  let lineStart = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char !== '\r' && char !== '\n') {
      cursor += 1;
      continue;
    }
    const eol = char === '\r' && source[cursor + 1] === '\n' ? '\r\n' : char;
    lines.push({
      text: source.slice(lineStart, cursor),
      start: lineStart,
      contentEnd: cursor,
      end: cursor + eol.length,
      eol,
    });
    cursor += eol.length;
    lineStart = cursor;
  }
  lines.push({
    text: source.slice(lineStart),
    start: lineStart,
    contentEnd: source.length,
    end: source.length,
    eol: '',
  });
  return lines;
};

export const countFormatPatchSourceLines = value => parseSourceLines(value).length;

const createValidationError = (code, message, patchIndex = null) => ({
  code,
  message,
  ...(Number.isInteger(patchIndex) ? { patchIndex } : {}),
});

const normalizeIssue = (issue = {}) => {
  if (typeof issue === 'string') {
    return {
      severity: 'warning',
      type: 'other',
      message: trim(issue),
      evidence: '',
    };
  }
  if (!isPlainObject(issue)) return null;
  return {
    severity: trim(issue.severity).toLowerCase() === 'error' ? 'error' : 'warning',
    type: trim(issue.type, 'other'),
    message: trim(issue.message || issue.summary || issue.title),
    evidence: truncate(issue.evidence || issue.fragment || issue.text, 160),
  };
};

const hasSourceTruncationIssue = issues => (
  (Array.isArray(issues) ? issues : [])
    .some(issue => trim(issue?.type).toLowerCase() === 'truncated_response')
);

const normalizePatch = (patch, patchIndex, errors) => {
  if (!isPlainObject(patch)) {
    errors.push(createValidationError('invalid_patch', 'linePatches 中包含非对象项目', patchIndex));
    return null;
  }
  const startLine = Number(patch.startLine);
  const endLine = Number(patch.endLine);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    errors.push(createValidationError('invalid_line_range', '补丁行号必须是有效的 1-based 闭区间', patchIndex));
    return null;
  }
  if (!Array.isArray(patch.originalLines)) {
    errors.push(createValidationError('original_lines_required', '每个补丁都必须提供 originalLines', patchIndex));
    return null;
  }
  if (!Array.isArray(patch.replacementLines)) {
    errors.push(createValidationError('replacement_lines_required', '每个补丁都必须提供 replacementLines', patchIndex));
    return null;
  }
  const originalLines = patch.originalLines.map(line => String(line ?? ''));
  const replacementLines = patch.replacementLines.map(line => String(line ?? ''));
  if (originalLines.length !== endLine - startLine + 1) {
    errors.push(createValidationError(
      'original_lines_length_mismatch',
      'originalLines 数量必须与 startLine/endLine 范围一致',
      patchIndex,
    ));
  }
  if ([...originalLines, ...replacementLines].some(line => /[\r\n]/.test(line))) {
    errors.push(createValidationError(
      'embedded_newline',
      'originalLines/replacementLines 的单项中不得包含换行符',
      patchIndex,
    ));
  }
  return {
    startLine,
    endLine,
    originalLines,
    replacementLines,
    reason: trim(patch.reason || patch.summary),
    patchIndex,
    originalMatches: null,
  };
};

const resolvePatchNewline = (sourceLines, startIndex, endIndex) => {
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (sourceLines[index]?.eol) return sourceLines[index].eol;
  }
  const firstWithEol = sourceLines.find(line => line.eol);
  return firstWithEol?.eol || '\n';
};

const applyNormalizedPatches = (originalText, sourceLines, patches) => {
  let candidateText = String(originalText ?? '');
  const descending = [...patches].sort((left, right) => (
    right.startLine - left.startLine || right.endLine - left.endLine
  ));
  descending.forEach((patch) => {
    const startIndex = patch.startLine - 1;
    const endIndex = patch.endLine - 1;
    const start = sourceLines[startIndex];
    const end = sourceLines[endIndex];
    let sliceStart = start.start;
    let sliceEnd = end.contentEnd;
    let replacement = patch.replacementLines.join(resolvePatchNewline(sourceLines, startIndex, endIndex));
    if (!patch.replacementLines.length) {
      replacement = '';
      if (end.eol) {
        sliceEnd = end.end;
      } else if (startIndex > 0) {
        sliceStart = sourceLines[startIndex - 1].contentEnd;
      }
    }
    candidateText = `${candidateText.slice(0, sliceStart)}${replacement}${candidateText.slice(sliceEnd)}`;
  });
  return candidateText;
};

export const applyValidatedFormatLinePatches = (
  originalText = '',
  patches = [],
  {
    maxPatches = FORMAT_PATCH_MAX_PATCHES,
    maxChangedLines = FORMAT_PATCH_MAX_CHANGED_LINES,
  } = {},
) => {
  const errors = [];
  const rawPatches = Array.isArray(patches) ? patches : [];
  const patchLimit = Math.max(1, Math.trunc(Number(maxPatches) || FORMAT_PATCH_MAX_PATCHES));
  const changedLineLimit = Math.max(
    1,
    Math.trunc(Number(maxChangedLines) || FORMAT_PATCH_MAX_CHANGED_LINES),
  );
  if (!Array.isArray(patches)) {
    errors.push(createValidationError('line_patches_required', 'linePatches 必须是数组'));
  }
  if (rawPatches.length > patchLimit) {
    errors.push(createValidationError(
      'too_many_patches',
      `补丁数量超过上限（${patchLimit}）`,
    ));
  }
  const normalized = rawPatches
    .map((patch, index) => normalizePatch(patch, index, errors))
    .filter(Boolean);
  const changedLineCount = normalized.reduce(
    (total, patch) => total + (patch.endLine - patch.startLine + 1) + patch.replacementLines.length,
    0,
  );
  if (changedLineCount > changedLineLimit) {
    errors.push(createValidationError(
      'too_many_changed_lines',
      `总变更行数超过上限（${changedLineLimit}）`,
    ));
  }

  const sourceLines = parseSourceLines(originalText);
  normalized.forEach((patch) => {
    if (patch.endLine > sourceLines.length) {
      errors.push(createValidationError('line_out_of_range', '补丁行号超出原文范围', patch.patchIndex));
      patch.originalMatches = false;
      return;
    }
    const currentLines = sourceLines
      .slice(patch.startLine - 1, patch.endLine)
      .map(line => line.text);
    patch.originalMatches = currentLines.length === patch.originalLines.length &&
      currentLines.every((line, index) => line === patch.originalLines[index]);
    if (!patch.originalMatches) {
      errors.push(createValidationError(
        'original_lines_mismatch',
        'originalLines 与原文快照不一致',
        patch.patchIndex,
      ));
    }
  });

  const ascending = [...normalized].sort((left, right) => (
    left.startLine - right.startLine || left.endLine - right.endLine
  ));
  for (let index = 1; index < ascending.length; index += 1) {
    if (ascending[index].startLine <= ascending[index - 1].endLine) {
      errors.push(createValidationError(
        'overlapping_patches',
        '多个补丁的原始行范围不得重叠',
        ascending[index].patchIndex,
      ));
      break;
    }
  }

  const linePatches = normalized
    .sort((left, right) => left.patchIndex - right.patchIndex)
    .map(({ patchIndex: _patchIndex, ...patch }) => patch);
  if (errors.length) {
    return {
      ok: false,
      candidateText: '',
      linePatches,
      changedLineCount,
      validationErrors: errors,
    };
  }
  const candidateText = applyNormalizedPatches(originalText, sourceLines, normalized);
  if (candidateText === String(originalText ?? '')) {
    return {
      ok: false,
      candidateText: '',
      linePatches,
      changedLineCount,
      validationErrors: [createValidationError('no_effect_patch', '补丁没有改变原文')],
    };
  }
  return {
    ok: true,
    candidateText,
    linePatches,
    changedLineCount,
    validationErrors: [],
  };
};

const parseStrictJsonObject = (raw) => {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const source = raw.trim();
  if (!source || !source.startsWith('{') || !source.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(source);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const buildInvalidResult = ({
  sourceText = '',
  boundedRaw = null,
  issues = [],
  validationErrors = [],
  baseRevision = '',
} = {}) => ({
  ok: false,
  protocolVersion: FORMAT_PATCH_PROTOCOL_VERSION,
  status: 'invalid_output',
  baseRevision: trim(baseRevision),
  issues: issues.length
    ? issues
    : [{
      severity: 'error',
      type: 'invalid_output',
      message: validationErrors[0]?.message || '模型输出不符合格式补丁协议',
      evidence: truncate(sourceText, 160),
    }],
  canRepair: false,
  repairSummary: '',
  candidateText: '',
  linePatches: [],
  validationErrors,
  sourceTruncationSuspected: false,
  rawPreview: truncate(sourceText, 240),
  rawText: boundedRaw?.text ?? boundRawText(sourceText).text,
  rawTextTruncated: boundedRaw?.truncated ?? boundRawText(sourceText).truncated,
});

export const normalizeFormatPatchModelResult = (
  raw = '',
  {
    originalText = '',
    baseRevision = '',
    maxPatches = FORMAT_PATCH_MAX_PATCHES,
    maxChangedLines = FORMAT_PATCH_MAX_CHANGED_LINES,
  } = {},
) => {
  const sourceText = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  const boundedRaw = boundRawText(sourceText);
  const parsed = parseStrictJsonObject(raw);
  if (!parsed) {
    return buildInvalidResult({
      sourceText,
      boundedRaw,
      baseRevision,
      validationErrors: [createValidationError('invalid_json', '模型未返回单一、可解析的 JSON 对象')],
      issues: [{
        severity: 'error',
        type: 'parse_error',
        message: '模型未返回单一、可解析的 JSON 对象',
        evidence: truncate(sourceText, 160),
      }],
    });
  }

  const validationErrors = [];
  if (
    Object.prototype.hasOwnProperty.call(parsed, 'correctedText') ||
    Object.prototype.hasOwnProperty.call(parsed, 'corrected_text')
  ) {
    validationErrors.push(createValidationError(
      'corrected_text_forbidden',
      'format_patch.v1 禁止返回 correctedText，只能返回 linePatches',
    ));
  }
  if (trim(parsed.protocolVersion) !== FORMAT_PATCH_PROTOCOL_VERSION) {
    validationErrors.push(createValidationError(
      'protocol_version_mismatch',
      `protocolVersion 必须是 ${FORMAT_PATCH_PROTOCOL_VERSION}`,
    ));
  }
  const returnedRevision = trim(parsed.baseRevision);
  const expectedRevision = trim(baseRevision);
  if (!returnedRevision) {
    validationErrors.push(createValidationError('revision_required', 'baseRevision 不能为空'));
  } else if (!expectedRevision || returnedRevision !== expectedRevision) {
    validationErrors.push(createValidationError('revision_mismatch', 'baseRevision 与本次运行不一致'));
  }
  const status = trim(parsed.status).toLowerCase();
  if (!FORMAT_PATCH_ALLOWED_STATUSES.has(status)) {
    validationErrors.push(createValidationError('invalid_status', 'status 不在 format_patch.v1 允许范围内'));
  }
  const rawPatches = parsed.linePatches;
  if (!Array.isArray(rawPatches)) {
    validationErrors.push(createValidationError('line_patches_required', 'linePatches 必须是数组'));
  } else if (status === 'patch' && rawPatches.length === 0) {
    validationErrors.push(createValidationError('patches_required', 'status=patch 时至少需要一个补丁'));
  } else if (status !== 'patch' && rawPatches.length > 0) {
    validationErrors.push(createValidationError(
      'patches_not_allowed',
      `status=${status || 'unknown'} 时 linePatches 必须为空`,
    ));
  }

  let patchResult = {
    ok: status !== 'patch',
    candidateText: '',
    linePatches: [],
    changedLineCount: 0,
    validationErrors: [],
  };
  if (status === 'patch' && Array.isArray(rawPatches) && rawPatches.length) {
    patchResult = applyValidatedFormatLinePatches(originalText, rawPatches, {
      maxPatches,
      maxChangedLines,
    });
    validationErrors.push(...patchResult.validationErrors);
  }
  if (validationErrors.length) {
    return buildInvalidResult({
      sourceText,
      boundedRaw,
      baseRevision: returnedRevision || expectedRevision,
      validationErrors,
    });
  }

  const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
    .map(normalizeIssue)
    .filter(issue => issue?.message)
    .slice(0, 12);
  return {
    ok: true,
    protocolVersion: FORMAT_PATCH_PROTOCOL_VERSION,
    status,
    baseRevision: returnedRevision,
    issues,
    canRepair: status === 'patch' && patchResult.ok,
    repairSummary: trim(parsed.repairSummary),
    candidateText: status === 'patch' ? patchResult.candidateText : '',
    linePatches: status === 'patch' ? patchResult.linePatches : [],
    changedLineCount: patchResult.changedLineCount,
    validationErrors: [],
    sourceTruncationSuspected: hasSourceTruncationIssue(issues),
    rawPreview: truncate(sourceText, 240),
    rawText: boundedRaw.text,
    rawTextTruncated: boundedRaw.truncated,
  };
};

export const validateFormatPatchRevision = ({
  snapshotText = '',
  currentText = '',
} = {}) => (
  String(snapshotText ?? '') === String(currentText ?? '')
    ? { ok: true, reason: '' }
    : { ok: false, reason: 'revision_expired' }
);

export const createFormatPatchRevisionToken = ({
  now = Date.now,
  random = Math.random,
} = {}) => {
  const at = typeof now === 'function' ? Number(now()) : Number(now);
  const randomValue = typeof random === 'function' ? Number(random()) : Number(random);
  const timePart = Math.max(0, Number.isFinite(at) ? Math.trunc(at) : Date.now()).toString(36);
  const randomPart = Math.max(0, Number.isFinite(randomValue) ? randomValue : Math.random())
    .toString(36)
    .replace(/^0\./, '')
    .padEnd(12, '0')
    .slice(0, 12);
  return `format-run:${timePart}:${randomPart}`;
};
