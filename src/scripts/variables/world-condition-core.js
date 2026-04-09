import {
  buildVariableContext as buildVariableContextImpl,
} from './variable-path-utils.js';

export const genNodeId = () => `nd_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;
export const genEdgeId = () => `ed_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;

export const sanitizeNodeId = (value, fallback = '') => {
  const raw = String(value || '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  if (cleaned) return cleaned;
  const backup = String(fallback || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return backup || `node_${Date.now().toString(36)}`;
};

const KNOWN_OPS = new Set(['==', '!=', '>', '>=', '<', '<=', 'contains', 'not_contains', 'is_empty', 'not_empty', 'regex']);
const KNOWN_PENDING_REASONS = new Set([
  'missing_input',
  'missing_left',
  'missing_right_input',
  'missing_right_literal',
  'missing_right_variable',
]);

export const clampConditionZoom = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeNodeType = (type) => {
  const t = String(type || '').trim().toLowerCase();
  if (['variable', 'value', 'compare', 'logic', 'result'].includes(t)) return t;
  return 'compare';
};

export const normalizeLogicValue = (logic) => {
  const value = String(logic || '').trim().toLowerCase();
  return ['and', 'or', 'not'].includes(value) ? value : 'and';
};

export const normalizeRightTypeValue = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  return ['number', 'string', 'boolean', 'variable'].includes(value) ? value : 'number';
};

export const normalizeWorldPromptMode = (raw, { fallback = 'hybrid' } = {}) => {
  const normalizeToken = (value) => {
    const token = String(value || '').trim().toLowerCase();
    if (token === 'legacy') return 'legacy';
    if (token === 'blocks' || token === 'block' || token === 'node') return 'blocks';
    if (token === 'hybrid' || token === 'mix') return 'hybrid';
    return '';
  };
  const fallbackMode = normalizeToken(fallback) || 'hybrid';
  return normalizeToken(raw) || fallbackMode;
};

export const shouldUseWorldPromptBlocks = (promptMode, blocks = [], { fallback = 'hybrid' } = {}) => {
  const mode = normalizeWorldPromptMode(promptMode, { fallback });
  return mode !== 'legacy' && Array.isArray(blocks) && blocks.length > 0;
};

export const parseTypedValue = (value, type = 'string') => {
  const mode = normalizeRightTypeValue(type);
  if (mode === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (mode === 'boolean') {
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'true' || text === '1' || text === 'yes' || text === 'on';
  }
  return String(value ?? '');
};

export const stringifyTypedValue = (value, type = 'string') => {
  const mode = normalizeRightTypeValue(type);
  if (mode === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
};

export const buildNodeDefineSpec = (data = {}) => {
  const path = String(data.path || '').trim();
  if (!path || data.autoCreate !== true) return null;
  const typeRaw = String(data.varType || 'number').trim().toLowerCase();
  const type = ['number', 'string', 'boolean'].includes(typeRaw) ? typeRaw : 'number';
  const defaultValue = parseTypedValue(data.defaultValue, type);
  return { name: path, type, default: defaultValue };
};

export const getNodePortSpec = (node = {}) => {
  const type = normalizeNodeType(node.type);
  if (type === 'variable') return { inputs: [], outputs: ['out'] };
  if (type === 'value') return { inputs: [], outputs: ['out'] };
  if (type === 'compare') return { inputs: ['left', 'right'], outputs: ['out'] };
  if (type === 'logic') {
    const mode = normalizeLogicValue(node?.data?.logic);
    const inputCountRaw = Number(node?.data?.inputCount || 2);
    const inputCount = Number.isFinite(inputCountRaw) ? Math.max(1, Math.min(8, Math.trunc(inputCountRaw))) : 2;
    return mode === 'not'
      ? { inputs: ['in'], outputs: ['out'] }
      : { inputs: Array.from({ length: inputCount }, (_, idx) => `in${idx + 1}`), outputs: ['out'] };
  }
  return { inputs: ['in'], outputs: [] };
};

export const normalizeGraphNodeData = (type, data = {}) => {
  const base = data && typeof data === 'object' ? { ...data } : {};
  if (type === 'variable') {
    return {
      path: String(base.path || '').trim(),
      autoCreate: base.autoCreate === true,
      varType: ['number', 'string', 'boolean'].includes(String(base.varType || '').trim().toLowerCase())
        ? String(base.varType).trim().toLowerCase()
        : 'number',
      defaultValue: base.defaultValue ?? 0,
    };
  }
  if (type === 'value') {
    const rightType = normalizeRightTypeValue(base.rightType || 'number');
    const value = base.value ?? (rightType === 'number' ? 0 : '');
    return {
      rightType,
      value: stringifyTypedValue(value, rightType),
    };
  }
  if (type === 'compare') {
    const op = String(base.op || '>').trim();
    return {
      op: KNOWN_OPS.has(op) ? op : '>',
      fallbackRightType: normalizeRightTypeValue(base.fallbackRightType || 'number'),
      fallbackRight: stringifyTypedValue(base.fallbackRight ?? 10, base.fallbackRightType || 'number'),
    };
  }
  if (type === 'logic') {
    const logic = normalizeLogicValue(base.logic);
    const inputCountRaw = Number(base.inputCount || (logic === 'not' ? 1 : 2));
    const inputCount = logic === 'not'
      ? 1
      : (Number.isFinite(inputCountRaw) ? Math.max(2, Math.min(8, Math.trunc(inputCountRaw))) : 2);
    return { logic, inputCount };
  }
  return {};
};

export const normalizeGraphNode = (raw = {}, index = 0) => {
  const node = raw && typeof raw === 'object' ? { ...raw } : {};
  const type = normalizeNodeType(node.type);
  const fallbackId = `${type}_${index + 1}`;
  return {
    id: sanitizeNodeId(node.id, fallbackId),
    type,
    x: Number.isFinite(Number(node.x)) ? Number(node.x) : 36 + (index % 3) * 220,
    y: Number.isFinite(Number(node.y)) ? Number(node.y) : 36 + Math.floor(index / 3) * 120,
    data: normalizeGraphNodeData(type, node.data),
  };
};

export const normalizeGraphEdge = (raw = {}, index = 0, nodeById = new Map()) => {
  const edge = raw && typeof raw === 'object' ? { ...raw } : {};
  const fromRaw = String(edge.from || '').trim();
  const toRaw = String(edge.to || '').trim();
  const from = sanitizeNodeId(fromRaw, fromRaw);
  const to = sanitizeNodeId(toRaw, toRaw);
  if (!from || !to || from === to) return null;
  const fromNode = nodeById.get(from);
  const toNode = nodeById.get(to);
  if (!fromNode || !toNode) return null;
  const fromPort = String(edge.fromPort || 'out').trim();
  const toPort = String(edge.toPort || 'in').trim();
  const fromPorts = getNodePortSpec(fromNode).outputs;
  const toPorts = getNodePortSpec(toNode).inputs;
  if (!fromPorts.includes(fromPort) || !toPorts.includes(toPort)) return null;
  return {
    id: sanitizeNodeId(edge.id, `edge_${index + 1}`),
    from,
    fromPort,
    to,
    toPort,
  };
};

export const isConditionLogicNode = (node = {}) => {
  const logicRaw = String(node?.logic || '').trim().toLowerCase();
  return logicRaw === 'and' || logicRaw === 'or' || logicRaw === 'not';
};

export const autoLayoutNodeGraph = (graph = {}) => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeById = new Map(nodes.map(node => [String(node.id || ''), node]));
  const inDegree = new Map();
  const outgoing = new Map();
  nodes.forEach((node) => {
    const id = String(node.id || '');
    inDegree.set(id, 0);
    outgoing.set(id, []);
  });
  edges.forEach((edge) => {
    const from = String(edge.from || '');
    const to = String(edge.to || '');
    if (!nodeById.has(from) || !nodeById.has(to)) return;
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
    outgoing.get(from)?.push(to);
  });
  const queue = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });
  const levelById = new Map();
  queue.forEach(id => levelById.set(id, 0));
  while (queue.length) {
    const id = queue.shift();
    const level = Number(levelById.get(id) || 0);
    const nextList = outgoing.get(id) || [];
    nextList.forEach((to) => {
      levelById.set(to, Math.max(Number(levelById.get(to) || 0), level + 1));
      inDegree.set(to, Number(inDegree.get(to) || 0) - 1);
      if (inDegree.get(to) === 0) queue.push(to);
    });
  }
  nodes.forEach((node) => {
    if (!levelById.has(node.id)) levelById.set(node.id, 0);
  });
  const layers = new Map();
  nodes.forEach((node) => {
    const level = Number(levelById.get(node.id) || 0);
    if (!layers.has(level)) layers.set(level, []);
    layers.get(level).push(node);
  });
  [...layers.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([level, layerNodes]) => {
      layerNodes.sort((a, b) => String(a.type).localeCompare(String(b.type), 'en'));
      layerNodes.forEach((node, idx) => {
        node.x = 40 + level * 230;
        node.y = 40 + idx * 128;
      });
    });
  // --- 后处理：重新定位 compare 右端口的源节点到比较节点右侧 ---
  const edgeByTarget = new Map();
  edges.forEach(edge => {
    const key = `${edge.to}|${String(edge.toPort || '')}`;
    if (!edgeByTarget.has(key)) edgeByTarget.set(key, edge.from);
  });
  const movedIds = new Set();
  nodes.forEach(node => {
    if (normalizeNodeType(node.type) !== 'compare') return;
    const rightSourceId = edgeByTarget.get(`${node.id}|right`);
    if (!rightSourceId || !nodeById.has(rightSourceId)) return;
    const rightSource = nodeById.get(rightSourceId);
    rightSource.x = node.x + 230;
    rightSource.y = node.y;
    movedIds.add(rightSourceId);
  });
  if (movedIds.size > 0) {
    const colMap = new Map();
    nodes.forEach(n => {
      if (!colMap.has(n.x)) colMap.set(n.x, []);
      colMap.get(n.x).push(n);
    });
    colMap.forEach(colNodes => {
      if (colNodes.length <= 1) return;
      colNodes.sort((a, b) => a.y - b.y);
      colNodes.forEach((n, idx) => { n.y = 40 + idx * 128; });
    });
  }
  return graph;
};

