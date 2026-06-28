const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeToken = value => trim(value)
  .toLowerCase()
  .replace(/\s+/g, '');

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

export const APP_FEATURE_DEFINITIONS = Object.freeze([
  {
    id: 'session.create',
    title: '创建聊天室',
    aliases: ['创建聊天室', '新建聊天室', '添加好友', '创建联系人', '新建联系人', '开一个聊天室'],
    summary: '创建一个私聊联系人和对应聊天室。',
    uiPath: ['顶部 +', '好友列表', '输入新好友名称', '添加'],
    tools: ['session.create'],
    panel: 'session',
    riskLevel: 'low',
    writes: true,
    confirmation: 'none_for_create',
    firstRunGuide: 'session.create.guide',
    directAction: 'session.create',
  },
  {
    id: 'session.open',
    title: '打开聊天室',
    aliases: ['打开聊天室', '进入聊天室', '切换聊天室', '打开会话', '切换会话'],
    summary: '切换到指定联系人或群组的聊天室。',
    uiPath: ['聊天列表', '点击联系人或群组'],
    tools: ['session.open'],
    panel: 'chat',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'session.open.guide',
    directAction: 'session.open',
  },
  {
    id: 'session.config.open',
    title: '打开会话配置',
    aliases: ['会话配置', '聊天室配置', '当前会话配置', '打开会话配置', '配置聊天室'],
    summary: '打开当前聊天室或指定聊天室的会话配置面板。',
    uiPath: ['聊天室右上角菜单', '会话配置'],
    tools: ['session.open_config'],
    panel: 'session-config',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'session.config.open.guide',
    directAction: 'session.open_config',
  },
  {
    id: 'config.api.open',
    title: '打开 API 配置',
    aliases: ['设置API', '配置API', '模型配置', '供应商配置', 'key设置', 'api key'],
    summary: '打开聊天模型和 API 配置界面。',
    uiPath: ['设置', 'API / 模型配置'],
    tools: ['app.open_panel'],
    panel: 'config',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'config.api.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'agent.center.open',
    title: '打开 Agent Center',
    aliases: ['agent center', 'agent中心', '智能体中心', '打开agent', '助手设置'],
    summary: '打开 Agent 能力、待处理、资源和安全中心。',
    uiPath: ['设置', 'Agent Center'],
    tools: ['app.open_panel'],
    panel: 'agent-center',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'agent.center.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'worldbook.open',
    title: '打开世界书',
    aliases: ['世界书', '打开世界书', '世界信息', 'worldbook', '世界设定'],
    summary: '打开当前会话世界书管理界面。',
    uiPath: ['聊天室右上角菜单', '世界书'],
    tools: ['app.open_panel'],
    panel: 'worldbook',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'worldbook.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'memory.open',
    title: '打开记忆',
    aliases: ['记忆', '记忆表格', '打开记忆', 'memory', '记忆管理'],
    summary: '打开记忆表格和模板管理界面。',
    uiPath: ['设置', '记忆'],
    tools: ['app.open_panel'],
    panel: 'memory',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'memory.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'variables.open',
    title: '打开变量',
    aliases: ['变量', '打开变量', '变量面板', 'mvu变量', '状态变量'],
    summary: '打开当前会话变量和全局变量界面。',
    uiPath: ['聊天室右上角菜单', '变量'],
    tools: ['app.open_panel'],
    panel: 'variables',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'variables.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'regex.open',
    title: '打开正则',
    aliases: ['正则', '正则规则', '后处理', 'regex', '打开正则'],
    summary: '打开正则和后处理规则管理界面。',
    uiPath: ['设置', '正则 / 后处理'],
    tools: ['app.open_panel'],
    panel: 'regex',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'regex.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'app.state.read',
    title: '查看当前 APP 状态',
    aliases: ['当前状态', '当前会话状态', '用了哪些资源', '当前资源', '状态摘要'],
    summary: '读取当前页面、UI 模式、会话和可见状态摘要。',
    uiPath: [],
    tools: ['app.get_current_state'],
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'app.get_current_state',
  },
]);

