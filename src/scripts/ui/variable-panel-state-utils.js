export const VARIABLE_TREE_LIMITS = Object.freeze({
  maxDepth: 8,
  maxNodes: 2000,
  maxArray: 120,
});

const createVariableTreeNode = (name, path, order = 0) => ({
  name,
  path,
  order,
  children: new Map(),
  hasValue: false,
  value: undefined,
});

export const formatVariableTreeValue = (value) => {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return `{${Object.keys(value).length}}`;
  return String(value);
};

export const buildVariableTree = (variables = {}, limits = VARIABLE_TREE_LIMITS) => {
  const root = createVariableTreeNode('', '');
  let nodeCount = 0;

  const ensureChild = (parent, name, path, order = 0) => {
    if (!parent) return null;
    let child = parent.children.get(name);
    if (!child) {
      if (nodeCount >= limits.maxNodes) return null;
      child = createVariableTreeNode(name, path, order);
      parent.children.set(name, child);
      nodeCount += 1;
    } else if (Number.isFinite(order)) {
      child.order = order;
    }
    return child;
  };

  const assignValue = (node, value, override = false) => {
    if (!node) return;
    if (override || !node.hasValue) {
      node.value = value;
      node.hasValue = true;
    }
  };

  const expandValue = (node, value, depth = 0) => {
    if (!node || value == null || depth >= limits.maxDepth) return;
    if (Array.isArray(value)) {
      const limit = Math.min(value.length, limits.maxArray);
      for (let index = 0; index < limit; index += 1) {
        const name = `[${index}]`;
        const path = node.path ? `${node.path}${name}` : name;
        const child = ensureChild(node, name, path, index);
        if (!child) break;
        assignValue(child, value[index], false);
        expandValue(child, value[index], depth + 1);
      }
      return;
    }
    if (typeof value !== 'object') return;
    const entries = Object.entries(value);
    for (let index = 0; index < entries.length; index += 1) {
      const [key, item] = entries[index];
      const name = String(key);
      const path = node.path ? `${node.path}.${name}` : name;
      const child = ensureChild(node, name, path, index);
      if (!child) break;
      assignValue(child, item, false);
      expandValue(child, item, depth + 1);
    }
  };

  Object.entries(variables || {}).forEach(([path, value]) => {
    const raw = String(path || '').trim();
    if (!raw) return;
    const parts = raw.split('.').filter(Boolean);
    let node = root;
    let currentPath = '';
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      currentPath = currentPath ? `${currentPath}.${part}` : part;
      node = ensureChild(node, part, currentPath, index);
      if (!node) return;
    }
    assignValue(node, value, true);
    expandValue(node, value, parts.length);
  });
  return root;
};

export const getSortedVariableTreeChildren = (node) => {
  const list = Array.from(node?.children?.values?.() || []);
  return list.sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
};

export const variableTreeNodeMatches = (node, rawTerm = '') => {
  const term = String(rawTerm || '').trim().toLowerCase();
  if (!term) return true;
  const text = `${node?.path || ''} ${node?.name || ''} ${formatVariableTreeValue(node?.value)}`.toLowerCase();
  if (text.includes(term)) return true;
  for (const child of node?.children?.values?.() || []) {
    if (variableTreeNodeMatches(child, term)) return true;
  }
  return false;
};

export const normalizeVariableScope = value => (
  String(value || '').trim() === 'global' ? 'global' : 'session'
);