export const normalizePromptClause = (raw = {}) => {
  const clause = raw && typeof raw === 'object' ? { ...raw } : {};
  return {
    left: String(clause.left || '').trim(),
    op: KNOWN_OPS.has(String(clause.op || '>').trim()) ? String(clause.op || '>').trim() : '>',
    right: clause.right ?? '',
    rightType: normalizeRightTypeValue(clause.rightType || 'number'),
    pendingReason: KNOWN_PENDING_REASONS.has(String(clause.pendingReason || '').trim().toLowerCase())
      ? String(clause.pendingReason || '').trim().toLowerCase()
      : '',
    defineVariable: clause.defineVariable && typeof clause.defineVariable === 'object'
      ? {
          name: String(clause.defineVariable.name || '').trim(),
          type: String(clause.defineVariable.type || 'number').trim().toLowerCase(),
          default: clause.defineVariable.default ?? 0,
        }
      : null,
  };
};

export const isConditionTreeGroup = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return false;
  const logic = String(raw.logic || '').trim().toLowerCase();
  return logic === 'and' || logic === 'or' || logic === 'not' || Array.isArray(raw.clauses) || (raw.clause && typeof raw.clause === 'object');
};

export const createDefaultPromptClause = () => normalizePromptClause({
  left: '',
  op: '>',
  right: 10,
  rightType: 'number',
});

