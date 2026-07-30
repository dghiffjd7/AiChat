const trim = (value, maxLength = 1000) => String(value ?? '').trim().slice(0, maxLength);

const normalizeKey = value => trim(value)
  .toLocaleLowerCase()
  .replace(/[\s\p{P}\p{S}_]+/gu, '');

const unique = value => Array.from(new Set(
  (Array.isArray(value) ? value : [value])
    .map(item => trim(item, 240))
    .filter(Boolean),
));

const clone = value => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const stableId = value => {
  const source = trim(value, 1000);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `visual-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const parseAspectRatio = value => {
  const text = trim(value, 40).toLowerCase();
  const ratioMatch = text.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/u);
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (width > 0 && height > 0) {
      return { text: `${ratioMatch[1]}:${ratioMatch[2]}`, ratio: width / height };
    }
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0
    ? { text, ratio: numeric }
    : null;
};

const normalizeStoredSpec = (spec = {}) => {
  const subject = trim(spec?.subject, 160);
  if (!subject) return null;
  return {
    id: trim(spec?.id, 80) || stableId(subject),
    subject,
    subjectAliases: unique(spec?.subjectAliases).slice(0, 12),
    appearance: trim(spec?.appearance, 360),
    outfit: trim(spec?.outfit, 360),
    style: trim(spec?.style, 360),
  };
};

export const MAID_VISUAL_SPEC_VERSION = 'maid-visual-spec-v1';

export const normalizeMaidVisualSpecLedger = (ledger = {}) => {
  const sourceSpecs = ledger?.specs && typeof ledger.specs === 'object' && !Array.isArray(ledger.specs)
    ? ledger.specs
    : {};
  const specs = {};
  Object.entries(sourceSpecs).slice(-8).forEach(([key, value]) => {
    const normalized = normalizeStoredSpec(value);
    if (normalized) specs[trim(key, 240) || normalizeKey(normalized.subject)] = normalized;
  });
  return {
    version: MAID_VISUAL_SPEC_VERSION,
    specs,
  };
};

export const createMaidVisualSpecLedger = (initial = null) => (
  normalizeMaidVisualSpecLedger(initial || {})
);

const resolveLedgerSpec = (ledger, subject) => {
  const key = normalizeKey(subject);
  return { key, spec: ledger?.specs?.[key] || null };
};

export const freezeMaidVisualSpec = ({
  ledger = null,
  args = {},
} = {}) => {
  const subject = trim(args?.subject, 160);
  const target = trim(args?.target, 240);
  const purpose = trim(args?.purpose, 40).toLowerCase();
  const appearance = trim(args?.appearance, 360);
  const outfit = trim(args?.outfit, 360);
  const style = trim(args?.style, 360);
  const targetAspect = parseAspectRatio(args?.targetAspectRatio);
  const subjectAliases = unique(args?.subjectAliases).slice(0, 12);
  const missing = [
    ['subject', subject],
    ['target', target],
    ['purpose', purpose],
    ['appearance', appearance],
    ['outfit', outfit],
    ['style', style],
    ['targetAspectRatio', targetAspect?.text],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length || !['avatar', 'wallpaper'].includes(purpose)) {
    return {
      ok: false,
      reason: 'visual_spec_incomplete',
      message: `生图前需要完整视觉规格；缺少或无效字段：${missing.concat(['avatar', 'wallpaper'].includes(purpose) ? [] : ['purpose']).join('、')}`,
      missingFields: missing,
    };
  }
  const prompt = trim(args?.prompt, 4000);
  const subjectTerms = unique([subject, ...subjectAliases]);
  const normalizedPrompt = normalizeKey(prompt);
  if (!subjectTerms.some(term => {
    const normalized = normalizeKey(term);
    return normalized.length >= 2 && normalizedPrompt.includes(normalized);
  })) {
    return {
      ok: false,
      reason: 'visual_subject_not_in_prompt',
      message: '生图提示词没有包含冻结主体或其别名，无法确认生成对象。',
      subject,
      subjectAliases,
    };
  }
  const targetLedger = ledger && typeof ledger === 'object'
    ? ledger
    : createMaidVisualSpecLedger();
  if (!targetLedger.specs || typeof targetLedger.specs !== 'object' || Array.isArray(targetLedger.specs)) {
    targetLedger.specs = {};
  }
  targetLedger.version = MAID_VISUAL_SPEC_VERSION;
  const { key, spec: existing } = resolveLedgerSpec(targetLedger, subject);
  const nextBase = {
    id: existing?.id || stableId(subject),
    subject,
    subjectAliases: unique([...(existing?.subjectAliases || []), ...subjectAliases]).slice(0, 12),
    appearance,
    outfit,
    style,
  };
  if (existing) {
    const conflictingFields = ['appearance', 'outfit', 'style'].filter(field => (
      normalizeKey(existing[field]) !== normalizeKey(nextBase[field])
    ));
    if (conflictingFields.length) {
      return {
        ok: false,
        reason: 'visual_spec_conflict',
        message: `主体「${subject}」的 ${conflictingFields.join('、')} 与本任务已冻结规格冲突。`,
        conflictingFields,
        frozenSpec: clone(existing),
      };
    }
  } else {
    targetLedger.specs[key] = nextBase;
  }
  const frozen = targetLedger.specs[key] || nextBase;
  if (existing) targetLedger.specs[key] = { ...existing, subjectAliases: nextBase.subjectAliases };
  return {
    ok: true,
    created: !existing,
    spec: {
      ...clone(frozen),
      target,
      purpose,
      targetAspectRatio: targetAspect.text,
      targetAspectValue: targetAspect.ratio,
    },
  };
};

export const validateMaidVisualAspect = ({
  targetAspectRatio = '',
  width = 0,
  height = 0,
  tolerance = 0.05,
} = {}) => {
  const target = parseAspectRatio(targetAspectRatio);
  const actualWidth = Math.max(0, Number(width) || 0);
  const actualHeight = Math.max(0, Number(height) || 0);
  if (!target) {
    return { ok: false, reason: 'visual_aspect_invalid', targetAspectRatio: trim(targetAspectRatio, 40) };
  }
  if (!actualWidth || !actualHeight) {
    return {
      ok: false,
      reason: 'visual_dimensions_unverified',
      targetAspectRatio: target.text,
      width: actualWidth,
      height: actualHeight,
    };
  }
  const actual = actualWidth / actualHeight;
  const allowedDelta = Math.max(0.02, target.ratio * Math.max(0.01, Number(tolerance) || 0.05));
  if (Math.abs(actual - target.ratio) > allowedDelta) {
    return {
      ok: false,
      reason: 'visual_aspect_mismatch',
      message: `当前图片比例约为 ${actualWidth}:${actualHeight}，与目标 ${target.text} 不符。`,
      targetAspectRatio: target.text,
      actualAspectRatio: Number(actual.toFixed(4)),
      width: actualWidth,
      height: actualHeight,
    };
  }
  return {
    ok: true,
    targetAspectRatio: target.text,
    actualAspectRatio: Number(actual.toFixed(4)),
    width: actualWidth,
    height: actualHeight,
  };
};

export const buildMaidVisualSpecPrompt = ({
  prompt = '',
  spec = {},
  promptDialect = '',
} = {}) => {
  const base = trim(prompt, 4000);
  const continuity = unique([spec?.appearance, spec?.outfit, spec?.style]);
  if (!continuity.length) return base;
  if (['nai_tags', 'stable_diffusion_tags'].includes(trim(promptDialect, 80).toLowerCase())) {
    return unique([base, ...continuity]).join(', ').slice(0, 4000);
  }
  return [
    base,
    `Frozen visual continuity — appearance: ${trim(spec?.appearance)}; outfit: ${trim(spec?.outfit)}; style: ${trim(spec?.style)}.`,
  ].filter(Boolean).join('\n').slice(0, 4000);
};

export const validateMaidVisualAttachmentTarget = ({
  attachment = {},
  purpose = '',
  target = null,
} = {}) => {
  if (attachment?.source !== 'generated' && !attachment?.visualSpec) return { ok: true, generated: false };
  const spec = attachment?.visualSpec;
  if (!spec || typeof spec !== 'object') {
    return { ok: false, reason: 'visual_spec_missing', message: '生成图片缺少视觉规格，不能自动写回。' };
  }
  const expectedPurpose = trim(purpose, 40).toLowerCase();
  if (trim(spec?.purpose, 40).toLowerCase() !== expectedPurpose) {
    return {
      ok: false,
      reason: 'visual_purpose_mismatch',
      message: `生成图片用途是 ${trim(spec?.purpose, 40)}，不能写入 ${expectedPurpose}。`,
      visualSpec: clone(spec),
    };
  }
  if (target) {
    const expectedTarget = normalizeKey(spec?.target);
    const targetKeys = [target?.id, target?.name].map(normalizeKey).filter(Boolean);
    if (!expectedTarget || !targetKeys.includes(expectedTarget)) {
      return {
        ok: false,
        reason: 'visual_target_mismatch',
        message: `生成图片冻结目标为「${trim(spec?.target, 240)}」，不能写入「${trim(target?.name || target?.id, 240)}」。`,
        visualSpec: clone(spec),
      };
    }
  }
  const aspect = validateMaidVisualAspect({
    targetAspectRatio: spec?.targetAspectRatio,
    width: spec?.actualWidth,
    height: spec?.actualHeight,
  });
  if (!aspect.ok) return { ...aspect, visualSpec: clone(spec) };
  return {
    ok: true,
    generated: true,
    visualSpec: clone(spec),
    aspect,
  };
};

export const buildMaidVisualSpecPromptBlock = (ledger = {}) => {
  const normalized = normalizeMaidVisualSpecLedger(ledger);
  const specs = Object.values(normalized.specs);
  if (!specs.length) return '';
  return [
    `<maid_visual_specs state="frozen" version="${MAID_VISUAL_SPEC_VERSION}">`,
    '同一主体后续生图必须复用以下 appearance/outfit/style；用途与目标比例仍按本张图片明确填写。',
    JSON.stringify(specs),
    '</maid_visual_specs>',
  ].join('\n');
};
