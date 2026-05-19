const NODE_TYPE_LABELS = Object.freeze({
  persona_card: '角色卡',
  private_chat: '私聊',
  group_chat: '群聊',
  moment: '动态',
  creative_session: '创作',
  forum_board: '论坛板块',
  forum_thread: '论坛帖子',
  contact: '联系人',
  group_member: '群成员',
  memory_table: '记忆表格',
  memory_row: '记忆行',
  contact_profile: '联系人画像',
  worldbook: '世界书',
  worldbook_entry: '世界书条目',
  summary: '摘要',
  variable_scope: '变量',
  prompt: 'Prompt',
  rule: '规则',
});

const EDGE_TYPE_LABELS = Object.freeze({
  contains: '包含',
  member_of: '成员',
  binds: '绑定',
  derived_from: '派生',
  candidate_for: '候选',
  triggers: '触发',
  injects: '注入',
  visible_to: '可见',
  blocked_by: '阻止',
  trimmed_by: '裁剪',
});

const STATUS_LABELS = Object.freeze({
  active: '已启用',
  candidate: '候选',
  blocked: '已阻止',
  trimmed: '已裁剪',
  disabled: '已关闭',
  unknown: '未知',
});

export const LINEAGE_GRAPH_STATUS_FILTERS = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'active', label: '已注入' },
  { id: 'candidate', label: '候选' },
  { id: 'blocked_trimmed', label: '阻止/裁剪' },
  { id: 'risk', label: '风险' },
]);

export const LINEAGE_GRAPH_VIEW_MODES = Object.freeze([
  { id: 'overview', label: '总览' },
  { id: 'pipeline', label: '注入链路' },
  { id: 'local', label: '局部图' },
  { id: 'full', label: '完整图' },
]);

const STRUCTURAL_EDGE_TYPES = new Set(['contains', 'member_of', 'binds', 'derived_from']);

const MAP_CATEGORY_DEFS = Object.freeze([
  { id: 'contacts', label: '联系人', types: ['contact', 'group_member'] },
  { id: 'groups', label: '群聊', types: ['group_chat'] },
  { id: 'worldbooks', label: '世界书', types: ['worldbook', 'worldbook_entry'] },
  { id: 'memories', label: '记忆', types: ['memory_table', 'memory_row'] },
  { id: 'profiles', label: '画像', types: ['contact_profile'] },
  { id: 'moments', label: '动态', types: ['moment'] },
  { id: 'contexts', label: '上下文', types: ['persona_card', 'private_chat', 'creative_session', 'forum_board', 'forum_thread', 'summary', 'variable_scope', 'rule'] },
  { id: 'prompts', label: 'Prompt', types: ['prompt'] },
]);

const TYPE_COLUMNS = Object.freeze({
  persona_card: 0,
  private_chat: 1,
  group_chat: 1,
  moment: 1,
  creative_session: 1,
  forum_board: 1,
  forum_thread: 1,
  contact: 1,
  group_member: 1,
  worldbook: 2,
  contact_profile: 2,
  memory_table: 2,
  summary: 2,
  variable_scope: 2,
  rule: 2,
  worldbook_entry: 3,
  memory_row: 3,
  prompt: 4,
});

const STATUS_SORT = Object.freeze({
  active: 0,
  candidate: 1,
  blocked: 2,
  trimmed: 3,
  disabled: 4,
  unknown: 5,
});

const normalizeString = value => String(value ?? '').trim();
const listOf = value => Array.isArray(value) ? value : [];
const labelFor = (map, value) => map[normalizeString(value)] || normalizeString(value) || '未知';

