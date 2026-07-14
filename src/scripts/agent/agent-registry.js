// Phase B：统一 Agent Registry（第一种来源 = 现有女仆 Sub-agent 配置）。
// 职责边界（见架构计划 §2）：Registry 只持有 Agent 身份/能力标签/模型引用/委派约束等「声明」投影，
// 不绕过 Tool Registry 执行工具、不保存第二份 schema 真相、不做动态统计。
// 本阶段只读：预算/委派约束是「声明但未强制」的默认值，供 Phase C 的委派排序与 Validator 使用。

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const AGENT_CAPABILITY_KIND = 'agent';

// 统一 CapabilityRef：id + version + namespace + kind 必须唯一定位执行契约（此处为 Agent 身份）。
export const buildCapabilityRef = ({
  id = '',
  version = '1',
  namespace = 'builtin',
  kind = AGENT_CAPABILITY_KIND,
  provider = 'app',
  ref = '',
} = {}) => {
  const capId = trim(id);
  return {
    id: capId,
    version: trim(version, '1'),
    namespace: trim(namespace, 'builtin'),
    kind: trim(kind, AGENT_CAPABILITY_KIND),
    provider: trim(provider, 'app'),
    ref: trim(ref) || capId,
  };
};

// 唯一定位键：跨 provider 去重与快照引用用它，不用裸 id（不同 namespace 可同 id）。
export const capabilityRefKey = (ref = {}) => {
  const r = isPlainObject(ref) ? ref : {};
  return `${trim(r.namespace, 'builtin')}:${trim(r.kind, AGENT_CAPABILITY_KIND)}:${trim(r.id)}@${trim(r.version, '1')}`;
};

const SUB_AGENT_PROVIDER = 'maid-sub-agent';
const SUB_AGENT_NAMESPACE = 'user';

// 把一条女仆 Sub-agent 配置投影成统一 Agent capability 记录。
// 行为兼容关键：promptShape 必须与迁移前 planner 收到的 sub-agent 形状一致（id/name/skills/note/enabled）。
export const projectSubAgentCapability = (subAgent = {}) => {
  const src = isPlainObject(subAgent) ? subAgent : {};
  const id = trim(src.id);
  if (!id) return null;
  const name = trim(src.name) || id;
  const skills = (Array.isArray(src.skills) ? src.skills : []).map(s => trim(s)).filter(Boolean);
  const note = trim(src.note);
  const enabled = src.enabled !== false;
  const modelProfileRef = trim(src.modelProfileId);
  const modelOverride = trim(src.modelOverride);
  return {
    ref: buildCapabilityRef({
      id,
      version: '1',
      namespace: SUB_AGENT_NAMESPACE,
      kind: AGENT_CAPABILITY_KIND,
      provider: SUB_AGENT_PROVIDER,
      ref: id,
    }),
    id,
    name,
    enabled,
    provider: SUB_AGENT_PROVIDER,
    source: SUB_AGENT_PROVIDER,
    // Agent metadata（架构计划 §3.2）：能力标签 = 用户勾选的 skills；模型引用 = 绑定的模型档。
    capabilityTags: skills,
    modelProfileRef,
    modelOverride,
    note,
    // 声明但未强制（Phase B 只读）：单任务预算、委派与降级默认。
    budgets: { tokens: null, timeMs: null, toolCalls: null },
    memoryScope: 'maid-run',
    delegation: { maxDepth: 1, maxConcurrency: 1 },
    // 行为兼容投影：与迁移前 buildMaidSubAgentsPromptBlock 收到的形状等价。
    promptShape: { id, name, skills, note, enabled, profileHint: '' },
  };
};

// 女仆 Sub-agent provider：registry 的第一个来源。getSubAgents 返回原始 sub-agent 数组。
export const createSubAgentRegistryProvider = (getSubAgents = () => []) => ({
  provider: SUB_AGENT_PROVIDER,
  listCapabilities: () => (typeof getSubAgents === 'function' ? getSubAgents() : [])
    .map(projectSubAgentCapability)
    .filter(Boolean),
});

// 统一 Agent Registry：聚合多个 provider（当前仅 sub-agent；后续内建领域 Agent / 用户 Agent / MCP 复用同接口）。
export const createAgentRegistry = ({ providers = [] } = {}) => {
  const providerList = (Array.isArray(providers) ? providers : []).filter(p => p && typeof p.listCapabilities === 'function');

  const listAgents = () => {
    const out = [];
    const seen = new Set();
    providerList.forEach((p) => {
      let caps = [];
      try { caps = p.listCapabilities() || []; } catch { caps = []; }
      caps.forEach((cap) => {
        if (!cap || !cap.ref) return;
        const key = capabilityRefKey(cap.ref);
        if (seen.has(key)) return; // 先注册的 provider 优先，后者不覆盖
        seen.add(key);
        out.push(cap);
      });
    });
    return out;
  };

  const listEnabledAgents = () => listAgents().filter(cap => cap.enabled !== false);

  const getAgent = (id = '') => {
    const target = trim(id);
    if (!target) return null;
    return listAgents().find(cap => cap.id === target) || null;
  };

  const getAgentByRef = (ref = {}) => {
    const key = capabilityRefKey(ref);
    return listAgents().find(cap => capabilityRefKey(cap.ref) === key) || null;
  };

  const listByProvider = (provider = '') => {
    const target = trim(provider);
    return listAgents().filter(cap => cap.provider === target);
  };

  // 供 planner 消费的行为兼容投影：等价于迁移前 settingsStore.listSubAgents() 过 enabled 的结果。
  const listPromptShapes = () => listEnabledAgents().map(cap => cap.promptShape);

  return {
    listAgents,
    listEnabledAgents,
    getAgent,
    getAgentByRef,
    listByProvider,
    listPromptShapes,
    get providers() { return providerList.map(p => p.provider); },
  };
};