const scoreFeature = (feature = {}, query = '') => {
  const q = normalizeToken(query);
  if (!q) return 0;
  const id = normalizeToken(feature.id);
  const title = normalizeToken(feature.title);
  const aliases = list(feature.aliases).map(normalizeToken);
  if (id === q || title === q || aliases.includes(q)) return 100;
  if (id.includes(q) || title.includes(q)) return 80;
  if (aliases.some(alias => alias.includes(q) || q.includes(alias))) return 70;
  const haystack = normalizeToken([
    feature.id,
    feature.title,
    feature.summary,
    ...list(feature.aliases),
    ...list(feature.uiPath),
  ].join(' '));
  if (haystack.includes(q)) return 45;
  return 0;
};

const searchFeatureList = (features = APP_FEATURE_DEFINITIONS, query = '', { limit = 5 } = {}) => {
  const max = Math.max(1, Math.min(20, Math.trunc(Number(limit) || 5)));
  return (Array.isArray(features) ? features : [])
    .map(feature => ({ feature, score: scoreFeature(feature, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || trim(a.feature?.id).localeCompare(trim(b.feature?.id)))
    .slice(0, max)
    .map(item => ({ ...clone(item.feature), score: item.score }));
};

export const listAppFeatures = () => APP_FEATURE_DEFINITIONS.map(clone);

export const findAppFeature = (featureId = '') => {
  const id = trim(featureId);
  if (!id) return null;
  const normalized = normalizeToken(id);
  const found = APP_FEATURE_DEFINITIONS.find(feature =>
    feature.id === id ||
    normalizeToken(feature.id) === normalized ||
    normalizeToken(feature.title) === normalized ||
    list(feature.aliases).some(alias => normalizeToken(alias) === normalized)
  );
  return found ? clone(found) : null;
};

export const searchAppFeatures = (query = '', { limit = 5 } = {}) => {
  return searchFeatureList(APP_FEATURE_DEFINITIONS, query, { limit });
};

export const buildAppFeatureDoc = (featureId = '') => {
  const feature = findAppFeature(featureId);
  if (!feature) return null;
  return {
    ...feature,
    doc: [
      feature.summary,
      feature.uiPath?.length ? `界面路径：${feature.uiPath.join(' -> ')}` : '',
      feature.tools?.length ? `可用工具：${feature.tools.join(', ')}` : '',
      `风险等级：${feature.riskLevel || 'low'}`,
      feature.writes ? '会写入 APP 数据。' : '只读或只打开界面。',
      feature.confirmation && feature.confirmation !== 'none' ? `确认策略：${feature.confirmation}` : '',
    ].filter(Boolean).join('\n'),
  };
};

export const buildAppFeatureKnowledgeText = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `${trim(feature.title, feature.id)} (${trim(feature.id)})`,
      trim(feature.summary),
      list(feature.uiPath).length ? `路径：${list(feature.uiPath).join(' -> ')}` : '',
      list(feature.tools).length ? `工具：${list(feature.tools).join(', ')}` : '',
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n')
);

export const buildAppFeatureSearchContextText = (query = '', {
  features = listAppFeatures(),
  limit = 5,
} = {}) => {
  const text = trim(query);
  const matches = searchFeatureList(features, text, { limit });
  return [
    `检索：${text ? '已执行' : '未执行'}`,
    `命中：${matches.length ? matches.map(item => item.title || item.id).join('、') : '无'}`,
    ...matches.map(feature => [
      `${trim(feature.title, feature.id)} (${trim(feature.id)})`,
      trim(feature.summary),
      list(feature.uiPath).length ? `路径：${list(feature.uiPath).join(' -> ')}` : '',
      list(feature.tools).length ? `工具：${list(feature.tools).join(', ')}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n');
};