export const createPendingPromptClause = (pendingReason = 'missing_input') => normalizePromptClause({
  ...createDefaultPromptClause(),
  pendingReason,
});

export const isDefaultPromptClause = (raw = {}) => {
  const clause = normalizePromptClause(raw);
  if (String(clause.left || '').trim()) return false;
  if (clause.defineVariable && typeof clause.defineVariable === 'object' && String(clause.defineVariable.name || '').trim()) {
    return false;
  }
  const op = String(clause.op || '').trim().toLowerCase();
  if (op !== '>') return false;
  const rightType = normalizeRightTypeValue(clause.rightType || 'number');
  if (rightType !== 'number') return false;
  const pending = String(clause.pendingReason || '').trim().toLowerCase();
  if (pending && pending !== 'missing_left' && pending !== 'missing_input') return false;
  const rightNumber = Number(clause.right);
  if (Number.isFinite(rightNumber)) return rightNumber === 10;
  return String(clause.right ?? '').trim() === '';
};

export const isTrivialConditionTree = (raw = null) => {
  if (!raw || typeof raw !== 'object') return true;
  const node = normalizeConditionTree(raw, createDefaultPromptClause());
  const inspect = (item) => {
    if (!item || typeof item !== 'object') return true;
    const logic = String(item.logic || '').trim().toLowerCase();
    if (logic === 'not') {
      const child = item.clause && typeof item.clause === 'object'
        ? item.clause
        : (Array.isArray(item.clauses) ? item.clauses[0] : null);
      return inspect(child);
    }
    if (logic === 'and' || logic === 'or' || Array.isArray(item.clauses)) {
      const clauses = Array.isArray(item.clauses) ? item.clauses : [];
      if (!clauses.length) return true;
      return clauses.every(inspect);
    }
    return isDefaultPromptClause(item);
  };
  return inspect(node);
};

export const normalizeConditionTree = (raw = null, fallbackClause = null) => {
  const fallback = normalizePromptClause(fallbackClause || createDefaultPromptClause());
  if (!raw || typeof raw !== 'object') return { logic: 'and', clauses: [fallback] };
  if (!isConditionTreeGroup(raw)) return normalizePromptClause(raw);
  const logic = normalizeLogicValue(raw.logic || 'and');
  if (logic === 'not') {
    const childRaw = raw.clause && typeof raw.clause === 'object'
      ? raw.clause
      : (Array.isArray(raw.clauses) ? raw.clauses[0] : null);
    const child = normalizeConditionTree(childRaw, fallback);
    return { logic: 'not', clause: child };
  }
  const listRaw = Array.isArray(raw.clauses) ? raw.clauses : [];
  const clauses = listRaw.length
    ? listRaw.map(item => normalizeConditionTree(item, fallback)).filter(Boolean)
    : [fallback];
  return { logic, clauses };
};