const escHtml = value => normalizeString(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const truncate = (value, max = 32) => {
  const text = normalizeString(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
};

const isCrossScopeEdge = (edge = {}, graphScopeId = '') => {
  const graphScope = normalizeString(graphScopeId);
  const sourceScope = normalizeString(edge?.sourceScopeId || graphScope);
  const targetScope = normalizeString(edge?.targetScopeId || graphScope);
  return Boolean(sourceScope && targetScope && sourceScope !== targetScope);
};

const isRiskEdge = (edge = {}, graphScopeId = '') => {
  const reason = normalizeString(edge?.reason);
  const status = normalizeString(edge?.status);
  return isCrossScopeEdge(edge, graphScopeId)
    || reason === 'scope_block'
    || reason === 'mode_block'
    || status === 'blocked';
};

const isStructuralEdge = (edge = {}) => STRUCTURAL_EDGE_TYPES.has(normalizeString(edge?.type));

const shouldIncludeEdge = (edge = {}, filter = 'all', graphScopeId = '') => {
  const status = normalizeString(edge?.status) || 'unknown';
  if (filter === 'active') return status === 'active';
  if (filter === 'candidate') return status === 'candidate';
  if (filter === 'blocked_trimmed') return status === 'blocked' || status === 'trimmed' || status === 'disabled';
  if (filter === 'risk') return isRiskEdge(edge, graphScopeId);
  return true;
};

const getNodeColumn = (node = {}, rootId = '') => {
  if (normalizeString(node?.id) === normalizeString(rootId)) return 4;
  const type = normalizeString(node?.type);
  return Number.isFinite(TYPE_COLUMNS[type]) ? TYPE_COLUMNS[type] : 2;
};

const compareNode = (a, b) => {
  const sa = STATUS_SORT[normalizeString(a?.status)] ?? STATUS_SORT.unknown;
  const sb = STATUS_SORT[normalizeString(b?.status)] ?? STATUS_SORT.unknown;
  if (sa !== sb) return sa - sb;
  const ta = normalizeString(a?.type);
  const tb = normalizeString(b?.type);
  if (ta !== tb) return ta.localeCompare(tb);
  return normalizeString(a?.label || a?.id).localeCompare(normalizeString(b?.label || b?.id));
};

const makeSvgId = value => normalizeString(value).replace(/[^A-Za-z0-9_-]+/g, '_') || 'item';

const buildVisibleGraph = (graph = null, {
  statusFilter = 'all',
  nodeTypeFilter = 'all',
  focusId = '',
  maxDepth = 2,
  includeStructuralEdges = true,
  maxNodes = 140,
  maxEdges = 220,
} = {}) => {
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const graphScopeId = normalizeString(graph?.scopeId);
  const filterEdges = (allowStructural = includeStructuralEdges !== false) => edges
    .filter(edge => shouldIncludeEdge(edge, statusFilter, graphScopeId))
    .filter(edge => allowStructural || !isStructuralEdge(edge) || isRiskEdge(edge, graphScopeId));
  let selectedEdges = filterEdges(includeStructuralEdges !== false);
  const normalizedFocusId = normalizeString(focusId);
  if (normalizedFocusId) {
    const depthLimit = Math.max(1, Math.trunc(Number(maxDepth) || 2));
    const seen = new Set([normalizedFocusId]);
    const frontier = new Set([normalizedFocusId]);
    for (let depth = 0; depth < depthLimit; depth += 1) {
      const next = new Set();
      selectedEdges.forEach((edge) => {
        const source = normalizeString(edge?.source);
        const target = normalizeString(edge?.target);
        if (frontier.has(source) && !seen.has(target)) next.add(target);
        if (frontier.has(target) && !seen.has(source)) next.add(source);
      });
      next.forEach(id => seen.add(id));
      frontier.clear();
      next.forEach(id => frontier.add(id));
    }
    selectedEdges = selectedEdges.filter(edge => seen.has(normalizeString(edge?.source)) && seen.has(normalizeString(edge?.target)));
    if (!selectedEdges.length && includeStructuralEdges === false) {
      selectedEdges = filterEdges(true).filter(edge => seen.has(normalizeString(edge?.source)) && seen.has(normalizeString(edge?.target)));
    }
  }
  selectedEdges = selectedEdges.slice(0, Math.max(1, maxEdges));
  const edgeNodeIds = new Set();
  selectedEdges.forEach((edge) => {
    const source = normalizeString(edge?.source);
    const target = normalizeString(edge?.target);
    if (source) edgeNodeIds.add(source);
    if (target) edgeNodeIds.add(target);
  });
  if (normalizeString(graph?.rootId)) edgeNodeIds.add(normalizeString(graph.rootId));
  let selectedNodes = nodes.filter((node) => {
    const id = normalizeString(node?.id);
    if (!id || !edgeNodeIds.has(id)) return false;
    if (nodeTypeFilter && nodeTypeFilter !== 'all') return normalizeString(node?.type) === nodeTypeFilter;
    return true;
  });
  if (selectedNodes.length > maxNodes) selectedNodes = selectedNodes.slice(0, Math.max(1, maxNodes));
  const selectedNodeIds = new Set(selectedNodes.map(node => normalizeString(node?.id)).filter(Boolean));
  const visibleEdges = selectedEdges.filter(edge => selectedNodeIds.has(normalizeString(edge?.source)) && selectedNodeIds.has(normalizeString(edge?.target)));
  return { nodes: selectedNodes, edges: visibleEdges };
};

export const summarizeLineageGraph = (graph = null) => {
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const byStatus = edges.reduce((acc, edge) => {
    const key = normalizeString(edge?.status) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const byType = nodes.reduce((acc, node) => {
    const key = normalizeString(node?.type) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const riskEdges = edges.filter(edge => isRiskEdge(edge, graph?.scopeId));
  return {
    scopeId: normalizeString(graph?.scopeId) || 'default',
    mode: normalizeString(graph?.mode) || 'unknown',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    byStatus,
    byType,
    riskCount: riskEdges.length,
  };
};

const nodeTypeCount = (summary = {}, type = '') => Number(summary?.byType?.[type] || 0);
const edgeStatusCount = (summary = {}, status = '') => Number(summary?.byStatus?.[status] || 0);

const nodeByIdMap = (graph = null) => new Map(listOf(graph?.nodes).map(node => [normalizeString(node?.id), node]));

const labelOfNode = (node = null) => normalizeString(node?.label || node?.id) || '未知节点';

const categoryForNode = (node = {}) => {
  const type = normalizeString(node?.type);
  return MAP_CATEGORY_DEFS.find(category => category.types.includes(type)) || null;
};

const edgeTouchesNodeSet = (edge = {}, nodeIds = new Set()) => (
  nodeIds.has(normalizeString(edge?.source)) || nodeIds.has(normalizeString(edge?.target))
);

const statusFromCounts = ({
  risk = 0,
  blocked = 0,
  trimmed = 0,
  active = 0,
  candidate = 0,
} = {}) => {
  if (risk || blocked) return 'blocked';
  if (trimmed) return 'trimmed';
  if (active) return 'active';
  if (candidate) return 'candidate';
  return 'unknown';
};

const summarizeEdgesForNodes = (graph = null, nodeIds = new Set()) => {
  const counts = {
    active: 0,
    candidate: 0,
    blocked: 0,
    trimmed: 0,
    disabled: 0,
    unknown: 0,
    injects: 0,
    risk: 0,
  };
  listOf(graph?.edges).forEach((edge) => {
    if (!edgeTouchesNodeSet(edge, nodeIds)) return;
    const status = normalizeString(edge?.status) || 'unknown';
    counts[status] = Number(counts[status] || 0) + 1;
    if (normalizeString(edge?.type) === 'injects' && status === 'active') counts.injects += 1;
    if (isRiskEdge(edge, graph?.scopeId)) counts.risk += 1;
  });
  return counts;
};

const mapNodeStatus = (node = {}, graph = null) => {
  const scope = normalizeString(node?.scopeId);
  const graphScope = normalizeString(graph?.scopeId);
  if (scope && graphScope && scope !== graphScope) return 'blocked';
  return normalizeString(node?.status) || 'unknown';
};

const relevantEdgesForNode = (graph = null, nodeId = '') => {
  const id = normalizeString(nodeId);
  if (!id) return [];
  return listOf(graph?.edges)
    .filter(edge => normalizeString(edge?.source) === id || normalizeString(edge?.target) === id)
    .sort((a, b) => {
      const riskDelta = Number(isRiskEdge(b, graph?.scopeId)) - Number(isRiskEdge(a, graph?.scopeId));
      if (riskDelta) return riskDelta;
      const statusDelta = (STATUS_SORT[normalizeString(a?.status)] ?? STATUS_SORT.unknown)
        - (STATUS_SORT[normalizeString(b?.status)] ?? STATUS_SORT.unknown);
      if (statusDelta) return statusDelta;
      return normalizeString(a?.id).localeCompare(normalizeString(b?.id));
    });
};

const makeMapEdgePath = (source = {}, target = {}) => {
  const sourceX = Number(source?.x || 0) + Number(source?.width || 0) / 2;
  const sourceY = Number(source?.y || 0);
  const targetX = Number(target?.x || 0) - Number(target?.width || 0) / 2;
  const targetY = Number(target?.y || 0);
  const delta = Math.max(64, Math.abs(targetX - sourceX) * 0.45);
  return `M ${sourceX.toFixed(1)} ${sourceY.toFixed(1)} C ${(sourceX + delta).toFixed(1)} ${sourceY.toFixed(1)}, ${(targetX - delta).toFixed(1)} ${targetY.toFixed(1)}, ${targetX.toFixed(1)} ${targetY.toFixed(1)}`;
};

const makeMapNode = ({
  id = '',
  label = '',
  meta = '',
  kind = 'item',
  status = 'unknown',
  x = 0,
  y = 0,
  width = 176,
  height = 58,
  nodeId = '',
  categoryId = '',
  count = 0,
} = {}) => ({
  id: normalizeString(id),
  label: normalizeString(label),
  meta: normalizeString(meta),
  kind: normalizeString(kind) || 'item',
  status: normalizeString(status) || 'unknown',
  x: Number(x) || 0,
  y: Number(y) || 0,
  width: Number(width) || 176,
  height: Number(height) || 58,
  nodeId: normalizeString(nodeId),
  categoryId: normalizeString(categoryId),
  count: Number(count) || 0,
});

const buildLineageMapSceneModel = (graph = null, {
  focusId = '',
  expandedIds = [],
  maxItemsPerCategory = 12,
  maxNeighbors = 10,
} = {}) => {
  const nodes = listOf(graph?.nodes);
  const rootId = normalizeString(graph?.rootId);
  const nodeById = nodeByIdMap(graph);
  const rootNode = nodeById.get(rootId) || nodes.find(node => normalizeString(node?.type) === 'prompt') || nodes[0] || null;
  const rootMapId = rootNode ? `node:${normalizeString(rootNode.id)}` : 'root:empty';
  const expanded = new Set(listOf(expandedIds).map(normalizeString).filter(Boolean));
  const focus = normalizeString(focusId);
  const focusNode = nodeById.get(focus) || null;
  const rootY = 320;
  const mapNodes = [];
  const mapEdges = [];

  const rootMapNode = makeMapNode({
    id: rootMapId,
    label: rootNode ? labelOfNode(rootNode) : '当前上下文',
    meta: rootNode ? labelFor(NODE_TYPE_LABELS, rootNode.type) : '上下文',
    kind: 'root',
    status: rootNode ? mapNodeStatus(rootNode, graph) : 'active',
    x: 300,
    y: rootY,
    width: 198,
    height: 76,
    nodeId: rootNode ? normalizeString(rootNode.id) : '',
  });
  mapNodes.push(rootMapNode);

  const categoryRows = MAP_CATEGORY_DEFS
    .map((definition) => {
      const categoryNodes = nodes
        .filter((node) => normalizeString(node?.id) !== normalizeString(rootNode?.id))
        .filter((node) => definition.types.includes(normalizeString(node?.type)));
      const ids = new Set(categoryNodes.map(node => normalizeString(node?.id)).filter(Boolean));
      const counts = summarizeEdgesForNodes(graph, ids);
      return {
        ...definition,
        nodes: categoryNodes.sort(compareNode),
        counts,
        status: statusFromCounts(counts),
      };
    })
    .filter(category => category.nodes.length);

  const categoryStartY = Math.max(120, rootY - (categoryRows.length - 1) * 46);
  categoryRows.forEach((category, index) => {
    const y = categoryStartY + index * 92;
    const meta = category.counts.risk
      ? `${category.counts.risk} 风险`
      : category.counts.injects
        ? `${category.counts.injects} 注入`
        : category.counts.candidate
          ? `${category.counts.candidate} 候选`
          : `${category.nodes.length}`;
    const categoryNode = makeMapNode({
      id: `category:${category.id}`,
      label: category.label,
      meta,
      kind: 'category',
      status: category.status,
      x: 620,
      y,
      width: 166,
      height: 62,
      categoryId: category.id,
      count: category.nodes.length,
    });
    mapNodes.push(categoryNode);
    mapEdges.push({
      id: `map-edge-root-${category.id}`,
      sourceId: rootMapNode.id,
      targetId: categoryNode.id,
      status: category.status,
      kind: 'aggregate',
    });

    if (!expanded.has(category.id)) return;
    const itemLimit = Math.max(1, Math.trunc(Number(maxItemsPerCategory) || 12));
    const visibleItems = category.nodes.slice(0, itemLimit);
    const itemStartY = y - Math.max(0, visibleItems.length - 1) * 34;
    visibleItems.forEach((node, itemIndex) => {
      const nodeId = normalizeString(node?.id);
      const itemNode = makeMapNode({
        id: `item:${nodeId}`,
        label: labelOfNode(node),
        meta: labelFor(NODE_TYPE_LABELS, node?.type),
        kind: nodeId === focus ? 'focus' : 'item',
        status: mapNodeStatus(node, graph),
        x: 920,
        y: itemStartY + itemIndex * 68,
        width: 188,
        height: 58,
        nodeId,
      });
      mapNodes.push(itemNode);
      mapEdges.push({
        id: `map-edge-${category.id}-${nodeId}`,
        sourceId: categoryNode.id,
        targetId: itemNode.id,
        status: itemNode.status,
        kind: 'contains',
      });
    });
    if (category.nodes.length > visibleItems.length) {
      const moreNode = makeMapNode({
        id: `more:${category.id}`,
        label: `+${category.nodes.length - visibleItems.length}`,
        meta: '更多',
        kind: 'more',
        status: 'unknown',
        x: 920,
        y: itemStartY + visibleItems.length * 68,
        width: 118,
        height: 48,
      });
      mapNodes.push(moreNode);
      mapEdges.push({
        id: `map-edge-${category.id}-more`,
        sourceId: categoryNode.id,
        targetId: moreNode.id,
        status: 'unknown',
        kind: 'contains',
      });
    }
  });

  if (focusNode) {
    const focusMapNode = mapNodes.find(node => node.nodeId === focus);
    const sourceNode = focusMapNode || makeMapNode({
      id: `focus:${focus}`,
      label: labelOfNode(focusNode),
      meta: labelFor(NODE_TYPE_LABELS, focusNode?.type),
      kind: 'focus',
      status: mapNodeStatus(focusNode, graph),
      x: 920,
      y: rootY,
      width: 190,
      height: 62,
      nodeId: focus,
    });
    if (!focusMapNode) {
      mapNodes.push(sourceNode);
      mapEdges.push({
        id: `map-edge-root-focus-${focus}`,
        sourceId: rootMapNode.id,
        targetId: sourceNode.id,
        status: sourceNode.status,
        kind: 'focus',
      });
    }
    const relatedEdges = relevantEdgesForNode(graph, focus).slice(0, Math.max(1, Math.trunc(Number(maxNeighbors) || 10)));
    const relatedNodes = [];
    relatedEdges.forEach((edge) => {
      const otherId = normalizeString(edge?.source) === focus ? normalizeString(edge?.target) : normalizeString(edge?.source);
      if (!otherId || otherId === normalizeString(rootNode?.id)) return;
      if (relatedNodes.some(item => normalizeString(item?.id) === otherId)) return;
      const other = nodeById.get(otherId);
      if (other) relatedNodes.push(other);
    });
    const relatedStartY = sourceNode.y - Math.max(0, relatedNodes.length - 1) * 32;
    relatedNodes.forEach((node, index) => {
      const nodeId = normalizeString(node?.id);
      const relatedNode = makeMapNode({
        id: `related:${nodeId}`,
        label: labelOfNode(node),
        meta: labelFor(NODE_TYPE_LABELS, node?.type),
        kind: 'related',
        status: mapNodeStatus(node, graph),
        x: 1200,
        y: relatedStartY + index * 64,
        width: 176,
        height: 54,
        nodeId,
      });
      mapNodes.push(relatedNode);
      const edge = relatedEdges.find(item => normalizeString(item?.source) === nodeId || normalizeString(item?.target) === nodeId);
      mapEdges.push({
        id: normalizeString(edge?.id) || `map-edge-related-${nodeId}`,
        sourceId: sourceNode.id,
        targetId: relatedNode.id,
        status: normalizeString(edge?.status) || relatedNode.status,
        kind: 'related',
        edgeId: normalizeString(edge?.id),
        isRisk: edge ? isRiskEdge(edge, graph?.scopeId) : false,
      });
    });
  }

  const mapNodeById = new Map(mapNodes.map(node => [node.id, node]));
  const renderedEdges = mapEdges
    .map((edge) => {
      const source = mapNodeById.get(edge.sourceId);
      const target = mapNodeById.get(edge.targetId);
      if (!source || !target) return null;
      return {
        ...edge,
        path: makeMapEdgePath(source, target),
      };
    })
    .filter(Boolean);
  const right = Math.max(980, ...mapNodes.map(node => node.x + node.width / 2 + 120));
  const bottom = Math.max(640, ...mapNodes.map(node => node.y + node.height / 2 + 100));
  const top = Math.min(80, ...mapNodes.map(node => node.y - node.height / 2 - 80));
  return {
    width: Math.ceil(right),
    height: Math.ceil(bottom - Math.min(0, top)),
    offsetY: Math.min(0, top),
    nodes: mapNodes.map(node => ({ ...node, y: node.y - Math.min(0, top) })),
    edges: renderedEdges.map(edge => ({
      ...edge,
      path: edge.path.replace(/(\d+\.\d+) (\d+\.\d+)/g, (match, x, y) => `${x} ${(Number(y) - Math.min(0, top)).toFixed(1)}`),
    })),
    expandedIds: Array.from(expanded),
  };
};

const edgeLabel = (edge = {}, nodes = new Map()) => {
  const source = nodes.get(normalizeString(edge?.source));
  const target = nodes.get(normalizeString(edge?.target));
  return `${labelOfNode(source)} → ${labelOfNode(target)}`;
};

const renderBadge = (label = '', value = '', className = '') => (
  `<span class="lineage-mini-badge ${escHtml(className)}"><span>${escHtml(label)}</span><b>${escHtml(value)}</b></span>`
);

const renderGraphCard = ({
  title = '',
  value = '',
  hint = '',
  className = '',
  nodeId = '',
  edgeId = '',
} = {}) => {
  const attrs = [
    nodeId ? `data-lineage-node-id="${escHtml(nodeId)}"` : '',
    edgeId ? `data-lineage-edge-id="${escHtml(edgeId)}"` : '',
  ].filter(Boolean).join(' ');
  return `
    <button type="button" class="lineage-readable-card ${escHtml(className)}" ${attrs}>
      <span class="lineage-readable-title">${escHtml(title)}</span>
      <strong>${escHtml(value)}</strong>
      ${hint ? `<span class="lineage-readable-hint">${escHtml(hint)}</span>` : ''}
    </button>
  `;
};

const renderEdgeList = (graph = null, edges = [], emptyText = '暂无记录') => {
  const nodes = nodeByIdMap(graph);
  const list = listOf(edges).slice(0, 10);
  if (!list.length) return `<div class="lineage-readable-empty">${escHtml(emptyText)}</div>`;
  return list.map((edge) => renderGraphCard({
    title: edgeLabel(edge, nodes),
    value: `${labelFor(EDGE_TYPE_LABELS, edge?.type)} · ${labelFor(STATUS_LABELS, edge?.status)}`,
    hint: normalizeString(edge?.reason) || 'default',
    className: `is-${normalizeString(edge?.status) || 'unknown'}${isRiskEdge(edge, graph?.scopeId) ? ' is-risk' : ''}`,
    edgeId: normalizeString(edge?.id),
  })).join('');
};

const summarizeWorldbookGroups = (graph = null) => {
  const nodes = nodeByIdMap(graph);
  const groups = new Map();
  listOf(graph?.edges).forEach((edge) => {
    const source = nodes.get(normalizeString(edge?.source));
    if (normalizeString(source?.type) !== 'worldbook_entry') return;
    const worldId = normalizeString(source?.meta?.worldId || source?.id || 'unknown');
    const sourceKind = normalizeString(source?.meta?.sourceKind || 'session') || 'session';
    const key = `${sourceKind}:${worldId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        worldId,
        sourceKind,
        label: `${sourceKind === 'global' ? '全局' : sourceKind === 'role' ? '角色' : sourceKind === 'builtin' ? '内置' : '会话'}世界书 ${worldId}`,
        active: 0,
        candidate: 0,
        blocked: 0,
        trimmed: 0,
        unknown: 0,
      });
    }
    const group = groups.get(key);
    const status = normalizeString(edge?.status) || 'unknown';
    group[status] = Number(group[status] || 0) + 1;
  });
  return Array.from(groups.values()).sort((a, b) => (b.active + b.candidate + b.trimmed + b.blocked) - (a.active + a.candidate + a.trimmed + a.blocked));
};

export const renderLineageOverviewHtml = (graph = null) => {
  const summary = summarizeLineageGraph(graph);
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const injectedEdges = edges.filter(edge => normalizeString(edge?.type) === 'injects' && normalizeString(edge?.status) === 'active');
  const blockedEdges = edges.filter(edge => ['blocked', 'trimmed', 'disabled'].includes(normalizeString(edge?.status)));
  const riskEdges = edges.filter(edge => isRiskEdge(edge, graph?.scopeId));
  const worldGroups = summarizeWorldbookGroups(graph).slice(0, 8);
  const activeSignalLabel = injectedEdges.length ? '已注入' : '启用边';
  const activeSignalCount = injectedEdges.length || edgeStatusCount(summary, 'active');
  const statCards = [
    ['联系人', nodeTypeCount(summary, 'contact')],
    ['群聊', nodeTypeCount(summary, 'group_chat')],
    ['世界书', nodeTypeCount(summary, 'worldbook')],
    ['条目', nodeTypeCount(summary, 'worldbook_entry')],
    ['画像', nodeTypeCount(summary, 'contact_profile')],
    ['记忆行', nodeTypeCount(summary, 'memory_row')],
    [activeSignalLabel, activeSignalCount],
    ['风险', summary.riskCount],
  ];
  return `
    <div class="lineage-readable-view lineage-overview-view">
      <div class="lineage-overview-stats">
        ${statCards.map(([label, value]) => renderGraphCard({ title: label, value: String(value), hint: label === '风险' && value ? '需要检查' : '' })).join('')}
      </div>
      <div class="lineage-readable-grid">
        <section class="lineage-readable-section">
          <h4>世界书聚合</h4>
          ${worldGroups.length
            ? worldGroups.map(group => renderGraphCard({
                title: group.label,
                value: `${group.active} 注入 / ${group.candidate} 候选`,
                hint: `${group.trimmed} 裁剪 / ${group.blocked} 阻止`,
                className: group.blocked || group.trimmed ? 'is-trimmed' : 'is-active',
              })).join('')
            : '<div class="lineage-readable-empty">暂无世界书条目聚合</div>'}
        </section>
        <section class="lineage-readable-section">
          <h4>已注入</h4>
          ${renderEdgeList(graph, injectedEdges, '暂无实际注入边')}
        </section>
        <section class="lineage-readable-section">
          <h4>阻止 / 裁剪</h4>
          ${renderEdgeList(graph, blockedEdges, '暂无阻止或裁剪')}
        </section>
        <section class="lineage-readable-section">
          <h4>风险</h4>
          ${renderEdgeList(graph, riskEdges, '暂无风险边')}
        </section>
      </div>
      <div class="lineage-readable-note">
        ${renderBadge('scope', summary.scopeId)}
        ${renderBadge('mode', summary.mode)}
        ${renderBadge('节点', nodes.length)}
        ${renderBadge('边', edges.length)}
      </div>
    </div>
  `;
};

const collectPipelineItems = (graph = null) => {
  const nodes = nodeByIdMap(graph);
  const edges = listOf(graph?.edges);
  const rootId = normalizeString(graph?.rootId);
  const scopeNodes = listOf(graph?.nodes).filter(node => {
    const type = normalizeString(node?.type);
    return normalizeString(node?.id) === rootId
      || ['persona_card', 'private_chat', 'group_chat', 'moment', 'creative_session', 'forum_board', 'forum_thread', 'prompt'].includes(type);
  });
  const candidateEdges = edges.filter(edge => normalizeString(edge?.type) === 'candidate_for' || normalizeString(edge?.status) === 'candidate');
  const triggerEdges = edges.filter(edge => normalizeString(edge?.type) === 'triggers');
  const injectedEdges = edges.filter(edge => normalizeString(edge?.type) === 'injects' && normalizeString(edge?.status) === 'active');
  const blockedEdges = edges.filter(edge => ['blocked', 'trimmed', 'disabled'].includes(normalizeString(edge?.status)) || isRiskEdge(edge, graph?.scopeId));
  const toNodeCards = list => list.slice(0, 8).map(node => renderGraphCard({
    title: labelFor(NODE_TYPE_LABELS, node?.type),
    value: labelOfNode(node),
    hint: normalizeString(node?.scopeId) || normalizeString(graph?.scopeId) || 'default',
    className: `is-${normalizeString(node?.status) || 'unknown'}`,
    nodeId: normalizeString(node?.id),
  })).join('') || '<div class="lineage-readable-empty">暂无</div>';
  const toEdgeCards = (list, empty = '暂无') => renderEdgeList(graph, list, empty);
  return {
    scope: toNodeCards(scopeNodes),
    candidates: toEdgeCards(candidateEdges, '暂无候选来源'),
    triggers: toEdgeCards(triggerEdges, '暂无触发边'),
    injected: toEdgeCards(injectedEdges, '暂无注入边'),
    blocked: toEdgeCards(blockedEdges, '暂无阻止/裁剪/风险'),
  };
};

export const renderLineagePipelineHtml = (graph = null) => {
  const items = collectPipelineItems(graph);
  return `
    <div class="lineage-readable-view lineage-pipeline-view">
      <div class="lineage-pipeline-stage">
        <h4>当前范围</h4>
        ${items.scope}
      </div>
      <div class="lineage-pipeline-arrow">→</div>
      <div class="lineage-pipeline-stage">
        <h4>候选来源</h4>
        ${items.candidates}
      </div>
      <div class="lineage-pipeline-arrow">→</div>
      <div class="lineage-pipeline-stage">
        <h4>触发 / 筛选</h4>
        ${items.triggers}
      </div>
      <div class="lineage-pipeline-arrow">→</div>
      <div class="lineage-pipeline-stage">
        <h4>已注入</h4>
        ${items.injected}
      </div>
      <div class="lineage-pipeline-arrow">→</div>
      <div class="lineage-pipeline-stage is-risk-stage">
        <h4>阻止 / 裁剪 / 风险</h4>
        ${items.blocked}
      </div>
    </div>
  `;
};

export const renderLineageMapSceneHtml = (graph = null, options = {}) => {
  const model = buildLineageMapSceneModel(graph, options);
  if (!model.nodes.length) {
    return '<div class="lineage-graph-empty">暂无血缘图节点</div>';
  }
  const edgeHtml = model.edges.map((edge) => {
    const status = normalizeString(edge?.status) || 'unknown';
    const riskClass = edge?.isRisk ? ' is-risk' : '';
    const edgeAttr = edge?.edgeId ? ` data-lineage-edge-id="${escHtml(edge.edgeId)}"` : '';
    return `
      <path class="lineage-map-link is-${escHtml(status)}${riskClass}" d="${escHtml(edge?.path)}"${edgeAttr} />
    `;
  }).join('');
  const nodeHtml = model.nodes.map((node) => {
    const status = normalizeString(node?.status) || 'unknown';
    const attrs = [
      node.nodeId ? `data-lineage-node-id="${escHtml(node.nodeId)}"` : '',
      node.categoryId ? `data-lineage-map-category="${escHtml(node.categoryId)}"` : '',
      node.categoryId && model.expandedIds.includes(node.categoryId) ? 'data-lineage-expanded="true"' : '',
    ].filter(Boolean).join(' ');
    const style = `left:${Number(node.x).toFixed(1)}px;top:${Number(node.y).toFixed(1)}px;width:${Number(node.width).toFixed(1)}px;min-height:${Number(node.height).toFixed(1)}px;`;
    const count = node.count ? `<span class="lineage-map-count">${escHtml(node.count)}</span>` : '';
    return `
      <div class="lineage-map-node is-${escHtml(node.kind)} is-${escHtml(status)}" ${attrs} role="${node.nodeId || node.categoryId ? 'button' : 'img'}" tabindex="${node.nodeId || node.categoryId ? '0' : '-1'}" style="${escHtml(style)}">
        <span class="lineage-map-dot"></span>
        <span class="lineage-map-text">
          <strong>${escHtml(truncate(node.label, node.kind === 'root' ? 22 : 16))}</strong>
          ${node.meta ? `<small>${escHtml(truncate(node.meta, 18))}</small>` : ''}
        </span>
        ${count}
      </div>
    `;
  }).join('');
  return `
    <div class="lineage-map-scene" style="width:${Number(model.width)}px;height:${Number(model.height)}px;">
      <svg class="lineage-map-links" viewBox="0 0 ${Number(model.width)} ${Number(model.height)}" aria-hidden="true">
        ${edgeHtml}
      </svg>
      ${nodeHtml}
    </div>
  `;
};

export const buildLineageGraphViewModel = (graph = null, options = {}) => {
  const sourceGraph = graph && typeof graph === 'object' ? graph : {};
  const { nodes, edges } = buildVisibleGraph(sourceGraph, options);
  const rootId = normalizeString(sourceGraph.rootId);
  const nodeWidth = 190;
  const nodeHeight = 58;
  const columnGap = 94;
  const rowGap = 24;
  const marginX = 42;
  const marginY = 44;
  const columns = new Map();
  nodes.forEach((node) => {
    const column = getNodeColumn(node, rootId);
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  });
  columns.forEach(list => list.sort(compareNode));
  const positionedNodes = [];
  Array.from(columns.keys()).sort((a, b) => a - b).forEach((column) => {
    const list = columns.get(column) || [];
    list.forEach((node, index) => {
      positionedNodes.push({
        ...node,
        x: marginX + column * (nodeWidth + columnGap),
        y: marginY + index * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
        column,
      });
    });
  });
  const nodeById = new Map(positionedNodes.map(node => [normalizeString(node?.id), node]));
  const positionedEdges = edges
    .map((edge) => {
      const source = nodeById.get(normalizeString(edge?.source));
      const target = nodeById.get(normalizeString(edge?.target));
      if (!source || !target) return null;
      const sourceX = source.x + source.width;
      const sourceY = source.y + source.height / 2;
      const targetX = target.x;
      const targetY = target.y + target.height / 2;
      const delta = Math.max(48, Math.abs(targetX - sourceX) * 0.45);
      const c1x = sourceX + delta;
      const c2x = targetX - delta;
      const path = `M ${sourceX} ${sourceY} C ${c1x} ${sourceY}, ${c2x} ${targetY}, ${targetX} ${targetY}`;
      return {
        ...edge,
        path,
        labelX: (sourceX + targetX) / 2,
        labelY: (sourceY + targetY) / 2,
        isRisk: isRiskEdge(edge, sourceGraph.scopeId),
      };
    })
    .filter(Boolean);
  const width = Math.max(760, ...positionedNodes.map(node => node.x + node.width + marginX));
  const height = Math.max(420, ...positionedNodes.map(node => node.y + node.height + marginY));
  return {
    graph: sourceGraph,
    summary: summarizeLineageGraph(sourceGraph),
    statusFilter: normalizeString(options.statusFilter || 'all') || 'all',
    nodeTypeFilter: normalizeString(options.nodeTypeFilter || 'all') || 'all',
    nodes: positionedNodes,
    edges: positionedEdges,
    width,
    height,
    truncated: {
      nodes: listOf(sourceGraph?.nodes).length > positionedNodes.length,
      edges: listOf(sourceGraph?.edges).length > positionedEdges.length,
    },
  };
};

export const renderLineageGraphSvg = (model = null) => {
  const nodes = listOf(model?.nodes);
  const edges = listOf(model?.edges);
  if (!nodes.length && !edges.length) {
    return '<div class="lineage-graph-empty">暂无血缘图节点</div>';
  }
  const markerIds = ['active', 'candidate', 'blocked', 'trimmed', 'disabled', 'unknown', 'risk']
    .map(status => `lineage-arrow-${status}`);
  const defs = `
    <defs>
      ${markerIds.map((id) => `
        <marker id="${id}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" class="lineage-arrow-head ${id.replace('lineage-arrow-', 'is-')}" />
        </marker>
      `).join('')}
    </defs>
  `;
  const edgeHtml = edges.map((edge, index) => {
    const status = normalizeString(edge?.status) || 'unknown';
    const marker = edge?.isRisk ? 'risk' : status;
    const typeLabel = truncate(labelFor(EDGE_TYPE_LABELS, edge?.type), 8);
    return `
      <g class="lineage-edge is-${escHtml(status)}${edge?.isRisk ? ' is-risk' : ''}" data-lineage-edge-id="${escHtml(edge?.id || `edge-${index}`)}">
        <path d="${escHtml(edge?.path)}" marker-end="url(#lineage-arrow-${escHtml(marker)})" />
        <text x="${Number(edge?.labelX || 0).toFixed(1)}" y="${Number(edge?.labelY || 0).toFixed(1)}">${escHtml(typeLabel)}</text>
      </g>
    `;
  }).join('');
  const nodeHtml = nodes.map((node) => {
    const status = normalizeString(node?.status) || 'unknown';
    const label = truncate(node?.label || node?.id, 18);
    const type = truncate(labelFor(NODE_TYPE_LABELS, node?.type), 14);
    const scope = normalizeString(node?.scopeId);
    const graphScope = normalizeString(model?.graph?.scopeId);
    const isRisk = Boolean(scope && graphScope && scope !== graphScope);
    return `
      <g class="lineage-node is-${escHtml(status)}${isRisk ? ' is-risk' : ''}" data-lineage-node-id="${escHtml(node?.id)}" transform="translate(${Number(node?.x || 0).toFixed(1)} ${Number(node?.y || 0).toFixed(1)})">
        <rect width="${Number(node?.width || 190)}" height="${Number(node?.height || 58)}" rx="8" ry="8" />
        <circle cx="16" cy="17" r="5" />
        <text class="lineage-node-label" x="28" y="20">${escHtml(label)}</text>
        <text class="lineage-node-meta" x="14" y="42">${escHtml(type)} · ${escHtml(labelFor(STATUS_LABELS, status))}</text>
      </g>
    `;
  }).join('');
  return `
    <svg class="lineage-graph-svg" viewBox="0 0 ${Number(model?.width || 760)} ${Number(model?.height || 420)}" role="img" aria-label="上下文血缘节点图">
      ${defs}
      <g class="lineage-edge-layer">${edgeHtml}</g>
      <g class="lineage-node-layer">${nodeHtml}</g>
    </svg>
  `;
};

export const formatLineageNodeDetails = (node = null) => {
  if (!node || typeof node !== 'object') return '请选择一个节点或一条边查看详情。';
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const lines = [
    `节点：${normalizeString(node.label || node.id)}`,
    `类型：${labelFor(NODE_TYPE_LABELS, node.type)} (${normalizeString(node.type) || 'unknown'})`,
    `状态：${labelFor(STATUS_LABELS, node.status)} (${normalizeString(node.status) || 'unknown'})`,
    `scope：${normalizeString(node.scopeId) || 'default'}`,
    node.summary ? `摘要：${normalizeString(node.summary)}` : '',
    `id：${normalizeString(node.id)}`,
  ].filter(Boolean);
  const metaLines = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(', ') : (typeof value === 'object' ? JSON.stringify(value) : String(value));
      return `meta.${key}：${text}`;
    });
  return [...lines, ...metaLines].join('\n');
};

export const formatLineageEdgeDetails = (edge = null, graph = null) => {
  if (!edge || typeof edge !== 'object') return '请选择一个节点或一条边查看详情。';
  const nodes = listOf(graph?.nodes);
  const nodeById = new Map(nodes.map(node => [normalizeString(node?.id), node]));
  const labelOf = id => normalizeString(nodeById.get(normalizeString(id))?.label || id);
  const evidence = edge.evidence && typeof edge.evidence === 'object' ? edge.evidence : {};
  const budget = edge.budget && typeof edge.budget === 'object' ? edge.budget : {};
  const lines = [
    `边：${labelOf(edge.source)} → ${labelOf(edge.target)}`,
    `关系：${labelFor(EDGE_TYPE_LABELS, edge.type)} (${normalizeString(edge.type) || 'unknown'})`,
    `状态：${labelFor(STATUS_LABELS, edge.status)} (${normalizeString(edge.status) || 'unknown'})`,
    `原因：${normalizeString(edge.reason) || 'unknown'}`,
    Number.isFinite(Number(edge.score)) ? `分数：${Number(edge.score)}` : '',
    Number.isFinite(Number(edge.priority)) ? `优先级：${Number(edge.priority)}` : '',
    `sourceScope：${normalizeString(edge.sourceScopeId) || 'default'}`,
    `targetScope：${normalizeString(edge.targetScopeId) || 'default'}`,
    isCrossScopeEdge(edge, graph?.scopeId) ? '风险：跨角色卡 scope 边' : '',
    `id：${normalizeString(edge.id)}`,
  ].filter(Boolean);
  const evidenceLines = Object.entries(evidence)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(', ') : (typeof value === 'object' ? JSON.stringify(value) : String(value));
      return `evidence.${key}：${text}`;
    });
  const budgetLines = Object.entries(budget)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `budget.${key}：${value}`);
  return [...lines, ...evidenceLines, ...budgetLines].join('\n');
};

export const getLineageGraphItem = (graph = null, kind = '', id = '') => {
  const key = normalizeString(id);
  if (!key) return null;
  if (kind === 'edge') return listOf(graph?.edges).find(edge => normalizeString(edge?.id) === key) || null;
  return listOf(graph?.nodes).find(node => normalizeString(node?.id) === key) || null;
};

const makeMermaidIdMap = (nodes = []) => {
  const used = new Set();
  const map = new Map();
  nodes.forEach((node, index) => {
    const base = `N_${makeSvgId(node?.id || index)}`.slice(0, 48);
    let id = base;
    let suffix = 1;
    while (used.has(id)) {
      id = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(id);
    map.set(normalizeString(node?.id), id);
  });
  return map;
};

export const exportLineageGraphMermaid = (graph = null) => {
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const idMap = makeMermaidIdMap(nodes);
  const lines = [
    'flowchart LR',
    `%% scope: ${normalizeString(graph?.scopeId) || 'default'}, mode: ${normalizeString(graph?.mode) || 'unknown'}`,
  ];
  nodes.forEach((node) => {
    const id = idMap.get(normalizeString(node?.id));
    if (!id) return;
    const label = `${normalizeString(node?.label || node?.id)}\\n${labelFor(NODE_TYPE_LABELS, node?.type)}`;
    lines.push(`  ${id}["${label.replace(/"/g, '\\"')}"]`);
  });
  edges.forEach((edge) => {
    const source = idMap.get(normalizeString(edge?.source));
    const target = idMap.get(normalizeString(edge?.target));
    if (!source || !target) return;
    const label = [labelFor(EDGE_TYPE_LABELS, edge?.type), labelFor(STATUS_LABELS, edge?.status), normalizeString(edge?.reason)]
      .filter(Boolean)
      .join(' / ')
      .replace(/"/g, '\\"');
    lines.push(`  ${source} -->|"${label}"| ${target}`);
  });
  return lines.join('\n');
};

export const exportLineageGraphDot = (graph = null) => {
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const lines = [
    'digraph ContextLineageGraph {',
    '  rankdir=LR;',
    `  label="scope: ${normalizeString(graph?.scopeId) || 'default'} / mode: ${normalizeString(graph?.mode) || 'unknown'}";`,
  ];
  nodes.forEach((node) => {
    const id = makeSvgId(node?.id);
    const label = `${normalizeString(node?.label || node?.id)}\\n${labelFor(NODE_TYPE_LABELS, node?.type)}\\n${labelFor(STATUS_LABELS, node?.status)}`.replace(/"/g, '\\"');
    lines.push(`  "${id}" [label="${label}"];`);
  });
  edges.forEach((edge) => {
    const source = makeSvgId(edge?.source);
    const target = makeSvgId(edge?.target);
    const label = [labelFor(EDGE_TYPE_LABELS, edge?.type), labelFor(STATUS_LABELS, edge?.status), normalizeString(edge?.reason)]
      .filter(Boolean)
      .join(' / ')
      .replace(/"/g, '\\"');
    lines.push(`  "${source}" -> "${target}" [label="${label}"];`);
  });
  lines.push('}');
  return lines.join('\n');
};

const nodeMatchesQuery = (node = {}, query = '') => {
  const q = normalizeString(query).toLowerCase();
  if (!q) return false;
  return [
    node?.id,
    node?.label,
    node?.type,
    node?.summary,
    node?.meta?.sessionId,
    node?.meta?.contactId,
    node?.meta?.worldId,
    node?.meta?.entryId,
  ].some(value => normalizeString(value).toLowerCase().includes(q));
};

const formatPathText = (path = {}, nodeById = new Map()) => {
  const parts = [];
  listOf(path.edges).forEach((edge, index) => {
    const source = index === 0 ? normalizeString(edge?.source) : '';
    if (source) parts.push(normalizeString(nodeById.get(source)?.label || source));
    parts.push(`${labelFor(EDGE_TYPE_LABELS, edge?.type)}(${labelFor(STATUS_LABELS, edge?.status)}:${normalizeString(edge?.reason) || 'unknown'})`);
    parts.push(normalizeString(nodeById.get(normalizeString(edge?.target))?.label || edge?.target));
  });
  return parts.join(' -> ');
};

export const findLineagePaths = (graph = null, {
  query = '',
  targetId = '',
  maxDepth = 7,
  maxPaths = 8,
} = {}) => {
  const nodes = listOf(graph?.nodes);
  const edges = listOf(graph?.edges);
  const nodeById = new Map(nodes.map(node => [normalizeString(node?.id), node]));
  const resolvedTargetId = normalizeString(targetId || graph?.rootId);
  const normalizedQuery = normalizeString(query);
  const riskSources = new Set(
    edges
      .filter(edge => isRiskEdge(edge, graph?.scopeId))
      .map(edge => normalizeString(edge?.source))
      .filter(Boolean)
  );
  const startNodes = nodes.filter((node) => {
    const id = normalizeString(node?.id);
    if (!id || id === resolvedTargetId) return false;
    if (normalizedQuery) return nodeMatchesQuery(node, normalizedQuery);
    return riskSources.has(id);
  });
  const outEdges = new Map();
  edges.forEach((edge) => {
    const source = normalizeString(edge?.source);
    const target = normalizeString(edge?.target);
    if (!source || !target) return;
    if (!outEdges.has(source)) outEdges.set(source, []);
    outEdges.get(source).push(edge);
  });
  const paths = [];
  const depthLimit = Math.max(1, Math.trunc(Number(maxDepth) || 7));
  const pathLimit = Math.max(1, Math.trunc(Number(maxPaths) || 8));
  const visit = (nodeId, pathEdges = [], visited = new Set()) => {
    if (paths.length >= pathLimit) return;
    if (pathEdges.length > depthLimit) return;
    if (nodeId === resolvedTargetId && pathEdges.length) {
      paths.push({
        startId: normalizeString(pathEdges[0]?.source),
        targetId: resolvedTargetId,
        edges: pathEdges.slice(),
        text: formatPathText({ edges: pathEdges }, nodeById),
      });
      return;
    }
    if (visited.has(nodeId)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const nextEdges = outEdges.get(nodeId) || [];
    nextEdges.forEach((edge) => {
      const target = normalizeString(edge?.target);
      if (!target) return;
      visit(target, [...pathEdges, edge], nextVisited);
    });
  };
  startNodes.forEach((node) => {
    if (paths.length >= pathLimit) return;
    visit(normalizeString(node?.id), [], new Set());
  });
  return {
    query: normalizedQuery,
    targetId: resolvedTargetId,
    paths,
    startCount: startNodes.length,
  };
};

export const detectLineageCycles = (graph = null, { maxCycles = 8 } = {}) => {
  const edges = listOf(graph?.edges);
  const outEdges = new Map();
  edges.forEach((edge) => {
    const source = normalizeString(edge?.source);
    const target = normalizeString(edge?.target);
    if (!source || !target) return;
    if (!outEdges.has(source)) outEdges.set(source, []);
    outEdges.get(source).push(edge);
  });
  const cycles = [];
  const limit = Math.max(1, Math.trunc(Number(maxCycles) || 8));
  const dfs = (nodeId, stack = [], seen = new Set()) => {
    if (cycles.length >= limit) return;
    if (seen.has(nodeId)) {
      const start = stack.findIndex(edge => normalizeString(edge?.source) === nodeId);
      if (start >= 0) cycles.push(stack.slice(start));
      return;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(nodeId);
    (outEdges.get(nodeId) || []).forEach(edge => dfs(normalizeString(edge?.target), [...stack, edge], nextSeen));
  };
  Array.from(outEdges.keys()).forEach(nodeId => dfs(nodeId));
  return cycles.slice(0, limit).map(edgesInCycle => ({
    edges: edgesInCycle,
    text: edgesInCycle.map(edge => `${normalizeString(edge?.source)} -> ${normalizeString(edge?.target)}`).join(' -> '),
  }));
};

export const formatLineagePathDiagnostics = (result = null, graph = null) => {
  const paths = listOf(result?.paths);
  const cycles = detectLineageCycles(graph, { maxCycles: 3 });
  const header = normalizeString(result?.query)
    ? `路径诊断：${normalizeString(result.query)} -> ${normalizeString(result?.targetId) || 'root'}`
    : `风险路径诊断 -> ${normalizeString(result?.targetId) || 'root'}`;
  const lines = [
    header,
    `起点候选：${Number(result?.startCount || 0)}`,
    `路径数量：${paths.length}`,
  ];
  if (!paths.length) {
    lines.push('未找到可达路径。');
  } else {
    paths.forEach((path, index) => {
      lines.push(`${index + 1}. ${path.text || formatPathText(path, new Map(listOf(graph?.nodes).map(node => [normalizeString(node?.id), node])))}`);
    });
  }
  if (cycles.length) {
    lines.push('', `循环关系：${cycles.length}`);
    cycles.forEach((cycle, index) => lines.push(`${index + 1}. ${cycle.text}`));
  }
  return lines.join('\n');
};
