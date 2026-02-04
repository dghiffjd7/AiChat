const ensureRuleId = (rule, fallback) => {
  const id = String(rule?.id || '').trim();
  return id || fallback;
};

export const VARIABLE_TEMPLATES = [
  {
    id: 'affection_basic',
    name: '基础好感度',
    desc: '0-100 进度条，自动评估变化',
    variables: [
      {
        id: '好感度',
        name: '好感度',
        default: 50,
        schema: {
          type: 'number',
          range: { min: 0, max: 100 },
          ui: { display: 'progress', color: '#f97316', format: '{value}/100', label: '好感度', icon: '❤️' },
        },
      },
    ],
    rules: [
      {
        id: 'affection_auto',
        name: '好感度自动评估',
        enabled: true,
        priority: 0,
        trigger: { type: 'every_turn' },
        action: {
          type: 'ai_evaluate',
          target: '好感度',
          mode: 'delta',
          prompt: '根据本轮对话判断好感度变化（-5~+5 之间的整数，只输出数字）。',
        },
      },
    ],
  },
  {
    id: 'relationship_stages',
    name: '关系阶段',
    desc: '枚举展示关系阶段',
    variables: [
      {
        id: '关系阶段',
        name: '关系阶段',
        default: '陌生',
        schema: {
          type: 'enum',
          options: ['陌生', '熟悉', '朋友', '亲密', '恋人'],
          ui: { display: 'badge', color: '#16a34a', label: '关系阶段' },
        },
      },
    ],
  },
  {
    id: 'story_branch',
    name: '剧情阶段',
    desc: '剧情推进的阶段枚举',
    variables: [
      {
        id: '剧情阶段',
        name: '剧情阶段',
        default: '开端',
        schema: {
          type: 'enum',
          options: ['开端', '发展', '高潮', '结局'],
          ui: { display: 'badge', color: '#0ea5e9', label: '剧情阶段' },
        },
      },
    ],
  },
  {
    id: 'game_stats',
    name: '基础属性',
    desc: '生命/体力/金币等数值',
    variables: [
      {
        id: '生命',
        name: '生命',
        default: 100,
        schema: {
          type: 'number',
          range: { min: 0, max: 100 },
          ui: { display: 'progress', color: '#ef4444', format: '{value}/100', label: '生命' },
        },
      },
      {
        id: '体力',
        name: '体力',
        default: 100,
        schema: {
          type: 'number',
          range: { min: 0, max: 100 },
          ui: { display: 'progress', color: '#f59e0b', format: '{value}/100', label: '体力' },
        },
      },
      {
        id: '金币',
        name: '金币',
        default: 0,
        schema: {
          type: 'number',
          range: { min: 0, max: 999999 },
          ui: { display: 'card', color: '#eab308', format: '{value}', label: '金币' },
        },
      },
    ],
  },
];

export const listVariableTemplates = () => VARIABLE_TEMPLATES.slice();

export const applyTemplate = (chatStore, sessionId, templateId, { overwrite = true } = {}) => {
  if (!chatStore || !sessionId) return { ok: false, reason: 'missing_context' };
  const tpl = VARIABLE_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return { ok: false, reason: 'missing_template' };
  const sid = String(sessionId || '').trim();
  if (!sid) return { ok: false, reason: 'missing_session' };

  const existing = chatStore.listVariables?.(sid) || {};
  const schemas = chatStore.listVariableSchemas?.(sid) || {};

  const varsApplied = [];
  const varsSkipped = [];
  (tpl.variables || []).forEach((v) => {
    const key = String(v?.id || v?.name || '').trim();
    if (!key) return;
    const hasVar = Object.prototype.hasOwnProperty.call(existing, key) || Object.prototype.hasOwnProperty.call(schemas, key);
    if (hasVar && !overwrite) {
      varsSkipped.push(key);
      return;
    }
    const schema = v?.schema || {};
    chatStore.setVariableSchema?.(key, schema, sid);
    if (Object.prototype.hasOwnProperty.call(v, 'default')) {
      chatStore.setVariable?.(key, v.default, sid);
    }
    varsApplied.push(key);
  });

  if (Array.isArray(tpl.rules) && tpl.rules.length) {
    const currentRules = chatStore.listVariableRules?.(sid) || [];
    const mapped = tpl.rules.map((rule, idx) => {
      const base = { ...rule };
      base.id = ensureRuleId(base, `tpl_${tpl.id}_${idx + 1}_${Date.now()}`);
      return base;
    });
    chatStore.setVariableRules?.([...currentRules, ...mapped], sid);
  }

  return { ok: true, applied: varsApplied, skipped: varsSkipped };
};
