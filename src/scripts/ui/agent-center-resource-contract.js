const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const countPendingBy = (pending = [], predicate = () => false) => (
  (Array.isArray(pending) ? pending : []).filter(item => {
    try {
      return predicate(item);
    } catch {
      return false;
    }
  }).length
);

const RESOURCE_DEFINITIONS = Object.freeze([
  {
    id: 'prompt_library',
    group: '提示词',
    title: 'Prompt Library',
    summary: '统一管理私聊、群聊、动态、生图、摘要和记忆写表提示词。',
    detail: '第一层只看分类和状态，编辑进入二级详情；仍沿用旧预设字段保存，不改变注入行为。',
    target: { panel: 'presetPanel', section: 'chatprompts', focus: 'prompt-library' },
    actionLabel: '打开提示词库',
    chips: ['统一入口', '二级详情', '旧字段保存'],
  },
  {
    id: 'memory_center',
    group: '记忆',
    title: 'Memory Center',
    summary: '查看记忆表格、全局记忆、默认模板、数据导入导出和写表提示词。',
    detail: '复杂表格和模板操作进入记忆管理主界面，不在 Agent Center 复制编辑器。',
    target: { panel: 'memoryTemplatePanel', focus: 'overview' },
    actionLabel: '打开记忆管理',
    chips: ['表格管理', '模板', '数据导入导出'],
  },
  {
    id: 'worldbook',
    group: '资源',
    title: '世界书',
    summary: '管理当前会话和全局世界书资源，查看 Agent 生成的世界书变更预览。',
    detail: '世界书编辑继续使用世界书主界面；Agent Center 只显示状态和待确认入口。',
    target: { panel: 'worldPanel', scope: 'session' },
    actionLabel: '打开世界书',
    chips: ['当前会话', '全局库', '写入预览'],
  },
  {
    id: 'variables',
    group: '资源',
    title: '变量',
    summary: '管理当前会话变量和全局变量，查看变量写入预览。',
    detail: '变量编辑进入变量主界面；待确认变更仍在 Agent Center 待处理页提交或撤销。',
    target: { panel: 'variablePanel' },
    actionLabel: '打开变量',
    chips: ['会话变量', '全局变量', '写入预览'],
  },
  {
    id: 'contact_profiles',
    group: '画像',
    title: '联系人画像',
    summary: '查看联系人画像保存候选和联系人相关资源入口。',
    detail: '画像候选在待处理页确认；联系人资源管理进入联系人设置主界面。',
    target: { panel: 'contactSettingsPanel' },
    actionLabel: '打开联系人设置',
    chips: ['画像候选', '联系人资源'],
  },
  {
    id: 'image_templates',
    group: '生图',
    title: '生图模板',
    summary: '管理图片模型、默认参数和自动标签生图相关配置。',
    detail: '图片参数继续在配置面板的图片页统一维护；提示词内容从 Prompt Library 进入。',
    target: { panel: 'configPanel', tab: 'image' },
    actionLabel: '打开图片配置',
    chips: ['图片模型', '默认参数', '自动标签'],
  },
  {
    id: 'regex_postprocess',
    group: '后处理',
    title: '正则/后处理',
    summary: '管理输入、输出、推理、局部会话等正则后处理规则。',
    detail: '复杂规则继续进入正则主界面或会话正则界面，避免在多个位置重复编辑。',
    target: { panel: 'regexPanel' },
    actionLabel: '打开正则管理',
    chips: ['输入', '输出', '推理'],
  },
]);

const mergeResourceOverride = (resource = {}, override = {}) => {
  const src = override && typeof override === 'object' ? override : {};
  const status = trim(src.status || resource.status, '就绪');
  const count = Number.isFinite(Number(src.count)) ? Number(src.count) : Number(resource.count || 0);
  const chips = Array.from(new Set([
    ...list(resource.chips),
    ...list(src.chips),
  ]));
  return {
    ...resource,
    ...src,
    id: resource.id,
    title: trim(src.title || resource.title, resource.id),
    group: trim(src.group || resource.group),
    summary: trim(src.summary || resource.summary),
    detail: trim(src.detail || resource.detail),
    status,
    count,
    chips,
    target: {
      ...(resource.target || {}),
      ...(src.target || {}),
    },
    actionLabel: trim(src.actionLabel || resource.actionLabel, '打开'),
  };
};

export const buildAgentCenterResources = ({
  pending = [],
  tools = [],
  agents = [],
  safety = {},
  resourceStatus = {},
} = {}) => {
  const writePreviewPending = countPendingBy(pending, item => item?.writePreview);
  const memoryPreviewPending = countPendingBy(pending, item => item?.toolName === 'memory.preview_actions');
  const variablePreviewPending = countPendingBy(pending, item => item?.toolName === 'variable.preview_commands');
  const worldbookPreviewPending = countPendingBy(pending, item => item?.toolName === 'worldbook.preview_actions');
  const profilePending = countPendingBy(pending, item => item?.kind === 'contact_profile_update');
  const writePreviewEnabled = safety?.sessionGate?.writePreviewTools?.enabled === true;
  const toolCount = Array.isArray(tools) ? tools.length : 0;
  const enabledAgentCount = (Array.isArray(agents) ? agents : []).filter(agent => agent?.enabled).length;

  const computed = {
    prompt_library: {
      status: '统一入口',
      count: 0,
      chips: ['提示词 12 项', `Agent ${enabledAgentCount} 个启用`],
    },
    memory_center: {
      status: memoryPreviewPending ? `${memoryPreviewPending} 个待确认` : '就绪',
      count: memoryPreviewPending,
      chips: [
        writePreviewEnabled ? '预览工具已加入' : '预览工具未加入',
        writePreviewPending ? `写入预览 ${writePreviewPending}` : '',
      ],
    },
    worldbook: {
      status: worldbookPreviewPending ? `${worldbookPreviewPending} 个待确认` : '就绪',
      count: worldbookPreviewPending,
    },
    variables: {
      status: variablePreviewPending ? `${variablePreviewPending} 个待确认` : '就绪',
      count: variablePreviewPending,
    },
    contact_profiles: {
      status: profilePending ? `${profilePending} 个候选` : '就绪',
      count: profilePending,
    },
    image_templates: {
      status: '统一配置',
      count: 0,
      chips: toolCount ? [`Agent 工具 ${toolCount}`] : [],
    },
    regex_postprocess: {
      status: '统一配置',
      count: 0,
    },
  };

  return RESOURCE_DEFINITIONS.map(definition => mergeResourceOverride(
    mergeResourceOverride(definition, computed[definition.id]),
    resourceStatus?.[definition.id],
  ));
};

export const findAgentCenterResource = (resources = [], resourceId = '') => {
  const id = trim(resourceId);
  return (Array.isArray(resources) ? resources : []).find(resource => resource?.id === id) || null;
};