export const getPrimaryClauseFromConditionTree = (raw = null, fallbackClause = null) => {
  const node = normalizeConditionTree(raw, fallbackClause);
  if (!node || typeof node !== 'object') return normalizePromptClause(fallbackClause || createDefaultPromptClause());
  if (node.logic === 'not') return getPrimaryClauseFromConditionTree(node.clause, fallbackClause);
  if (Array.isArray(node.clauses)) {
    const first = node.clauses[0];
    return getPrimaryClauseFromConditionTree(first, fallbackClause);
  }
  return normalizePromptClause(node);
};

export const visitConditionTree = (node, visitor, path = 'root') => {
  if (!node || typeof node !== 'object' || typeof visitor !== 'function') return;
  visitor(node, path);
  if (node.logic === 'not') {
    if (node.clause && typeof node.clause === 'object') visitConditionTree(node.clause, visitor, `${path}.0`);
    return;
  }
  if (Array.isArray(node.clauses)) {
    node.clauses.forEach((child, idx) => {
      if (child && typeof child === 'object') visitConditionTree(child, visitor, `${path}.${idx}`);
    });
  }
};

export const collectConditionDefineSpecs = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (node.defineVariable && typeof node.defineVariable === 'object') out.push(node.defineVariable);
  if (Array.isArray(node.clauses)) node.clauses.forEach(item => collectConditionDefineSpecs(item, out));
  if (node.clause && typeof node.clause === 'object') collectConditionDefineSpecs(node.clause, out);
  if (node.where && typeof node.where === 'object') collectConditionDefineSpecs(node.where, out);
  return out;
};

export const buildNodeGraphFromWhen = (when = {}, fallbackClause = {}) => {
  const nodes = [];
  const edges = [];
  const createNode = (type, data = {}) => {
    const node = {
      id: genNodeId(),
      type: normalizeNodeType(type),
      x: 0,
      y: 0,
      data: normalizeGraphNodeData(normalizeNodeType(type), data),
    };
    nodes.push(node);
    return node;
  };
  const connect = (fromNode, fromPort, toNode, toPort) => {
    if (!fromNode?.id || !toNode?.id) return;
    edges.push({
      id: genEdgeId(),
      from: fromNode.id,
      fromPort,
      to: toNode.id,
      toPort,
    });
  };
  const buildClauseNodes = (clauseRaw = {}) => {
    const clause = normalizePromptClause(clauseRaw);
    const variableNode = createNode('variable', {
      path: clause.left,
      autoCreate: Boolean(clause.defineVariable?.name),
      varType: clause.defineVariable?.type || 'number',
      defaultValue: clause.defineVariable?.default ?? 0,
    });
    const compareNode = createNode('compare', {
      op: clause.op,
      fallbackRightType: clause.rightType,
      fallbackRight: stringifyTypedValue(clause.right, clause.rightType),
    });
    connect(variableNode, 'out', compareNode, 'left');
    if (clause.op !== 'is_empty' && clause.op !== 'not_empty') {
      const rightIsVariable = clause.rightType === 'variable';
      const rightNode = rightIsVariable
        ? createNode('variable', { path: String(clause.right || ''), autoCreate: false, varType: 'number', defaultValue: 0 })
        : createNode('value', {
            rightType: clause.rightType,
            value: stringifyTypedValue(clause.right, clause.rightType),
          });
      connect(rightNode, 'out', compareNode, 'right');
    }
    return compareNode;
  };
  const buildConditionNodes = (nodeRaw = {}) => {
    const node = nodeRaw && typeof nodeRaw === 'object' ? nodeRaw : {};
    if (isConditionLogicNode(node)) {
      const logic = normalizeLogicValue(node.logic);
      const children = Array.isArray(node.clauses) ? node.clauses.filter(Boolean) : [];
      const logicNode = createNode('logic', { logic, inputCount: logic === 'not' ? 1 : Math.max(2, children.length) });
      if (logic === 'not') {
        const child = node.clause && typeof node.clause === 'object'
          ? node.clause
          : (Array.isArray(node.clauses) ? node.clauses[0] : null);
        if (child) {
          const childOutput = buildConditionNodes(child);
          if (childOutput) connect(childOutput, 'out', logicNode, 'in');
        }
        return logicNode;
      }
      children.forEach((child, idx) => {
        const childOutput = buildConditionNodes(child);
        if (!childOutput) return;
        connect(childOutput, 'out', logicNode, `in${idx + 1}`);
      });
      return logicNode;
    }
    if (node.clause && typeof node.clause === 'object') {
      return buildConditionNodes(node.clause);
    }
    return buildClauseNodes(node);
  };

  const fallback = normalizePromptClause(fallbackClause || {});
  const root = buildConditionNodes(when && typeof when === 'object' ? when : fallback);
  const resultNode = createNode('result', {});
  if (root) connect(root, 'out', resultNode, 'in');
  return autoLayoutNodeGraph({
    version: 1,
    nodes,
    edges,
  });
};