export const resolveVariablePanelScope = ({
  sessionId = '',
  getVariableScope = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  let rawScope = 'session';
  try {
    rawScope = typeof getVariableScope === 'function' ? getVariableScope(sid) : 'session';
  } catch {}
  return { sid, scope: normalizeVariableScope(rawScope) };
};

export const formatVariableScopeLabel = ({ scope = 'session', sessionId = '' } = {}) => {
  const normalizedScope = normalizeVariableScope(scope);
  const sid = String(sessionId || '').trim();
  if (normalizedScope === 'global') return '全局变量（所有会话共享）';
  return sid ? `当前会话「${sid}」` : '当前会话';
};

export const buildVariableScopeImpactText = ({
  scope = 'session',
  sessionId = '',
  action = 'manage',
} = {}) => {
  const normalizedScope = normalizeVariableScope(scope);
  const target = formatVariableScopeLabel({ scope: normalizedScope, sessionId });
  const storesRules = normalizedScope !== 'global';
  if (action === 'edit') {
    return `影响范围：${target}。已有变量的当前值会即时写入；新建变量${storesRules ? '、类型与展示配置' : ''}需点击保存。取消或关闭不会回滚已即时写入的值${storesRules ? '，也不会保存尚未提交的配置草稿' : ''}。`;
  }
  if (action === 'rules') {
    return `影响范围：${target}。启用的规则可能在后续消息中自动修改变量、切换角色或注入提示词；关闭窗口不会运行规则，停用或删除规则可停止后续影响。`;
  }
  if (action === 'templates') {
    return `影响范围：${target}。应用模板会一次写入多项会话变量；取消覆盖确认不会写入，应用前可先导出备份。`;
  }
  if (action === 'import') {
    const extra = storesRules ? '、Schema 与规则' : '';
    return `影响范围：${target}。合并导入会写入同名变量${extra}；覆盖导入会先清空当前范围再写入。建议先导出备份，关闭窗口或取消确认不会写入。`;
  }
  if (action === 'export') {
    return `影响范围：${target}。导出为只读复制，不会修改变量；可作为导入或覆盖前的回退备份。`;
  }
  if (action === 'delete') {
    return `影响范围：${target}。删除后相关提示词、世界书条件和脚本读取会失去该变量；取消确认不会删除，可通过导入备份恢复。`;
  }
  if (action === 'clear') {
    return `影响范围：${target}。清空会删除当前范围内的变量值；取消确认不会删除，建议先导出备份。`;
  }
  return `影响范围：${target}。变量会影响后续提示词、世界书条件和脚本读取；关闭面板不会撤销已保存内容，导出可作为回退备份。`;
};

export const inferVariableValueType = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return 'object';
  return 'string';
};

export const isVariableValueFilled = value => (
  value !== undefined
  && value !== null
  && !(typeof value === 'string' && value.trim() === '')
);

const normalizeVariableFilter = value => (
  ['filled', 'empty'].includes(String(value || '').trim()) ? String(value).trim() : 'all'
);

const normalizeVariableSort = value => (
  String(value || '').trim() === 'updated' ? 'updated' : 'name'
);

export const buildVariableListRows = ({
  vars = {},
  schemas = {},
  term = '',
  filter = 'all',
  sort = 'name',
  updatedAtByKey = {},
} = {}) => {
  const query = String(term || '').trim().toLowerCase();
  const normalizedFilter = normalizeVariableFilter(filter);
  const normalizedSort = normalizeVariableSort(sort);
  const rows = Object.entries(vars || {}).map(([rawKey, value], index) => {
    const key = String(rawKey);
    const valueText = value === null || value === undefined ? '' : String(value);
    return {
      key,
      value,
      valueText,
      schema: schemas?.[key] || null,
      filled: isVariableValueFilled(value),
      updatedAt: Number(updatedAtByKey?.[key] || 0) || 0,
      index,
    };
  }).filter((row) => {
    if (normalizedFilter === 'filled' && !row.filled) return false;
    if (normalizedFilter === 'empty' && row.filled) return false;
    if (!query) return true;
    return row.key.toLowerCase().includes(query) || row.valueText.toLowerCase().includes(query);
  });

  rows.sort((left, right) => {
    if (normalizedSort === 'updated' && left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    const byName = left.key.localeCompare(right.key);
    return byName || left.index - right.index;
  });
  return rows;
};

export const getVariableRenderSlice = ({
  rows = [],
  limit = 80,
  batchSize = 80,
} = {}) => {
  const list = Array.isArray(rows) ? rows : [];
  const normalizedBatchSize = Math.max(1, Math.trunc(Number(batchSize) || 80));
  const normalizedLimit = Math.max(
    normalizedBatchSize,
    Math.trunc(Number(limit) || normalizedBatchSize),
  );
  const rendered = Math.min(list.length, normalizedLimit);
  return {
    rows: list.slice(0, rendered),
    rendered,
    total: list.length,
    hasMore: rendered < list.length,
    nextLimit: Math.min(list.length, normalizedLimit + normalizedBatchSize),
  };
};

export const resolveNextEnumValue = (currentValue, rawOptions = []) => {
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(option => String(option)).filter(Boolean)
    : [];
  if (!options.length) return '';
  const current = String(currentValue ?? '');
  const index = options.indexOf(current);
  return options[(index + 1 + options.length) % options.length];
};
