export function mountNodeEditorCoreImpl(context, { entry, block, markRefDirty } = {}, deps = {}) {
    const {
        genNodeId,
        genEdgeId,
        sanitizeNodeId,
        normalizeNodeType,
        normalizeLogicValue,
        normalizeRightTypeValue,
        parseTypedValue,
        stringifyTypedValue,
        buildNodeDefineSpec,
        getNodePortSpec,
        normalizeGraphNodeData,
        normalizeGraphNode,
        normalizeGraphEdge,
        isConditionLogicNode,
        autoLayoutNodeGraph,
        buildNodeGraphFromWhen,
        normalizeNodeGraph,
        buildWhenFromNodeGraph,
        normalizePromptClause,
        isConditionTreeGroup,
        createDefaultPromptClause,
        normalizeConditionTree,
        getPrimaryClauseFromConditionTree,
        visitConditionTree,
        buildVariableContext,
        explainConditionTree,
        BLOCK_OP_OPTIONS,
        BLOCK_RIGHT_TYPE_OPTIONS,
        NODE_LOGIC_OPTIONS,
        NODE_CANVAS_MIN_WIDTH,
        NODE_CANVAS_MIN_HEIGHT,
        NODE_CANVAS_PADDING_X,
        NODE_CANVAS_PADDING_Y,
        deepClone,
        escapeHtml,
        clamp,
    } = deps || {};

    return (function mountNodeEditorCoreInner({ entry, block, markRefDirty } = {}) {
        const nodeEditorEl = this.editorEl?.querySelector('#we-node-editor');
        const nodeCanvasWrap = this.editorEl?.querySelector('#we-node-canvas-wrap');
        const nodeSceneEl = this.editorEl?.querySelector('#we-node-scene');
        const nodeCanvasEl = this.editorEl?.querySelector('#we-node-canvas');
        const nodeLinksEl = this.editorEl?.querySelector('#we-node-links');
        const nodeGuidesEl = this.editorEl?.querySelector('#we-node-guides');
        const nodeStatusEl = this.editorEl?.querySelector('#we-node-status');
        const nodeMarqueeEl = this.editorEl?.querySelector('#we-node-marquee');
        const contextMenuEl = this.editorEl?.querySelector('#we-node-context-menu');
        const nodeInspectorEl = this.editorEl?.querySelector('#we-node-inspector');
        if (!nodeEditorEl || !nodeCanvasWrap || !nodeSceneEl || !nodeCanvasEl || !nodeLinksEl || !nodeGuidesEl || !nodeStatusEl || !nodeMarqueeEl || !contextMenuEl || !nodeInspectorEl || !block) return;
        const initialFocusState = this.consumeBlockEditorFocus(block?.id);

        let graph = this.ensureBlockNodeGraph(block);
        if (!graph) return;
        let activeDrag = null;
        let activeLink = null;
        let activePan = null;
        let activeMarquee = null;
        let previewPoint = null;
        let spacePressed = false;
        let sceneWidth = NODE_CANVAS_MIN_WIDTH;
        let sceneHeight = NODE_CANVAS_MIN_HEIGHT;
        let zoom = clamp(Number(graph?.viewport?.zoom || 1), 0.55, 1.8);
        let lastNodeSelectOpenAt = 0;
        let lastNodeSelectAnchor = null;
        let lastNodeSelectEventType = '';
        const selectedNodeIds = new Set();
        const LINK_SNAP_DISTANCE = 36;
        const NODE_GRID_SIZE = 16;
        const AUTO_SCROLL_EDGE = 54;
        const AUTO_SCROLL_MAX_STEP = 20;
        const ALIGN_SNAP_THRESHOLD = 10;
        let activeGuides = { vertical: null, horizontal: null };
        let runtimeContextCache = null;
        let runtimePathStateCache = null;
        const runtimeSummaryCache = new Map();
        let focusPulseToken = 0;
        let focusPulseTimer = null;
        const focusPulseNodeIds = new Set();

        const getNodeById = (nodeId) => {
            const id = String(nodeId || '').trim();
            if (!id) return null;
            return (graph.nodes || []).find(node => String(node.id || '') === id) || null;
        };
        const getIncomingEdges = (nodeId) => (graph.edges || []).filter(edge => edge.to === nodeId);
        const getOutgoingEdges = (nodeId) => (graph.edges || []).filter(edge => edge.from === nodeId);
        const getResultNode = () => (graph.nodes || []).find(node => node.type === 'result') || null;
        const getEdgeKey = (edge = {}) => {
            const rawId = String(edge?.id || '').trim();
            if (rawId) return rawId;
            return `${String(edge?.from || '')}:${String(edge?.fromPort || '')}->${String(edge?.to || '')}:${String(edge?.toPort || '')}`;
        };
        const resetRuntimeCaches = () => {
            runtimeContextCache = null;
            runtimePathStateCache = null;
            runtimeSummaryCache.clear();
        };
        const getRuntimeContext = () => {
            if (!runtimeContextCache) {
                runtimeContextCache = this.getConditionRuntimeContext();
            }
            return runtimeContextCache;
        };
        const getFinalSourceNodeId = () => {
            const resultNode = getResultNode();
            if (!resultNode) return '';
            const edge = (graph.edges || []).find(item => item.to === resultNode.id && item.toPort === 'in');
            return String(edge?.from || '').trim();
        };
        const getConnectionIssue = (fromNodeOrId, fromPort, toNodeOrId, toPort) => {
            const fromNode = typeof fromNodeOrId === 'object' ? fromNodeOrId : getNodeById(fromNodeOrId);
            const toNode = typeof toNodeOrId === 'object' ? toNodeOrId : getNodeById(toNodeOrId);
            if (!fromNode || !toNode) return '连接节点不存在';
            if (String(fromNode.id || '') === String(toNode.id || '')) return '节点不能连接到自身';
            const fromType = normalizeNodeType(fromNode.type);
            const toType = normalizeNodeType(toNode.type);
            const fromPorts = getNodePortSpec(fromNode).outputs;
            const toPorts = getNodePortSpec(toNode).inputs;
            if (!fromPorts.includes(fromPort)) return '起点端口不是输出端口';
            if (!toPorts.includes(toPort)) return '目标端口不是输入端口';
            if (fromType === 'variable') {
                if (toType !== 'compare' || toPort !== 'left') return '变量节点只能连到比较节点左侧';
                return '';
            }
            if (fromType === 'value') {
                if (toType !== 'compare' || toPort !== 'right') return '值节点只能连到比较节点右侧';
                return '';
            }
            if (fromType === 'compare' || fromType === 'logic') {
                if (toType === 'logic') return '';
                if (toType === 'result' && toPort === 'in') return '';
                return '条件结果只能连到逻辑节点或最终条件';
            }
            return '当前节点类型不支持这样连接';
        };
        const setFinalNode = (nodeId = '') => {
            const id = String(nodeId || '').trim();
            if (!id) return false;
            const node = getNodeById(id);
            const resultNode = getResultNode();
            if (!node || !resultNode || node.type === 'result') return false;
            graph.edges = (graph.edges || []).filter(edge => !(edge.to === resultNode.id && edge.toPort === 'in'));
            graph.edges.push({
                id: genEdgeId(),
                from: id,
                fromPort: 'out',
                to: resultNode.id,
                toPort: 'in',
            });
            return true;
        };
        const getActivePathState = () => {
            const nodeIds = new Set();
            const edgeIds = new Set();
            const stack = [];
            const resultNode = getResultNode();
            if (resultNode) stack.push(resultNode.id);
            while (stack.length) {
                const currentId = String(stack.pop() || '').trim();
                if (!currentId || nodeIds.has(currentId)) continue;
                nodeIds.add(currentId);
                getIncomingEdges(currentId).forEach((edge) => {
                    if (!edge?.from) return;
                    edgeIds.add(getEdgeKey(edge));
                    stack.push(edge.from);
                });
            }
            return { nodeIds, edgeIds };
        };
        const getNodeIssueState = (node) => {
            if (!node) return { level: '', issues: [] };
            const activePathState = getActivePathState();
            const activeNodeIds = activePathState.nodeIds;
            const issues = [];
            const incoming = getIncomingEdges(node.id);
            const outgoing = getOutgoingEdges(node.id);
            const type = normalizeNodeType(node.type);
            const data = node.data || {};
            if (!activeNodeIds.has(node.id)) {
                issues.push('未接入当前生效链路');
                return { level: 'danger', issues };
            }
            if (type === 'variable') {
                if (!String(data.path || '').trim()) issues.push('未选择变量');
            } else if (type === 'value') {
                if (!String(data.value || '').trim()) issues.push('未填写比较值');
            } else if (type === 'compare') {
                const hasLeft = incoming.some(edge => edge.toPort === 'left');
                const hasRight = incoming.some(edge => edge.toPort === 'right');
                const op = String(data.op || '>').trim().toLowerCase();
                if (!hasLeft) issues.push('缺少左值输入');
                if (!['is_empty', 'not_empty'].includes(op) && !hasRight) issues.push('缺少右值输入');
            } else if (type === 'logic') {
                const inputPorts = getNodePortSpec(node).inputs;
                const connectedCount = inputPorts.filter(port => incoming.some(edge => edge.toPort === port)).length;
                const logic = normalizeLogicValue(data.logic);
                const minRequired = logic === 'not' ? 1 : 2;
                if (connectedCount < minRequired) issues.push('输入条件不足');
            } else if (type === 'result') {
                if (!incoming.length) issues.push('没有生效条件');
            }
            incoming.forEach((edge) => {
                const reason = getConnectionIssue(edge.from, edge.fromPort, node, edge.toPort);
                if (reason) issues.push(reason);
            });
            outgoing.forEach((edge) => {
                const reason = getConnectionIssue(node, edge.fromPort, edge.to, edge.toPort);
                if (reason) issues.push(reason);
            });
            return {
                level: issues.length ? 'warn' : '',
                issues: [...new Set(issues)],
            };
        };
        const persistGraph = ({ syncWhen = true } = {}) => {
            graph.viewport = { x: 0, y: 0, zoom };
            graph = normalizeNodeGraph(graph, block.when, this.ensureBlockPrimaryClause(block));
            graph.viewport.zoom = zoom;
            block.nodeGraph = graph;
            if (syncWhen) this.syncBlockWhenFromNodeGraph(block, graph);
            if (typeof markRefDirty === 'function') markRefDirty();
        };
        const hideContextMenu = () => {
            contextMenuEl.innerHTML = '';
            contextMenuEl.style.display = 'none';
        };
        const applyViewport = () => {
            const scaledWidth = Math.ceil(sceneWidth * zoom);
            const scaledHeight = Math.ceil(sceneHeight * zoom);
            nodeSceneEl.style.width = `${scaledWidth}px`;
            nodeSceneEl.style.height = `${scaledHeight}px`;
            nodeCanvasEl.style.width = `${sceneWidth}px`;
            nodeCanvasEl.style.height = `${sceneHeight}px`;
            nodeLinksEl.style.width = `${sceneWidth}px`;
            nodeLinksEl.style.height = `${sceneHeight}px`;
            nodeGuidesEl.style.width = `${sceneWidth}px`;
            nodeGuidesEl.style.height = `${sceneHeight}px`;
            const useTransform = Math.abs(zoom - 1) > 0.001;
            nodeCanvasEl.style.transform = useTransform ? `scale(${zoom})` : '';
            nodeLinksEl.style.transform = useTransform ? `scale(${zoom})` : '';
            nodeGuidesEl.style.transform = useTransform ? `scale(${zoom})` : '';
            nodeCanvasEl.style.transformOrigin = '0 0';
            nodeLinksEl.style.transformOrigin = '0 0';
            nodeGuidesEl.style.transformOrigin = '0 0';
        };
        const setZoom = (nextZoom) => {
            zoom = clamp(Number(nextZoom || 1), 0.55, 1.8);
            persistGraph({ syncWhen: false });
            renderScene();
        };
        const getViewCenter = () => {
            const x = (nodeCanvasWrap.scrollLeft + (nodeCanvasWrap.clientWidth / 2)) / zoom;
            const y = (nodeCanvasWrap.scrollTop + (nodeCanvasWrap.clientHeight / 2)) / zoom;
            return { x: Math.max(24, x - 90), y: Math.max(24, y - 50) };
        };
        const getNodeClampBounds = () => ({
            maxX: Math.max(24, sceneWidth - 170),
            maxY: Math.max(24, sceneHeight - 70),
        });
        const snapToGrid = (value) => Math.round(Number(value || 0) / NODE_GRID_SIZE) * NODE_GRID_SIZE;
        const normalizeNodePoint = (x, y) => {
            const { maxX, maxY } = getNodeClampBounds();
            return {
                x: clamp(snapToGrid(x), 0, maxX),
                y: clamp(snapToGrid(y), 0, maxY),
            };
        };
        const getNodeMetrics = (node) => {
            const id = String(node?.id || '').trim();
            const el = id ? nodeCanvasEl.querySelector(`.world-node-item[data-node-id="${id}"]`) : null;
            const width = Math.max(172, Math.round(el?.offsetWidth || 172));
            const height = Math.max(70, Math.round(el?.offsetHeight || 88));
            const x = Number(node?.x || 0);
            const y = Number(node?.y || 0);
            return {
                x,
                y,
                width,
                height,
                left: x,
                centerX: x + (width / 2),
                right: x + width,
                top: y,
                centerY: y + (height / 2),
                bottom: y + height,
            };
        };
        const tidyNodes = (nodes = []) => {
            const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
            if (!list.length) return;
            const { maxX, maxY } = getNodeClampBounds();
            const occupied = new Set();
            [...list]
                .sort((a, b) => {
                    const yDelta = Number(a?.y || 0) - Number(b?.y || 0);
                    if (yDelta !== 0) return yDelta;
                    return Number(a?.x || 0) - Number(b?.x || 0);
                })
                .forEach((node) => {
                    let x = clamp(snapToGrid(node.x), 0, maxX);
                    let y = clamp(snapToGrid(node.y), 0, maxY);
                    let guard = 0;
                    while (occupied.has(`${x}:${y}`) && guard < 12) {
                        y = clamp(y + NODE_GRID_SIZE, 0, maxY);
                        guard += 1;
                    }
                    node.x = x;
                    node.y = y;
                    occupied.add(`${x}:${y}`);
                });
        };
        const arrangeSelectedNodes = (nodes = []) => {
            const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
            if (!list.length) return;
            const selectedIds = new Set(list.map(node => String(node?.id || '')).filter(Boolean));
            const inDegree = new Map();
            const layerMap = new Map();
            list.forEach((node) => inDegree.set(String(node.id), 0));
            (graph.edges || []).forEach((edge) => {
                const from = String(edge.from || '');
                const to = String(edge.to || '');
                if (!selectedIds.has(from) || !selectedIds.has(to)) return;
                inDegree.set(to, (inDegree.get(to) || 0) + 1);
            });
            const typeRank = (node) => {
                const type = normalizeNodeType(node?.type);
                if (type === 'variable' || type === 'value') return 0;
                if (type === 'compare') return 1;
                if (type === 'logic') return 2;
                return 3;
            };
            const queue = list
                .filter(node => (inDegree.get(String(node.id)) || 0) === 0)
                .sort((a, b) => typeRank(a) - typeRank(b) || Number(a.x || 0) - Number(b.x || 0));
            if (!queue.length) {
                list.forEach((node) => layerMap.set(String(node.id), typeRank(node)));
            } else {
                queue.forEach((node) => layerMap.set(String(node.id), typeRank(node)));
                while (queue.length) {
                    const current = queue.shift();
                    const currentId = String(current?.id || '');
                    const currentLayer = Number(layerMap.get(currentId) || 0);
                    (graph.edges || []).forEach((edge) => {
                        if (String(edge.from || '') !== currentId) return;
                        const to = String(edge.to || '');
                        if (!selectedIds.has(to)) return;
                        const nextLayer = Math.max(currentLayer + 1, typeRank(getNodeById(to)));
                        if (!layerMap.has(to) || nextLayer > layerMap.get(to)) {
                            layerMap.set(to, nextLayer);
                        }
                        inDegree.set(to, Math.max(0, (inDegree.get(to) || 0) - 1));
                        if ((inDegree.get(to) || 0) === 0) queue.push(getNodeById(to));
                    });
                }
            }
            const bounds = list.reduce((acc, node) => {
                acc.minX = Math.min(acc.minX, Number(node.x || 0));
                acc.minY = Math.min(acc.minY, Number(node.y || 0));
                return acc;
            }, { minX: Infinity, minY: Infinity });
            const base = normalizeNodePoint(Number.isFinite(bounds.minX) ? bounds.minX : 24, Number.isFinite(bounds.minY) ? bounds.minY : 24);
            const columns = new Map();
            list.forEach((node) => {
                const layer = Number(layerMap.get(String(node.id)) || 0);
                if (!columns.has(layer)) columns.set(layer, []);
                columns.get(layer).push(node);
            });
            [...columns.entries()]
                .sort((a, b) => a[0] - b[0])
                .forEach(([layer, nodesInLayer]) => {
                    nodesInLayer
                        .sort((a, b) => typeRank(a) - typeRank(b) || Number(a.y || 0) - Number(b.y || 0))
                        .forEach((node, index) => {
                            const point = normalizeNodePoint(base.x + (layer * 240), base.y + (index * 128));
                            node.x = point.x;
                            node.y = point.y;
                        });
                });
            tidyNodes(list);
        };
        const renderGuides = () => {
            if (!nodeGuidesEl) return;
            const lines = [];
            if (activeGuides.vertical && Number.isFinite(activeGuides.vertical.x)) {
                lines.push(`<div class="world-node-guide is-vertical" style="left:${Math.round(activeGuides.vertical.x)}px; top:0; height:${sceneHeight}px;"></div>`);
            }
            if (activeGuides.horizontal && Number.isFinite(activeGuides.horizontal.y)) {
                lines.push(`<div class="world-node-guide is-horizontal" style="top:${Math.round(activeGuides.horizontal.y)}px; left:0; width:${sceneWidth}px;"></div>`);
            }
            nodeGuidesEl.innerHTML = lines.join('');
        };
        const renderNodeStatus = () => {
            if (!nodeStatusEl) return;
            let text = '拖动节点标题可移动；拖端口可连线；双击或 Alt+单击连线可删除。';
            let tone = 'muted';
            if (activeLink?.mode === 'from-output') {
                const sourceLabel = getPortDisplayLabel(activeLink.fromNodeId, activeLink.fromPort, 'output');
                if (activeLink.hoverTarget?.valid) {
                    const targetLabel = getPortDisplayLabel(activeLink.hoverTarget.nodeId, activeLink.hoverTarget.port, 'input');
                    text = `释放以连接：${sourceLabel} -> ${targetLabel}`;
                    tone = 'success';
                } else if (activeLink.hoverTarget?.issue) {
                    text = activeLink.hoverTarget.issue;
                    tone = 'warn';
                } else {
                    const fromType = normalizeNodeType(getNodeById(activeLink.fromNodeId)?.type);
                    if (fromType === 'variable') text = '拖到比较节点左侧“变量”输入口。';
                    else if (fromType === 'value') text = '拖到比较节点右侧“值”输入口。';
                    else text = '拖到逻辑节点输入口，或接入最终条件主链路。';
                }
            } else if (activeLink?.mode === 'to-input') {
                const targetLabel = getPortDisplayLabel(activeLink.toNodeId, activeLink.toPort, 'input');
                if (activeLink.hoverTarget?.valid) {
                    const sourceLabel = getPortDisplayLabel(activeLink.hoverTarget.nodeId, activeLink.hoverTarget.port, 'output');
                    text = `释放以连接：${sourceLabel} -> ${targetLabel}`;
                    tone = 'success';
                } else if (activeLink.hoverTarget?.issue) {
                    text = activeLink.hoverTarget.issue;
                    tone = 'warn';
                } else {
                    text = `为 ${targetLabel} 选择一个合法来源。`;
                }
            } else if (selectedNodeIds.size) {
                text = `已选中 ${selectedNodeIds.size} 个节点，可拖动、复制、整理或设为最终条件。`;
            }
            nodeStatusEl.dataset.tone = tone;
            nodeStatusEl.textContent = text;
        };
        const focusNodes = (nodes = []) => {
            const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
            if (!list.length) return;
            const metricsList = list.map(node => getNodeMetrics(node));
            const bounds = metricsList.reduce((acc, metrics) => ({
                minX: Math.min(acc.minX, metrics.left),
                minY: Math.min(acc.minY, metrics.top),
                maxX: Math.max(acc.maxX, metrics.right),
                maxY: Math.max(acc.maxY, metrics.bottom),
            }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
            const padding = 72;
            const width = Math.max(220, bounds.maxX - bounds.minX);
            const height = Math.max(140, bounds.maxY - bounds.minY);
            const wrapWidth = Math.max(240, nodeCanvasWrap.clientWidth - padding);
            const wrapHeight = Math.max(180, nodeCanvasWrap.clientHeight - padding);
            zoom = clamp(Math.min(wrapWidth / width, wrapHeight / height), 0.55, 1.8);
            persistGraph({ syncWhen: false });
            renderScene();
            requestAnimationFrame(() => {
                const centerX = ((bounds.minX + bounds.maxX) / 2) * zoom;
                const centerY = ((bounds.minY + bounds.maxY) / 2) * zoom;
                nodeCanvasWrap.scrollLeft = Math.max(0, centerX - (nodeCanvasWrap.clientWidth / 2));
                nodeCanvasWrap.scrollTop = Math.max(0, centerY - (nodeCanvasWrap.clientHeight / 2));
            });
        };
        const startFocusPulse = (nodeIds = [], durationMs = 1300) => {
            const ids = (Array.isArray(nodeIds) ? nodeIds : [])
                .map(nodeId => String(nodeId || '').trim())
                .filter(Boolean);
            focusPulseNodeIds.clear();
            ids.forEach((nodeId) => focusPulseNodeIds.add(nodeId));
            if (focusPulseTimer) {
                clearTimeout(focusPulseTimer);
                focusPulseTimer = null;
            }
            if (!focusPulseNodeIds.size) return;
            const token = ++focusPulseToken;
            renderScene();
            focusPulseTimer = setTimeout(() => {
                if (token !== focusPulseToken) return;
                focusPulseNodeIds.clear();
                focusPulseTimer = null;
                renderScene();
            }, Math.max(320, Number(durationMs || 0)));
        };
        const scrollCanvasForPointer = (clientX, clientY) => {
            const rect = nodeCanvasWrap.getBoundingClientRect();
            let dx = 0;
            let dy = 0;
            if (clientX > rect.right - AUTO_SCROLL_EDGE) {
                dx = Math.ceil(((clientX - (rect.right - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_STEP);
            } else if (clientX < rect.left + AUTO_SCROLL_EDGE) {
                dx = -Math.ceil((((rect.left + AUTO_SCROLL_EDGE) - clientX) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_STEP);
            }
            if (clientY > rect.bottom - AUTO_SCROLL_EDGE) {
                dy = Math.ceil(((clientY - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_STEP);
            } else if (clientY < rect.top + AUTO_SCROLL_EDGE) {
                dy = -Math.ceil((((rect.top + AUTO_SCROLL_EDGE) - clientY) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_STEP);
            }
            if (!dx && !dy) return { dx: 0, dy: 0 };
            const maxLeft = Math.max(0, nodeCanvasWrap.scrollWidth - nodeCanvasWrap.clientWidth);
            const maxTop = Math.max(0, nodeCanvasWrap.scrollHeight - nodeCanvasWrap.clientHeight);
            const nextLeft = clamp(nodeCanvasWrap.scrollLeft + dx, 0, maxLeft);
            const nextTop = clamp(nodeCanvasWrap.scrollTop + dy, 0, maxTop);
            const movedX = nextLeft - nodeCanvasWrap.scrollLeft;
            const movedY = nextTop - nodeCanvasWrap.scrollTop;
            if (movedX) nodeCanvasWrap.scrollLeft = nextLeft;
            if (movedY) nodeCanvasWrap.scrollTop = nextTop;
            return { dx: movedX, dy: movedY };
        };
        const resolveDragAlignment = (origins, dx, dy) => {
            const selectedIds = new Set(origins.keys());
            const movingNodes = [...origins.keys()].map(id => getNodeById(id)).filter(Boolean);
            const staticNodes = (graph.nodes || []).filter(node => !selectedIds.has(String(node.id || '')) && node.type !== 'result');
            if (!movingNodes.length || !staticNodes.length) {
                activeGuides = { vertical: null, horizontal: null };
                return { dx, dy };
            }
            let bestX = null;
            let bestY = null;
            movingNodes.forEach((node) => {
                const origin = origins.get(node.id);
                if (!origin) return;
                const baseMetrics = getNodeMetrics({ ...node, x: origin.x, y: origin.y });
                const movingMetrics = {
                    left: baseMetrics.left + dx,
                    centerX: baseMetrics.centerX + dx,
                    right: baseMetrics.right + dx,
                    top: baseMetrics.top + dy,
                    centerY: baseMetrics.centerY + dy,
                    bottom: baseMetrics.bottom + dy,
                };
                staticNodes.forEach((other) => {
                    const otherMetrics = getNodeMetrics(other);
                    [['left', 'left'], ['centerX', 'centerX'], ['right', 'right']].forEach(([fromKey, toKey]) => {
                        const delta = otherMetrics[toKey] - movingMetrics[fromKey];
                        if (Math.abs(delta) > ALIGN_SNAP_THRESHOLD) return;
                        if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
                            bestX = { delta, x: otherMetrics[toKey] };
                        }
                    });
                    [['top', 'top'], ['centerY', 'centerY'], ['bottom', 'bottom']].forEach(([fromKey, toKey]) => {
                        const delta = otherMetrics[toKey] - movingMetrics[fromKey];
                        if (Math.abs(delta) > ALIGN_SNAP_THRESHOLD) return;
                        if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
                            bestY = { delta, y: otherMetrics[toKey] };
                        }
                    });
                });
            });
            activeGuides = {
                vertical: bestX ? { x: bestX.x } : null,
                horizontal: bestY ? { y: bestY.y } : null,
            };
            return {
                dx: dx + (bestX?.delta || 0),
                dy: dy + (bestY?.delta || 0),
            };
        };
        const getNodeLabel = (node) => {
            const type = normalizeNodeType(node?.type);
            if (type === 'variable') return '变量';
            if (type === 'value') return '值';
            if (type === 'compare') return '比较';
            if (type === 'logic') return '逻辑';
            return '最终条件';
        };
        const getPortLabel = (node, direction, port) => {
            const type = normalizeNodeType(node?.type);
            if (type === 'compare' && direction === 'input') {
                if (port === 'left') return '变量';
                if (port === 'right') return '值';
            }
            if (type === 'compare' && direction === 'output' && port === 'out') return '结果';
            if (type === 'variable' && direction === 'output' && port === 'out') return '变量';
            if (type === 'value' && direction === 'output' && port === 'out') return '值';
            return '';
        };
        const getPortDisplayLabel = (nodeId, port, direction) => {
            const node = getNodeById(nodeId);
            if (!node) return '端口';
            const nodeLabel = getNodeLabel(node);
            const portLabel = getPortLabel(node, direction, port);
            return portLabel ? `${nodeLabel}·${portLabel}` : nodeLabel;
        };
        const findPortEl = (nodeId, port, direction) => nodeCanvasEl.querySelector(
            `.world-node-port[data-node-id="${nodeId}"][data-port="${port}"][data-direction="${direction}"]`,
        );
        const clientToCanvasPoint = (clientX, clientY) => {
            const canvasRect = nodeCanvasEl.getBoundingClientRect();
            return {
                x: (clientX - canvasRect.left) / zoom,
                y: (clientY - canvasRect.top) / zoom,
            };
        };
        const portCenter = (nodeId, port, direction) => {
            const portEl = findPortEl(nodeId, port, direction);
            if (!portEl) return null;
            const portRect = portEl.getBoundingClientRect();
            const canvasRect = nodeCanvasEl.getBoundingClientRect();
            return {
                x: (portRect.left - canvasRect.left + (portRect.width / 2)) / zoom,
                y: (portRect.top - canvasRect.top + (portRect.height / 2)) / zoom,
            };
        };
        const curvePath = (sx, sy, tx, ty) => {
            const dx = Math.max(56, Math.abs(tx - sx) * 0.45);
            return `M${sx} ${sy} C${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
        };
        const getInputTargetFromEl = (portEl) => {
            if (!portEl?.matches?.('.world-node-port.is-input')) return null;
            const nodeId = String(portEl.dataset.nodeId || '').trim();
            const port = String(portEl.dataset.port || '').trim();
            if (!nodeId || !port) return null;
            const fromNode = activeLink?.mode === 'from-output'
                ? getNodeById(activeLink?.fromNodeId)
                : null;
            const issue = activeLink?.mode === 'from-output' && fromNode
                ? getConnectionIssue(fromNode, activeLink.fromPort, nodeId, port)
                : '';
            return {
                nodeId,
                port,
                issue,
                valid: !issue,
                center: portCenter(nodeId, port, 'input'),
            };
        };
        const getOutputTargetFromEl = (portEl) => {
            if (!portEl?.matches?.('.world-node-port.is-output')) return null;
            const nodeId = String(portEl.dataset.nodeId || '').trim();
            const port = String(portEl.dataset.port || '').trim();
            if (!nodeId || !port) return null;
            const toNode = activeLink?.mode === 'to-input'
                ? getNodeById(activeLink?.toNodeId)
                : null;
            const issue = activeLink?.mode === 'to-input' && toNode
                ? getConnectionIssue(nodeId, port, toNode, activeLink.toPort)
                : '';
            return {
                nodeId,
                port,
                issue,
                valid: !issue,
                center: portCenter(nodeId, port, 'output'),
            };
        };
        const getNearestValidInputTarget = (clientX, clientY, maxDistance = LINK_SNAP_DISTANCE) => {
            if (activeLink?.mode !== 'from-output' || !activeLink?.fromNodeId) return null;
            const fromNode = getNodeById(activeLink.fromNodeId);
            if (!fromNode) return null;
            let best = null;
            nodeCanvasEl.querySelectorAll('.world-node-port.is-input').forEach((portEl) => {
                const nodeId = String(portEl.dataset.nodeId || '').trim();
                const port = String(portEl.dataset.port || '').trim();
                if (!nodeId || !port) return;
                const issue = getConnectionIssue(fromNode, activeLink.fromPort, nodeId, port);
                if (issue) return;
                const rect = portEl.getBoundingClientRect();
                const centerX = rect.left + (rect.width / 2);
                const centerY = rect.top + (rect.height / 2);
                const distance = Math.hypot(centerX - clientX, centerY - clientY);
                if (distance > maxDistance) return;
                if (!best || distance < best.distance) {
                    best = {
                        nodeId,
                        port,
                        issue: '',
                        valid: true,
                        center: portCenter(nodeId, port, 'input'),
                        distance,
                    };
                }
            });
            return best;
        };
        const getNearestValidOutputTarget = (clientX, clientY, maxDistance = LINK_SNAP_DISTANCE) => {
            if (activeLink?.mode !== 'to-input' || !activeLink?.toNodeId) return null;
            const toNode = getNodeById(activeLink.toNodeId);
            if (!toNode) return null;
            let best = null;
            nodeCanvasEl.querySelectorAll('.world-node-port.is-output').forEach((portEl) => {
                const nodeId = String(portEl.dataset.nodeId || '').trim();
                const port = String(portEl.dataset.port || '').trim();
                if (!nodeId || !port) return;
                const issue = getConnectionIssue(nodeId, port, toNode, activeLink.toPort);
                if (issue) return;
                const rect = portEl.getBoundingClientRect();
                const centerX = rect.left + (rect.width / 2);
                const centerY = rect.top + (rect.height / 2);
                const distance = Math.hypot(centerX - clientX, centerY - clientY);
                if (distance > maxDistance) return;
                if (!best || distance < best.distance) {
                    best = {
                        nodeId,
                        port,
                        issue: '',
                        valid: true,
                        center: portCenter(nodeId, port, 'output'),
                        distance,
                    };
                }
            });
            return best;
        };
        const updateActiveLinkPreview = (event) => {
            if (!activeLink) return;
            const directTarget = activeLink.mode === 'to-input'
                ? getOutputTargetFromEl(event.target?.closest?.('.world-node-port.is-output'))
                : getInputTargetFromEl(event.target?.closest?.('.world-node-port.is-input'));
            const snappedTarget = activeLink.mode === 'to-input'
                ? getNearestValidOutputTarget(event.clientX, event.clientY)
                : getNearestValidInputTarget(event.clientX, event.clientY);
            const hoverTarget = (snappedTarget && snappedTarget.valid)
                ? snappedTarget
                : directTarget;
            const nextHoverKey = hoverTarget ? `${hoverTarget.nodeId}:${hoverTarget.port}:${hoverTarget.valid ? '1' : '0'}` : '';
            const prevHoverKey = String(activeLink.hoverKey || '');
            activeLink.hoverTarget = hoverTarget || null;
            activeLink.hoverKey = nextHoverKey;
            previewPoint = hoverTarget?.center || clientToCanvasPoint(event.clientX, event.clientY);
            if (prevHoverKey !== nextHoverKey) renderScene();
            else renderLinks();
        };
        const checkLinkCycle = (fromId, toId) => {
            const adjacency = new Map();
            (graph.nodes || []).forEach((node) => adjacency.set(String(node.id || ''), []));
            (graph.edges || []).forEach((edge) => {
                const from = String(edge.from || '');
                const to = String(edge.to || '');
                if (!adjacency.has(from) || !adjacency.has(to)) return;
                adjacency.get(from).push(to);
            });
            if (adjacency.has(fromId) && adjacency.has(toId)) adjacency.get(fromId).push(toId);
            const seen = new Set();
            const stack = [toId];
            while (stack.length) {
                const cur = stack.pop();
                if (cur === fromId) return true;
                if (seen.has(cur)) continue;
                seen.add(cur);
                (adjacency.get(cur) || []).forEach(next => stack.push(next));
            }
            return false;
        };
        const connectNodes = (fromNodeId, fromPort, toNodeId, toPort) => {
            if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return false;
            const fromNode = getNodeById(fromNodeId);
            const toNode = getNodeById(toNodeId);
            if (!fromNode || !toNode) return false;
            const fromPorts = getNodePortSpec(fromNode).outputs;
            const toPorts = getNodePortSpec(toNode).inputs;
            if (!fromPorts.includes(fromPort) || !toPorts.includes(toPort)) return false;
            const connectionIssue = getConnectionIssue(fromNode, fromPort, toNode, toPort);
            if (connectionIssue) {
                window.toastr?.warning?.(connectionIssue);
                return false;
            }
            if (checkLinkCycle(fromNodeId, toNodeId)) {
                window.toastr?.warning?.('该连线会形成循环，已阻止');
                return false;
            }
            graph.edges = (graph.edges || []).filter(edge => !(edge.to === toNodeId && edge.toPort === toPort));
            graph.edges.push({ id: genEdgeId(), from: fromNodeId, fromPort, to: toNodeId, toPort });
            return true;
        };
        const restoreActiveLinkSourceEdge = () => {
            const edge = activeLink?.sourceEdge;
            if (!edge?.id) return;
            const edgeId = String(edge.id || '').trim();
            if ((graph.edges || []).some(item => String(item.id || '').trim() === edgeId)) return;
            graph.edges.push({ ...edge });
        };
        const updateSceneSize = () => {
            const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
            const maxX = nodes.reduce((acc, node) => Math.max(acc, Number(node.x || 0)), 0);
            const maxY = nodes.reduce((acc, node) => Math.max(acc, Number(node.y || 0)), 0);
            sceneWidth = Math.max(NODE_CANVAS_MIN_WIDTH, Math.ceil(maxX + NODE_CANVAS_PADDING_X));
            sceneHeight = Math.max(NODE_CANVAS_MIN_HEIGHT, Math.ceil(maxY + NODE_CANVAS_PADDING_Y));
            nodeLinksEl.setAttribute('viewBox', `0 0 ${sceneWidth} ${sceneHeight}`);
            applyViewport();
        };
        const getCurrentVariableRecord = (name = '') => {
            const key = String(name || '').trim();
            if (!key) return null;
            return this.getSessionVariableRecords({ scope: 'current' }).find(item => item.name === key)
                || this.getSessionVariableRecords({ scope: 'session' }).find(item => item.name === key)
                || this.getSessionVariableRecords({ scope: 'global' }).find(item => item.name === key)
                || null;
        };
        const getNodeRuntimeSummary = (targetNodeId = '', seen = new Set()) => {
            const id = String(targetNodeId || '').trim();
            if (!id || seen.has(id)) return null;
            if (runtimeSummaryCache.has(id)) return runtimeSummaryCache.get(id);
            const nextSeen = new Set(seen);
            nextSeen.add(id);
            const targetNode = getNodeById(id);
            if (!targetNode) return null;
            const targetType = normalizeNodeType(targetNode.type);
            if (targetType === 'variable') {
                const path = String(targetNode?.data?.path || '').trim();
                const record = getCurrentVariableRecord(path);
                const summary = {
                    nodeId: id,
                    type: targetType,
                    label: path || '未选择变量',
                    valueText: record ? this.formatVariableBrowserValue(record.currentValue, record.type) : '未设置',
                    result: null,
                };
                runtimeSummaryCache.set(id, summary);
                return summary;
            }
            if (targetType === 'value') {
                const rightType = normalizeRightTypeValue(targetNode?.data?.rightType || 'number');
                const summary = {
                    nodeId: id,
                    type: targetType,
                    label: this.getConditionSummaryValueText(targetNode?.data?.value, rightType),
                    valueText: this.getConditionSummaryValueText(targetNode?.data?.value, rightType),
                    result: null,
                };
                runtimeSummaryCache.set(id, summary);
                return summary;
            }
            if (targetType === 'compare') {
                const runtimeContext = getRuntimeContext();
                const incoming = getIncomingEdges(id);
                const leftEdge = incoming.find(edge => edge.toPort === 'left') || null;
                const rightEdge = incoming.find(edge => edge.toPort === 'right') || null;
                const leftNode = getNodeById(leftEdge?.from);
                const rightNode = getNodeById(rightEdge?.from);
                const compareData = targetNode.data || {};
                const clause = normalizePromptClause({
                    left: String(leftNode?.data?.path || '').trim(),
                    op: String(compareData.op || '>').trim(),
                    rightType: rightNode
                        ? (normalizeNodeType(rightNode.type) === 'variable' ? 'variable' : normalizeRightTypeValue(rightNode?.data?.rightType || 'number'))
                        : normalizeRightTypeValue(compareData.fallbackRightType || 'number'),
                    right: rightNode
                        ? (normalizeNodeType(rightNode.type) === 'variable'
                            ? String(rightNode?.data?.path || '').trim()
                            : parseTypedValue(rightNode?.data?.value, rightNode?.data?.rightType || 'number'))
                        : parseTypedValue(compareData.fallbackRight, compareData.fallbackRightType || 'number'),
                });
                const explanation = explainConditionTree(clause, runtimeContext);
                const summary = {
                    nodeId: id,
                    type: targetType,
                    label: this.getOptionLabel(BLOCK_OP_OPTIONS, compareData.op, '大于 (>)'),
                    result: Boolean(explanation?.result),
                    explanation,
                    clause,
                };
                runtimeSummaryCache.set(id, summary);
                return summary;
            }
            if (targetType === 'logic') {
                const logicValue = normalizeLogicValue(targetNode?.data?.logic || 'and');
                const inputPorts = getNodePortSpec(targetNode).inputs;
                const children = inputPorts.map((port) => {
                    const incoming = getIncomingEdges(id).find(edge => edge.toPort === port) || null;
                    const child = incoming ? getNodeRuntimeSummary(incoming.from, nextSeen) : null;
                    return { port, child };
                });
                const childResults = children
                    .map(item => item.child?.result)
                    .filter(value => typeof value === 'boolean');
                let result = null;
                if (logicValue === 'not') {
                    result = childResults.length ? !childResults[0] : null;
                } else if (childResults.length) {
                    result = logicValue === 'or'
                        ? childResults.some(Boolean)
                        : childResults.every(Boolean);
                }
                const summary = {
                    nodeId: id,
                    type: targetType,
                    label: this.getOptionLabel(NODE_LOGIC_OPTIONS, logicValue, 'AND'),
                    logic: logicValue,
                    result,
                    children,
                };
                runtimeSummaryCache.set(id, summary);
                return summary;
            }
            return null;
        };
        const getCompareRuntimeReason = (summary, incoming = []) => {
            if (!summary?.clause) return '当前比较节点尚未形成可评估条件。';
            const clause = summary.clause;
            const explanation = summary.explanation || null;
            const op = String(clause.op || '').trim().toLowerCase();
            const needsRight = !['is_empty', 'not_empty'].includes(op);
            const hasLeft = incoming.some(edge => edge.toPort === 'left');
            const hasRight = incoming.some(edge => edge.toPort === 'right');
            if (!hasLeft) return '左侧尚未连接变量节点。';
            if (needsRight && !hasRight) return '右侧尚未连接值节点或变量节点。';
            if (!explanation) return '当前会话缺少可用变量上下文，暂时无法评估。';
            const leftValue = this.formatConditionRuntimeValue(explanation.leftValue, clause.rightType);
            if (op === 'is_empty') {
                return summary.result === true
                    ? `左值 ${leftValue} 为空，条件成立。`
                    : `左值 ${leftValue} 不为空，条件不成立。`;
            }
            if (op === 'not_empty') {
                return summary.result === true
                    ? `左值 ${leftValue} 不为空，条件成立。`
                    : `左值 ${leftValue} 为空，条件不成立。`;
            }
            const rightType = clause.rightType === 'variable' ? 'string' : clause.rightType;
            const rightValue = this.formatConditionRuntimeValue(explanation.rightValue, rightType);
            const opLabel = this.getConditionSummaryOperator(clause.op);
            return summary.result === true
                ? `当前满足：${leftValue} ${opLabel} ${rightValue}`
                : `当前不满足：${leftValue} ${opLabel} ${rightValue}`;
        };
        const getLogicRuntimeReason = (summary) => {
            if (!summary) return '当前逻辑节点尚未形成可评估链路。';
            const children = Array.isArray(summary.children) ? summary.children : [];
            const connected = children.filter(item => String(item?.child?.nodeId || '').trim());
            if (!connected.length) return '当前没有连接任何上游结果。';
            const resolved = connected.filter(item => typeof item?.child?.result === 'boolean');
            const pending = connected.filter(item => typeof item?.child?.result !== 'boolean');
            const formatPort = (port = '') => String(port || '').trim().toUpperCase();
            if (summary.logic === 'not') {
                if (!resolved.length) return 'NOT 需要 1 路可判断输入，当前仍未准备好。';
                return summary.result === true
                    ? `NOT 输入 ${formatPort(resolved[0]?.port)} 为未命中，因此当前命中。`
                    : `NOT 输入 ${formatPort(resolved[0]?.port)} 为命中，因此当前未命中。`;
            }
            if (!resolved.length) return `当前 ${connected.length} 路输入都尚未产出可判断结果。`;
            if (summary.logic === 'and') {
                if (summary.result === true) {
                    return `AND 需要全部命中，当前 ${resolved.length} 路均命中。`;
                }
                const failedPorts = resolved.filter(item => item?.child?.result === false).map(item => formatPort(item.port));
                return failedPorts.length
                    ? `AND 需要全部命中，未命中输入：${failedPorts.join('、')}${pending.length ? `（另有 ${pending.length} 路待判断）` : ''}。`
                    : `AND 尚未满足全部输入条件${pending.length ? `（${pending.length} 路待判断）` : ''}。`;
            }
            if (summary.logic === 'or') {
                if (summary.result === true) {
                    const hitPorts = resolved.filter(item => item?.child?.result === true).map(item => formatPort(item.port));
                    return `OR 需要至少一路命中，当前命中输入：${hitPorts.join('、')}。`;
                }
                return `OR 需要至少一路命中，当前已判断 ${resolved.length} 路均未命中${pending.length ? `（${pending.length} 路待判断）` : ''}。`;
            }
            return '当前逻辑结果已更新。';
        };
        const getRuntimeStateMeta = (node) => {
            const type = normalizeNodeType(node?.type);
            if (type !== 'compare' && type !== 'logic') return { className: '', badgeText: '', badgeClass: '', reason: '' };
            const summary = getNodeRuntimeSummary(node?.id);
            if (!summary || typeof summary?.result !== 'boolean') {
                return {
                    className: ' is-runtime-pending',
                    badgeText: '待判断',
                    badgeClass: ' is-pending',
                    reason: type === 'compare'
                        ? getCompareRuntimeReason(summary, getIncomingEdges(String(node?.id || '')))
                        : getLogicRuntimeReason(summary),
                };
            }
            if (summary.result === true) {
                return {
                    className: ' is-runtime-hit',
                    badgeText: '命中',
                    badgeClass: ' is-hit',
                    reason: type === 'compare'
                        ? getCompareRuntimeReason(summary, getIncomingEdges(String(node?.id || '')))
                        : getLogicRuntimeReason(summary),
                };
            }
            return {
                className: ' is-runtime-miss',
                badgeText: '未命中',
                badgeClass: ' is-miss',
                reason: type === 'compare'
                    ? getCompareRuntimeReason(summary, getIncomingEdges(String(node?.id || '')))
                    : getLogicRuntimeReason(summary),
            };
        };
        const getRuntimePathState = () => {
            if (runtimePathStateCache) return runtimePathStateCache;
            const nodeIds = new Set();
            const edgeIds = new Set();
            const sourceNodeId = getFinalSourceNodeId();
            const finalSummary = sourceNodeId ? getNodeRuntimeSummary(sourceNodeId) : null;
            const finalResult = typeof finalSummary?.result === 'boolean' ? finalSummary.result : null;
            const tone = finalResult === true ? 'hit' : finalResult === false ? 'miss' : 'pending';
            if (!sourceNodeId) {
                runtimePathStateCache = { nodeIds, edgeIds, tone, finalResult };
                return runtimePathStateCache;
            }
            const visited = new Set();
            const walkNode = (nodeId = '') => {
                const id = String(nodeId || '').trim();
                if (!id || visited.has(id)) return;
                visited.add(id);
                nodeIds.add(id);
                const node = getNodeById(id);
                if (!node) return;
                const type = normalizeNodeType(node.type);
                const incoming = getIncomingEdges(id);
                const followEdge = (edge) => {
                    if (!edge?.from) return;
                    edgeIds.add(getEdgeKey(edge));
                    walkNode(edge.from);
                };
                if (type === 'compare') {
                    const summary = getNodeRuntimeSummary(id);
                    const op = String(summary?.clause?.op || node?.data?.op || '>').trim().toLowerCase();
                    const needsRight = !['is_empty', 'not_empty'].includes(op);
                    const leftEdge = incoming.find(edge => edge.toPort === 'left') || null;
                    const rightEdge = incoming.find(edge => edge.toPort === 'right') || null;
                    if (leftEdge) followEdge(leftEdge);
                    if (needsRight && rightEdge) followEdge(rightEdge);
                    return;
                }
                if (type === 'logic') {
                    const summary = getNodeRuntimeSummary(id);
                    const logicValue = normalizeLogicValue(summary?.logic || node?.data?.logic || 'and');
                    const childByPort = new Map();
                    (Array.isArray(summary?.children) ? summary.children : []).forEach((item) => {
                        const port = String(item?.port || '').trim();
                        if (!port) return;
                        childByPort.set(port, item?.child || null);
                    });
                    const connected = getNodePortSpec(node).inputs
                        .map((port) => {
                            const portName = String(port || '').trim();
                            const edge = incoming.find(item => String(item?.toPort || '').trim() === portName) || null;
                            if (!edge) return null;
                            const child = childByPort.has(portName)
                                ? childByPort.get(portName)
                                : getNodeRuntimeSummary(edge.from);
                            return { port: portName, edge, child };
                        })
                        .filter(Boolean);
                    let selected = connected;
                    if (logicValue === 'not') {
                        selected = connected.slice(0, 1);
                    } else if (logicValue === 'and') {
                        if (summary?.result === true) {
                            const hits = connected.filter(item => item?.child?.result === true);
                            selected = hits.length
                                ? hits
                                : connected.filter(item => item?.child?.result !== false);
                            if (!selected.length) selected = connected;
                        } else if (summary?.result === false) {
                            const misses = connected.filter(item => item?.child?.result === false);
                            selected = misses.length ? misses : connected;
                        }
                    } else if (logicValue === 'or') {
                        if (summary?.result === true) {
                            const hits = connected.filter(item => item?.child?.result === true);
                            selected = hits.length ? hits : connected;
                        } else if (summary?.result === false) {
                            const misses = connected.filter(item => item?.child?.result === false);
                            selected = misses.length ? misses : connected;
                        }
                    }
                    selected.forEach((item) => followEdge(item.edge));
                    return;
                }
                incoming.forEach(followEdge);
            };
            walkNode(sourceNodeId);
            runtimePathStateCache = { nodeIds, edgeIds, tone, finalResult };
            return runtimePathStateCache;
        };
        const renderNodeBody = (node) => {
            const type = normalizeNodeType(node.type);
            const data = node.data || {};
            if (type === 'variable') {
                const label = escapeHtml(String(data.path || '').trim() || '未选择变量');
                const typeLabel = escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, data.varType, data.varType || '未定义'));
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${label}</div>
                        <div class="world-node-summary-meta">
                            <span>${typeLabel}</span>
                            <span>${data.autoCreate ? '自动建' : '手动选择'}</span>
                        </div>
                    </div>
                `;
            }
            if (type === 'value') {
                const rightTypeLabel = escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, data.rightType, '数字'));
                const valueText = escapeHtml(String(data.value || '').trim() || '未填写比较值');
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${valueText}</div>
                        <div class="world-node-summary-meta">
                            <span>${rightTypeLabel}</span>
                        </div>
                    </div>
                `;
            }
            if (type === 'compare') {
                const opLabel = escapeHtml(this.getOptionLabel(BLOCK_OP_OPTIONS, data.op, '大于 (>)'));
                const incoming = getIncomingEdges(node.id);
                const runtimeMeta = getRuntimeStateMeta(node);
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${opLabel}</div>
                        <div class="world-node-summary-meta">
                            <span>${incoming.some(edge => edge.toPort === 'left') ? '左已连' : '左未连'}</span>
                            <span>${incoming.some(edge => edge.toPort === 'right') ? '右已连' : '右未连'}</span>
                            <span class="world-node-runtime-pill${runtimeMeta.badgeClass}">${runtimeMeta.badgeText}</span>
                        </div>
                    </div>
                `;
            }
            if (type === 'logic') {
                const logicLabel = escapeHtml(this.getOptionLabel(NODE_LOGIC_OPTIONS, data.logic, 'AND'));
                const inputCount = getNodePortSpec(node).inputs.length;
                const runtimeMeta = getRuntimeStateMeta(node);
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${logicLabel}</div>
                        <div class="world-node-summary-meta">
                            <span>${normalizeLogicValue(data.logic) === 'not' ? '单输入' : `${inputCount} 路输入`}</span>
                            <span class="world-node-runtime-pill${runtimeMeta.badgeClass}">${runtimeMeta.badgeText}</span>
                        </div>
                    </div>
                `;
            }
            return '<div class="world-node-output-hint">当前最终条件由系统内部维护</div>';
        };
        const renderNodeInspector = () => {
            if (!nodeInspectorEl) return;
            const selectedNodes = [...selectedNodeIds].map(id => getNodeById(id)).filter(Boolean);
            if (!selectedNodes.length) {
                nodeInspectorEl.innerHTML = `
                    <div class="world-node-inspector-empty">
                        <div class="world-node-inspector-title">节点属性</div>
                        <div class="world-node-inspector-hint">选中一个节点后，可在这里快速修改属性。</div>
                    </div>
                `;
                return;
            }
            if (selectedNodes.length > 1) {
                nodeInspectorEl.innerHTML = `
                    <div class="world-node-inspector-empty">
                        <div class="world-node-inspector-title">已选中 ${selectedNodes.length} 个节点</div>
                        <div class="world-node-inspector-hint">当前以批量移动、复制、整理为主；单选节点后可编辑具体属性。</div>
                    </div>
                `;
                return;
            }
            const node = selectedNodes[0];
            const type = normalizeNodeType(node?.type);
            const data = node?.data || {};
            const issueState = getNodeIssueState(node);
            const issueText = issueState.issues.length ? escapeHtml(issueState.issues.join(' / ')) : '当前节点无明显问题';
            const countVariableRefsInBlock = (name = '') => {
                const key = String(name || '').trim();
                if (!key) return 0;
                return (graph.nodes || [])
                    .filter(item => normalizeNodeType(item?.type) === 'variable')
                    .filter(item => String(item?.data?.path || '').trim() === key)
                    .length;
            };
            const getVariableReferenceTargets = (name = '') => {
                const key = String(name || '').trim();
                if (!key) return [];
                const refs = [];
                (graph.nodes || [])
                    .filter(item => normalizeNodeType(item?.type) === 'variable')
                    .filter(item => String(item?.data?.path || '').trim() === key)
                    .forEach((varNode) => {
                        getOutgoingEdges(varNode.id).forEach((edge) => {
                            const compareNode = getNodeById(edge?.to);
                            if (!compareNode || normalizeNodeType(compareNode.type) !== 'compare') return;
                            const compareData = compareNode.data || {};
                            refs.push({
                                compareNodeId: String(compareNode.id || '').trim(),
                                side: String(edge?.toPort || '').trim() === 'right' ? '右值' : '左值',
                                opLabel: this.getOptionLabel(BLOCK_OP_OPTIONS, compareData.op, '大于 (>)'),
                                sameNode: String(varNode.id || '').trim() === String(node?.id || '').trim(),
                            });
                        });
                    });
                const seen = new Set();
                return refs.filter((item) => {
                    const refKey = `${item.compareNodeId}:${item.side}`;
                    if (seen.has(refKey)) return false;
                    seen.add(refKey);
                    return true;
                });
            };
            let body = '';
            if (type === 'variable') {
                const label = escapeHtml(String(data.path || '').trim() || '选择变量');
                const typeLabel = escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, data.varType, data.varType || '未定义'));
                const defaultValue = escapeHtml(this.getConditionSummaryValueText(data.defaultValue, data.varType || 'string'));
                const variableRecord = getCurrentVariableRecord(data.path);
                const sourceLabel = variableRecord
                    ? escapeHtml(variableRecord.source === 'global' ? '全局变量' : '会话变量')
                    : '当前未找到变量记录';
                const currentValue = variableRecord
                    ? escapeHtml(this.formatVariableBrowserValue(variableRecord.currentValue, variableRecord.type))
                    : '未设置';
                const refCount = countVariableRefsInBlock(data.path);
                const refTargets = getVariableReferenceTargets(data.path);
                body = `
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">变量</div>
                        <button type="button" class="world-app-select-btn world-node-select" data-node-id="${node.id}" data-field="varPath">
                            <span>${label}</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-node-inspector-row compact">
                        <button type="button" class="world-node-mini-btn world-node-create-var" data-node-id="${node.id}" title="新建变量">+</button>
                        <button type="button" class="world-node-mini-btn" data-node-id="${node.id}" data-action="edit-variable" title="编辑变量">设</button>
                        <label class="world-node-check">
                            <input type="checkbox" class="world-node-input-check" data-node-id="${node.id}" data-field="autoCreate" ${data.autoCreate ? 'checked' : ''}>
                            <span>自动建</span>
                        </label>
                    </div>
                    <div class="world-node-inspector-meta">
                        <span>类型：${typeLabel}</span>
                        <span>默认：${defaultValue}</span>
                    </div>
                    <div class="world-node-inspector-meta">
                        <span>来源：${sourceLabel}</span>
                        <span>当前值：${currentValue}</span>
                        <span>本块引用：${refCount}</span>
                    </div>
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">引用反查</div>
                        <div class="world-node-ref-list">
                            ${refTargets.length ? refTargets.map((item, index) => `
                                <button
                                    type="button"
                                    class="world-node-ref-btn${item.sameNode ? ' is-current' : ''}"
                                    data-action="focus-node"
                                    data-node-id="${escapeHtml(item.compareNodeId)}"
                                >
                                    <span>比较 ${index + 1}</span>
                                    <span>${escapeHtml(item.side)}</span>
                                    <span>${escapeHtml(item.opLabel)}</span>
                                    ${item.sameNode ? '<span>当前链</span>' : ''}
                                </button>
                            `).join('') : '<div class="world-node-inspector-hint">当前 block 内还没有比较节点引用这个变量。</div>'}
                        </div>
                    </div>
                `;
            } else if (type === 'value') {
                const rightTypeLabel = escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, data.rightType, '数字'));
                body = `
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">值类型</div>
                        <button type="button" class="world-app-select-btn world-node-select" data-node-id="${node.id}" data-field="valueType">
                            <span>${rightTypeLabel}</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">比较值</div>
                        <input type="text" class="world-node-text-input" data-node-id="${node.id}" data-field="value" value="${escapeHtml(String(data.value || ''))}" placeholder="输入值">
                    </div>
                `;
            } else if (type === 'compare') {
                const opLabel = escapeHtml(this.getOptionLabel(BLOCK_OP_OPTIONS, data.op, '大于 (>)'));
                const incoming = getIncomingEdges(node.id);
                const compareSummary = getNodeRuntimeSummary(node.id);
                const leftInput = compareSummary?.clause?.left
                    ? `变量 ${compareSummary.clause.left}`
                    : '未连接';
                const rightInput = compareSummary?.clause
                    ? this.getConditionSummaryValueText(compareSummary.clause.right, compareSummary.clause.rightType)
                    : '未连接';
                const leftValue = compareSummary?.explanation
                    ? this.formatConditionRuntimeValue(compareSummary.explanation.leftValue, compareSummary.clause?.rightType)
                    : '未找到';
                const rightValue = compareSummary?.explanation
                    ? this.formatConditionRuntimeValue(compareSummary.explanation.rightValue, compareSummary.clause?.rightType === 'variable' ? 'string' : compareSummary.clause?.rightType)
                    : '未找到';
                const compareReason = getCompareRuntimeReason(compareSummary, incoming);
                const compareReasonClass = compareSummary?.result === true
                    ? ' is-hit'
                    : compareSummary?.result === false
                        ? ' is-warn'
                        : '';
                body = `
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">比较方式</div>
                        <button type="button" class="world-app-select-btn world-node-select" data-node-id="${node.id}" data-field="op">
                            <span>${opLabel}</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-node-inspector-meta">
                        <span>左侧：${incoming.some(edge => edge.toPort === 'left') ? '已连接' : '未连接'}</span>
                        <span>右侧：${incoming.some(edge => edge.toPort === 'right') ? '已连接' : '未连接'}</span>
                        <span>${compareSummary?.result === true ? '当前命中' : compareSummary?.result === false ? '当前未命中' : '暂无法判断'}</span>
                    </div>
                    <div class="world-node-ref-list">
                        <button type="button" class="world-node-ref-btn" data-action="focus-node" data-node-id="${escapeHtml(String(getNodeById(incoming.find(edge => edge.toPort === 'left')?.from)?.id || ''))}">
                            <span>左输入</span>
                            <span>${escapeHtml(leftInput)}</span>
                            <span>当前值 ${escapeHtml(leftValue)}</span>
                        </button>
                        <button type="button" class="world-node-ref-btn" data-action="focus-node" data-node-id="${escapeHtml(String(getNodeById(incoming.find(edge => edge.toPort === 'right')?.from)?.id || ''))}">
                            <span>右输入</span>
                            <span>${escapeHtml(rightInput)}</span>
                            <span>当前值 ${escapeHtml(rightValue)}</span>
                        </button>
                    </div>
                    <div class="world-node-inspector-reason${compareReasonClass}">${escapeHtml(compareReason)}</div>
                `;
            } else if (type === 'logic') {
                const logicLabel = escapeHtml(this.getOptionLabel(NODE_LOGIC_OPTIONS, data.logic, 'AND'));
                const inputCount = getNodePortSpec(node).inputs.length;
                const logicSummary = getNodeRuntimeSummary(node.id);
                const logicReason = getLogicRuntimeReason(logicSummary);
                const logicReasonClass = logicSummary?.result === true
                    ? ' is-hit'
                    : logicSummary?.result === false
                        ? ' is-warn'
                        : '';
                body = `
                    <div class="world-node-inspector-row">
                        <div class="world-node-inspector-label">逻辑</div>
                        <button type="button" class="world-app-select-btn world-node-select" data-node-id="${node.id}" data-field="logic">
                            <span>${logicLabel}</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-node-inspector-row compact">
                        ${normalizeLogicValue(data.logic) === 'not' ? '<span class="world-node-count">NOT 固定单输入</span>' : `
                            <button type="button" class="world-node-mini-btn" data-node-id="${node.id}" data-action="add-input" title="增加输入">+</button>
                            <button type="button" class="world-node-mini-btn" data-node-id="${node.id}" data-action="remove-input" title="减少输入">-</button>
                            <span class="world-node-count">${inputCount} 路输入</span>
                        `}
                    </div>
                    <div class="world-node-inspector-meta">
                        <span>${logicSummary?.result === true ? '当前命中' : logicSummary?.result === false ? '当前未命中' : '暂无法判断'}</span>
                    </div>
                    <div class="world-node-ref-list">
                        ${(Array.isArray(logicSummary?.children) ? logicSummary.children : []).map((item) => {
                            const child = item?.child || null;
                            const targetNodeId = String(child?.nodeId || '').trim();
                            return `
                                <button type="button" class="world-node-ref-btn${child?.result === true ? ' is-current' : ''}" data-action="focus-node" data-node-id="${escapeHtml(targetNodeId)}"${targetNodeId ? '' : ' disabled'}>
                                    <span>${escapeHtml(String(item?.port || '').toUpperCase())}</span>
                                    <span>${escapeHtml(child?.label || '未连接')}</span>
                                    <span>${child?.result === true ? '命中' : child?.result === false ? '未命中' : '无结果'}</span>
                                </button>
                            `;
                        }).join('') || '<div class="world-node-inspector-hint">当前还没有输入链路。</div>'}
                    </div>
                    <div class="world-node-inspector-reason${logicReasonClass}">${escapeHtml(logicReason)}</div>
                `;
            } else {
                body = `<div class="world-node-output-hint">当前最终条件由系统内部维护，无需额外设置。</div>`;
            }
            nodeInspectorEl.innerHTML = `
                <div class="world-node-inspector-card">
                    <div class="world-node-inspector-head">
                        <div>
                            <div class="world-node-inspector-title">${escapeHtml(getNodeLabel(node))}</div>
                            <div class="world-node-inspector-hint">${escapeHtml(issueText)}</div>
                        </div>
                    </div>
                    <div class="world-node-inspector-body">
                        ${body}
                    </div>
                </div>
            `;
        };
        const renderNodePorts = (node, direction = 'input') => {
            const spec = getNodePortSpec(node);
            const ports = direction === 'output' ? spec.outputs : spec.inputs;
            return ports.map((port) => `
                ${(() => {
                    let stateClass = '';
                    const portLabel = getPortLabel(node, direction, port);
                    if (direction === 'input' && activeLink?.fromNodeId) {
                        const fromNode = getNodeById(activeLink.fromNodeId);
                        const issue = getConnectionIssue(fromNode, activeLink.fromPort, node, port);
                        stateClass = issue ? ' is-invalid-target' : ' is-valid-target';
                        if (activeLink?.hoverTarget?.nodeId === node.id && activeLink?.hoverTarget?.port === port) {
                            stateClass += activeLink.hoverTarget.valid ? ' is-hover-target' : ' is-hover-invalid';
                        }
                    } else if (direction === 'output' && activeLink?.mode === 'to-input' && activeLink?.toNodeId) {
                        const toNode = getNodeById(activeLink.toNodeId);
                        const issue = getConnectionIssue(node, port, toNode, activeLink.toPort);
                        stateClass = issue ? ' is-invalid-target' : ' is-valid-target';
                        if (activeLink?.hoverTarget?.nodeId === node.id && activeLink?.hoverTarget?.port === port) {
                            stateClass += activeLink.hoverTarget.valid ? ' is-hover-target' : ' is-hover-invalid';
                        }
                    }
                    return `
                <button
                    type="button"
                    class="world-node-port ${direction === 'input' ? 'is-input' : 'is-output'}${stateClass}"
                    data-direction="${direction}"
                    data-node-type="${normalizeNodeType(node.type)}"
                    data-node-id="${node.id}"
                    data-port="${port}"
                    data-port-label="${escapeHtml(portLabel)}"
                    aria-label="${direction === 'input' ? '输入端口' : '输出端口'}"
                ></button>
                    `;
                })()}
            `).join('');
        };
        const renderLinks = ({ activePathState = null, runtimePathState = null } = {}) => {
            const paths = [];
            const structuralPath = activePathState || getActivePathState();
            const runtimePath = runtimePathState || getRuntimePathState();
            (graph.edges || []).forEach((edge) => {
                const fromNode = getNodeById(edge.from);
                const toNode = getNodeById(edge.to);
                if (fromNode?.type === 'result' || toNode?.type === 'result') return;
                const from = portCenter(edge.from, edge.fromPort, 'output');
                const to = portCenter(edge.to, edge.toPort, 'input');
                if (!from || !to) return;
                const edgeKey = getEdgeKey(edge);
                const edgeStateClass = structuralPath.edgeIds.has(edgeKey)
                    ? ' is-active-path'
                    : ' is-inactive-path';
                const runtimeStateClass = runtimePath.edgeIds.has(edgeKey)
                    ? ` is-runtime-path-${runtimePath.tone}`
                    : '';
                paths.push(`<path class="world-node-edge${edgeStateClass}${runtimeStateClass}" data-edge-id="${edge.id}" d="${curvePath(from.x, from.y, to.x, to.y)}"></path>`);
            });
            if (activeLink && previewPoint) {
                const from = activeLink.mode === 'to-input'
                    ? previewPoint
                    : portCenter(activeLink.fromNodeId, activeLink.fromPort, 'output');
                const to = activeLink.mode === 'to-input'
                    ? portCenter(activeLink.toNodeId, activeLink.toPort, 'input')
                    : previewPoint;
                if (from && to) {
                    const previewClass = activeLink?.hoverTarget
                        ? (activeLink.hoverTarget.valid ? ' is-valid' : ' is-invalid')
                        : '';
                    paths.push(`<path class="world-node-edge is-preview${previewClass}" d="${curvePath(from.x, from.y, to.x, to.y)}"></path>`);
                }
            }
            nodeLinksEl.innerHTML = paths.join('');
        };
        const openNodeSelectMenu = (selectBtn) => {
            if (!selectBtn) return;
            const nodeId = String(selectBtn.dataset.nodeId || '');
            const field = String(selectBtn.dataset.field || '');
            const node = getNodeById(nodeId);
            if (!node) return;
            let options = [];
            let current = '';
            if (field === 'op') {
                options = BLOCK_OP_OPTIONS;
                current = String(node?.data?.op || '>');
            } else if (field === 'logic') {
                options = NODE_LOGIC_OPTIONS;
                current = String(node?.data?.logic || 'and');
            } else if (field === 'valueType') {
                options = BLOCK_RIGHT_TYPE_OPTIONS;
                current = String(node?.data?.rightType || 'number');
            } else if (field === 'varPath') {
                current = String(node?.data?.path || '');
                void this.openVariableBrowser({ initialName: current }).then((result) => {
                    if (!result) return;
                    if (result?.payload) {
                        if (!this.applyVariablePayloadToNode(node, result.payload)) return;
                        this.ensureVariableInStore(result.payload.name, result.payload.type, result.payload.defaultValue);
                    } else {
                        node.data.path = String(result?.name || '').trim();
                        node.data.varType = String(result?.type || node.data.varType || 'string').trim().toLowerCase();
                        if (Object.prototype.hasOwnProperty.call(result || {}, 'defaultValue')) {
                            node.data.defaultValue = result.defaultValue;
                        }
                        if (node.data.path) node.data.autoCreate = false;
                    }
                    persistGraph({ syncWhen: true });
                    renderScene();
                });
                return;
            }
            this.openCustomSelectMenu({
                anchorEl: selectBtn,
                options,
                currentValue: current,
                onSelect: (value) => {
                    if (field === 'op') {
                        node.data.op = String(value || '>');
                    } else if (field === 'logic') {
                        node.data.logic = normalizeLogicValue(value);
                        if (node.data.logic === 'not') node.data.inputCount = 1;
                        else node.data.inputCount = Math.max(2, Number(node.data.inputCount || 2));
                    } else if (field === 'valueType') {
                        const nextType = normalizeRightTypeValue(value);
                        node.data.rightType = nextType;
                        node.data.value = stringifyTypedValue(parseTypedValue(node.data.value, nextType), nextType);
                    }
                    persistGraph({ syncWhen: true });
                    renderScene();
                },
            });
        };
        const ensureInspectorVisible = () => {
            if (!nodeInspectorEl || !selectedNodeIds.size) return;
            const rect = nodeInspectorEl.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            if (viewportHeight && rect.top >= 72 && rect.bottom <= viewportHeight - 12) return;
            nodeInspectorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
        const bindNodeInteractiveControls = () => {
            const queryAllControls = (selector) => [
                ...nodeCanvasEl.querySelectorAll(selector),
                ...nodeInspectorEl.querySelectorAll(selector),
            ];
            queryAllControls('.world-node-body').forEach((el) => {
                el.addEventListener('pointerdown', (event) => event.stopPropagation());
                el.addEventListener('mousedown', (event) => event.stopPropagation());
                el.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const nodeId = String(el.closest('.world-node-item')?.dataset?.nodeId || '').trim();
                    if (!nodeId) return;
                    if (event.shiftKey) {
                        if (selectedNodeIds.has(nodeId)) selectedNodeIds.delete(nodeId);
                        else selectedNodeIds.add(nodeId);
                    } else if (!selectedNodeIds.has(nodeId) || selectedNodeIds.size !== 1) {
                        selectedNodeIds.clear();
                        selectedNodeIds.add(nodeId);
                    }
                    renderScene();
                    ensureInspectorVisible();
                });
                el.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
            });

            queryAllControls('.world-node-body button, .world-node-body input, .world-node-body label, .world-node-inspector button, .world-node-inspector input, .world-node-inspector label').forEach((el) => {
                el.addEventListener('pointerdown', (event) => event.stopPropagation());
                el.addEventListener('mousedown', (event) => event.stopPropagation());
                el.addEventListener('click', (event) => event.stopPropagation());
                el.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
            });

            queryAllControls('.world-node-select').forEach((btn) => {
                const openSelect = (event, source = 'click') => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (
                        source === 'click' &&
                        lastNodeSelectAnchor === btn &&
                        lastNodeSelectEventType === 'pointerup' &&
                        (Date.now() - lastNodeSelectOpenAt) < 260
                    ) {
                        return;
                    }
                    lastNodeSelectAnchor = btn;
                    lastNodeSelectOpenAt = Date.now();
                    lastNodeSelectEventType = source;
                    openNodeSelectMenu(btn);
                };
                btn.addEventListener('pointerup', (event) => openSelect(event, 'pointerup'));
                btn.addEventListener('click', (event) => openSelect(event, 'click'));
            });

            queryAllControls('.world-node-text-input').forEach((inputEl) => {
                const focusInput = (event) => {
                    event.stopPropagation();
                    inputEl.focus();
                };
                inputEl.addEventListener('pointerup', focusInput);
                inputEl.addEventListener('touchend', focusInput);
                inputEl.addEventListener('input', () => {
                    const nodeId = String(inputEl.dataset.nodeId || '');
                    const field = String(inputEl.dataset.field || '');
                    const node = getNodeById(nodeId);
                    if (!node) return;
                    if (field === 'value') node.data.value = String(inputEl.value || '');
                    persistGraph({ syncWhen: true });
                });
            });

            queryAllControls('.world-node-input-check').forEach((checkEl) => {
                checkEl.addEventListener('change', () => {
                    const nodeId = String(checkEl.dataset.nodeId || '');
                    const field = String(checkEl.dataset.field || '');
                    const node = getNodeById(nodeId);
                    if (!node) return;
                    if (field === 'autoCreate') node.data.autoCreate = Boolean(checkEl.checked);
                    persistGraph({ syncWhen: true });
                    renderScene();
                });
            });

            queryAllControls('.world-node-mini-btn[data-action]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const nodeId = String(btn.dataset.nodeId || '');
                    const action = String(btn.dataset.action || '');
                    const node = getNodeById(nodeId);
                    if (!node) return;
                    if (action === 'edit-variable') {
                        if (normalizeNodeType(node.type) !== 'variable') return;
                        void this.openVariableModal({
                            name: node?.data?.path || '',
                            type: node?.data?.varType || 'number',
                            defaultValue: node?.data?.defaultValue ?? 0,
                            op: '>',
                            rightType: 'number',
                            rightValue: 10,
                        }).then((payload) => {
                            if (!payload) return;
                            if (!this.applyVariablePayloadToNode(node, payload)) return;
                            this.ensureVariableInStore(payload.name, payload.type, payload.defaultValue);
                            persistGraph({ syncWhen: true });
                            renderScene();
                        });
                        return;
                    }
                    if (normalizeNodeType(node.type) !== 'logic') return;
                    if (action === 'add-input') {
                        node.data.inputCount = Math.min(8, Number(node.data.inputCount || 2) + 1);
                    } else if (action === 'remove-input') {
                        node.data.inputCount = Math.max(2, Number(node.data.inputCount || 2) - 1);
                        const validPorts = new Set(getNodePortSpec(node).inputs);
                        graph.edges = (graph.edges || []).filter(edge => edge.to !== node.id || validPorts.has(edge.toPort));
                    }
                    persistGraph({ syncWhen: true });
                    renderScene();
                });
            });

            queryAllControls('.world-node-ref-btn[data-action="focus-node"]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const nodeId = String(btn.dataset.nodeId || '').trim();
                    const targetNode = getNodeById(nodeId);
                    if (!targetNode) return;
                    selectedNodeIds.clear();
                    selectedNodeIds.add(targetNode.id);
                    renderScene();
                    requestAnimationFrame(() => {
                        focusNodes([targetNode]);
                        startFocusPulse([targetNode.id], 1200);
                    });
                });
            });

            nodeCanvasEl.querySelectorAll('.world-node-delete').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const nodeId = String(btn.dataset.nodeId || '');
                    graph.nodes = (graph.nodes || []).filter(node => node.id !== nodeId);
                    graph.edges = (graph.edges || []).filter(edge => edge.from !== nodeId && edge.to !== nodeId);
                    selectedNodeIds.delete(nodeId);
                    persistGraph({ syncWhen: true });
                    renderScene();
                });
            });

            queryAllControls('.world-node-create-var').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const nodeId = String(btn.dataset.nodeId || '');
                    const node = getNodeById(nodeId);
                    if (!node || node.type !== 'variable') return;
                    void this.openVariableModal({
                        name: node?.data?.path || '',
                        type: node?.data?.varType || 'number',
                        defaultValue: node?.data?.defaultValue ?? 0,
                        op: '>',
                        rightType: 'number',
                        rightValue: 10,
                    }).then((payload) => {
                        if (!payload) return;
                        if (!this.applyVariablePayloadToNode(node, payload)) return;
                        this.ensureVariableInStore(payload.name, payload.type, payload.defaultValue);
                        persistGraph({ syncWhen: true });
                        renderScene();
                    });
                });
            });
        };
        const renderScene = () => {
            updateSceneSize();
            resetRuntimeCaches();
            const finalSourceNodeId = getFinalSourceNodeId();
            const activePathState = getActivePathState();
            const runtimePathState = getRuntimePathState();
            nodeCanvasEl.innerHTML = (graph.nodes || [])
                .filter(node => node.type !== 'result')
                .map((node) => `
                ${(() => {
                    const issueState = getNodeIssueState(node);
                    const issueClass = issueState.level ? ` is-${issueState.level}` : '';
                    const runtimeMeta = getRuntimeStateMeta(node);
                    const titleParts = [];
                    if (issueState.issues.length) titleParts.push(issueState.issues.join(' / '));
                    if (runtimeMeta.reason) titleParts.push(runtimeMeta.reason);
                    const issueTitle = titleParts.length ? ` title="${escapeHtml(titleParts.join(' / '))}"` : '';
                    const isFinal = finalSourceNodeId === node.id;
                    const isActivePath = activePathState.nodeIds.has(String(node.id || ''));
                    const pathClass = isActivePath ? ' is-active-path' : ' is-inactive-path';
                    const runtimePathClass = runtimePathState.nodeIds.has(String(node.id || ''))
                        ? ` is-runtime-path-${runtimePathState.tone}`
                        : '';
                    const runtimeClass = runtimeMeta.className || '';
                    const focusPulseClass = focusPulseNodeIds.has(String(node.id || '')) ? ' is-focus-pulse' : '';
                    return `
                <div class="world-node-item world-node-item-${node.type}${selectedNodeIds.has(node.id) ? ' is-selected' : ''}${issueClass}${isFinal ? ' is-final' : ''}${pathClass}${runtimePathClass}${runtimeClass}${focusPulseClass}" data-node-id="${node.id}" style="left:${Math.round(Number(node.x || 0))}px; top:${Math.round(Number(node.y || 0))}px;"${issueTitle}>
                    <div class="world-node-head" data-node-id="${node.id}">
                        <span>${getNodeLabel(node)}</span>
                        <div class="world-node-head-actions">
                            ${isFinal ? '<span class="world-node-final-badge">最终</span>' : ''}
                            <button type="button" class="world-node-delete" data-node-id="${node.id}" aria-label="删除节点">×</button>
                        </div>
                    </div>
                    <div class="world-node-body">
                        ${renderNodeBody(node)}
                    </div>
                    <div class="world-node-ports is-input is-${normalizeNodeType(node.type)}">${renderNodePorts(node, 'input')}</div>
                    <div class="world-node-ports is-output is-${normalizeNodeType(node.type)}">${renderNodePorts(node, 'output')}</div>
                </div>
                    `;
                })()}
            `).join('');
            renderNodeInspector();
            bindNodeInteractiveControls();
            if (!activeDrag) activeGuides = { vertical: null, horizontal: null };
            renderGuides();
            renderLinks({ activePathState, runtimePathState });
            renderNodeStatus();
        };
        const addNode = (type, center = getViewCenter()) => {
            const nodeType = normalizeNodeType(type);
            if (nodeType === 'result' && (graph.nodes || []).some(node => node.type === 'result')) {
                window.toastr?.info?.('系统内部最终节点只保留一个');
                return;
            }
            const snapped = normalizeNodePoint(center.x, center.y);
            const node = normalizeGraphNode({ id: genNodeId(), type: nodeType, x: snapped.x, y: snapped.y, data: {} }, (graph.nodes || []).length);
            graph.nodes.push(node);
            selectedNodeIds.clear();
            if (node.type !== 'result') selectedNodeIds.add(node.id);
            persistGraph({ syncWhen: true });
            renderScene();
        };
        const applyVariableSelectionToNode = (node, result) => {
            if (!node || normalizeNodeType(node.type) !== 'variable' || !result) return false;
            if (result?.payload) {
                if (!this.applyVariablePayloadToNode(node, result.payload)) return false;
                this.ensureVariableInStore(result.payload.name, result.payload.type, result.payload.defaultValue);
                return true;
            }
            if (!node.data || typeof node.data !== 'object') node.data = {};
            node.data.path = String(result?.name || '').trim();
            node.data.varType = String(result?.type || node.data.varType || 'string').trim().toLowerCase();
            if (Object.prototype.hasOwnProperty.call(result || {}, 'defaultValue')) {
                node.data.defaultValue = result.defaultValue;
            }
            if (node.data.path) node.data.autoCreate = false;
            return Boolean(node.data.path);
        };
        const addConditionChain = (payload = null, options = {}) => {
            const openVariablePicker = Boolean(options?.openVariablePicker) && !payload;
            const center = getViewCenter();
            const snappedCenter = normalizeNodePoint(center.x, center.y);
            const laneY = snappedCenter.y;
            const compareX = snappedCenter.x;
            const variableNode = normalizeGraphNode({
                id: genNodeId(),
                type: 'variable',
                x: compareX - 260,
                y: laneY,
                data: payload ? {
                    path: String(payload.name || '').trim(),
                    autoCreate: true,
                    varType: String(payload.type || 'number').trim().toLowerCase(),
                    defaultValue: payload.defaultValue,
                } : {},
            }, graph.nodes.length);
            const valueNode = normalizeGraphNode({
                id: genNodeId(),
                type: 'value',
                x: compareX + 260,
                y: laneY,
                data: payload ? {
                    rightType: payload.rightType,
                    value: payload.rightValue,
                } : {},
            }, graph.nodes.length + 1);
            const compareNode = normalizeGraphNode({
                id: genNodeId(),
                type: 'compare',
                x: compareX,
                y: laneY,
                data: payload ? {
                    op: payload.op,
                    fallbackRightType: payload.rightType,
                    fallbackRight: payload.rightValue,
                } : {},
            }, graph.nodes.length + 2);
            graph.nodes.push(variableNode, valueNode, compareNode);
            tidyNodes([variableNode, compareNode, valueNode]);
            connectNodes(variableNode.id, 'out', compareNode.id, 'left');
            connectNodes(valueNode.id, 'out', compareNode.id, 'right');
            setFinalNode(compareNode.id);
            selectedNodeIds.clear();
            if (openVariablePicker) {
                selectedNodeIds.add(variableNode.id);
            } else {
                selectedNodeIds.add(variableNode.id);
                selectedNodeIds.add(valueNode.id);
                selectedNodeIds.add(compareNode.id);
            }
            persistGraph({ syncWhen: true });
            renderScene();
            if (!openVariablePicker) return;
            ensureInspectorVisible();
            void this.openVariableBrowser({ initialName: String(variableNode?.data?.path || '').trim() }).then((result) => {
                if (!result) return;
                if (!applyVariableSelectionToNode(variableNode, result)) return;
                persistGraph({ syncWhen: true });
                renderScene();
                ensureInspectorVisible();
            });
        };
        const buildCompareChainNodes = ({
            centerX,
            centerY,
            leftType = 'variable',
            rightType = 'value',
            compareOp = '>',
            leftData = {},
            rightData = {},
            compareData = {},
        } = {}) => {
            const leftNode = normalizeGraphNode({
                id: genNodeId(),
                type: leftType,
                x: centerX - 240,
                y: centerY,
                data: leftData,
            }, graph.nodes.length);
            const rightNode = normalizeGraphNode({
                id: genNodeId(),
                type: rightType,
                x: centerX + 240,
                y: centerY,
                data: rightData,
            }, graph.nodes.length + 1);
            const compareNode = normalizeGraphNode({
                id: genNodeId(),
                type: 'compare',
                x: centerX,
                y: centerY,
                data: {
                    op: compareOp,
                    ...compareData,
                },
            }, graph.nodes.length + 2);
            graph.nodes.push(leftNode, rightNode, compareNode);
            connectNodes(leftNode.id, 'out', compareNode.id, 'left');
            connectNodes(rightNode.id, 'out', compareNode.id, 'right');
            return { nodes: [leftNode, rightNode, compareNode], outputNode: compareNode };
        };
        const addNodeTemplate = (templateType = 'single') => {
            const center = getViewCenter();
            const base = normalizeNodePoint(center.x, center.y);
            const type = String(templateType || 'single').trim();
            if (type === 'single') {
                addConditionChain();
                return;
            }
            const newNodes = [];
            if (type === 'and' || type === 'or') {
                const topChain = buildCompareChainNodes({
                    centerX: base.x,
                    centerY: base.y - 96,
                    compareOp: '>',
                    rightData: { rightType: 'number', value: '10' },
                    compareData: { fallbackRightType: 'number', fallbackRight: '10' },
                });
                const bottomChain = buildCompareChainNodes({
                    centerX: base.x,
                    centerY: base.y + 96,
                    compareOp: '>',
                    rightData: { rightType: 'number', value: '20' },
                    compareData: { fallbackRightType: 'number', fallbackRight: '20' },
                });
                const logicNode = normalizeGraphNode({
                    id: genNodeId(),
                    type: 'logic',
                    x: base.x + 288,
                    y: base.y,
                    data: { logic: type, inputCount: 2 },
                }, graph.nodes.length + 6);
                graph.nodes.push(logicNode);
                connectNodes(topChain.outputNode.id, 'out', logicNode.id, 'in1');
                connectNodes(bottomChain.outputNode.id, 'out', logicNode.id, 'in2');
                setFinalNode(logicNode.id);
                newNodes.push(...topChain.nodes, ...bottomChain.nodes, logicNode);
            } else if (type === 'not') {
                const chain = buildCompareChainNodes({
                    centerX: base.x,
                    centerY: base.y,
                    compareOp: '>',
                    rightData: { rightType: 'number', value: '10' },
                    compareData: { fallbackRightType: 'number', fallbackRight: '10' },
                });
                const logicNode = normalizeGraphNode({
                    id: genNodeId(),
                    type: 'logic',
                    x: base.x + 288,
                    y: base.y,
                    data: { logic: 'not', inputCount: 1 },
                }, graph.nodes.length + 3);
                graph.nodes.push(logicNode);
                connectNodes(chain.outputNode.id, 'out', logicNode.id, 'in');
                setFinalNode(logicNode.id);
                newNodes.push(...chain.nodes, logicNode);
            } else if (type === 'varCompare') {
                const chain = buildCompareChainNodes({
                    centerX: base.x,
                    centerY: base.y,
                    leftType: 'variable',
                    rightType: 'variable',
                    compareOp: '==',
                    leftData: { autoCreate: false, varType: 'string', defaultValue: '' },
                    rightData: { autoCreate: false, varType: 'string', defaultValue: '' },
                    compareData: { fallbackRightType: 'variable', fallbackRight: '' },
                });
                setFinalNode(chain.outputNode.id);
                newNodes.push(...chain.nodes);
            }
            if (!newNodes.length) return;
            selectedNodeIds.clear();
            newNodes.forEach((node) => selectedNodeIds.add(node.id));
            arrangeSelectedNodes(newNodes);
            persistGraph({ syncWhen: true });
            renderScene();
        };
        const deleteSelection = () => {
            if (!selectedNodeIds.size) return;
            graph.nodes = (graph.nodes || []).filter(node => !selectedNodeIds.has(node.id));
            graph.edges = (graph.edges || []).filter(edge => !selectedNodeIds.has(edge.from) && !selectedNodeIds.has(edge.to));
            selectedNodeIds.clear();
            persistGraph({ syncWhen: true });
            renderScene();
        };
        const duplicateSelection = () => {
            const sourceNodes = (graph.nodes || []).filter(node => selectedNodeIds.has(node.id));
            if (!sourceNodes.length) return;
            const idMap = new Map();
            const clones = sourceNodes.map((node, idx) => {
                const clone = normalizeGraphNode({
                    ...node,
                    id: genNodeId(),
                    x: Number(node.x || 0) + 28,
                    y: Number(node.y || 0) + 28 + (idx * 3),
                    data: deepClone(node.data),
                }, (graph.nodes || []).length + idx);
                idMap.set(node.id, clone.id);
                return clone;
            });
            const cloneEdges = (graph.edges || [])
                .filter(edge => idMap.has(edge.from) && idMap.has(edge.to))
                .map(edge => ({ id: genEdgeId(), from: idMap.get(edge.from), fromPort: edge.fromPort, to: idMap.get(edge.to), toPort: edge.toPort }));
            graph.nodes.push(...clones);
            graph.edges.push(...cloneEdges);
            tidyNodes(clones);
            selectedNodeIds.clear();
            clones.forEach(node => selectedNodeIds.add(node.id));
            persistGraph({ syncWhen: true });
            renderScene();
        };
        const showContextMenu = (event) => {
            const items = [
                { action: 'addCondition', label: '新增条件链' },
                { action: 'addLogic', label: '新增逻辑节点' },
                { action: 'layout', label: '自动排版' },
            ];
            if (selectedNodeIds.size === 1) {
                items.unshift({ action: 'setFinal', label: '设为最终条件' });
            }
            if (selectedNodeIds.size) {
                items.unshift({ action: 'tidySelection', label: '整理所选' });
                items.unshift({ action: 'duplicate', label: '复制所选' });
                items.unshift({ action: 'delete', label: '删除所选' });
            }
            contextMenuEl.innerHTML = items.map(item => `<button type="button" class="world-node-context-item" data-action="${item.action}">${item.label}</button>`).join('');
            const wrapRect = nodeCanvasWrap.getBoundingClientRect();
            const left = clamp(event.clientX - wrapRect.left + nodeCanvasWrap.scrollLeft, 8, Math.max(8, Math.ceil(sceneWidth * zoom) - 180));
            const top = clamp(event.clientY - wrapRect.top + nodeCanvasWrap.scrollTop, 8, Math.max(8, Math.ceil(sceneHeight * zoom) - 180));
            contextMenuEl.style.left = `${left}px`;
            contextMenuEl.style.top = `${top}px`;
            contextMenuEl.style.display = 'block';
        };

        const onWrapPointerDown = (event) => {
            if (event.target?.closest?.('.world-node-item, .world-node-context-menu')) return;
            hideContextMenu();
            if (event.button === 1 || (spacePressed && event.button === 0)) {
                event.preventDefault();
                activePan = {
                    startX: event.clientX,
                    startY: event.clientY,
                    scrollLeft: nodeCanvasWrap.scrollLeft,
                    scrollTop: nodeCanvasWrap.scrollTop,
                };
                return;
            }
            if (event.button !== 0) return;
            const wrapRect = nodeCanvasWrap.getBoundingClientRect();
            const contentX = event.clientX - wrapRect.left + nodeCanvasWrap.scrollLeft;
            const contentY = event.clientY - wrapRect.top + nodeCanvasWrap.scrollTop;
            activeMarquee = { startX: contentX, startY: contentY, endX: contentX, endY: contentY };
            nodeMarqueeEl.style.display = 'block';
        };
        const onCanvasPointerDown = (event) => {
            hideContextMenu();
            if (event.target?.closest?.('.world-node-body')) return;
            const edgeEl = event.target?.closest?.('.world-node-edge');
            if (edgeEl && !edgeEl.classList.contains('is-preview')) {
                const edgeId = String(edgeEl.dataset.edgeId || '').trim();
                const edge = (graph.edges || []).find(item => String(item.id || '') === edgeId);
                const fromNode = getNodeById(edge?.from);
                const toNode = getNodeById(edge?.to);
                if (edge && fromNode && toNode && fromNode.type !== 'result' && toNode.type !== 'result') {
                    event.preventDefault();
                    event.stopPropagation();
                    graph.edges = (graph.edges || []).filter(item => String(item.id || '') !== edgeId);
                    activeLink = {
                        mode: 'from-output',
                        fromNodeId: String(edge.from || ''),
                        fromPort: String(edge.fromPort || 'out'),
                        sourceEdge: { ...edge },
                        hoverTarget: null,
                        hoverKey: '',
                    };
                    previewPoint = clientToCanvasPoint(event.clientX, event.clientY);
                    renderScene();
                    return;
                }
            }
            const outputPortEl = event.target?.closest?.('.world-node-port.is-output');
            if (outputPortEl) {
                const nodeId = String(outputPortEl.dataset.nodeId || '');
                const port = String(outputPortEl.dataset.port || 'out');
                activeLink = { mode: 'from-output', fromNodeId: nodeId, fromPort: port, sourceEdge: null, hoverTarget: null, hoverKey: '' };
                previewPoint = clientToCanvasPoint(event.clientX, event.clientY);
                renderScene();
                return;
            }
            const inputPortEl = event.target?.closest?.('.world-node-port.is-input');
            if (inputPortEl) {
                const nodeId = String(inputPortEl.dataset.nodeId || '');
                const port = String(inputPortEl.dataset.port || 'in');
                const existingEdge = (graph.edges || []).find((edge) => edge.to === nodeId && edge.toPort === port) || null;
                if (existingEdge) {
                    graph.edges = (graph.edges || []).filter((edge) => String(edge.id || '') !== String(existingEdge.id || ''));
                }
                activeLink = {
                    mode: 'to-input',
                    toNodeId: nodeId,
                    toPort: port,
                    sourceEdge: existingEdge ? { ...existingEdge } : null,
                    hoverTarget: null,
                    hoverKey: '',
                };
                previewPoint = clientToCanvasPoint(event.clientX, event.clientY);
                renderScene();
                return;
            }
            const headEl = event.target?.closest?.('.world-node-head');
            if (!headEl || event.target?.closest?.('button')) return;
            const nodeId = String(headEl.dataset.nodeId || '');
            const node = getNodeById(nodeId);
            if (!node || node.type === 'result') return;
            event.preventDefault();
            if (event.shiftKey) {
                if (selectedNodeIds.has(nodeId)) selectedNodeIds.delete(nodeId);
                else selectedNodeIds.add(nodeId);
            } else if (!selectedNodeIds.has(nodeId)) {
                selectedNodeIds.clear();
                selectedNodeIds.add(nodeId);
            }
            const nodes = [...selectedNodeIds].map(id => getNodeById(id)).filter(Boolean);
            activeDrag = {
                startX: event.clientX,
                startY: event.clientY,
                scrollLeft: nodeCanvasWrap.scrollLeft,
                scrollTop: nodeCanvasWrap.scrollTop,
                origins: new Map(nodes.map(item => [item.id, { x: Number(item.x || 0), y: Number(item.y || 0) }])),
            };
            renderScene();
            ensureInspectorVisible();
        };
        const onDocPointerMove = (event) => {
            if (activePan) {
                nodeCanvasWrap.scrollLeft = activePan.scrollLeft - (event.clientX - activePan.startX);
                nodeCanvasWrap.scrollTop = activePan.scrollTop - (event.clientY - activePan.startY);
                return;
            }
            if (activeDrag) {
                scrollCanvasForPointer(event.clientX, event.clientY);
                let dx = (event.clientX - activeDrag.startX + (nodeCanvasWrap.scrollLeft - activeDrag.scrollLeft)) / zoom;
                let dy = (event.clientY - activeDrag.startY + (nodeCanvasWrap.scrollTop - activeDrag.scrollTop)) / zoom;
                ({ dx, dy } = resolveDragAlignment(activeDrag.origins, dx, dy));
                const { maxX, maxY } = getNodeClampBounds();
                activeDrag.origins.forEach((origin, nodeId) => {
                    const node = getNodeById(nodeId);
                    if (!node) return;
                    node.x = clamp(origin.x + dx, 0, maxX);
                    node.y = clamp(origin.y + dy, 0, maxY);
                    const el = nodeCanvasEl.querySelector(`.world-node-item[data-node-id="${node.id}"]`);
                    if (el) {
                        el.style.left = `${Math.round(node.x)}px`;
                        el.style.top = `${Math.round(node.y)}px`;
                    }
                });
                renderGuides();
                renderLinks();
                return;
            }
            if (activeLink) {
                scrollCanvasForPointer(event.clientX, event.clientY);
                updateActiveLinkPreview(event);
                return;
            }
            if (activeMarquee) {
                scrollCanvasForPointer(event.clientX, event.clientY);
                const wrapRect = nodeCanvasWrap.getBoundingClientRect();
                activeMarquee.endX = event.clientX - wrapRect.left + nodeCanvasWrap.scrollLeft;
                activeMarquee.endY = event.clientY - wrapRect.top + nodeCanvasWrap.scrollTop;
                const left = Math.min(activeMarquee.startX, activeMarquee.endX);
                const top = Math.min(activeMarquee.startY, activeMarquee.endY);
                const width = Math.abs(activeMarquee.endX - activeMarquee.startX);
                const height = Math.abs(activeMarquee.endY - activeMarquee.startY);
                nodeMarqueeEl.style.left = `${left}px`;
                nodeMarqueeEl.style.top = `${top}px`;
                nodeMarqueeEl.style.width = `${width}px`;
                nodeMarqueeEl.style.height = `${height}px`;
            }
        };
        const onDocPointerUp = (event) => {
            if (activePan) activePan = null;
            if (activeDrag) {
                const movedNodes = [...activeDrag.origins.keys()].map(id => getNodeById(id)).filter(Boolean);
                tidyNodes(movedNodes);
                activeGuides = { vertical: null, horizontal: null };
                activeDrag = null;
                persistGraph({ syncWhen: true });
                renderScene();
            }
            if (activeLink) {
                const hoverTarget = activeLink.hoverTarget;
                const directPortEl = activeLink.mode === 'to-input'
                    ? event.target?.closest?.('.world-node-port.is-output')
                    : event.target?.closest?.('.world-node-port.is-input');
                const fallbackTarget = activeLink.mode === 'to-input'
                    ? getOutputTargetFromEl(directPortEl)
                    : getInputTargetFromEl(directPortEl);
                const finalTarget = hoverTarget?.valid ? hoverTarget : fallbackTarget;
                let connected = false;
                if (finalTarget?.valid) {
                    connected = activeLink.mode === 'to-input'
                        ? connectNodes(finalTarget.nodeId, finalTarget.port, activeLink.toNodeId, activeLink.toPort)
                        : connectNodes(activeLink.fromNodeId, activeLink.fromPort, finalTarget.nodeId, finalTarget.port);
                    if (connected) {
                        persistGraph({ syncWhen: true });
                    }
                }
                if (!connected) {
                    restoreActiveLinkSourceEdge();
                }
                activeLink = null;
                previewPoint = null;
                activeGuides = { vertical: null, horizontal: null };
                renderScene();
            }
            if (activeMarquee) {
                const wrapRect = nodeCanvasWrap.getBoundingClientRect();
                const left = Math.min(activeMarquee.startX, activeMarquee.endX) - nodeCanvasWrap.scrollLeft;
                const top = Math.min(activeMarquee.startY, activeMarquee.endY) - nodeCanvasWrap.scrollTop;
                const right = Math.max(activeMarquee.startX, activeMarquee.endX) - nodeCanvasWrap.scrollLeft;
                const bottom = Math.max(activeMarquee.startY, activeMarquee.endY) - nodeCanvasWrap.scrollTop;
                selectedNodeIds.clear();
                nodeCanvasEl.querySelectorAll('.world-node-item').forEach((nodeEl) => {
                    const rect = nodeEl.getBoundingClientRect();
                    const relLeft = rect.left - wrapRect.left;
                    const relTop = rect.top - wrapRect.top;
                    const relRight = relLeft + rect.width;
                    const relBottom = relTop + rect.height;
                    const nodeId = String(nodeEl.dataset.nodeId || '');
                    const node = getNodeById(nodeId);
                    if (node?.type === 'result') return;
                    if (relRight >= left && relLeft <= right && relBottom >= top && relTop <= bottom) {
                        selectedNodeIds.add(nodeId);
                    }
                });
                activeMarquee = null;
                nodeMarqueeEl.style.display = 'none';
                activeGuides = { vertical: null, horizontal: null };
                renderScene();
            }
        };
        const onCanvasClick = (event) => {
            if (!event.target?.closest?.('.world-node-item')) {
                selectedNodeIds.clear();
                hideContextMenu();
                renderScene();
            }
        };
        const onLinksClick = (event) => {
            const removeEdge = event.target?.closest?.('.world-node-edge');
            if (!removeEdge || removeEdge.classList.contains('is-preview')) return;
            if (!(event.altKey || event.detail >= 2)) return;
            graph.edges = (graph.edges || []).filter(edge => String(edge.id || '') !== String(removeEdge.dataset.edgeId || ''));
            persistGraph({ syncWhen: true });
            renderScene();
        };
        const onToolbarClick = (event) => {
            const btn = event.target?.closest?.('.world-node-toolbar-btn');
            if (!btn) return;
            const action = String(btn.dataset.action || '');
            if (action === 'template') {
                this.openCustomSelectMenu({
                    anchorEl: btn,
                    options: [
                        { value: 'single', label: '单条件比较' },
                        { value: 'and', label: 'AND 双条件' },
                        { value: 'or', label: 'OR 双条件' },
                        { value: 'not', label: 'NOT 条件' },
                        { value: 'varCompare', label: '变量对变量比较' },
                    ],
                    currentValue: '',
                    onSelect: (value) => addNodeTemplate(value),
                });
                return;
            }
            if (action === 'addCondition') return void addConditionChain(null, { openVariablePicker: true });
            if (action === 'addVariable') {
                void this.openVariableModal().then((payload) => {
                    if (!payload) return;
                    this.ensureVariableInStore(payload.name, payload.type, payload.defaultValue);
                    addConditionChain(payload);
                });
                return;
            }
            if (action === 'addValue') return void addNode('value');
            if (action === 'addCompare') return void addNode('compare');
            if (action === 'addLogic') return void addNode('logic');
            if (action === 'zoomIn') return void setZoom(zoom + 0.1);
            if (action === 'zoomOut') return void setZoom(zoom - 0.1);
            if (action === 'zoomReset') return void setZoom(1);
            if (action === 'fitSelection') {
                const nodes = [...selectedNodeIds].map(id => getNodeById(id)).filter(Boolean);
                if (!nodes.length) return;
                focusNodes(nodes);
                return;
            }
            if (action === 'fitAll') {
                const nodes = (graph.nodes || []).filter(node => node.type !== 'result');
                if (!nodes.length) return;
                focusNodes(nodes);
                return;
            }
            if (action === 'layout') {
                autoLayoutNodeGraph(graph);
                persistGraph({ syncWhen: true });
                renderScene();
            }
        };
        const onWrapContextMenu = (event) => {
            event.preventDefault();
            const nodeItem = event.target?.closest?.('.world-node-item');
            if (nodeItem) {
                const nodeId = String(nodeItem.dataset.nodeId || '');
                const node = getNodeById(nodeId);
                if (node?.type !== 'result' && !selectedNodeIds.has(nodeId)) {
                    selectedNodeIds.clear();
                    selectedNodeIds.add(nodeId);
                    renderScene();
                }
            }
            showContextMenu(event);
        };
        const onContextMenuClick = (event) => {
            const btn = event.target?.closest?.('.world-node-context-item');
            if (!btn) return;
            const action = String(btn.dataset.action || '');
            hideContextMenu();
            if (action === 'setFinal') {
                const [nodeId] = [...selectedNodeIds];
                if (setFinalNode(nodeId)) {
                    persistGraph({ syncWhen: true });
                    renderScene();
                }
                return;
            }
            if (action === 'tidySelection') {
                const nodes = [...selectedNodeIds].map(id => getNodeById(id)).filter(Boolean);
                if (!nodes.length) return;
                arrangeSelectedNodes(nodes);
                persistGraph({ syncWhen: true });
                renderScene();
                return;
            }
            if (action === 'delete') return void deleteSelection();
            if (action === 'duplicate') return void duplicateSelection();
            if (action === 'addCondition') return void addConditionChain(null, { openVariablePicker: true });
            if (action === 'addLogic') return void addNode('logic');
            if (action === 'layout') {
                autoLayoutNodeGraph(graph);
                persistGraph({ syncWhen: true });
                renderScene();
            }
        };
        const onWheel = (event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
        };
        const onKeyDown = (event) => {
            if (event.code === 'Space') spacePressed = true;
            if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.size) {
                event.preventDefault();
                deleteSelection();
            }
        };
        const onKeyUp = (event) => {
            if (event.code === 'Space') spacePressed = false;
        };
        const onDocPointerDown = (event) => {
            if (!nodeCanvasWrap.contains(event.target)) hideContextMenu();
        };

        nodeCanvasWrap.addEventListener('pointerdown', onWrapPointerDown);
        nodeCanvasWrap.addEventListener('contextmenu', onWrapContextMenu);
        nodeCanvasWrap.addEventListener('wheel', onWheel, { passive: false });
        nodeCanvasEl.addEventListener('pointerdown', onCanvasPointerDown);
        nodeCanvasEl.addEventListener('click', onCanvasClick);
        nodeLinksEl.addEventListener('click', onLinksClick);
        nodeEditorEl.addEventListener('click', onToolbarClick);
        contextMenuEl.addEventListener('click', onContextMenuClick);
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('pointermove', onDocPointerMove);
        document.addEventListener('pointerup', onDocPointerUp);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        renderScene();
        if (initialFocusState?.nodeIds?.length) {
            const focusNodeList = initialFocusState.nodeIds
                .map(nodeId => getNodeById(nodeId))
                .filter(node => node && normalizeNodeType(node.type) !== 'result');
            if (focusNodeList.length) {
                const primaryNode = focusNodeList[0];
                selectedNodeIds.clear();
                if (primaryNode?.id) selectedNodeIds.add(primaryNode.id);
                renderScene();
                requestAnimationFrame(() => {
                    focusNodes(focusNodeList);
                    startFocusPulse(focusNodeList.map(node => node.id), 1500);
                });
            }
        }
        this.nodeEditorCleanup = () => {
            nodeCanvasWrap.removeEventListener('pointerdown', onWrapPointerDown);
            nodeCanvasWrap.removeEventListener('contextmenu', onWrapContextMenu);
            nodeCanvasWrap.removeEventListener('wheel', onWheel);
            nodeCanvasEl.removeEventListener('pointerdown', onCanvasPointerDown);
            nodeCanvasEl.removeEventListener('click', onCanvasClick);
            nodeLinksEl.removeEventListener('click', onLinksClick);
            nodeEditorEl.removeEventListener('click', onToolbarClick);
            contextMenuEl.removeEventListener('click', onContextMenuClick);
            document.removeEventListener('pointerdown', onDocPointerDown, true);
            document.removeEventListener('pointermove', onDocPointerMove);
            document.removeEventListener('pointerup', onDocPointerUp);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            if (focusPulseTimer) {
                clearTimeout(focusPulseTimer);
                focusPulseTimer = null;
            }
            focusPulseNodeIds.clear();
            hideContextMenu();
        };
    }).call(context, { entry, block, markRefDirty });
}