export const normalizeNodeGraph = (raw = {}, fallbackWhen = {}, fallbackClause = {}) => {
  const graph = raw && typeof raw === 'object' ? raw : {};
  if (!Array.isArray(graph.nodes) || !graph.nodes.length) {
    return buildNodeGraphFromWhen(fallbackWhen, fallbackClause);
  }
  const nodes = graph.nodes.map((node, idx) => normalizeGraphNode(node, idx));
  const dedupNodes = [];
  const nodeById = new Map();
  nodes.forEach((node) => {
    const id = String(node.id || '').trim() || genNodeId();
    if (nodeById.has(id)) {
      node.id = genNodeId();
    } else {
      node.id = id;
    }
    nodeById.set(node.id, node);
    dedupNodes.push(node);
  });
  let hasResult = dedupNodes.some(node => node.type === 'result');
  if (!hasResult) {
    const resultNode = normalizeGraphNode({ type: 'result', id: genNodeId(), x: 620, y: 120 }, dedupNodes.length);
    dedupNodes.push(resultNode);
    nodeById.set(resultNode.id, resultNode);
    hasResult = true;
  }
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const normalizedEdges = rawEdges
    .map((edge, idx) => normalizeGraphEdge(edge, idx, nodeById))
    .filter(Boolean);
  const edgeKeys = new Set();
  const dedupEdges = [];
  normalizedEdges.forEach((edge) => {
    const key = `${edge.from}|${edge.fromPort}|${edge.to}|${edge.toPort}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    dedupEdges.push(edge);
  });
  const resultNode = dedupNodes.find(node => node.type === 'result');
  const hasResultInput = dedupEdges.some(edge => edge.to === resultNode.id && edge.toPort === 'in');
  if (!hasResultInput) {
    const candidate = dedupNodes.find(node => node.type === 'compare' || node.type === 'logic') || dedupNodes[0];
    if (candidate && candidate.id !== resultNode.id) {
      dedupEdges.push({
        id: genEdgeId(),
        from: candidate.id,
        fromPort: 'out',
        to: resultNode.id,
        toPort: 'in',
      });
    }
  }
  return {
    version: 1,
    nodes: dedupNodes,
    edges: dedupEdges,
    viewport: {
      x: Number.isFinite(Number(graph?.viewport?.x)) ? Number(graph.viewport.x) : 0,
      y: Number.isFinite(Number(graph?.viewport?.y)) ? Number(graph.viewport.y) : 0,
      zoom: Number.isFinite(Number(graph?.viewport?.zoom))
        ? clampConditionZoom(Number(graph.viewport.zoom), 0.55, 1.8)
        : 1,
    },
  };
};

export const buildWhenFromNodeGraph = (graphRaw = {}, fallbackClause = {}) => {
  const graph = normalizeNodeGraph(graphRaw, {}, fallbackClause);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeById = new Map(nodes.map(node => [String(node.id || ''), node]));
  const incomingByPort = new Map();
  edges.forEach((edge) => {
    const key = `${edge.to}|${edge.toPort}`;
    if (!incomingByPort.has(key)) incomingByPort.set(key, []);
    incomingByPort.get(key).push(edge);
  });
  const getIncomingNode = (toId, toPort) => {
    const key = `${toId}|${toPort}`;
    const list = incomingByPort.get(key) || [];
    const hit = list[0];
    if (!hit) return null;
    return nodeById.get(hit.from) || null;
  };
  const buildClauseFromCompare = (node, seen) => {
    const compareData = normalizeGraphNodeData('compare', node?.data || {});
    const op = String(compareData.op || '>').trim();
    const needsRight = !['is_empty', 'not_empty'].includes(op.toLowerCase());
    const clause = normalizePromptClause({
      left: '',
      op,
      rightType: compareData.fallbackRightType,
      right: parseTypedValue(compareData.fallbackRight, compareData.fallbackRightType),
    });
    const markPendingReason = (reason = '') => {
      if (!clause.pendingReason && KNOWN_PENDING_REASONS.has(String(reason || '').trim().toLowerCase())) {
        clause.pendingReason = String(reason || '').trim().toLowerCase();
      }
    };
    const leftNode = getIncomingNode(node.id, 'left');
    if (leftNode && !seen.has(leftNode.id)) {
      if (leftNode.type === 'variable') {
        clause.left = String(leftNode?.data?.path || '').trim();
        const defineSpec = buildNodeDefineSpec(leftNode.data);
        if (defineSpec) clause.defineVariable = defineSpec;
      } else if (leftNode.type === 'value') {
        clause.left = String(leftNode?.data?.value || '').trim();
      }
    }
    if (!clause.left) markPendingReason('missing_left');
    const rightNode = getIncomingNode(node.id, 'right');
    if (needsRight) {
      if (rightNode && !seen.has(rightNode.id)) {
        if (rightNode.type === 'variable') {
          clause.rightType = 'variable';
          clause.right = String(rightNode?.data?.path || '').trim();
          if (!String(clause.right || '').trim()) markPendingReason('missing_right_variable');
        } else if (rightNode.type === 'value') {
          const rightType = normalizeRightTypeValue(rightNode?.data?.rightType || 'number');
          const rawValue = String(rightNode?.data?.value ?? '');
          clause.rightType = rightType;
          clause.right = rawValue.trim() ? parseTypedValue(rawValue, rightType) : '';
          if (!rawValue.trim()) markPendingReason('missing_right_literal');
        } else {
          clause.right = '';
          markPendingReason('missing_right_input');
        }
      } else {
        clause.right = '';
        markPendingReason('missing_right_input');
      }
    }
    return normalizePromptClause(clause);
  };
  const buildCondition = (nodeId, seen = new Set()) => {
    const id = String(nodeId || '').trim();
    if (!id || seen.has(id)) return null;
    const node = nodeById.get(id);
    if (!node) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    if (node.type === 'compare') {
      return buildClauseFromCompare(node, nextSeen);
    }
    if (node.type === 'logic') {
      const logic = normalizeLogicValue(node?.data?.logic);
      if (logic === 'not') {
        const child = getIncomingNode(node.id, 'in');
        const childCondition = child ? buildCondition(child.id, nextSeen) : null;
        if (!childCondition) return { logic: 'not', clause: createPendingPromptClause('missing_input') };
        return { logic: 'not', clause: childCondition };
      }
      const inputPorts = getNodePortSpec(node).inputs;
      const clauses = inputPorts.map((port) => {
        const child = getIncomingNode(node.id, port);
        if (!child) return createPendingPromptClause('missing_input');
        return buildCondition(child.id, nextSeen) || createPendingPromptClause('missing_input');
      });
      return { logic, clauses };
    }
    if (node.type === 'result') {
      const child = getIncomingNode(node.id, 'in');
      return child ? buildCondition(child.id, nextSeen) : createPendingPromptClause('missing_input');
    }
    if (node.type === 'variable') {
      return normalizePromptClause({
        left: String(node?.data?.path || '').trim(),
        op: 'not_empty',
        rightType: 'string',
        right: '',
        defineVariable: buildNodeDefineSpec(node.data),
      });
    }
    return createPendingPromptClause('missing_input');
  };
  const resultNode = nodes.find(node => node.type === 'result') || null;
  const built = buildCondition(resultNode?.id, new Set()) || createPendingPromptClause('missing_input');
  if (built?.logic && Array.isArray(built.clauses)) {
    return {
      logic: normalizeLogicValue(built.logic),
      clauses: built.clauses.map(clause => (clause?.logic ? clause : normalizePromptClause(clause))),
    };
  }
  if (built?.logic === 'not') {
    return {
      logic: 'not',
      clause: built.clause?.logic ? built.clause : normalizePromptClause(built.clause || fallbackClause),
    };
  }
  return {
    logic: 'and',
    clauses: [normalizePromptClause(built || fallbackClause)],
  };
};

export const buildVariableContext = (options = {}) => buildVariableContextImpl(options);

const coerceBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return text === 'true' || text === '1' || text === 'yes' || text === 'on';
};

const coerceLiteral = (value, rightType = 'string') => {
  const type = String(rightType || 'string').trim().toLowerCase();
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') return coerceBoolean(value);
  return value;
};

const getResolver = (runtime = {}) => {
  if (typeof runtime === 'function') return runtime;
  if (typeof runtime?.resolvePathValue === 'function') return runtime.resolvePathValue;
  return () => undefined;
};

const evalExpression = (expr, runtime = {}) => {
  const resolvePathValue = getResolver(runtime);
  if (expr && typeof expr === 'object') {
    if (typeof expr.var === 'string' && expr.var.trim()) {
      return resolvePathValue(expr.var);
    }
    const fn = String(expr.fn || '').trim().toLowerCase();
    const args = Array.isArray(expr.args) ? expr.args.map(arg => evalExpression(arg, runtime)) : [];
    const toNum = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    if (fn === 'add') return args.reduce((sum, item) => sum + toNum(item), 0);
    if (fn === 'sub') {
      if (!args.length) return 0;
      return args.slice(1).reduce((acc, item) => acc - toNum(item), toNum(args[0]));
    }
    if (fn === 'mul') return args.reduce((acc, item) => acc * toNum(item), args.length ? 1 : 0);
    if (fn === 'div') {
      if (!args.length) return 0;
      return args.slice(1).reduce((acc, item) => {
        const d = toNum(item);
        return d === 0 ? acc : acc / d;
      }, toNum(args[0]));
    }
    if (fn === 'min') return args.length ? Math.min(...args.map(toNum)) : 0;
    if (fn === 'max') return args.length ? Math.max(...args.map(toNum)) : 0;
    if (fn === 'abs') return Math.abs(toNum(args[0]));
    return undefined;
  }
  if (typeof expr === 'string') {
    const key = expr.trim();
    if (!key) return undefined;
    const resolved = resolvePathValue(key);
    if (resolved !== undefined) return resolved;
    if (/^-?\d+(?:\.\d+)?$/.test(key)) return Number(key);
    const lower = key.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;
    return undefined;
  }
  return expr;
};

export const getClausePendingReason = (clauseRaw = {}) => {
  const clause = normalizePromptClause(clauseRaw);
  if (clause.pendingReason) return clause.pendingReason;
  if (!String(clause.left || '').trim()) return 'missing_left';
  const op = String(clause.op || '==').trim().toLowerCase();
  if (!['is_empty', 'not_empty'].includes(op) && clause.rightType === 'variable' && !String(clause.right || '').trim()) {
    return 'missing_right_variable';
  }
  return '';
};

const evaluateClauseState = (clauseRaw, runtime = {}) => {
  const clause = normalizePromptClause(clauseRaw);
  const pendingReason = getClausePendingReason(clause);
  const leftValue = evalExpression(clause.left, runtime);
  const rightValue = clause.rightType === 'variable'
    ? evalExpression(clause.right, runtime)
    : coerceLiteral(clause.right, clause.rightType);
  if (pendingReason) {
    return {
      clause,
      result: null,
      runtimeResult: false,
      pendingReason,
      leftValue,
      rightValue,
    };
  }
  const op = String(clause.op || '==').trim().toLowerCase();
  const rightType = String(clause.rightType || 'string').trim().toLowerCase();
  if (op === 'is_empty') {
    let result = false;
    if (Array.isArray(leftValue)) result = leftValue.length === 0;
    else if (leftValue && typeof leftValue === 'object') result = Object.keys(leftValue).length === 0;
    else result = String(leftValue ?? '').trim().length === 0;
    return {
      clause,
      result,
      runtimeResult: result,
      pendingReason: '',
      leftValue,
      rightValue,
    };
  }
  if (op === 'not_empty') {
    let result = false;
    if (Array.isArray(leftValue)) result = leftValue.length > 0;
    else if (leftValue && typeof leftValue === 'object') result = Object.keys(leftValue).length > 0;
    else result = String(leftValue ?? '').trim().length > 0;
    return {
      clause,
      result,
      runtimeResult: result,
      pendingReason: '',
      leftValue,
      rightValue,
    };
  }
  let compareLeft = leftValue;
  let compareRight = rightValue;
  if (rightType === 'number') {
    const l = Number(leftValue);
    const r = Number(rightValue);
    compareLeft = Number.isFinite(l) ? l : leftValue;
    compareRight = Number.isFinite(r) ? r : rightValue;
  } else if (rightType === 'boolean') {
    compareLeft = coerceBoolean(leftValue);
    compareRight = coerceBoolean(rightValue);
  } else if (rightType === 'string') {
    compareLeft = String(leftValue ?? '');
    compareRight = String(rightValue ?? '');
  }
  let result = false;
  if (op === 'contains') {
    result = Array.isArray(leftValue)
      ? leftValue.some(item => String(item ?? '') === String(rightValue ?? ''))
      : String(leftValue ?? '').includes(String(rightValue ?? ''));
    return {
      clause,
      result,
      runtimeResult: result,
      pendingReason: '',
      leftValue,
      rightValue,
    };
  }
  if (op === 'not_contains') {
    result = Array.isArray(leftValue)
      ? !leftValue.some(item => String(item ?? '') === String(rightValue ?? ''))
      : !String(leftValue ?? '').includes(String(rightValue ?? ''));
    return {
      clause,
      result,
      runtimeResult: result,
      pendingReason: '',
      leftValue,
      rightValue,
    };
  }
  if (op === 'regex') {
    const pattern = String(rightValue ?? '').trim();
    if (!pattern) {
      return {
        clause,
        result: false,
        runtimeResult: false,
        pendingReason: '',
        leftValue,
        rightValue,
      };
    }
    try {
      const literal = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
      const re = literal ? new RegExp(literal[1], literal[2] || '') : new RegExp(pattern, 'i');
      result = re.test(String(leftValue ?? ''));
      return {
        clause,
        result,
        runtimeResult: result,
        pendingReason: '',
        leftValue,
        rightValue,
      };
    } catch {
      return {
        clause,
        result: false,
        runtimeResult: false,
        pendingReason: '',
        leftValue,
        rightValue,
      };
    }
  }
  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    const l = Number(leftValue);
    const r = Number(rightValue);
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      return {
        clause,
        result: false,
        runtimeResult: false,
        pendingReason: '',
        leftValue,
        rightValue,
      };
    }
    if (op === '>') result = l > r;
    else if (op === '>=') result = l >= r;
    else if (op === '<') result = l < r;
    else result = l <= r;
    return {
      clause,
      result,
      runtimeResult: result,
      pendingReason: '',
      leftValue,
      rightValue,
    };
  }
  result = op === '!=' ? compareLeft !== compareRight : compareLeft === compareRight;
  return {
    clause,
    result,
    runtimeResult: result,
    pendingReason: '',
    leftValue,
    rightValue,
  };
};

const evaluateClause = (clause, runtime = {}) => evaluateClauseState(clause, runtime).runtimeResult;

export const combineConditionLogicState = (logicRaw = 'and', childResults = []) => {
  const logic = normalizeLogicValue(logicRaw || 'and');
  const values = Array.isArray(childResults)
    ? childResults.map(value => (typeof value === 'boolean' ? value : null))
    : [];
  const pendingCount = values.filter(value => typeof value !== 'boolean').length;
  const resolved = values.filter(value => typeof value === 'boolean');
  if (logic === 'not') {
    const first = values.length ? values[0] : null;
    if (typeof first !== 'boolean') {
      return { logic, result: null, runtimeResult: false, pendingCount, resolvedCount: resolved.length };
    }
    return { logic, result: !first, runtimeResult: !first, pendingCount, resolvedCount: resolved.length };
  }
  if (!values.length) {
    return { logic, result: null, runtimeResult: false, pendingCount: 1, resolvedCount: 0 };
  }
  if (pendingCount > 0) {
    return { logic, result: null, runtimeResult: false, pendingCount, resolvedCount: resolved.length };
  }
  const result = logic === 'or' ? resolved.some(Boolean) : resolved.every(Boolean);
  return { logic, result, runtimeResult: result, pendingCount, resolvedCount: resolved.length };
};

export const evaluateConditionTreeState = (node, runtime = {}) => {
  if (!node || typeof node !== 'object') {
    return { result: true, runtimeResult: true, kind: 'empty' };
  }
  const logicRaw = String(node.logic || '').trim().toLowerCase();
  if (logicRaw === 'not') {
    const childNode = node.clause && typeof node.clause === 'object'
      ? node.clause
      : (Array.isArray(node.clauses) ? node.clauses[0] : null);
    const childState = childNode
      ? evaluateConditionTreeState(childNode, runtime)
      : evaluateConditionTreeState(createPendingPromptClause('missing_input'), runtime);
    const combined = combineConditionLogicState('not', [childState.result]);
    return {
      kind: 'group',
      logic: 'not',
      result: combined.result,
      runtimeResult: combined.runtimeResult,
      child: childState,
      children: [childState],
    };
  }
  if (Array.isArray(node.clauses)) {
    const logic = logicRaw === 'or' ? 'or' : 'and';
    const items = node.clauses.length ? node.clauses : [createPendingPromptClause('missing_input')];
    const children = items.map(item => evaluateConditionTreeState(item, runtime));
    const combined = combineConditionLogicState(logic, children.map(item => item.result));
    return {
      kind: 'group',
      logic,
      result: combined.result,
      runtimeResult: combined.runtimeResult,
      children,
    };
  }
  if (node.clause && typeof node.clause === 'object') {
    return evaluateConditionTreeState(node.clause, runtime);
  }
  const clauseState = evaluateClauseState(node, runtime);
  return {
    kind: 'clause',
    result: clauseState.result,
    runtimeResult: clauseState.runtimeResult,
    clause: clauseState.clause,
    leftValue: clauseState.leftValue,
    rightValue: clauseState.rightValue,
    pendingReason: clauseState.pendingReason,
  };
};

export const evaluateConditionTree = (node, runtime = {}) => {
  const state = evaluateConditionTreeState(node, runtime);
  return Boolean(state?.runtimeResult);
};

export const explainConditionTree = (node, runtime = {}, path = 'root') => {
  if (!node || typeof node !== 'object') {
    return { kind: 'empty', path, result: true, runtimeResult: true };
  }
  if (isConditionTreeGroup(node)) {
    const logic = normalizeLogicValue(node.logic || 'and');
    if (logic === 'not') {
      const child = explainConditionTree(node.clause || createPendingPromptClause('missing_input'), runtime, `${path}.0`);
      const combined = combineConditionLogicState('not', [child.result]);
      return {
        kind: 'group',
        path,
        logic,
        result: combined.result,
        runtimeResult: combined.runtimeResult,
        child,
        children: [child],
      };
    }
    const children = (Array.isArray(node.clauses) && node.clauses.length ? node.clauses : [createPendingPromptClause('missing_input')])
      .map((child, idx) => explainConditionTree(child, runtime, `${path}.${idx}`));
    const combined = combineConditionLogicState(logic, children.map(child => child.result));
    return {
      kind: 'group',
      path,
      logic,
      result: combined.result,
      runtimeResult: combined.runtimeResult,
      children,
    };
  }
  const clauseState = evaluateClauseState(node, runtime);
  return {
    kind: 'clause',
    path,
    result: clauseState.result,
    runtimeResult: clauseState.runtimeResult,
    clause: clauseState.clause,
    leftValue: clauseState.leftValue,
    rightValue: clauseState.rightValue,
    pendingReason: clauseState.pendingReason,
  };
};
