/**
 * 世界书编辑弹窗（参考 SillyTavern World Info 设计）
 * - 双栏：左侧条目列表，右侧条目编辑
 * - 支持新增/复制/删除条目与保存
 * - 保存时保留 ST 字段，并兼容旧字段命名
 */

import { LLMClient } from '../api/client.js';
import { ConfigManager } from '../storage/config.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { buildVariableContext, explainConditionTree } from '../variables/world-condition-core.js';

const DEFAULT_DEPTH = 4;
const DEFAULT_WEIGHT = 100;

const SELECTIVE_LOGIC_OPTIONS = [
    { value: 0, label: 'AND 任一（匹配任一关键词）' },
    { value: 1, label: 'NOT 全部（不匹配全部关键词）' },
    { value: 2, label: 'NOT 任一（不匹配任一关键词）' },
    { value: 3, label: 'AND 全部（匹配全部关键词）' },
];

const POSITION_OPTIONS = [
    { value: 0, label: '↑Char（角色前）' },
    { value: 1, label: '↓Char（角色后）' },
    { value: 2, label: '↑AT（作者备注前）' },
    { value: 3, label: '↓AT（作者备注后）' },
    { value: 4, label: '@Depth（按深度插入）' },
    { value: 5, label: '↑EM（例子前）' },
    { value: 6, label: '↓EM（例子后）' },
];

const ROLE_OPTIONS = [
    { value: 0, label: 'system' },
    { value: 1, label: 'user' },
    { value: 2, label: 'assistant' },
];

const TRIGGER_STRATEGY_OPTIONS = [
    { value: 'blue', label: '🔵 蓝灯（常驻触发）' },
    { value: 'green', label: '🟢 绿灯（关键词触发）' },
];

const BLOCK_OP_OPTIONS = [
    { value: '==', label: '等于 (==)' },
    { value: '!=', label: '不等于 (!=)' },
    { value: '>', label: '大于 (>)' },
    { value: '>=', label: '大于等于 (>=)' },
    { value: '<', label: '小于 (<)' },
    { value: '<=', label: '小于等于 (<=)' },
    { value: 'contains', label: '包含 (contains)' },
    { value: 'not_contains', label: '不包含 (not_contains)' },
    { value: 'is_empty', label: '为空 (is_empty)' },
    { value: 'not_empty', label: '非空 (not_empty)' },
    { value: 'regex', label: '正则匹配 (regex)' },
];

const BLOCK_RIGHT_TYPE_OPTIONS = [
    { value: 'number', label: '数字' },
    { value: 'string', label: '文本' },
    { value: 'boolean', label: '布尔' },
    { value: 'variable', label: '变量' },
];

const NODE_LOGIC_OPTIONS = [
    { value: 'and', label: 'AND' },
    { value: 'or', label: 'OR' },
    { value: 'not', label: 'NOT' },
];

const NODE_GRAPH_VERSION = 1;
const NODE_CANVAS_MIN_WIDTH = 760;
const NODE_CANVAS_MIN_HEIGHT = 320;
const NODE_CANVAS_PADDING_X = 220;
const NODE_CANVAS_PADDING_Y = 160;

const BLOCK_EXPAND_ICON_SVG = `
<svg class="world-corner-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"></path>
    <path d="M9 9L3 3M15 9l6-6M9 15l-6 6M15 15l6 6"></path>
</svg>
`.trim();

const BLOCK_FLIP_ICON_SVG = `
<svg class="world-corner-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h11"></path>
    <path d="M12.5 4.5L15 7l-2.5 2.5"></path>
    <path d="M20 17H9"></path>
    <path d="M11.5 14.5L9 17l2.5 2.5"></path>
    <path d="M17 4a8 8 0 0 1 3 6"></path>
    <path d="M7 20a8 8 0 0 1-3-6"></path>
</svg>
`.trim();

const BLOCK_MODE_NODE_ICON_SVG = `
<svg class="world-mini-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="6" r="2.2"></circle>
    <circle cx="18" cy="12" r="2.2"></circle>
    <circle cx="6" cy="18" r="2.2"></circle>
    <path d="M8.2 7.2l7.6 3.6"></path>
    <path d="M8.2 16.8l7.6-3.6"></path>
</svg>
`.trim();

const BLOCK_MODE_FORM_ICON_SVG = `
<svg class="world-mini-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 6h14"></path>
    <path d="M5 12h14"></path>
    <path d="M5 18h14"></path>
    <circle cx="9" cy="6" r="1.7"></circle>
    <circle cx="15" cy="12" r="1.7"></circle>
    <circle cx="11" cy="18" r="1.7"></circle>
</svg>
`.trim();

const WORLD_AI_INPUT_KEY = 'world_ai_input_v1';
const WORLD_AI_TEMPLATE_KEY = 'world_ai_template_v1';
const WORLD_VAR_BROWSER_RECENT_KEY = 'world_var_browser_recent_v1';
const WORLD_AI_TEMPLATE = `
name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "仅供参考，勿完全按照其输出"
  examples:
    - ""
    - ""
    - ""
`.trim();

const deepClone = (obj) => {
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj || {}));
    }
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const hasTauriRuntime = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
};

const isAndroid = () => {
    try {
        return /android/i.test(navigator.userAgent || '');
    } catch {
        return false;
    }
};

const buildJsonDataUrl = (payload) => {
    const json = JSON.stringify(payload, null, 2);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:application/json;base64,${btoa(binary)}`;
};

const toNumber = (val, def) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
};

const genBlockId = () => `blk_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;
const genNodeId = () => `nd_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;
const genEdgeId = () => `ed_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sanitizeNodeId = (value, fallback = '') => {
    const raw = String(value || '').trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    if (cleaned) return cleaned;
    const backup = String(fallback || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    return backup || `node_${Date.now().toString(36)}`;
};
const normalizeNodeType = (type) => {
    const t = String(type || '').trim().toLowerCase();
    if (['variable', 'value', 'compare', 'logic', 'result'].includes(t)) return t;
    return 'compare';
};
const normalizeLogicValue = (logic) => {
    const value = String(logic || '').trim().toLowerCase();
    return ['and', 'or', 'not'].includes(value) ? value : 'and';
};
const normalizeRightTypeValue = (raw) => {
    const value = String(raw || '').trim().toLowerCase();
    return ['number', 'string', 'boolean', 'variable'].includes(value) ? value : 'number';
};
const parseTypedValue = (value, type = 'string') => {
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
const stringifyTypedValue = (value, type = 'string') => {
    const mode = normalizeRightTypeValue(type);
    if (mode === 'boolean') return value ? 'true' : 'false';
    return String(value ?? '');
};
const buildNodeDefineSpec = (data = {}) => {
    const path = String(data.path || '').trim();
    if (!path || data.autoCreate !== true) return null;
    const typeRaw = String(data.varType || 'number').trim().toLowerCase();
    const type = ['number', 'string', 'boolean'].includes(typeRaw) ? typeRaw : 'number';
    const defaultValue = parseTypedValue(data.defaultValue, type);
    return { name: path, type, default: defaultValue };
};
const getNodePortSpec = (node = {}) => {
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
const normalizeGraphNodeData = (type, data = {}) => {
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
        const knownOps = new Set(BLOCK_OP_OPTIONS.map(opt => String(opt.value)));
        return {
            op: knownOps.has(op) ? op : '>',
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
const normalizeGraphNode = (raw = {}, index = 0) => {
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
const normalizeGraphEdge = (raw = {}, index = 0, nodeById = new Map()) => {
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
const isConditionLogicNode = (node = {}) => {
    const logicRaw = String(node?.logic || '').trim().toLowerCase();
    return logicRaw === 'and' || logicRaw === 'or' || logicRaw === 'not';
};
const autoLayoutNodeGraph = (graph = {}) => {
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
    return graph;
};
const buildNodeGraphFromWhen = (when = {}, fallbackClause = {}) => {
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
        version: NODE_GRAPH_VERSION,
        nodes,
        edges,
    });
};
const normalizeNodeGraph = (raw = {}, fallbackWhen = {}, fallbackClause = {}) => {
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
    const next = {
        version: NODE_GRAPH_VERSION,
        nodes: dedupNodes,
        edges: dedupEdges,
        viewport: {
            x: Number.isFinite(Number(graph?.viewport?.x)) ? Number(graph.viewport.x) : 0,
            y: Number.isFinite(Number(graph?.viewport?.y)) ? Number(graph.viewport.y) : 0,
            zoom: Number.isFinite(Number(graph?.viewport?.zoom)) ? clamp(Number(graph.viewport.zoom), 0.55, 1.8) : 1,
        },
    };
    return next;
};
const buildWhenFromNodeGraph = (graphRaw = {}, fallbackClause = {}) => {
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
        const clause = normalizePromptClause({
            left: '',
            op: compareData.op,
            rightType: compareData.fallbackRightType,
            right: parseTypedValue(compareData.fallbackRight, compareData.fallbackRightType),
        });
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
        const rightNode = getIncomingNode(node.id, 'right');
        if (rightNode && !seen.has(rightNode.id)) {
            if (rightNode.type === 'variable') {
                clause.rightType = 'variable';
                clause.right = String(rightNode?.data?.path || '').trim();
            } else if (rightNode.type === 'value') {
                const rightType = normalizeRightTypeValue(rightNode?.data?.rightType || 'number');
                clause.rightType = rightType;
                clause.right = parseTypedValue(rightNode?.data?.value, rightType);
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
                if (!childCondition) return { logic: 'not', clause: normalizePromptClause(fallbackClause) };
                return { logic: 'not', clause: childCondition };
            }
            const inputPorts = getNodePortSpec(node).inputs;
            const inputs = inputPorts
                .map((port) => getIncomingNode(node.id, port))
                .filter(Boolean);
            const clauses = inputs
                .map(child => buildCondition(child.id, nextSeen))
                .filter(Boolean);
            if (!clauses.length) clauses.push(normalizePromptClause(fallbackClause));
            return { logic, clauses };
        }
        if (node.type === 'result') {
            const child = getIncomingNode(node.id, 'in');
            return child ? buildCondition(child.id, nextSeen) : normalizePromptClause(fallbackClause);
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
        return normalizePromptClause(fallbackClause);
    };
    const resultNode = nodes.find(node => node.type === 'result') || null;
    const built = buildCondition(resultNode?.id, new Set()) || normalizePromptClause(fallbackClause);
    if (built?.logic && Array.isArray(built.clauses)) {
        return {
            logic: normalizeLogicValue(built.logic),
            clauses: built.clauses.map(clause => {
                if (clause?.logic) return clause;
                return normalizePromptClause(clause);
            }),
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

const normalizePromptClause = (raw = {}) => {
    const clause = raw && typeof raw === 'object' ? { ...raw } : {};
    return {
        left: String(clause.left || '').trim(),
        op: String(clause.op || '>').trim(),
        right: clause.right ?? '',
        rightType: String(clause.rightType || 'number').trim(),
        defineVariable: clause.defineVariable && typeof clause.defineVariable === 'object'
            ? {
                name: String(clause.defineVariable.name || '').trim(),
                type: String(clause.defineVariable.type || 'number').trim().toLowerCase(),
                default: clause.defineVariable.default ?? 0,
            }
            : null,
    };
};

const isConditionTreeGroup = (raw = {}) => {
    if (!raw || typeof raw !== 'object') return false;
    const logic = String(raw.logic || '').trim().toLowerCase();
    return logic === 'and' || logic === 'or' || logic === 'not' || Array.isArray(raw.clauses) || (raw.clause && typeof raw.clause === 'object');
};

const createDefaultPromptClause = () => normalizePromptClause({
    left: '',
    op: '>',
    right: 10,
    rightType: 'number',
});

const buildVariableCreationDraft = (raw = {}) => {
    const draft = raw && typeof raw === 'object' ? { ...raw } : {};
    const type = ['number', 'string', 'boolean'].includes(String(draft.type || '').trim().toLowerCase())
        ? String(draft.type).trim().toLowerCase()
        : 'number';
    const opRaw = String(draft.op || '>').trim();
    const knownOps = new Set(BLOCK_OP_OPTIONS.map(opt => String(opt.value)));
    const op = knownOps.has(opRaw) ? opRaw : '>';
    const rightType = normalizeRightTypeValue(draft.rightType || 'number');
    return {
        name: String(draft.name || '').trim(),
        type,
        defaultValueText: stringifyTypedValue(
            draft.defaultValue ?? (type === 'number' ? 0 : (type === 'boolean' ? false : '')),
            type,
        ),
        op,
        rightType,
        rightValueText: stringifyTypedValue(
            draft.rightValue ?? (rightType === 'number' ? 10 : (rightType === 'boolean' ? false : '')),
            rightType,
        ),
    };
};

const normalizeConditionTree = (raw = null, fallbackClause = null) => {
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

const getPrimaryClauseFromConditionTree = (raw = null, fallbackClause = null) => {
    const node = normalizeConditionTree(raw, fallbackClause);
    if (!node || typeof node !== 'object') return normalizePromptClause(fallbackClause || createDefaultPromptClause());
    if (node.logic === 'not') return getPrimaryClauseFromConditionTree(node.clause, fallbackClause);
    if (Array.isArray(node.clauses)) {
        const first = node.clauses[0];
        return getPrimaryClauseFromConditionTree(first, fallbackClause);
    }
    return normalizePromptClause(node);
};

const visitConditionTree = (node, visitor, path = 'root') => {
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

const normalizePromptBlock = (raw = {}, index = 0, fallbackContent = '') => {
    const block = raw && typeof raw === 'object' ? { ...raw } : {};
    const whenRaw = block.when && typeof block.when === 'object' ? block.when : {};
    const normalizedWhenTree = normalizeConditionTree(whenRaw, createDefaultPromptClause());
    const primaryClause = getPrimaryClauseFromConditionTree(normalizedWhenTree, createDefaultPromptClause());
    const normalizedGraph = normalizeNodeGraph(
        block.nodeGraph,
        normalizedWhenTree,
        primaryClause,
    );
    const uiMode = 'node';
    let normalizedWhen = normalizedWhenTree;
    if (uiMode === 'node') {
        normalizedWhen = buildWhenFromNodeGraph(normalizedGraph, primaryClause);
    }
    normalizedWhen = normalizeConditionTree(normalizedWhen, primaryClause);
    return {
        id: String(block.id || '').trim() || genBlockId(),
        title: String(block.title || `内容 ${index + 1}`).trim(),
        enabled: block.enabled !== false,
        content: String(block.content ?? (index === 0 ? fallbackContent : '')).trim(),
        role: Number.isFinite(Number(block.role)) ? Number(block.role) : 0,
        priority: Number.isFinite(Number(block.priority)) ? Number(block.priority) : 100,
        uiMode,
        nodeGraph: normalizedGraph,
        when: normalizedWhen,
    };
};

const canUseApiConfig = config => {
    const cfg = config || {};
    const hasKey = typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0;
    const hasVertexSa =
        cfg.provider === 'vertexai' &&
        typeof cfg.vertexaiServiceAccount === 'string' &&
        cfg.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
};

const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') {
        return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
};

const stripCodeFence = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const withoutStart = raw.replace(/^```(?:yaml)?\s*/i, '');
    return withoutStart.replace(/```\s*$/i, '').trim();
};

const loadWorldAiInput = () => {
    try {
        return String(localStorage.getItem(WORLD_AI_INPUT_KEY) || '');
    } catch {
        return '';
    }
};

const saveWorldAiInput = (value) => {
    try {
        localStorage.setItem(WORLD_AI_INPUT_KEY, String(value || ''));
    } catch {}
};

const loadWorldAiTemplate = () => {
    try {
        const stored = String(localStorage.getItem(WORLD_AI_TEMPLATE_KEY) || '').trim();
        return stored || WORLD_AI_TEMPLATE;
    } catch {
        return WORLD_AI_TEMPLATE;
    }
};

const saveWorldAiTemplate = (value) => {
    try {
        const trimmed = String(value || '').trim();
        localStorage.setItem(WORLD_AI_TEMPLATE_KEY, trimmed || WORLD_AI_TEMPLATE);
    } catch {}
};

const loadRecentVariableNames = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(WORLD_VAR_BROWSER_RECENT_KEY) || '[]');
        return Array.isArray(raw)
            ? raw.map(item => String(item || '').trim()).filter(Boolean).slice(0, 24)
            : [];
    } catch {
        return [];
    }
};

const saveRecentVariableNames = (names = []) => {
    try {
        const list = Array.isArray(names)
            ? names.map(item => String(item || '').trim()).filter(Boolean).slice(0, 24)
            : [];
        localStorage.setItem(WORLD_VAR_BROWSER_RECENT_KEY, JSON.stringify(list));
    } catch {}
};

const buildWorldAiMessages = (template, inputText) => {
    const trimmedTemplate = String(template || '').trim();
    const trimmedInput = String(inputText || '').trim();
    const userContent = [
        '请根据模板与用户输入生成完整的「角色世界书条目」。',
        '要求：',
        '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
        '- YAML 结构必须与模板一致；内容尽量充实，未知的可以写“未说明”。',
        '- 英文名使用英文；对话范例需明确“仅供参考，勿完全按照其输出”。',
        '',
        '<template>',
        trimmedTemplate || '(空模板)',
        '</template>',
        '',
        '<input>',
        trimmedInput || '(未提供)',
        '</input>',
    ].join('\n');
    return [{ role: 'user', content: userContent }];
};

const buildWorldAiContinueMessages = (template, inputText, draft) => {
    const trimmedTemplate = String(template || '').trim();
    const trimmedInput = String(inputText || '').trim();
    const trimmedDraft = String(draft || '').trim();
    const userContent = [
        '请在模板约束下，结合用户输入，对已有草稿进行补全与润色。',
        '要求：',
        '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
        '- YAML 结构必须与模板一致；不要丢失草稿里已经明确的设定。',
        '- 对话范例需明确“仅供参考，勿完全按照其输出”。',
        '',
        '<template>',
        trimmedTemplate || '(空模板)',
        '</template>',
        '',
        '<input>',
        trimmedInput || '(未提供)',
        '</input>',
        '',
        '<draft>',
        trimmedDraft || '(空草稿)',
        '</draft>',
    ].join('\n');
    return [{ role: 'user', content: userContent }];
};

const normalizeEntry = (entry = {}, index = 0) => {
    const e = { ...entry };

    e.id = e.id ?? (Number.isInteger(e.uid) ? String(e.uid) : `entry-${index}`);
    if (e.uid == null && /^\d+$/.test(e.id)) {
        e.uid = Number(e.id);
    }

    const comment = e.comment ?? e.title ?? '';
    e.comment = comment;
    e.title = comment;

    const key = normalizeArray(e.key ?? e.triggers);
    const keysecondary = normalizeArray(e.keysecondary ?? e.secondary);
    e.key = key;
    e.triggers = key;
    e.keysecondary = keysecondary;
    e.secondary = keysecondary;
    e.scope = [];

    const order = toNumber(e.order ?? e.priority, 100);
    e.order = order;
    e.priority = order;

    e.depth = toNumber(e.depth, DEFAULT_DEPTH);
    e.position = toNumber(e.position, 0);
    e.role = toNumber(e.role, 0);

    e.disable = Boolean(e.disable);
    e.constant = Boolean(e.constant);
    e.selective = Boolean(e.selective);
    // 触发策略仅保留蓝/绿两态；禁用状态独立控制。
    if (e.constant) {
        e.selective = false;
    } else if (!e.selective) {
        e.selective = true;
    }
    e.selectiveLogic = toNumber(e.selectiveLogic, 0);

    // 概率：旧格式可能是 0-1 的 ratio
    const rawProb = e.probability;
    const probPercent = typeof rawProb === 'number'
        ? (rawProb <= 1 ? Math.round(rawProb * 100) : Math.round(rawProb))
        : 100;
    e.probability = probPercent;
    e.useProbability = e.useProbability !== false;

    e.ignoreBudget = Boolean(e.ignoreBudget);
    e.excludeRecursion = Boolean(e.excludeRecursion);
    e.preventRecursion = Boolean(e.preventRecursion);
    e.vectorized = Boolean(e.vectorized);
    e.addMemo = Boolean(e.addMemo);

    e.matchPersonaDescription = Boolean(e.matchPersonaDescription);
    e.matchCharacterDescription = Boolean(e.matchCharacterDescription);
    e.matchCharacterPersonality = Boolean(e.matchCharacterPersonality);
    e.matchCharacterDepthPrompt = Boolean(e.matchCharacterDepthPrompt);
    e.matchScenario = Boolean(e.matchScenario);
    e.matchCreatorNotes = Boolean(e.matchCreatorNotes);

    e.group = e.group ?? '';
    e.groupOverride = Boolean(e.groupOverride);
    e.groupWeight = toNumber(e.groupWeight, DEFAULT_WEIGHT);

    e.scanDepth = e.scanDepth ?? null;
    e.caseSensitive = e.caseSensitive ?? null;
    e.matchWholeWords = e.matchWholeWords ?? null;
    e.useGroupScoring = e.useGroupScoring ?? null;

    e.automationId = e.automationId ?? '';
    e.sticky = e.sticky ?? null;
    e.cooldown = e.cooldown ?? null;
    e.delay = e.delay ?? null;
    e.delayUntilRecursion = toNumber(e.delayUntilRecursion, 0);

    e.content = e.content ?? '';
    const promptBlocksRaw = Array.isArray(e.promptBlocks) ? e.promptBlocks : [];
    e.promptBlocks = promptBlocksRaw.length
        ? promptBlocksRaw.map((block, idx) => normalizePromptBlock(block, idx, e.content))
        : [normalizePromptBlock({ content: e.content, title: e.comment || `内容 ${index + 1}` }, 0, e.content)];
    e.promptMode = String(e.promptMode || 'hybrid').trim().toLowerCase();
    if (!['legacy', 'blocks', 'hybrid'].includes(e.promptMode)) e.promptMode = 'hybrid';
    const firstContent = String(e.promptBlocks?.[0]?.content || '').trim();
    if (firstContent) e.content = firstContent;
    return e;
};

const createDefaultEntry = (index = 0) => normalizeEntry({ constant: true, selective: false }, index);

const positionLabel = (pos = 0, role = 0, depth = DEFAULT_DEPTH) => {
    switch (Number(pos)) {
        case 0: return '↑Char';
        case 1: return '↓Char';
        case 2: return '↑AT';
        case 3: return '↓AT';
        case 4: return `@D${depth}/${ROLE_OPTIONS.find(r => r.value === role)?.label || 'system'}`;
        case 5: return '↑EM';
        case 6: return '↓EM';
        default: return String(pos);
    }
};

export class WorldEditorModal {
    constructor({ onSaved } = {}) {
        this.overlay = null;
        this.modal = null;
        this.entriesListEl = null;
        this.editorEl = null;
        this.nameInputEl = null;
        this.saveBtn = null;
        this.addBtn = null;
        this.worldName = '';
        this.originalName = '';
        this.data = { name: '', entries: [] };
        this.currentIndex = 0;
        this.onSaved = onSaved;
        this.aiOverlay = null;
        this.aiModal = null;
        this.aiInputEl = null;
        this.aiTemplateEl = null;
        this.aiStatusEl = null;
        this.aiGenerateBtn = null;
        this.aiContinueBtn = null;
        this.aiCloseBtn = null;
        this.aiBusy = false;
        this.aiRequestId = 0;
        this.aiPendingEntryId = '';
        this.aiTargetEntryId = '';
        this.chatConfigManager = new ConfigManager();
        this.batchMode = false;
        this.selectedEntries = new Set();
        this.batchToggleBtn = null;
        this.batchBarEl = null;
        this.batchCountEl = null;
        this.batchSelectAllBtn = null;
        this.batchClearBtn = null;
        this.batchCreateBtn = null;
        this.batchCreateAllBtn = null;
        this.manageBtn = null;
        this.manageOverlay = null;
        this.manageModal = null;
        this.manageCountEl = null;
        this.manageSelectAllBtn = null;
        this.manageClearBtn = null;
        this.manageCreateSelectedBtn = null;
        this.manageDeleteBtn = null;
        this.manageMoveUpBtn = null;
        this.manageMoveDownBtn = null;
        this.manageMoveTopBtn = null;
        this.manageMoveBottomBtn = null;
        this.manageListEl = null;
        this.chatNameOverlay = null;
        this.chatNameModal = null;
        this.chatNameInputEl = null;
        this.chatNameResolve = null;
        this.chatNameKeyHandler = null;
        this.variableOverlay = null;
        this.variableModal = null;
        this.variableNameInputEl = null;
        this.variableDefaultInputEl = null;
        this.variableRightInputEl = null;
        this.variableTypeBtn = null;
        this.variableOpBtn = null;
        this.variableRightTypeBtn = null;
        this.variableResolve = null;
        this.variableKeyHandler = null;
        this.variableModalDraft = buildVariableCreationDraft();
        this.variableBrowserOverlay = null;
        this.variableBrowserModal = null;
        this.variableBrowserSearchEl = null;
        this.variableBrowserListEl = null;
        this.variableBrowserEmptyEl = null;
        this.variableBrowserScopeEl = null;
        this.variableBrowserNameEl = null;
        this.variableBrowserSourceEl = null;
        this.variableBrowserTypeBtn = null;
        this.variableBrowserCurrentEl = null;
        this.variableBrowserDefaultEl = null;
        this.variableBrowserInitialEl = null;
        this.variableBrowserDeleteBtn = null;
        this.variableBrowserResolve = null;
        this.variableBrowserKeyHandler = null;
        this.variableBrowserState = {
            search: '',
            selectedId: '',
            scope: 'current',
            recentIds: loadRecentVariableNames(),
            draft: null,
        };
        this.refMode = false;
        this.refLocalEntries = null;
        this.refSyncTimer = null;
        this.refSyncDelay = 900;
        this.refSyncInFlight = false;
        this.refSyncPending = false;
        this.entrySearchTerm = '';
        this.entryPageSize = 5;
        this.entryPageIndex = 0;
        this.entrySearchEl = null;
        this.entryPageSizeEl = null;
        this.entryPagePrevBtn = null;
        this.entryPageNextBtn = null;
        this.entryPageIndicatorEl = null;
        this.entryDotsEl = null;
        this.entryPageScrollLock = false;
        this.entryTotalPages = 1;
        this.customSelectMenuEl = null;
        this.customSelectMenuAnchor = null;
        this.customSelectMenuCleanup = null;
        this.entryBlockPageMap = new Map();
        this.blockFlipMap = new Map();
        this.blockExpandMap = new Map();
        this.blockBackViewMap = new Map();
        this.blockEditorFocusMap = new Map();
        this.blockManageOverlay = null;
        this.blockManageModal = null;
        this.blockManageList = null;
        this.blockManageCloseBtn = null;
        this.blockManageEntryId = '';
        this.nodeEditorCleanup = null;
    }

    async show(name, data) {
        if (!this.modal) {
            this.createUI();
        }
        this.worldName = name;
        this.originalName = name;
        this.data = deepClone(data || { name, entries: [] });
        if (!Array.isArray(this.data.entries)) this.data.entries = [];
        const hasRefs = Array.isArray(this.data.refs) && this.data.refs.length > 0;
        const hasEntries = this.data.entries.length > 0;
        this.refMode = hasRefs && !hasEntries;
        this.refLocalEntries = hasEntries ? null : this.data.entries.slice();
        if (this.refMode) {
            try {
                const resolved = await this.resolveRefEntriesForDisplay(this.data.refs);
                this.data.entries = Array.isArray(resolved) ? resolved : [];
            } catch (err) {
                logger.warn('读取引用世界书失败', err);
                this.data.entries = [];
            }
        }
        this.data.entries = this.data.entries.map((e, i) => normalizeEntry(e, i));
        if (!this.data.entries.length && !this.refMode) {
            this.data.entries.push(createDefaultEntry(0));
        }
        this.batchMode = false;
        this.selectedEntries.clear();
        this.blockFlipMap.clear();
        this.blockExpandMap.clear();
        this.blockManageEntryId = '';
        this.entrySearchTerm = '';
        this.entryPageIndex = 0;
        this.updateBatchBar();
        if (this.nameInputEl) {
            const displayName = String(this.data?.name || name || '').trim();
            this.nameInputEl.value = displayName || '';
        }
        if (this.entrySearchEl) this.entrySearchEl.value = '';
        this.currentIndex = 0;
        this.renderList();
        this.selectEntry(0);
        this.updateRefModeUI();
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';
    }

    hide() {
        this.cleanupNodeEditor();
        this.closeCustomSelectMenu();
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.modal) this.modal.style.display = 'none';
        this.hideManageModal();
        this.hideAiModal();
        this.closeVariableModal(null);
        this.closeVariableBrowser(null);
        this.hideBlockManageModal();
        if (this.refSyncTimer) {
            clearTimeout(this.refSyncTimer);
            this.refSyncTimer = null;
        }
    }

    cleanupNodeEditor() {
        if (typeof this.nodeEditorCleanup === 'function') {
            try { this.nodeEditorCleanup(); } catch {}
        }
        this.nodeEditorCleanup = null;
    }

    updateRefModeUI() {
        const disabled = Boolean(this.refMode);
        const applyState = (btn) => {
            if (!btn) return;
            btn.disabled = disabled;
            btn.style.opacity = disabled ? '0.6' : '';
            btn.style.cursor = disabled ? 'not-allowed' : '';
        };
        applyState(this.addBtn);
        applyState(this.manageBtn);
        if (this.nameInputEl) {
            this.nameInputEl.disabled = disabled;
            this.nameInputEl.style.opacity = disabled ? '0.6' : '';
        }
    }

    scheduleRefSync() {
        if (!this.refMode) return;
        if (this.refSyncTimer) clearTimeout(this.refSyncTimer);
        this.refSyncTimer = setTimeout(() => this.flushRefSync(), this.refSyncDelay);
    }

    async flushRefSync() {
        if (!this.refMode) return;
        if (this.refSyncInFlight) {
            this.refSyncPending = true;
            return;
        }
        this.refSyncInFlight = true;
        try {
            await this.saveRefEdits({ showToast: false });
        } finally {
            this.refSyncInFlight = false;
            if (this.refSyncPending) {
                this.refSyncPending = false;
                this.scheduleRefSync();
            }
        }
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'world-editor-overlay';
        this.overlay.className = 'popup-overlay';
        this.overlay.style.display = 'none';
        // Ensure editor sits above world management panel
        this.overlay.style.position = 'fixed';
        this.overlay.style.inset = '0';
        this.overlay.style.background = 'rgba(0,0,0,0.45)';
        this.overlay.style.zIndex = '22000';
        this.overlay.onclick = () => this.hide();

        this.modal = document.createElement('div');
        this.modal.id = 'world-editor-modal';
        this.modal.className = 'world-editor-popup';
        this.modal.style.display = 'none';
        this.modal.style.position = 'fixed';
        this.modal.style.top = '50%';
        this.modal.style.left = '50%';
        this.modal.style.transform = 'translate(-50%, -50%)';
        this.modal.style.zIndex = '23000';
        this.modal.onclick = (e) => e.stopPropagation();

        this.modal.innerHTML = `
            <div class="world-editor-header">
                <div class="world-editor-title">
                    <span style="margin-right:6px;">世界书</span>
                    <input id="world-editor-name" type="text" placeholder="名称" style="font-weight:700; font-size:14px; color:#111827; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px; min-width:140px; max-width:260px;">
                </div>
                <div class="world-editor-actions">
                    <button id="world-editor-save">保存</button>
                    <button id="world-editor-export">导出</button>
                    <button id="world-editor-manage">管理</button>
                    <button id="world-editor-close" class="world-editor-close">×</button>
                </div>
            </div>
            <div class="world-editor-body">
                <div class="world-entries-column">
                    <div class="world-entries-toolbar">
                        <button id="world-entry-add">＋ 新条目</button>
                        <div class="world-entries-search">
                            <input id="world-entry-search" type="search" placeholder="搜索条目">
                        </div>
                        <div class="world-entries-pager">
                            <span class="world-entries-pager-label">每页</span>
                            <input id="world-entry-page-size" type="number" min="1" max="200" step="1" list="world-entry-page-sizes" value="5">
                            <datalist id="world-entry-page-sizes">
                                <option value="5"></option>
                                <option value="10"></option>
                                <option value="50"></option>
                                <option value="100"></option>
                            </datalist>
                        </div>
                    </div>
                    <ul id="world-entries-list" class="world-entries-list"></ul>
                    <div id="world-entry-dots" class="world-entries-dots"></div>
                </div>
                <div id="world-entry-editor" class="world-entry-editor"></div>
            </div>
        `;

        this.entriesListEl = this.modal.querySelector('#world-entries-list');
        this.editorEl = this.modal.querySelector('#world-entry-editor');
        this.nameInputEl = this.modal.querySelector('#world-editor-name');
        this.saveBtn = this.modal.querySelector('#world-editor-save');
        this.addBtn = this.modal.querySelector('#world-entry-add');
        this.exportBtn = this.modal.querySelector('#world-editor-export');
        this.manageBtn = this.modal.querySelector('#world-editor-manage');
        this.entrySearchEl = this.modal.querySelector('#world-entry-search');
        this.entryPageSizeEl = this.modal.querySelector('#world-entry-page-size');
        this.entryPagePrevBtn = this.modal.querySelector('#world-entry-page-prev');
        this.entryPageNextBtn = this.modal.querySelector('#world-entry-page-next');
        this.entryPageIndicatorEl = this.modal.querySelector('#world-entry-page-indicator');
        this.entryDotsEl = this.modal.querySelector('#world-entry-dots');

        this.modal.querySelector('#world-editor-close').onclick = () => this.hide();
        this.saveBtn.onclick = () => this.saveWorld();
        if (this.exportBtn) this.exportBtn.onclick = () => this.exportWorld();
        this.addBtn.onclick = () => this.addEntry();
        if (this.manageBtn) this.manageBtn.onclick = () => this.showManageModal();
        if (this.entrySearchEl) {
            this.entrySearchEl.addEventListener('input', () => {
                this.entrySearchTerm = String(this.entrySearchEl.value || '');
                this.entryPageIndex = 0;
                this.renderList();
            });
        }
        if (this.entryPageSizeEl) {
            this.entryPageSizeEl.addEventListener('input', () => {
                const raw = Number(this.entryPageSizeEl.value);
                if (!Number.isFinite(raw)) return;
                const next = Math.max(1, Math.min(200, Math.trunc(raw)));
                this.entryPageSize = next;
                this.entryPageSizeEl.value = String(next);
                this.entryPageIndex = 0;
                this.renderList();
            });
        }
        if (this.entriesListEl) {
            this.entriesListEl.addEventListener('scroll', () => {
                if (this.entryPageScrollLock) return;
                const width = this.entriesListEl.clientWidth || 1;
                const idx = Math.round(this.entriesListEl.scrollLeft / width);
                if (idx !== this.entryPageIndex) {
                    this.entryPageIndex = idx;
                    this.updateEntryPageIndicator();
                }
            });
        }

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
        this.createAiModal();
        this.createManageModal();
    }

    createAiModal() {
        if (this.aiModal) return;
        this.aiOverlay = document.createElement('div');
        this.aiOverlay.className = 'world-ai-overlay';
        this.aiOverlay.style.display = 'none';
        this.aiOverlay.addEventListener('click', () => this.hideAiModal());

        this.aiModal = document.createElement('div');
        this.aiModal.className = 'world-ai-modal';
        this.aiModal.style.display = 'none';
        this.aiModal.innerHTML = `
            <div class="world-ai-header">
                <div>
                    <div class="world-ai-title">AI 生成角色世界书</div>
                    <div class="world-ai-subtitle">输入人物设定，自动生成 YAML 条目</div>
                </div>
                <button type="button" class="world-ai-close" aria-label="关闭">×</button>
            </div>
            <div class="world-ai-body">
                <label class="world-ai-label">人物设定</label>
                <textarea id="world-ai-input" class="world-ai-textarea" placeholder="例如：名字、性别、背景、外貌、性格、说话习惯、关系等"></textarea>
                <div class="world-ai-hint">生成过程中可关闭此窗，完成后自动写入内容并保存。</div>

                <label class="world-ai-label">生成模板</label>
                <textarea id="world-ai-template" class="world-ai-textarea world-ai-template" placeholder="可编辑模板（建议保留字段结构）"></textarea>

                <div class="world-ai-actions">
                    <button type="button" class="world-ai-btn ghost" id="world-ai-cancel">关闭</button>
                    <button type="button" class="world-ai-btn" id="world-ai-continue">继续</button>
                    <button type="button" class="world-ai-btn primary" id="world-ai-generate">生成</button>
                </div>
                <div class="world-ai-status" id="world-ai-status"></div>
            </div>
        `;
        this.aiModal.addEventListener('click', (e) => e.stopPropagation());

        this.aiInputEl = this.aiModal.querySelector('#world-ai-input');
        this.aiTemplateEl = this.aiModal.querySelector('#world-ai-template');
        this.aiStatusEl = this.aiModal.querySelector('#world-ai-status');
        this.aiGenerateBtn = this.aiModal.querySelector('#world-ai-generate');
        this.aiContinueBtn = this.aiModal.querySelector('#world-ai-continue');
        this.aiCloseBtn = this.aiModal.querySelector('.world-ai-close');
        const cancelBtn = this.aiModal.querySelector('#world-ai-cancel');

        if (this.aiInputEl) {
            this.aiInputEl.value = loadWorldAiInput();
            this.aiInputEl.addEventListener('input', () => saveWorldAiInput(this.aiInputEl.value));
        }
        if (this.aiTemplateEl) {
            this.aiTemplateEl.value = loadWorldAiTemplate();
            this.aiTemplateEl.addEventListener('input', () => saveWorldAiTemplate(this.aiTemplateEl.value));
        }

        if (this.aiGenerateBtn) this.aiGenerateBtn.onclick = () => this.handleAiGenerate();
        if (this.aiContinueBtn) this.aiContinueBtn.onclick = () => this.handleAiContinue();
        if (this.aiCloseBtn) this.aiCloseBtn.onclick = () => this.hideAiModal();
        if (cancelBtn) cancelBtn.onclick = () => this.hideAiModal();

        document.body.appendChild(this.aiOverlay);
        document.body.appendChild(this.aiModal);
    }

    showAiModal(entry) {
        if (!entry) return;
        if (!this.aiModal) this.createAiModal();
        this.aiTargetEntryId = String(entry.id || '');
        if (this.aiTemplateEl && !String(this.aiTemplateEl.value || '').trim()) {
            this.aiTemplateEl.value = loadWorldAiTemplate();
        }
        this.setAiStatus('');
        this.aiOverlay.style.display = 'block';
        this.aiModal.style.display = 'block';
    }

    hideAiModal() {
        if (this.aiOverlay) this.aiOverlay.style.display = 'none';
        if (this.aiModal) this.aiModal.style.display = 'none';
    }

    createVariableModal() {
        if (this.variableModal) return;
        this.variableOverlay = document.createElement('div');
        this.variableOverlay.className = 'world-var-overlay';
        this.variableOverlay.style.display = 'none';
        this.variableOverlay.addEventListener('click', () => this.closeVariableModal(null));

        this.variableModal = document.createElement('div');
        this.variableModal.className = 'world-var-modal';
        this.variableModal.style.display = 'none';
        this.variableModal.innerHTML = `
            <div class="world-var-header">
                <div>
                    <div class="world-var-title">新增变量</div>
                    <div class="world-var-subtitle">默认会创建数值条件：变量名 > 10，只填名称即可。</div>
                </div>
                <button type="button" class="world-var-close" aria-label="关闭">×</button>
            </div>
            <div class="world-var-body">
                <label class="world-var-label" for="world-var-name">变量名</label>
                <input id="world-var-name" class="world-var-input" type="text" value="" placeholder="例如 stat_data.苏晚晴.love_degree.0">

                <div class="world-var-grid">
                    <div class="world-var-field">
                        <label class="world-var-label">变量类型</label>
                        <button type="button" class="world-app-select-btn" id="world-var-type-btn">
                            <span>数字</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label" for="world-var-default">默认值</label>
                        <input id="world-var-default" class="world-var-input" type="text" value="0" placeholder="0">
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label">比较</label>
                        <button type="button" class="world-app-select-btn" id="world-var-op-btn">
                            <span>大于 (&gt;)</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label">比较值类型</label>
                        <button type="button" class="world-app-select-btn" id="world-var-righttype-btn">
                            <span>数字</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                </div>

                <div class="world-var-field" id="world-var-right-wrap">
                    <label class="world-var-label" for="world-var-right">比较值</label>
                    <input id="world-var-right" class="world-var-input" type="text" value="10" placeholder="10">
                </div>
            </div>
            <div class="world-var-actions">
                <button type="button" class="world-var-btn ghost" id="world-var-cancel">取消</button>
                <button type="button" class="world-var-btn primary" id="world-var-ok">创建</button>
            </div>
        `;
        this.variableModal.addEventListener('click', (e) => e.stopPropagation());

        this.variableNameInputEl = this.variableModal.querySelector('#world-var-name');
        this.variableDefaultInputEl = this.variableModal.querySelector('#world-var-default');
        this.variableRightInputEl = this.variableModal.querySelector('#world-var-right');
        this.variableTypeBtn = this.variableModal.querySelector('#world-var-type-btn');
        this.variableOpBtn = this.variableModal.querySelector('#world-var-op-btn');
        this.variableRightTypeBtn = this.variableModal.querySelector('#world-var-righttype-btn');

        this.variableModal.querySelector('.world-var-close')?.addEventListener('click', () => this.closeVariableModal(null));
        this.variableModal.querySelector('#world-var-cancel')?.addEventListener('click', () => this.closeVariableModal(null));
        this.variableModal.querySelector('#world-var-ok')?.addEventListener('click', () => this.submitVariableModal());

        this.variableTypeBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCustomSelectMenu({
                anchorEl: this.variableTypeBtn,
                options: BLOCK_RIGHT_TYPE_OPTIONS.filter(opt => opt.value !== 'variable'),
                currentValue: this.variableModalDraft.type,
                onSelect: (value) => {
                    this.variableModalDraft.type = ['number', 'string', 'boolean'].includes(String(value || '')) ? String(value) : 'number';
                    this.renderVariableModalDraft();
                },
            });
        });
        this.variableOpBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCustomSelectMenu({
                anchorEl: this.variableOpBtn,
                options: BLOCK_OP_OPTIONS,
                currentValue: this.variableModalDraft.op,
                onSelect: (value) => {
                    this.variableModalDraft.op = String(value || '>');
                    this.renderVariableModalDraft();
                },
            });
        });
        this.variableRightTypeBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCustomSelectMenu({
                anchorEl: this.variableRightTypeBtn,
                options: BLOCK_RIGHT_TYPE_OPTIONS,
                currentValue: this.variableModalDraft.rightType,
                onSelect: (value) => {
                    this.variableModalDraft.rightType = normalizeRightTypeValue(value);
                    this.renderVariableModalDraft();
                },
            });
        });

        document.body.appendChild(this.variableOverlay);
        document.body.appendChild(this.variableModal);
    }

    renderVariableModalDraft() {
        if (!this.variableModal) return;
        const draft = buildVariableCreationDraft(this.variableModalDraft);
        this.variableModalDraft = draft;
        if (this.variableNameInputEl) this.variableNameInputEl.value = draft.name;
        if (this.variableDefaultInputEl) this.variableDefaultInputEl.value = draft.defaultValueText;
        if (this.variableRightInputEl) this.variableRightInputEl.value = draft.rightValueText;
        if (this.variableTypeBtn) {
            const labelEl = this.variableTypeBtn.querySelector('span');
            if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.type, '数字');
        }
        if (this.variableOpBtn) {
            const labelEl = this.variableOpBtn.querySelector('span');
            if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_OP_OPTIONS, draft.op, '大于 (>)');
        }
        if (this.variableRightTypeBtn) {
            const labelEl = this.variableRightTypeBtn.querySelector('span');
            if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.rightType, '数字');
        }
        const rightWrap = this.variableModal.querySelector('#world-var-right-wrap');
        const hideRight = ['is_empty', 'not_empty'].includes(String(draft.op || '').trim().toLowerCase());
        if (rightWrap) rightWrap.style.display = hideRight ? 'none' : '';
        if (this.variableRightTypeBtn) this.variableRightTypeBtn.disabled = hideRight;
        if (this.variableRightInputEl) this.variableRightInputEl.disabled = hideRight;
    }

    openVariableModal(initialDraft = {}) {
        if (!this.variableModal) this.createVariableModal();
        if (!this.variableOverlay || !this.variableModal) return Promise.resolve(null);
        this.variableModalDraft = buildVariableCreationDraft(initialDraft);
        this.renderVariableModalDraft();
        this.variableOverlay.style.display = 'block';
        this.variableModal.style.display = 'block';
        queueMicrotask(() => {
            this.variableNameInputEl?.focus();
            this.variableNameInputEl?.select();
        });

        if (this.variableKeyHandler) {
            document.removeEventListener('keydown', this.variableKeyHandler);
        }
        this.variableKeyHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeVariableModal(null);
            } else if (event.key === 'Enter') {
                const target = event.target;
                if (target && target.tagName === 'TEXTAREA') return;
                event.preventDefault();
                this.submitVariableModal();
            }
        };
        document.addEventListener('keydown', this.variableKeyHandler);
        return new Promise((resolve) => {
            this.variableResolve = resolve;
        });
    }

    submitVariableModal() {
        const name = String(this.variableNameInputEl?.value || '').trim();
        if (!name) {
            window.toastr?.warning?.('请填写变量名');
            this.variableNameInputEl?.focus();
            return;
        }
        const draft = buildVariableCreationDraft({
            ...this.variableModalDraft,
            name,
            defaultValue: this.variableDefaultInputEl?.value,
            rightValue: this.variableRightInputEl?.value,
        });
        const payload = {
            name,
            type: draft.type,
            defaultValue: parseTypedValue(draft.defaultValueText, draft.type),
            op: draft.op,
            rightType: draft.rightType,
            rightValue: parseTypedValue(draft.rightValueText, draft.rightType),
        };
        this.closeVariableModal(payload);
    }

    closeVariableModal(value = null) {
        this.closeCustomSelectMenu();
        if (this.variableOverlay) this.variableOverlay.style.display = 'none';
        if (this.variableModal) this.variableModal.style.display = 'none';
        if (this.variableKeyHandler) {
            document.removeEventListener('keydown', this.variableKeyHandler);
            this.variableKeyHandler = null;
        }
        if (this.variableResolve) {
            const resolve = this.variableResolve;
            this.variableResolve = null;
            resolve(value);
        }
    }

    getSessionVariableRecords(options = {}) {
        const opts = typeof options === 'string' ? { searchTerm: options } : (options && typeof options === 'object' ? options : {});
        const searchTerm = String(opts.searchTerm || '');
        const scope = String(opts.scope || 'current').trim().toLowerCase();
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        if (!chatStore || !sid) return [];
        const useGlobal = Boolean(typeof bridge?.isSharedVariableSession === 'function' && bridge.isSharedVariableSession(sid));
        const localVars = chatStore?.listVariables?.(sid) || {};
        const globalVars = chatStore?.listGlobalVariables?.() || {};
        const initialVars = chatStore?.listInitialVariables?.(sid) || {};
        const schemas = chatStore?.listVariableSchemas?.(sid) || {};
        const query = String(searchTerm || '').trim().toLowerCase();
        const recentIds = Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [];
        const getRecentIndex = (item) => {
            const idIndex = recentIds.indexOf(item.id);
            if (idIndex >= 0) return idIndex;
            return recentIds.indexOf(item.name);
        };
        const isRecentRecord = (item) => getRecentIndex(item) >= 0;
        const buildRecords = (sourceName, sourceVars = {}, includeInitial = false) => {
            const keys = new Set([
                ...Object.keys(sourceVars || {}),
                ...Object.keys(schemas || {}),
                ...(includeInitial ? Object.keys(initialVars || {}) : []),
            ].map(key => String(key || '').trim()).filter(Boolean));
            return [...keys].map((key) => {
                const schema = schemas[key] || null;
                const fallbackType = typeof sourceVars[key];
                const type = String(schema?.type || fallbackType || 'string').trim().toLowerCase();
                return {
                    id: `${sourceName}:${key}`,
                    name: key,
                    type: ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(type) ? type : 'string',
                    source: sourceName,
                    currentValue: sourceVars[key],
                    defaultValue: schema?.default,
                    initialValue: includeInitial ? initialVars[key] : undefined,
                    schema,
                };
            });
        };
        const sessionRecords = buildRecords('session', localVars, true);
        const globalRecords = buildRecords('global', globalVars, false);
        let records = [];
        if (scope === 'global') records = globalRecords;
        else if (scope === 'session') records = sessionRecords;
        else if (scope === 'recent') records = [...sessionRecords, ...globalRecords].filter(isRecentRecord);
        else records = useGlobal ? globalRecords : sessionRecords;
        records = records.filter((item) => {
            if (!query) return true;
            const haystack = [
                item.name,
                item.type,
                item.source === 'global' ? '全局' : '会话',
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
        records.sort((a, b) => {
            const recentDelta = getRecentIndex(a) - getRecentIndex(b);
            const aRecent = isRecentRecord(a);
            const bRecent = isRecentRecord(b);
            if (aRecent && bRecent && recentDelta !== 0) return recentDelta;
            if (aRecent !== bRecent) return aRecent ? -1 : 1;
            const nameDelta = a.name.localeCompare(b.name, 'zh-CN');
            if (nameDelta !== 0) return nameDelta;
            return a.source.localeCompare(b.source, 'zh-CN');
        });
        return records.map((item) => {
            const schema = item.schema || null;
            const type = String(item.type || schema?.type || 'string').trim().toLowerCase();
            return {
                ...item,
                type: ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(type) ? type : 'string',
            };
        });
    }

    setVariableBrowserScope(scope = 'current') {
        const nextScope = ['current', 'global', 'session', 'recent'].includes(String(scope || '').trim().toLowerCase())
            ? String(scope || '').trim().toLowerCase()
            : 'current';
        this.variableBrowserState.scope = nextScope;
        this.renderVariableBrowser();
    }

    rememberRecentVariable(record = null) {
        const item = record && typeof record === 'object' ? record : null;
        const id = String(item?.id || '').trim();
        const fallbackName = String(item?.name || '').trim();
        const marker = id || fallbackName;
        if (!marker) return;
        const current = Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [];
        const next = [marker, ...current.filter(entry => entry !== marker && entry !== fallbackName && !id.endsWith(`:${entry}`))].slice(0, 24);
        this.variableBrowserState.recentIds = next;
        saveRecentVariableNames(next);
    }

    deleteVariableBrowserDraft() {
        const draft = this.variableBrowserState.draft;
        if (!draft?.name) return false;
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        if (!chatStore || !sid) return false;
        if (draft.source === 'global') {
            chatStore.deleteGlobalVariable?.(draft.name);
        } else {
            chatStore.deleteVariable?.(draft.name, sid);
            chatStore.deleteInitialVariable?.(draft.name, sid);
        }
        chatStore.deleteVariableSchema?.(draft.name, sid);
        const nextRecent = (Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [])
            .filter(entry => entry !== draft.id && entry !== draft.name);
        this.variableBrowserState.recentIds = nextRecent;
        saveRecentVariableNames(nextRecent);
        this.variableBrowserState.selectedId = '';
        this.variableBrowserState.draft = null;
        this.renderVariableBrowser();
        window.toastr?.success?.('变量已删除');
        return true;
    }

    formatVariableBrowserValue(value, type = 'string') {
        if (value === undefined) return '未设置';
        if (value === null) return 'null';
        const normalizedType = String(type || 'string').trim().toLowerCase();
        if (normalizedType === 'boolean') return value ? 'true' : 'false';
        if (normalizedType === 'array' || normalizedType === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return '[object]';
            }
        }
        return String(value);
    }

    buildVariableBrowserDraft(record = null) {
        const item = record && typeof record === 'object' ? record : {};
        const typeRaw = String(item.type || item.schema?.type || 'string').trim().toLowerCase();
        const type = ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(typeRaw) ? typeRaw : 'string';
        return {
            id: String(item.id || `${item.source || 'session'}:${item.name || ''}`).trim(),
            name: String(item.name || '').trim(),
            type,
            currentValueText: this.formatVariableBrowserValue(item.currentValue, type),
            defaultValueText: this.formatVariableBrowserValue(item.defaultValue, type),
            initialValueText: this.formatVariableBrowserValue(item.initialValue, type),
            source: item.source === 'global' ? 'global' : 'session',
        };
    }

    createVariableBrowserModal() {
        if (this.variableBrowserModal) return;
        this.variableBrowserOverlay = document.createElement('div');
        this.variableBrowserOverlay.className = 'world-var-browser-overlay';
        this.variableBrowserOverlay.style.display = 'none';
        this.variableBrowserOverlay.addEventListener('click', () => this.closeVariableBrowser(null));

        this.variableBrowserModal = document.createElement('div');
        this.variableBrowserModal.className = 'world-var-browser-modal';
        this.variableBrowserModal.style.display = 'none';
        this.variableBrowserModal.innerHTML = `
            <div class="world-var-browser-header">
                <div>
                    <div class="world-var-browser-title">变量浏览器</div>
                    <div class="world-var-browser-subtitle">搜索、查看并管理当前会话可用变量。</div>
                </div>
                <button type="button" class="world-var-browser-close" aria-label="关闭">×</button>
            </div>
            <div class="world-var-browser-toolbar">
                <input id="world-var-browser-search" class="world-var-browser-search" type="text" placeholder="搜索变量名 / 类型">
                <button type="button" class="world-var-btn ghost" id="world-var-browser-create">新建变量</button>
            </div>
            <div class="world-var-browser-body">
                <div class="world-var-browser-list-wrap">
                    <div class="world-var-browser-scope" id="world-var-browser-scope">
                        <button type="button" class="world-var-browser-scope-btn is-active" data-scope="current">当前</button>
                        <button type="button" class="world-var-browser-scope-btn" data-scope="session">会话</button>
                        <button type="button" class="world-var-browser-scope-btn" data-scope="global">全局</button>
                        <button type="button" class="world-var-browser-scope-btn" data-scope="recent">最近</button>
                    </div>
                    <div class="world-var-browser-list" id="world-var-browser-list"></div>
                    <div class="world-var-browser-empty" id="world-var-browser-empty">当前没有可用变量。</div>
                </div>
                <div class="world-var-browser-detail">
                    <div class="world-var-browser-detail-head">
                        <div>
                            <div class="world-var-browser-detail-name" id="world-var-browser-name">未选择变量</div>
                            <div class="world-var-browser-detail-source" id="world-var-browser-source"></div>
                        </div>
                    </div>
                    <div class="world-var-browser-fields">
                        <div class="world-var-field">
                            <label class="world-var-label">变量类型</label>
                            <button type="button" class="world-app-select-btn" id="world-var-browser-type-btn">
                                <span>字符串</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </div>
                        <div class="world-var-field">
                            <label class="world-var-label" for="world-var-browser-current">当前值</label>
                            <input id="world-var-browser-current" class="world-var-input" type="text" value="" placeholder="当前值">
                        </div>
                        <div class="world-var-field">
                            <label class="world-var-label" for="world-var-browser-default">默认值</label>
                            <input id="world-var-browser-default" class="world-var-input" type="text" value="" placeholder="默认值">
                        </div>
                        <div class="world-var-field">
                            <label class="world-var-label" for="world-var-browser-initial">初始值</label>
                            <input id="world-var-browser-initial" class="world-var-input" type="text" value="" placeholder="初始值">
                        </div>
                    </div>
                    <div class="world-var-browser-actions">
                        <button type="button" class="world-var-btn danger ghost" id="world-var-browser-delete">删除变量</button>
                        <button type="button" class="world-var-btn ghost" id="world-var-browser-save">保存更改</button>
                        <button type="button" class="world-var-btn primary" id="world-var-browser-use">选中变量</button>
                    </div>
                </div>
            </div>
        `;
        this.variableBrowserModal.addEventListener('click', (event) => event.stopPropagation());

        this.variableBrowserSearchEl = this.variableBrowserModal.querySelector('#world-var-browser-search');
        this.variableBrowserListEl = this.variableBrowserModal.querySelector('#world-var-browser-list');
        this.variableBrowserEmptyEl = this.variableBrowserModal.querySelector('#world-var-browser-empty');
        this.variableBrowserScopeEl = this.variableBrowserModal.querySelector('#world-var-browser-scope');
        this.variableBrowserNameEl = this.variableBrowserModal.querySelector('#world-var-browser-name');
        this.variableBrowserSourceEl = this.variableBrowserModal.querySelector('#world-var-browser-source');
        this.variableBrowserTypeBtn = this.variableBrowserModal.querySelector('#world-var-browser-type-btn');
        this.variableBrowserCurrentEl = this.variableBrowserModal.querySelector('#world-var-browser-current');
        this.variableBrowserDefaultEl = this.variableBrowserModal.querySelector('#world-var-browser-default');
        this.variableBrowserInitialEl = this.variableBrowserModal.querySelector('#world-var-browser-initial');
        this.variableBrowserDeleteBtn = this.variableBrowserModal.querySelector('#world-var-browser-delete');

        this.variableBrowserModal.querySelector('.world-var-browser-close')?.addEventListener('click', () => this.closeVariableBrowser(null));
        this.variableBrowserScopeEl?.querySelectorAll('.world-var-browser-scope-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.setVariableBrowserScope(btn.dataset.scope || 'current'));
        });
        this.variableBrowserModal.querySelector('#world-var-browser-create')?.addEventListener('click', () => {
            const selectedId = String(this.variableBrowserState.selectedId || '').trim();
            const selected = this.getSessionVariableRecords({ scope: this.variableBrowserState.scope }).find(item => item.id === selectedId) || null;
            void this.openVariableModal(selected ? {
                name: selected.name,
                type: selected.type,
                defaultValue: selected.defaultValue,
            } : {}).then((payload) => {
                if (!payload) return;
                const targetSource = ['global', 'session'].includes(String(this.variableBrowserState.scope || '').trim())
                    ? String(this.variableBrowserState.scope).trim()
                    : null;
                this.ensureVariableInStore(payload.name, payload.type, payload.defaultValue, { source: targetSource });
                const nextSource = targetSource || this.getSessionVariableRecords({ scope: 'current' }).find(item => item.name === payload.name)?.source || 'session';
                this.variableBrowserState.selectedId = `${nextSource}:${String(payload.name || '').trim()}`;
                this.renderVariableBrowser();
            });
        });
        this.variableBrowserSearchEl?.addEventListener('input', () => {
            this.variableBrowserState.search = String(this.variableBrowserSearchEl.value || '');
            this.renderVariableBrowser();
        });
        this.variableBrowserTypeBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const draft = this.variableBrowserState.draft;
            if (!draft?.name) return;
            this.openCustomSelectMenu({
                anchorEl: this.variableBrowserTypeBtn,
                options: BLOCK_RIGHT_TYPE_OPTIONS.filter(opt => ['number', 'string', 'boolean'].includes(String(opt.value || ''))),
                currentValue: draft.type,
                onSelect: (value) => {
                    const nextType = ['number', 'string', 'boolean'].includes(String(value || '').trim().toLowerCase())
                        ? String(value).trim().toLowerCase()
                        : 'string';
                    draft.type = nextType;
                    this.renderVariableBrowserDetail();
                },
            });
        });
        this.variableBrowserModal.querySelector('#world-var-browser-save')?.addEventListener('click', () => {
            this.saveVariableBrowserDraft();
        });
        this.variableBrowserDeleteBtn?.addEventListener('click', () => {
            const draft = this.variableBrowserState.draft;
            if (!draft?.name) {
                window.toastr?.warning?.('请先选择一个变量');
                return;
            }
            const confirmed = window.confirm(`删除变量「${draft.name}」？这会同时移除当前来源中的值与本会话的变量定义。`);
            if (!confirmed) return;
            this.deleteVariableBrowserDraft();
        });
        this.variableBrowserModal.querySelector('#world-var-browser-use')?.addEventListener('click', () => {
            const draft = this.variableBrowserState.draft;
            const name = String(draft?.name || '').trim();
            if (!name) {
                window.toastr?.warning?.('请先选择一个变量');
                return;
            }
            const type = ['number', 'string', 'boolean'].includes(String(draft?.type || '').trim().toLowerCase())
                ? String(draft.type).trim().toLowerCase()
                : 'string';
            this.rememberRecentVariable(draft);
            this.closeVariableBrowser({
                name,
                type,
                defaultValue: parseTypedValue(String(draft?.defaultValueText || ''), type),
            });
        });

        document.body.appendChild(this.variableBrowserOverlay);
        document.body.appendChild(this.variableBrowserModal);
    }

    renderVariableBrowserDetail() {
        if (!this.variableBrowserModal) return;
        const draft = this.variableBrowserState.draft;
        if (!draft || !draft.name) {
            if (this.variableBrowserNameEl) this.variableBrowserNameEl.textContent = '未选择变量';
            if (this.variableBrowserSourceEl) this.variableBrowserSourceEl.textContent = '';
            if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.value = '';
            if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.value = '';
            if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.value = '';
            if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = false;
            if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = true;
            if (this.variableBrowserTypeBtn) {
                const labelEl = this.variableBrowserTypeBtn.querySelector('span');
                if (labelEl) labelEl.textContent = '字符串';
            }
            return;
        }
        if (this.variableBrowserNameEl) this.variableBrowserNameEl.textContent = draft.name;
        if (this.variableBrowserSourceEl) this.variableBrowserSourceEl.textContent = draft.source === 'global' ? '当前来源：全局变量' : '当前来源：会话变量';
        if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.value = draft.currentValueText;
        if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.value = draft.defaultValueText;
        if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.value = draft.initialValueText;
        if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = draft.source === 'global';
        if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = false;
        if (this.variableBrowserTypeBtn) {
            const labelEl = this.variableBrowserTypeBtn.querySelector('span');
            if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.type, '字符串');
        }
    }

    renderVariableBrowser() {
        if (!this.variableBrowserModal || !this.variableBrowserListEl || !this.variableBrowserEmptyEl) return;
        const scope = String(this.variableBrowserState.scope || 'current').trim().toLowerCase();
        const records = this.getSessionVariableRecords({ searchTerm: this.variableBrowserState.search, scope });
        const currentSelected = String(this.variableBrowserState.selectedId || '').trim();
        const selected = records.find(item => item.id === currentSelected) || records[0] || null;
        this.variableBrowserState.selectedId = String(selected?.id || '').trim();
        this.variableBrowserState.draft = selected ? this.buildVariableBrowserDraft(selected) : null;
        this.variableBrowserScopeEl?.querySelectorAll('.world-var-browser-scope-btn').forEach((btn) => {
            btn.classList.toggle('is-active', String(btn.dataset.scope || '').trim() === scope);
        });
        this.variableBrowserListEl.innerHTML = records.map((item) => {
            const active = item.id === this.variableBrowserState.selectedId;
            const isRecent = (Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [])
                .some(entry => entry === item.id || entry === item.name);
            return `
                <button type="button" class="world-var-browser-item ${active ? 'is-active' : ''}" data-id="${escapeHtml(item.id)}">
                    <div class="world-var-browser-item-top">
                        <span class="world-var-browser-item-name">${escapeHtml(item.name)}</span>
                        <span class="world-var-browser-item-badges">
                            <span class="world-var-browser-item-badge ${item.source === 'global' ? '' : 'subtle'}">${item.source === 'global' ? '全局' : '会话'}</span>
                            ${isRecent ? '<span class="world-var-browser-item-badge recent">最近</span>' : ''}
                        </span>
                    </div>
                    <div class="world-var-browser-item-meta">
                        <span>${escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, item.type, item.type || '字符串'))}</span>
                        <span>当前值：${escapeHtml(this.formatVariableBrowserValue(item.currentValue, item.type))}</span>
                    </div>
                </button>
            `;
        }).join('');
        this.variableBrowserEmptyEl.style.display = records.length ? 'none' : 'block';
        this.variableBrowserListEl.querySelectorAll('.world-var-browser-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.variableBrowserState.selectedId = String(btn.dataset.id || '').trim();
                this.renderVariableBrowser();
            });
        });
        this.renderVariableBrowserDetail();
    }

    saveVariableBrowserDraft() {
        const draft = this.variableBrowserState.draft;
        if (!draft?.name) return false;
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        if (!chatStore || !sid) return false;
        draft.currentValueText = String(this.variableBrowserCurrentEl?.value || '');
        draft.defaultValueText = String(this.variableBrowserDefaultEl?.value || '');
        draft.initialValueText = String(this.variableBrowserInitialEl?.value || '');
        const type = ['number', 'string', 'boolean'].includes(String(draft.type || '').trim().toLowerCase())
            ? String(draft.type).trim().toLowerCase()
            : 'string';
        const defaultValue = parseTypedValue(draft.defaultValueText, type);
        const currentValue = parseTypedValue(draft.currentValueText, type);
        const initialValue = parseTypedValue(draft.initialValueText, type);
        chatStore.setVariableSchema?.(draft.name, { type, default: defaultValue }, sid);
        if (draft.source === 'global') {
            chatStore.setGlobalVariable?.(draft.name, currentValue);
        } else {
            chatStore.setVariable?.(draft.name, currentValue, sid);
            chatStore.setInitialVariable?.(draft.name, initialValue, sid);
        }
        this.renderVariableBrowser();
        window.toastr?.success?.('变量已更新');
        return true;
    }

    openVariableBrowser({ initialName = '' } = {}) {
        if (!this.variableBrowserModal) this.createVariableBrowserModal();
        if (!this.variableBrowserOverlay || !this.variableBrowserModal) return Promise.resolve(null);
        this.variableBrowserState.search = '';
        this.variableBrowserState.scope = 'current';
        this.variableBrowserState.selectedId = '';
        this.variableBrowserState.draft = null;
        if (this.variableBrowserSearchEl) this.variableBrowserSearchEl.value = '';
        const initial = String(initialName || '').trim();
        if (initial) {
            const currentRecords = this.getSessionVariableRecords({ scope: 'current' });
            const matched = currentRecords.find(item => item.name === initial) || this.getSessionVariableRecords({ scope: 'session' }).find(item => item.name === initial) || this.getSessionVariableRecords({ scope: 'global' }).find(item => item.name === initial) || null;
            this.variableBrowserState.selectedId = String(matched?.id || '').trim();
        }
        this.renderVariableBrowser();
        this.variableBrowserOverlay.style.display = 'block';
        this.variableBrowserModal.style.display = 'flex';
        queueMicrotask(() => {
            this.variableBrowserSearchEl?.focus();
            this.variableBrowserSearchEl?.select?.();
        });
        if (this.variableBrowserKeyHandler) {
            document.removeEventListener('keydown', this.variableBrowserKeyHandler);
        }
        this.variableBrowserKeyHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeVariableBrowser(null);
            }
        };
        document.addEventListener('keydown', this.variableBrowserKeyHandler);
        return new Promise((resolve) => {
            this.variableBrowserResolve = resolve;
        });
    }

    closeVariableBrowser(value = null) {
        this.closeCustomSelectMenu();
        if (this.variableBrowserOverlay) this.variableBrowserOverlay.style.display = 'none';
        if (this.variableBrowserModal) this.variableBrowserModal.style.display = 'none';
        if (this.variableBrowserKeyHandler) {
            document.removeEventListener('keydown', this.variableBrowserKeyHandler);
            this.variableBrowserKeyHandler = null;
        }
        if (this.variableBrowserResolve) {
            const resolve = this.variableBrowserResolve;
            this.variableBrowserResolve = null;
            resolve(value);
        }
    }

    applyVariablePayloadToNode(node, payload) {
        if (!node || typeof node !== 'object' || !payload) return false;
        if (!node.data || typeof node.data !== 'object') node.data = {};
        node.data.path = String(payload.name || '').trim();
        node.data.autoCreate = true;
        node.data.varType = String(payload.type || 'number').trim().toLowerCase();
        node.data.defaultValue = payload.defaultValue;
        return true;
    }

    ensureOverviewQuickFixVariableNode(block, fixKind = 'missing_left_variable', targetIndex = 0) {
        if (!block || typeof block !== 'object') return null;
        const graph = this.ensureBlockNodeGraph(block);
        const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
        const edges = Array.isArray(graph?.edges) ? graph.edges : [];
        const nodeById = new Map(nodes.map(node => [String(node.id || ''), node]));
        const compareNodes = nodes
            .filter(node => normalizeNodeType(node?.type) === 'compare')
            .sort((a, b) => {
                const yDelta = Number(a?.y || 0) - Number(b?.y || 0);
                if (yDelta !== 0) return yDelta;
                return Number(a?.x || 0) - Number(b?.x || 0);
            });
        const matchKind = String(fixKind || '').trim();
        let hitIndex = -1;
        for (const compareNode of compareNodes) {
            const compareId = String(compareNode.id || '').trim();
            if (!compareId) continue;
            const compareData = normalizeGraphNodeData('compare', compareNode.data || {});
            const port = matchKind === 'missing_right_variable' ? 'right' : 'left';
            const edge = edges.find(item => item.to === compareId && item.toPort === port) || null;
            const linkedNode = edge ? nodeById.get(String(edge.from || '')) : null;
            let matches = false;
            if (matchKind === 'missing_left_variable') {
                matches = !linkedNode || (normalizeNodeType(linkedNode.type) === 'variable' && !String(linkedNode?.data?.path || '').trim());
            } else if (matchKind === 'missing_right_variable') {
                matches =
                    compareData.fallbackRightType === 'variable' &&
                    (
                        !linkedNode ||
                        (normalizeNodeType(linkedNode.type) === 'variable' && !String(linkedNode?.data?.path || '').trim())
                    );
            }
            if (!matches) continue;
            hitIndex += 1;
            if (hitIndex !== Math.max(0, Number(targetIndex || 0))) continue;
            if (linkedNode && normalizeNodeType(linkedNode.type) === 'variable') {
                if (!linkedNode.data || typeof linkedNode.data !== 'object') linkedNode.data = {};
                return { graph, node: linkedNode };
            }
            const nextX = Number(compareNode.x || 0) + (port === 'left' ? -240 : 240);
            const nextY = Number(compareNode.y || 0);
            const node = normalizeGraphNode({
                id: genNodeId(),
                type: 'variable',
                x: nextX,
                y: nextY,
                data: { autoCreate: false, varType: 'string', defaultValue: '' },
            }, nodes.length);
            graph.nodes.push(node);
            graph.edges = edges.filter(item => !(item.to === compareId && item.toPort === port));
            graph.edges.push({
                id: genEdgeId(),
                from: node.id,
                fromPort: 'out',
                to: compareId,
                toPort: port,
            });
            return { graph, node };
        }
        return null;
    }

    async applyOverviewQuickFix(block, item = null) {
        const fixKind = String(item?.kind || '').trim();
        if (!fixKind) return false;
        if (fixKind === 'disconnected_from_result') {
            const nodeId = String(item?.nodeId || '').trim();
            const blockId = String(block?.id || '').trim();
            if (!blockId || !nodeId) return false;
            this.openBlockConditionEditor(blockId, 'node', block, '', { nodeIds: [nodeId] });
            window.toastr?.info?.('已定位到未接入当前生效链路的断点节点');
            return true;
        }
        const target = this.ensureOverviewQuickFixVariableNode(block, fixKind, item?.fixIndex || 0);
        if (!target?.node) return false;
        const result = await this.openVariableBrowser({ initialName: String(target.node?.data?.path || '').trim() });
        if (!result) return false;
        if (result?.payload) {
            if (!this.applyVariablePayloadToNode(target.node, result.payload)) return false;
            this.ensureVariableInStore(result.payload.name, result.payload.type, result.payload.defaultValue);
        } else {
            if (!target.node.data || typeof target.node.data !== 'object') target.node.data = {};
            target.node.data.path = String(result?.name || '').trim();
            target.node.data.varType = String(result?.type || target.node.data.varType || 'string').trim().toLowerCase();
            if (Object.prototype.hasOwnProperty.call(result || {}, 'defaultValue')) {
                target.node.data.defaultValue = result.defaultValue;
            }
            if (target.node.data.path) target.node.data.autoCreate = false;
        }
        this.syncBlockWhenFromNodeGraph(block);
        this.renderEditor();
        window.toastr?.success?.('已应用快速修复');
        return true;
    }

    getBlockDisconnectedNodeTargets(block) {
        if (!block || typeof block !== 'object') return [];
        const graph = this.ensureBlockNodeGraph(block);
        const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
        const edges = Array.isArray(graph?.edges) ? graph.edges : [];
        if (!nodes.length) return [];
        const resultNode = nodes.find(node => normalizeNodeType(node?.type) === 'result') || null;
        if (!resultNode) return [];
        const activeNodeIds = new Set();
        const stack = [String(resultNode.id || '').trim()].filter(Boolean);
        while (stack.length) {
            const currentId = String(stack.pop() || '').trim();
            if (!currentId || activeNodeIds.has(currentId)) continue;
            activeNodeIds.add(currentId);
            edges
                .filter(edge => String(edge?.to || '').trim() === currentId)
                .forEach((edge) => {
                    const fromId = String(edge?.from || '').trim();
                    if (fromId) stack.push(fromId);
                });
        }
        const disconnectedNodes = nodes
            .filter(node => normalizeNodeType(node?.type) !== 'result')
            .filter(node => !activeNodeIds.has(String(node?.id || '').trim()));
        if (!disconnectedNodes.length) return [];
        const disconnectedIds = new Set(disconnectedNodes.map(node => String(node?.id || '').trim()).filter(Boolean));
        const candidates = disconnectedNodes.filter((node) => {
            const nodeId = String(node?.id || '').trim();
            if (!nodeId) return false;
            const outgoing = edges.filter(edge => String(edge?.from || '').trim() === nodeId);
            return !outgoing.some((edge) => disconnectedIds.has(String(edge?.to || '').trim()));
        });
        const targets = (candidates.length ? candidates : disconnectedNodes)
            .slice()
            .sort((a, b) => {
                const yDelta = Number(a?.y || 0) - Number(b?.y || 0);
                if (yDelta !== 0) return yDelta;
                return Number(a?.x || 0) - Number(b?.x || 0);
            })
            .map((node, index) => ({
                nodeId: String(node?.id || '').trim(),
                order: index + 1,
                type: normalizeNodeType(node?.type),
                label: this.getOverviewNodeTypeLabel(node?.type),
            }));
        return targets.filter(item => item.nodeId);
    }

    getOverviewNodeTypeLabel(type = '') {
        const normalized = normalizeNodeType(type);
        if (normalized === 'variable') return '变量节点';
        if (normalized === 'value') return '值节点';
        if (normalized === 'compare') return '比较节点';
        if (normalized === 'logic') return '逻辑节点';
        return '节点';
    }

    createChatNameModal() {
        if (this.chatNameModal) return;
        this.chatNameOverlay = document.createElement('div');
        this.chatNameOverlay.className = 'world-chatname-overlay';
        this.chatNameOverlay.style.display = 'none';
        this.chatNameOverlay.addEventListener('click', () => this.closeChatNameModal(''));

        this.chatNameModal = document.createElement('div');
        this.chatNameModal.className = 'world-chatname-modal';
        this.chatNameModal.style.display = 'none';
        this.chatNameModal.innerHTML = `
            <div class="world-chatname-header">
                <div class="world-chatname-title">创建聊天室</div>
                <button type="button" class="world-chatname-close" aria-label="关闭">×</button>
            </div>
            <div class="world-chatname-body">
                <label class="world-chatname-label" for="world-chatname-input">聊天室名称</label>
                <input id="world-chatname-input" class="world-chatname-input" type="text" value="">
                <div class="world-chatname-hint">名称可修改，默认使用选中条目的名称</div>
            </div>
            <div class="world-chatname-actions">
                <button type="button" class="world-chatname-btn ghost" id="world-chatname-cancel">取消</button>
                <button type="button" class="world-chatname-btn primary" id="world-chatname-ok">创建</button>
            </div>
        `;
        this.chatNameModal.addEventListener('click', (e) => e.stopPropagation());

        this.chatNameInputEl = this.chatNameModal.querySelector('#world-chatname-input');
        const closeBtn = this.chatNameModal.querySelector('.world-chatname-close');
        const cancelBtn = this.chatNameModal.querySelector('#world-chatname-cancel');
        const okBtn = this.chatNameModal.querySelector('#world-chatname-ok');

        closeBtn?.addEventListener('click', () => this.closeChatNameModal(''));
        cancelBtn?.addEventListener('click', () => this.closeChatNameModal(''));
        okBtn?.addEventListener('click', () => this.submitChatNameModal());

        this.chatNameInputEl?.addEventListener('focus', () => {
            if (!this.chatNameInputEl) return;
            if (this.chatNameInputEl.classList.contains('is-placeholder')) {
                this.chatNameInputEl.value = '';
                this.chatNameInputEl.classList.remove('is-placeholder');
            }
        });
        this.chatNameInputEl?.addEventListener('blur', () => this.restoreChatNamePlaceholder());

        document.body.appendChild(this.chatNameOverlay);
        document.body.appendChild(this.chatNameModal);
    }

    openChatNameModal(defaultName) {
        if (!this.chatNameModal) this.createChatNameModal();
        if (!this.chatNameOverlay || !this.chatNameModal || !this.chatNameInputEl) return Promise.resolve('');
        const defaultText = String(defaultName || '').trim();
        this.chatNameInputEl.dataset.defaultName = defaultText;
        this.chatNameInputEl.value = defaultText;
        this.chatNameInputEl.classList.toggle('is-placeholder', Boolean(defaultText));
        this.chatNameOverlay.style.display = 'block';
        this.chatNameModal.style.display = 'block';

        if (this.chatNameKeyHandler) {
            document.removeEventListener('keydown', this.chatNameKeyHandler);
        }
        this.chatNameKeyHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeChatNameModal('');
            } else if (event.key === 'Enter') {
                event.preventDefault();
                this.submitChatNameModal();
            }
        };
        document.addEventListener('keydown', this.chatNameKeyHandler);

        return new Promise((resolve) => {
            this.chatNameResolve = resolve;
        });
    }

    restoreChatNamePlaceholder() {
        if (!this.chatNameInputEl) return;
        const text = String(this.chatNameInputEl.value || '').trim();
        if (!text) {
            const fallback = String(this.chatNameInputEl.dataset?.defaultName || '').trim();
            this.chatNameInputEl.value = fallback;
            this.chatNameInputEl.classList.toggle('is-placeholder', Boolean(fallback));
        } else {
            this.chatNameInputEl.classList.remove('is-placeholder');
        }
    }

    submitChatNameModal() {
        if (!this.chatNameInputEl) return;
        const isPlaceholder = this.chatNameInputEl.classList.contains('is-placeholder');
        const raw = String(this.chatNameInputEl.value || '').trim();
        const fallback = String(this.chatNameInputEl.dataset?.defaultName || '').trim();
        const value = (isPlaceholder || !raw) ? fallback : raw;
        this.closeChatNameModal(value);
    }

    closeChatNameModal(value) {
        if (this.chatNameOverlay) this.chatNameOverlay.style.display = 'none';
        if (this.chatNameModal) this.chatNameModal.style.display = 'none';
        if (this.chatNameKeyHandler) {
            document.removeEventListener('keydown', this.chatNameKeyHandler);
            this.chatNameKeyHandler = null;
        }
        if (this.chatNameResolve) {
            const resolve = this.chatNameResolve;
            this.chatNameResolve = null;
            resolve(String(value || ''));
        }
    }

    createManageModal() {
        if (this.manageModal) return;
        this.manageOverlay = document.createElement('div');
        this.manageOverlay.className = 'world-manage-overlay';
        this.manageOverlay.style.display = 'none';
        this.manageOverlay.addEventListener('click', () => this.hideManageModal());

        this.manageModal = document.createElement('div');
        this.manageModal.className = 'world-manage-modal';
        this.manageModal.style.display = 'none';
        this.manageModal.innerHTML = `
            <div class="world-manage-header">
                <div>
                    <div class="world-manage-title">条目管理</div>
                    <div class="world-manage-subtitle">批量操作、创建聊天室、删除与移动</div>
                </div>
                <button type="button" class="world-manage-close" aria-label="关闭">×</button>
            </div>
            <div class="world-manage-body">
                <div class="world-manage-toolbar">
                    <div class="world-manage-label">条目列表</div>
                    <div id="world-manage-count" class="world-manage-count">已选 0</div>
                    <div class="world-manage-actions">
                        <button type="button" class="world-manage-link" id="world-manage-selectall">全选</button>
                        <button type="button" class="world-manage-link" id="world-manage-clear">清空</button>
                        <span class="world-manage-sep"></span>
                        <button type="button" class="world-manage-link" id="world-manage-create-selected">创建聊天室</button>
                        <span class="world-manage-sep"></span>
                        <button type="button" class="world-manage-icon" id="world-manage-move-top" aria-label="置顶">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 4h14v2H5z"></path>
                                <path d="M12 7l-5 5h3v6h4v-6h3z"></path>
                            </svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-up" aria-label="上移">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l-6 6h4v6h4v-6h4z"></path></svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-down" aria-label="下移">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18l6-6h-4V6h-4v6H6z"></path></svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-bottom" aria-label="置底">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 18h14v2H5z"></path>
                                <path d="M12 17l5-5h-3V6h-4v6H7z"></path>
                            </svg>
                        </button>
                        <button type="button" class="world-manage-link danger" id="world-manage-delete">删除</button>
                    </div>
                </div>
                <div id="world-manage-list" class="world-manage-list"></div>
            </div>
            <div class="world-manage-footer">
                <button type="button" class="world-manage-btn primary" id="world-manage-close-btn">完成</button>
            </div>
        `;
        this.manageModal.addEventListener('click', (e) => e.stopPropagation());
        this.manageModal.querySelector('.world-manage-close')?.addEventListener('click', () => this.hideManageModal());
        this.manageModal.querySelector('#world-manage-close-btn')?.addEventListener('click', () => this.hideManageModal());

        this.manageCountEl = this.manageModal.querySelector('#world-manage-count');
        this.manageSelectAllBtn = this.manageModal.querySelector('#world-manage-selectall');
        this.manageClearBtn = this.manageModal.querySelector('#world-manage-clear');
        this.manageCreateSelectedBtn = this.manageModal.querySelector('#world-manage-create-selected');
        this.manageDeleteBtn = this.manageModal.querySelector('#world-manage-delete');
        this.manageMoveUpBtn = this.manageModal.querySelector('#world-manage-move-up');
        this.manageMoveDownBtn = this.manageModal.querySelector('#world-manage-move-down');
        this.manageMoveTopBtn = this.manageModal.querySelector('#world-manage-move-top');
        this.manageMoveBottomBtn = this.manageModal.querySelector('#world-manage-move-bottom');
        this.manageListEl = this.manageModal.querySelector('#world-manage-list');

        this.manageSelectAllBtn?.addEventListener('click', () => {
            this.selectAllEntries();
        });
        this.manageClearBtn?.addEventListener('click', () => this.clearSelection());
        this.manageCreateSelectedBtn?.addEventListener('click', () => this.createChatFromSelection());
        this.manageDeleteBtn?.addEventListener('click', () => this.deleteSelectedEntries());
        this.manageMoveUpBtn?.addEventListener('click', () => this.moveSelectedEntries(-1));
        this.manageMoveDownBtn?.addEventListener('click', () => this.moveSelectedEntries(1));
        this.manageMoveTopBtn?.addEventListener('click', () => this.moveSelectedToEdge('top'));
        this.manageMoveBottomBtn?.addEventListener('click', () => this.moveSelectedToEdge('bottom'));

        document.body.appendChild(this.manageOverlay);
        document.body.appendChild(this.manageModal);
    }

    showManageModal() {
        if (!this.manageModal) this.createManageModal();
        this.updateManageState();
        if (this.manageOverlay) this.manageOverlay.style.display = 'block';
        if (this.manageModal) this.manageModal.style.display = 'block';
    }

    hideManageModal() {
        if (this.manageOverlay) this.manageOverlay.style.display = 'none';
        if (this.manageModal) this.manageModal.style.display = 'none';
    }

    setAiStatus(message, tone = '') {
        if (!this.aiStatusEl) return;
        this.aiStatusEl.textContent = message || '';
        if (tone) {
            this.aiStatusEl.setAttribute('data-tone', tone);
        } else {
            this.aiStatusEl.removeAttribute('data-tone');
        }
    }

    setAiBusy(isBusy, entryId = '') {
        this.aiBusy = Boolean(isBusy);
        if (this.aiGenerateBtn) this.aiGenerateBtn.disabled = this.aiBusy;
        if (this.aiContinueBtn) this.aiContinueBtn.disabled = this.aiBusy;
        if (this.aiBusy && entryId) {
            this.aiPendingEntryId = String(entryId);
        } else if (!this.aiBusy) {
            this.aiPendingEntryId = '';
        }
        this.renderEditor();
    }

    async ensureChatConfigReady() {
        const config = await this.chatConfigManager.load();
        if (!canUseApiConfig(config)) {
            window.toastr?.warning?.('请先配置聊天模型 API');
            return null;
        }
        return config;
    }

    resolveEntryById(entryId) {
        const targetId = String(entryId || '');
        const idx = this.data.entries.findIndex(e => String(e.id || '') === targetId);
        if (idx < 0) return { idx: -1, entry: null };
        return { idx, entry: this.data.entries[idx] };
    }

    getEntryContentForAi(entryId) {
        const { idx, entry } = this.resolveEntryById(entryId);
        if (!entry || idx < 0) return '';
        const blocks = this.ensureEntryPromptBlocks(entry);
        const currentEntryId = this.getEntryId(entry, idx);
        const blockPage = this.getEntryBlockPage(entry, currentEntryId);
        const activeBlock = blocks[blockPage] || blocks[0] || null;
        if (this.currentIndex === idx) {
            const textarea = this.editorEl?.querySelector('#we-block-content');
            const live = String(textarea?.value || '').trim();
            if (live) return live;
        }
        return String(activeBlock?.content ?? entry.content ?? '').trim();
    }

    applyAiContentToEntry(entryId, content) {
        const { idx, entry } = this.resolveEntryById(entryId);
        if (idx < 0) {
            window.toastr?.warning?.('目标条目不存在，未写入内容');
            return false;
        }
        const blocks = this.ensureEntryPromptBlocks(entry);
        const currentEntryId = this.getEntryId(entry, idx);
        const blockPage = this.getEntryBlockPage(entry, currentEntryId);
        const activeBlock = blocks[blockPage] || blocks[0] || null;
        if (activeBlock) {
            activeBlock.content = content;
        } else {
            entry.content = content;
        }
        this.syncEntryContentFromBlocks(entry);
        if (this.currentIndex === idx) {
            const textarea = this.editorEl?.querySelector('#we-block-content');
            if (textarea) textarea.value = content;
        }
        this.renderList();
        this.scheduleRefSync();
        return true;
    }

    async runWorldAi({ mode = 'generate' } = {}) {
        if (this.aiBusy) {
            window.toastr?.warning?.('AI 生成中，请稍后');
            return;
        }
        const inputText = String(this.aiInputEl?.value || '').trim();
        if (!inputText) {
            window.toastr?.warning?.('请先输入人物设定');
            return;
        }
        const config = await this.ensureChatConfigReady();
        if (!config) return;
        const entryId = this.aiTargetEntryId || String(this.data.entries[this.currentIndex]?.id || '');
        if (!entryId) {
            window.toastr?.warning?.('未找到可写入的条目');
            return;
        }
        const template = String(this.aiTemplateEl?.value || WORLD_AI_TEMPLATE || '').trim();
        if (!template) {
            window.toastr?.warning?.('模板不能为空');
            return;
        }
        const draft = this.getEntryContentForAi(entryId);
        if (mode === 'continue' && !draft) {
            window.toastr?.warning?.('当前内容为空，无法继续');
            return;
        }
        const requestId = ++this.aiRequestId;
        this.setAiBusy(true, entryId);
        const loadingText = mode === 'continue' ? '正在继续补全角色条目...' : '正在生成角色条目...';
        this.setAiStatus(loadingText, 'loading');
        try {
            const client = new LLMClient(config);
            const messages = mode === 'continue'
                ? buildWorldAiContinueMessages(template, inputText, draft)
                : buildWorldAiMessages(template, inputText);
            const output = await client.chat(messages, { temperature: 0.6 });
            if (requestId !== this.aiRequestId) return;
            const yaml = stripCodeFence(output);
            if (!yaml) throw new Error('AI 未返回内容');
            const applied = this.applyAiContentToEntry(entryId, yaml);
            if (!applied) {
                this.setAiStatus('生成成功，但未找到条目写入', 'error');
                return;
            }
            const saved = await this.saveWorldSilently({ showToast: false });
            if (saved) {
                const successText = mode === 'continue' ? '补全完成，已写入内容并保存' : '生成完成，已写入内容并保存';
                this.setAiStatus(successText, 'success');
                window.toastr?.success?.(mode === 'continue' ? 'AI 补全已写入并保存' : 'AI 生成已写入并保存');
            } else {
                this.setAiStatus('生成完成，但自动保存失败', 'error');
                window.toastr?.warning?.(mode === 'continue' ? 'AI 已补全，但自动保存失败' : 'AI 已生成，但自动保存失败');
            }
        } catch (err) {
            logger.error(mode === 'continue' ? 'AI 补全世界书失败' : 'AI 生成世界书失败', err);
            this.setAiStatus(`生成失败：${err?.message || '未知错误'}`, 'error');
            window.toastr?.error?.(mode === 'continue' ? 'AI 补全失败' : 'AI 生成失败');
        } finally {
            if (requestId === this.aiRequestId) {
                this.setAiBusy(false);
            }
        }
    }

    async handleAiGenerate() {
        return this.runWorldAi({ mode: 'generate' });
    }

    async handleAiContinue() {
        return this.runWorldAi({ mode: 'continue' });
    }

    getEntryId(entry, idx = 0) {
        const raw = entry && typeof entry === 'object' ? entry : {};
        const id = raw.id ?? raw.uid ?? `entry-${idx}`;
        return String(id || '').trim();
    }

    getEntryDisplayName(entry, idx = 0) {
        const raw = entry && typeof entry === 'object' ? entry : {};
        const title = String(raw.comment || raw.title || '').trim();
        return title || `条目 ${idx + 1}`;
    }

    ensureEntryPromptBlocks(entry) {
        if (!entry || typeof entry !== 'object') return [];
        if (!Array.isArray(entry.promptBlocks) || !entry.promptBlocks.length) {
            entry.promptBlocks = [normalizePromptBlock({
                content: String(entry.content || ''),
                title: String(entry.comment || '内容 1'),
            }, 0, String(entry.content || ''))];
        }
        entry.promptBlocks = entry.promptBlocks.map((block, idx) => normalizePromptBlock(block, idx, idx === 0 ? entry.content : ''));
        return entry.promptBlocks;
    }

    getEntryBlockPage(entry, entryId = '') {
        const blocks = this.ensureEntryPromptBlocks(entry);
        const key = String(entryId || this.getEntryId(entry) || '').trim();
        const raw = Number(this.entryBlockPageMap.get(key) || 0);
        const page = Number.isFinite(raw) ? Math.max(0, Math.min(blocks.length - 1, Math.trunc(raw))) : 0;
        this.entryBlockPageMap.set(key, page);
        return page;
    }

    setEntryBlockPage(entry, entryId = '', page = 0) {
        const blocks = this.ensureEntryPromptBlocks(entry);
        const key = String(entryId || this.getEntryId(entry) || '').trim();
        const next = Math.max(0, Math.min(blocks.length - 1, Math.trunc(Number(page) || 0)));
        this.entryBlockPageMap.set(key, next);
        this.renderEditor();
    }

    isBlockFlipped(blockId = '') {
        return this.blockFlipMap.get(String(blockId || '').trim()) === true;
    }

    setBlockFlipped(blockId = '', flipped = false) {
        const id = String(blockId || '').trim();
        if (!id) return;
        const next = Boolean(flipped);
        this.blockFlipMap.set(id, next);
        if (next) this.blockBackViewMap.set(id, 'summary');
        this.renderEditor();
    }

    isBlockExpanded(blockId = '') {
        return this.blockExpandMap.get(String(blockId || '').trim()) === true;
    }

    setBlockExpanded(blockId = '', expanded = false) {
        const id = String(blockId || '').trim();
        if (!id) return;
        const next = Boolean(expanded);
        this.blockExpandMap.set(id, next);
        if (!next) {
            this.blockFlipMap.set(id, false);
            this.blockBackViewMap.set(id, 'summary');
        }
        this.renderEditor();
    }

    getBlockBackView(blockId = '') {
        const id = String(blockId || '').trim();
        if (!id) return 'summary';
        return this.blockBackViewMap.get(id) === 'editor' ? 'editor' : 'summary';
    }

    setBlockBackView(blockId = '', view = 'summary') {
        const id = String(blockId || '').trim();
        if (!id) return;
        const next = String(view || '').trim().toLowerCase() === 'editor' ? 'editor' : 'summary';
        this.blockBackViewMap.set(id, next);
        this.renderEditor();
    }

    setBlockEditorFocus(blockId = '', focusState = null) {
        const id = String(blockId || '').trim();
        if (!id) return;
        if (!focusState || typeof focusState !== 'object') {
            this.blockEditorFocusMap.delete(id);
            return;
        }
        const next = {
            path: String(focusState.path || '').trim(),
            nodeIds: Array.isArray(focusState.nodeIds)
                ? focusState.nodeIds.map(item => String(item || '').trim()).filter(Boolean)
                : [],
        };
        if (!next.path && !next.nodeIds.length) {
            this.blockEditorFocusMap.delete(id);
            return;
        }
        this.blockEditorFocusMap.set(id, next);
    }

    consumeBlockEditorFocus(blockId = '') {
        const id = String(blockId || '').trim();
        if (!id) return null;
        const focus = this.blockEditorFocusMap.get(id) || null;
        this.blockEditorFocusMap.delete(id);
        return focus;
    }

    openBlockConditionEditor(blockId = '', mode = 'node', block = null, focusPath = '', focusState = null) {
        const id = String(blockId || '').trim();
        if (!id) return;
        if (block && typeof block === 'object') block.uiMode = 'node';
        this.setBlockEditorFocus(id, {
            ...(focusState && typeof focusState === 'object' ? focusState : {}),
            path: String(focusPath || '').trim(),
        });
        this.blockBackViewMap.set(id, 'editor');
        this.renderEditor();
    }

    async saveBlockConditionEditor(blockId = '', block = null) {
        const id = String(blockId || '').trim();
        if (!id) return;
        if (block && typeof block === 'object') {
            this.syncBlockWhenFromNodeGraph(block);
        }
        const saved = await this.saveWorldSilently({ showToast: true });
        if (saved) {
            this.blockBackViewMap.set(id, 'summary');
        }
        this.renderEditor();
    }

    syncEntryContentFromBlocks(entry) {
        if (!entry || typeof entry !== 'object') return;
        const blocks = this.ensureEntryPromptBlocks(entry);
        const first = blocks[0];
        entry.content = String(first?.content || '').trim();
    }

    addPromptBlock(entry) {
        if (!entry || typeof entry !== 'object') return;
        const blocks = this.ensureEntryPromptBlocks(entry);
        const entryId = this.getEntryId(entry);
        const next = normalizePromptBlock({
            title: `内容 ${blocks.length + 1}`,
            content: '',
            when: {
                logic: 'and',
                clauses: [{
                    left: '',
                    op: '>',
                    right: 10,
                    rightType: 'number',
                }],
            },
        }, blocks.length, '');
        blocks.push(next);
        if (entryId) this.entryBlockPageMap.set(String(entryId), Math.max(0, blocks.length - 1));
        this.syncEntryContentFromBlocks(entry);
        this.renderEditor();
        this.renderBlockManageModalList();
        if (this.refMode) this.scheduleRefSync();
    }

    removePromptBlock(entry, blockIndex = 0) {
        if (!entry || typeof entry !== 'object') return;
        const blocks = this.ensureEntryPromptBlocks(entry);
        if (blocks.length <= 1) {
            window.toastr?.warning?.('至少保留一页内容');
            return;
        }
        const removeAt = Math.max(0, Math.min(blocks.length - 1, Math.trunc(Number(blockIndex) || 0)));
        const removed = blocks[removeAt];
        const removedId = String(removed?.id || '').trim();
        blocks.splice(removeAt, 1);
        if (removedId) {
            this.blockFlipMap.delete(removedId);
            this.blockExpandMap.delete(removedId);
        }
        const entryId = this.getEntryId(entry);
        if (entryId) {
            const current = this.getEntryBlockPage(entry, entryId);
            const next = Math.max(0, Math.min(blocks.length - 1, current >= removeAt ? current - 1 : current));
            this.entryBlockPageMap.set(String(entryId), next);
        }
        this.syncEntryContentFromBlocks(entry);
        this.renderEditor();
        this.renderBlockManageModalList();
        if (this.refMode) this.scheduleRefSync();
    }

    movePromptBlock(entry, fromIndex, toIndex) {
        if (!entry || typeof entry !== 'object') return;
        const blocks = this.ensureEntryPromptBlocks(entry);
        const from = Math.trunc(Number(fromIndex));
        const to = Math.trunc(Number(toIndex));
        if (!Number.isFinite(from) || !Number.isFinite(to)) return;
        if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || from === to) return;
        const [moved] = blocks.splice(from, 1);
        blocks.splice(to, 0, moved);
        const entryId = this.getEntryId(entry);
        if (entryId) this.entryBlockPageMap.set(String(entryId), to);
        this.syncEntryContentFromBlocks(entry);
        this.renderEditor();
        this.renderBlockManageModalList();
        if (this.refMode) this.scheduleRefSync();
    }

    ensureBlockPrimaryClause(block) {
        if (!block || typeof block !== 'object') return normalizePromptClause({});
        block.when = normalizeConditionTree(block.when, createDefaultPromptClause());
        return getPrimaryClauseFromConditionTree(block.when, createDefaultPromptClause());
    }

    ensureBlockConditionTree(block) {
        if (!block || typeof block !== 'object') return normalizeConditionTree(null, createDefaultPromptClause());
        block.when = normalizeConditionTree(block.when, createDefaultPromptClause());
        return block.when;
    }

    ensureBlockNodeGraph(block) {
        if (!block || typeof block !== 'object') return null;
        const primaryClause = this.ensureBlockPrimaryClause(block);
        block.nodeGraph = normalizeNodeGraph(block.nodeGraph, block.when, primaryClause);
        return block.nodeGraph;
    }

    syncBlockWhenFromNodeGraph(block, graph = null) {
        if (!block || typeof block !== 'object') return null;
        const primaryClause = this.ensureBlockPrimaryClause(block);
        const nodeGraph = graph || this.ensureBlockNodeGraph(block);
        if (!nodeGraph) return block.when;
        block.when = buildWhenFromNodeGraph(nodeGraph, primaryClause);
        if (!block.when || typeof block.when !== 'object') {
            block.when = { logic: 'and', clauses: [normalizePromptClause(primaryClause)] };
        }
        const logic = normalizeLogicValue(block.when.logic || 'and');
        if (logic === 'not') {
            const child = block.when.clause && typeof block.when.clause === 'object'
                ? block.when.clause
                : (Array.isArray(block.when.clauses) ? block.when.clauses[0] : null);
            block.when.logic = 'not';
            block.when.clause = child?.logic ? child : normalizePromptClause(child || primaryClause);
            delete block.when.clauses;
            return block.when;
        }
        const clauses = Array.isArray(block.when.clauses) ? block.when.clauses : [];
        block.when.logic = logic;
        block.when.clauses = clauses.length
            ? clauses.map(item => (item?.logic ? item : normalizePromptClause(item)))
            : [normalizePromptClause(primaryClause)];
        delete block.when.clause;
        return block.when;
    }

    syncBlockNodeGraphFromWhen(block) {
        if (!block || typeof block !== 'object') return null;
        const primaryClause = this.ensureBlockPrimaryClause(block);
        block.nodeGraph = normalizeNodeGraph(null, block.when, primaryClause);
        return block.nodeGraph;
    }

    getConditionSummaryOperator(op = '>') {
        const value = String(op || '>').trim();
        const map = {
            contains: '包含',
            not_contains: '不包含',
            is_empty: '为空',
            not_empty: '非空',
            regex: '正则匹配',
        };
        return map[value] || value;
    }

    getConditionSummaryValueText(value, rightType = 'number') {
        const type = normalizeRightTypeValue(rightType);
        if (type === 'variable') {
            const text = String(value ?? '').trim();
            return text ? `变量 ${text}` : '变量';
        }
        if (type === 'boolean') return parseTypedValue(value, 'boolean') ? 'true' : 'false';
        return stringifyTypedValue(value, type);
    }

    getConditionRuntimeContext() {
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        if (!chatStore || !sid) {
            return buildVariableContext({ baseVars: {}, globalVars: {} });
        }
        const useGlobal = Boolean(typeof bridge?.isSharedVariableSession === 'function' && bridge.isSharedVariableSession(sid));
        const localVars = chatStore?.listVariables?.(sid) || {};
        const globalVars = chatStore?.listGlobalVariables?.() || {};
        const baseVars = useGlobal ? globalVars : localVars;
        const runtimeContext = buildVariableContext({ baseVars, globalVars });
        runtimeContext.variableContext.local_variables = localVars;
        return runtimeContext;
    }

    formatConditionRuntimeValue(value, rightType = 'string') {
        if (value === undefined) return '未找到';
        if (value === null) return 'null';
        if (Array.isArray(value)) return JSON.stringify(value);
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return '[object]';
            }
        }
        return this.getConditionSummaryValueText(value, rightType);
    }

    getEntryActivationExplanation(entry, idx = this.currentIndex) {
        const bridge = window.appBridge;
        const worldId = String(entry?._refSourceId || entry?._sourceWorldId || this.worldName || '').trim();
        const entryId = this.getEntryId(entry, idx);
        if (!bridge?.explainWorldEntryActivation || !worldId || !entryId) return null;
        try {
            const label = bridge.buildWorldDebugLabel?.() || null;
            return bridge.explainWorldEntryActivation(worldId, entryId, label);
        } catch (err) {
            logger.warn('读取世界书条目激活解释失败', err);
            return null;
        }
    }

    renderEntryActivationOverview(explanation) {
        if (!explanation) return '';
        const sourceLabelMap = {
            direct: '直接命中',
            recursive: '递归命中',
            inactive: '当前未激活',
        };
        return `
            <div class="world-entry-activation-overview">
                <div class="world-entry-activation-head">
                    <div class="world-entry-activation-title">条目激活</div>
                    <div class="world-entry-activation-pills">
                        <span class="world-cond-overview-pill ${explanation.active ? '' : 'warn'}">${explanation.active ? '条目已激活' : '条目未激活'}</span>
                        <span class="world-cond-overview-pill">${escapeHtml(sourceLabelMap[explanation.activationSource] || '当前未激活')}</span>
                        ${explanation.recursionStep ? `<span class="world-cond-overview-pill">递归第 ${explanation.recursionStep} 轮</span>` : ''}
                        ${explanation.probabilityEnabled ? `<span class="world-cond-overview-pill subtle">概率 ${escapeHtml(String(explanation.probabilityValue))}%</span>` : ''}
                        ${explanation.filteredByGroup ? '<span class="world-cond-overview-pill warn">组竞争过滤</span>' : ''}
                    </div>
                </div>
                <div class="world-entry-activation-grid">
                    <div class="world-entry-activation-card">
                        <div class="world-entry-activation-label">主关键词</div>
                        <div class="world-entry-activation-value">${explanation.keys.length ? escapeHtml(explanation.keys.join(' / ')) : '未设置'}</div>
                        <div class="world-entry-activation-meta">${explanation.matchedPrimaryKeys.length ? `当前命中：${escapeHtml(explanation.matchedPrimaryKeys.join(' / '))}` : '当前未命中'}</div>
                    </div>
                    ${explanation.selective ? `
                        <div class="world-entry-activation-card">
                            <div class="world-entry-activation-label">副关键词</div>
                            <div class="world-entry-activation-value">${explanation.secondaryKeys.length ? escapeHtml(explanation.secondaryKeys.join(' / ')) : '未设置'}</div>
                            <div class="world-entry-activation-meta">${escapeHtml(explanation.selectiveLogicLabel || '副关键词逻辑')} / ${explanation.matchedSecondaryKeys.length ? `命中：${escapeHtml(explanation.matchedSecondaryKeys.join(' / '))}` : '当前未命中'}</div>
                        </div>
                    ` : ''}
                    <div class="world-entry-activation-card">
                        <div class="world-entry-activation-label">匹配来源</div>
                        <div class="world-entry-activation-value">${explanation.sourceFields.length ? escapeHtml(explanation.sourceFields.join(' / ')) : '当前没有可用上下文'}</div>
                        <div class="world-entry-activation-meta">${explanation.hasMatchInput ? '已按当前会话上下文判定' : '当前没有聊天输入，按条目内容参与'}</div>
                    </div>
                    <div class="world-entry-activation-card">
                        <div class="world-entry-activation-label">状态说明</div>
                        <div class="world-entry-activation-value">${explanation.reasons.length ? escapeHtml(explanation.reasons[0]) : (explanation.active ? '条目已通过激活层' : '暂无说明')}</div>
                        <div class="world-entry-activation-meta">
                            ${explanation.probabilityEnabled ? '概览未模拟随机概率；实际发送时仍会走概率掷骰。' : ''}
                            ${!explanation.probabilityEnabled && explanation.filteredByGroup ? '当前条目满足触发，但在分组竞争后被过滤。' : ''}
                            ${!explanation.probabilityEnabled && !explanation.filteredByGroup && explanation.preventRecursion ? '本条目命中后不会继续触发递归。' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderBlockSettingsPanel(block, blockPage = 0) {
        if (!block || typeof block !== 'object') return '';
        const title = String(block.title || '').trim();
        const roleLabelText = this.getOptionLabel(ROLE_OPTIONS, block.role, 'system');
        const priorityValue = Number.isFinite(Number(block.priority)) ? Number(block.priority) : 100;
        return `
            <div class="world-block-settings-card">
                <div class="world-block-settings-head">
                    <div>
                        <div class="world-block-settings-title">当前分页设置</div>
                        <div class="world-block-settings-subtitle">控制本页是否启用，以及注入角色与顺序。</div>
                    </div>
                    <label class="world-entry-inline-check world-block-settings-toggle">
                        <input type="checkbox" id="we-block-enabled" ${block.enabled !== false ? 'checked' : ''}>
                        <span>启用本页</span>
                    </label>
                </div>
                <div class="world-block-settings-grid">
                    <div class="world-entry-field">
                        <label>分页标题</label>
                        <input type="text" id="we-block-title" value="${escapeHtml(title)}" placeholder="例如：基础设定 / 状态卡 / 条件页 ${blockPage + 1}">
                    </div>
                    <div class="world-entry-field">
                        <label>注入角色（role）</label>
                        <button type="button" class="world-app-select-btn" id="we-block-role-btn">
                            <span>${escapeHtml(roleLabelText)}</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-entry-field">
                        <label>优先级（priority）</label>
                        <input type="number" id="we-block-priority" min="-9999" max="9999" value="${priorityValue}">
                    </div>
                </div>
            </div>
        `;
    }

    collectBlockConditionOverview(entry, block) {
        let tree = null;
        if (block && typeof block === 'object') {
            const primaryClause = this.ensureBlockPrimaryClause(block);
            const graph = this.ensureBlockNodeGraph(block);
            const compiledWhen = buildWhenFromNodeGraph(graph, primaryClause);
            tree = normalizeConditionTree(compiledWhen, primaryClause);
            block.when = tree;
        }
        if (!tree) tree = this.ensureBlockConditionTree(block);
        const stats = {
            clauseCount: 0,
            groupCount: 0,
            pendingCount: 0,
            pendingItems: [],
            variables: new Map(),
        };
        const runtimeContext = this.getConditionRuntimeContext();
        const explanation = explainConditionTree(tree, runtimeContext);
        const entryActivation = this.getEntryActivationExplanation(entry, this.currentIndex);
        let clauseOrder = 0;
        visitConditionTree(tree, (node, path) => {
            if (isConditionTreeGroup(node)) {
                stats.groupCount += 1;
                return;
            }
            const clause = normalizePromptClause(node);
            clauseOrder += 1;
            stats.clauseCount += 1;
            const left = String(clause.left || '').trim();
            const op = String(clause.op || '').trim().toLowerCase();
            const needsRight = !['is_empty', 'not_empty'].includes(op);
            const rightMissing = needsRight && clause.rightType === 'variable' && !String(clause.right || '').trim();
            if (!left) {
                stats.pendingCount += 1;
                stats.pendingItems.push({
                    order: clauseOrder,
                    path,
                    label: `条件 ${clauseOrder}`,
                    reason: '未设置变量',
                    kind: 'missing_left_variable',
                    fixIndex: stats.pendingItems.filter(item => item?.kind === 'missing_left_variable').length,
                });
                return;
            }
            if (rightMissing) {
                stats.pendingCount += 1;
                stats.pendingItems.push({
                    order: clauseOrder,
                    path,
                    label: `条件 ${clauseOrder}`,
                    reason: '变量比较的右值为空',
                    kind: 'missing_right_variable',
                    fixIndex: stats.pendingItems.filter(item => item?.kind === 'missing_right_variable').length,
                });
                return;
            }
            const prev = stats.variables.get(left) || {
                name: left,
                type: clause.defineVariable?.type || '',
                defaultValue: clause.defineVariable?.default,
                autoCreate: false,
                refCount: 0,
            };
            prev.refCount += 1;
            if (clause.defineVariable?.name === left) {
                prev.autoCreate = true;
                prev.type = clause.defineVariable?.type || prev.type || 'number';
                prev.defaultValue = clause.defineVariable?.default ?? prev.defaultValue;
            }
            stats.variables.set(left, prev);
        });
        const disconnectedTargets = this.getBlockDisconnectedNodeTargets(block);
        disconnectedTargets.forEach((target) => {
            stats.pendingCount += 1;
            stats.pendingItems.push({
                order: stats.pendingItems.length + 1,
                path: 'root',
                nodeId: target.nodeId,
                label: `${target.label} ${target.order}`,
                reason: '未接入当前生效链路',
                kind: 'disconnected_from_result',
            });
        });
        return {
            tree,
            explanation,
            entryActivation,
            clauseCount: stats.clauseCount,
            groupCount: stats.groupCount,
            pendingCount: stats.pendingCount,
            pendingItems: stats.pendingItems,
            variables: [...stats.variables.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        };
    }

    renderConditionOverviewNode(node, depth = 0, explanation = null) {
        if (!node || typeof node !== 'object') return '';
        if (isConditionTreeGroup(node)) {
            const logic = normalizeLogicValue(node.logic || 'and');
            const children = logic === 'not'
                ? [node.clause || createDefaultPromptClause()]
                : (Array.isArray(node.clauses) && node.clauses.length ? node.clauses : [createDefaultPromptClause()]);
            const childExplanations = Array.isArray(explanation?.children) ? explanation.children : [];
            return `
                <div class="world-cond-summary-group" data-depth="${depth}">
                    <div class="world-cond-summary-group-head">
                        <span class="world-cond-summary-logic">${escapeHtml(String(logic || 'and').toUpperCase())}</span>
                        <span class="world-cond-summary-badge ${explanation?.result ? '' : 'danger'}">${explanation?.result ? '命中' : '未命中'}</span>
                    </div>
                    <div class="world-cond-summary-group-body">
                        ${children.map((child, idx) => this.renderConditionOverviewNode(child, depth + 1, childExplanations[idx] || null)).join('')}
                    </div>
                </div>
            `;
        }
        const clause = normalizePromptClause(node);
        const left = String(clause.left || '').trim() || '未设置变量';
        const op = this.getConditionSummaryOperator(clause.op);
        const hideRight = ['is_empty', 'not_empty'].includes(String(clause.op || '').trim().toLowerCase());
        const right = hideRight ? '' : this.getConditionSummaryValueText(clause.right, clause.rightType);
        const leftValue = explanation ? this.formatConditionRuntimeValue(explanation.leftValue, clause.rightType) : '';
        const rightValue = explanation && !hideRight
            ? this.formatConditionRuntimeValue(explanation.rightValue, clause.rightType === 'variable' ? 'string' : clause.rightType)
            : '';
        return `
            <div class="world-cond-summary-clause${clause.left ? '' : ' is-pending'}" data-depth="${depth}">
                <div class="world-cond-summary-clause-main">
                    <span class="world-cond-summary-var">${escapeHtml(left)}</span>
                    <span class="world-cond-summary-op">${escapeHtml(op)}</span>
                    ${hideRight ? '' : `<span class="world-cond-summary-value">${escapeHtml(right || '未设置')}</span>`}
                </div>
                <div class="world-cond-summary-meta">
                    ${clause.defineVariable?.name ? `<span class="world-cond-summary-badge">自动建</span>` : ''}
                    ${clause.rightType === 'variable' && right ? `<span class="world-cond-summary-badge subtle">变量比较</span>` : ''}
                    ${clause.left ? '' : `<span class="world-cond-summary-badge danger">待完善</span>`}
                    ${explanation ? `<span class="world-cond-summary-badge ${explanation.result ? '' : 'danger'}">${explanation.result ? '命中' : '未命中'}</span>` : ''}
                </div>
                ${explanation ? `
                    <div class="world-cond-summary-runtime">
                        <span>当前值：${escapeHtml(leftValue)}</span>
                        ${hideRight ? '' : `<span>比较值：${escapeHtml(rightValue)}</span>`}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderBlockConditionOverview(entry, block) {
        const overview = this.collectBlockConditionOverview(entry, block);
        return `
            <div class="world-cond-overview" id="we-condition-overview">
                <div class="world-cond-overview-head">
                    <div>
                        <div class="world-cond-overview-title">当前触发条件</div>
                        <div class="world-cond-overview-subtitle">先看条目激活，再看 block 条件命中，需要调整时再进入编辑。</div>
                    </div>
                    <div class="world-cond-overview-stats">
                        <span class="world-cond-overview-pill ${overview.entryActivation?.active ? '' : 'warn'}">${overview.entryActivation?.active ? '条目已激活' : '条目未激活'}</span>
                        <span class="world-cond-overview-pill ${block?.enabled === false ? 'warn' : ''}">${block?.enabled === false ? 'block 已禁用' : 'block 已启用'}</span>
                        <span class="world-cond-overview-pill">${overview.clauseCount} 条条件</span>
                        <span class="world-cond-overview-pill">${overview.variables.length} 个变量</span>
                        <span class="world-cond-overview-pill ${overview.explanation?.result ? '' : 'warn'}">${overview.explanation?.result ? 'block 当前命中' : 'block 当前未命中'}</span>
                        ${overview.pendingCount ? `<span class="world-cond-overview-pill warn">${overview.pendingCount} 处待完善</span>` : ''}
                    </div>
                </div>
                ${this.renderEntryActivationOverview(overview.entryActivation)}
                <div class="world-cond-overview-structure">
                    ${this.renderConditionOverviewNode(overview.tree, 0, overview.explanation)}
                </div>
                ${overview.pendingCount ? `
                    <details class="world-cond-overview-pending">
                        <summary>待完善项（${overview.pendingCount}）</summary>
                        <div class="world-cond-overview-pending-list">
                            ${overview.pendingItems.map((item) => `
                                <div class="world-cond-overview-pending-item">
                                    <button type="button" class="world-cond-overview-pending-main" data-path="${escapeHtml(item.path || '')}" data-node-id="${escapeHtml(item.nodeId || '')}">
                                        <span class="world-cond-overview-pending-label">${escapeHtml(item.label)}</span>
                                        <span class="world-cond-overview-pending-reason">${escapeHtml(item.reason)}</span>
                                    </button>
                                    ${item.kind ? `<button type="button" class="world-cond-overview-pending-fix" data-fix-kind="${escapeHtml(item.kind)}" data-fix-index="${Number(item.fixIndex || 0)}" data-node-id="${escapeHtml(item.nodeId || '')}">${item.kind === 'disconnected_from_result' ? '定位节点' : '快速修复'}</button>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </details>
                ` : ''}
                <div class="world-cond-overview-vars">
                    <div class="world-cond-overview-vars-title">涉及变量</div>
                    <div class="world-cond-overview-var-list">
                        ${overview.variables.length ? overview.variables.map((item) => `
                            <div class="world-cond-overview-var-card">
                                <div class="world-cond-overview-var-name">${escapeHtml(item.name)}</div>
                                <div class="world-cond-overview-var-meta">
                                    <span>${escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, item.type, item.type || '未定义类型'))}</span>
                                    <span>引用 ${item.refCount}</span>
                                    ${item.autoCreate ? `<span>默认 ${escapeHtml(this.getConditionSummaryValueText(item.defaultValue, item.type || 'number'))}</span>` : ''}
                                </div>
                            </div>
                        `).join('') : '<div class="world-cond-overview-empty">当前还没有可识别的变量条件。</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    getSessionVariableOptions() {
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        const useGlobal = Boolean(typeof bridge?.isSharedVariableSession === 'function' && sid && bridge.isSharedVariableSession(sid));
        const vars = useGlobal
            ? (chatStore?.listGlobalVariables?.() || {})
            : (chatStore?.listVariables?.(sid) || {});
        const schemas = chatStore?.listVariableSchemas?.(sid) || {};
        const keys = new Set([
            ...Object.keys(vars || {}).map(k => String(k || '').trim()).filter(Boolean),
            ...Object.keys(schemas || {}).map(k => String(k || '').trim()).filter(Boolean),
        ]);
        return [...keys].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((key) => ({
            value: key,
            label: key,
        }));
    }

    ensureVariableInStore(name, type = 'number', defaultValue = 0, options = {}) {
        const key = String(name || '').trim();
        if (!key) return false;
        const varType = ['number', 'string', 'boolean'].includes(String(type || '').trim().toLowerCase())
            ? String(type || '').trim().toLowerCase()
            : 'number';
        const bridge = window.appBridge;
        const chatStore = bridge?.chatStore;
        const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
        if (!chatStore || !sid) return false;
        const preferredSource = ['global', 'session'].includes(String(options?.source || '').trim().toLowerCase())
            ? String(options.source).trim().toLowerCase()
            : null;
        const useGlobal = preferredSource
            ? preferredSource === 'global'
            : Boolean(typeof bridge?.isSharedVariableSession === 'function' && bridge.isSharedVariableSession(sid));
        chatStore.setVariableSchema?.(key, { type: varType, default: defaultValue }, sid);
        if (useGlobal) {
            const current = chatStore.getGlobalVariable?.(key);
            if (current === undefined || current === null) {
                chatStore.setGlobalVariable?.(key, defaultValue);
            }
        } else {
            const current = chatStore.getVariable?.(key, sid);
            if (current === undefined || current === null) {
                chatStore.setVariable?.(key, defaultValue, sid);
            }
            if (chatStore.getInitialVariable?.(key, sid) === undefined) {
                chatStore.setInitialVariable?.(key, defaultValue, sid);
            }
        }
        return true;
    }

    mountNodeEditor({ entry, block, markRefDirty }) {
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

        const getNodeById = (nodeId) => {
            const id = String(nodeId || '').trim();
            if (!id) return null;
            return (graph.nodes || []).find(node => String(node.id || '') === id) || null;
        };
        const getIncomingEdges = (nodeId) => (graph.edges || []).filter(edge => edge.to === nodeId);
        const getOutgoingEdges = (nodeId) => (graph.edges || []).filter(edge => edge.from === nodeId);
        const getResultNode = () => (graph.nodes || []).find(node => node.type === 'result') || null;
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
                    if (edge?.id) edgeIds.add(String(edge.id));
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
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${opLabel}</div>
                        <div class="world-node-summary-meta">
                            <span>${incoming.some(edge => edge.toPort === 'left') ? '左已连' : '左未连'}</span>
                            <span>${incoming.some(edge => edge.toPort === 'right') ? '右已连' : '右未连'}</span>
                        </div>
                    </div>
                `;
            }
            if (type === 'logic') {
                const logicLabel = escapeHtml(this.getOptionLabel(NODE_LOGIC_OPTIONS, data.logic, 'AND'));
                const inputCount = getNodePortSpec(node).inputs.length;
                return `
                    <div class="world-node-summary">
                        <div class="world-node-summary-main">${logicLabel}</div>
                        <div class="world-node-summary-meta">
                            <span>${normalizeLogicValue(data.logic) === 'not' ? '单输入' : `${inputCount} 路输入`}</span>
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
                const nextSeen = new Set(seen);
                nextSeen.add(id);
                const targetNode = getNodeById(id);
                if (!targetNode) return null;
                const targetType = normalizeNodeType(targetNode.type);
                if (targetType === 'variable') {
                    const path = String(targetNode?.data?.path || '').trim();
                    const record = getCurrentVariableRecord(path);
                    return {
                        nodeId: id,
                        type: targetType,
                        label: path || '未选择变量',
                        valueText: record ? this.formatVariableBrowserValue(record.currentValue, record.type) : '未设置',
                        result: null,
                    };
                }
                if (targetType === 'value') {
                    const rightType = normalizeRightTypeValue(targetNode?.data?.rightType || 'number');
                    return {
                        nodeId: id,
                        type: targetType,
                        label: this.getConditionSummaryValueText(targetNode?.data?.value, rightType),
                        valueText: this.getConditionSummaryValueText(targetNode?.data?.value, rightType),
                        result: null,
                    };
                }
                if (targetType === 'compare') {
                    const runtimeContext = this.getConditionRuntimeContext();
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
                    return {
                        nodeId: id,
                        type: targetType,
                        label: this.getOptionLabel(BLOCK_OP_OPTIONS, compareData.op, '大于 (>)'),
                        result: Boolean(explanation?.result),
                        explanation,
                        clause,
                    };
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
                    return {
                        nodeId: id,
                        type: targetType,
                        label: this.getOptionLabel(NODE_LOGIC_OPTIONS, logicValue, 'AND'),
                        logic: logicValue,
                        result,
                        children,
                    };
                }
                return null;
            };
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
                `;
            } else if (type === 'logic') {
                const logicLabel = escapeHtml(this.getOptionLabel(NODE_LOGIC_OPTIONS, data.logic, 'AND'));
                const inputCount = getNodePortSpec(node).inputs.length;
                const logicSummary = getNodeRuntimeSummary(node.id);
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
        const renderLinks = () => {
            const paths = [];
            const activePathState = getActivePathState();
            (graph.edges || []).forEach((edge) => {
                const fromNode = getNodeById(edge.from);
                const toNode = getNodeById(edge.to);
                if (fromNode?.type === 'result' || toNode?.type === 'result') return;
                const from = portCenter(edge.from, edge.fromPort, 'output');
                const to = portCenter(edge.to, edge.toPort, 'input');
                if (!from || !to) return;
                const edgeStateClass = activePathState.edgeIds.has(String(edge.id || ''))
                    ? ' is-active-path'
                    : ' is-inactive-path';
                paths.push(`<path class="world-node-edge${edgeStateClass}" data-edge-id="${edge.id}" d="${curvePath(from.x, from.y, to.x, to.y)}"></path>`);
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
                const openMenu = (event) => {
                    const eventType = String(event?.type || 'unknown');
                    const now = Date.now();
                    const isSameAnchor = lastNodeSelectAnchor === btn;
                    const isDuplicateWindow = isSameAnchor && now - lastNodeSelectOpenAt < 420;
                    const isSyntheticFollowup =
                        isDuplicateWindow &&
                        (
                            (lastNodeSelectEventType === 'pointerup' && (eventType === 'touchend' || eventType === 'click')) ||
                            (lastNodeSelectEventType === 'touchend' && eventType === 'click')
                        );
                    if (isSyntheticFollowup) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    lastNodeSelectAnchor = btn;
                    lastNodeSelectOpenAt = now;
                    lastNodeSelectEventType = eventType;
                    openNodeSelectMenu(btn);
                };
                btn.addEventListener('click', openMenu);
                btn.addEventListener('pointerup', openMenu);
                if (!(window.PointerEvent)) {
                    btn.addEventListener('touchend', openMenu);
                }
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
            const finalSourceNodeId = getFinalSourceNodeId();
            const activePathState = getActivePathState();
            nodeCanvasEl.innerHTML = (graph.nodes || [])
                .filter(node => node.type !== 'result')
                .map((node) => `
                ${(() => {
                    const issueState = getNodeIssueState(node);
                    const issueClass = issueState.level ? ` is-${issueState.level}` : '';
                    const issueTitle = issueState.issues.length ? ` title="${escapeHtml(issueState.issues.join(' / '))}"` : '';
                    const isFinal = finalSourceNodeId === node.id;
                    const isActivePath = activePathState.nodeIds.has(String(node.id || ''));
                    const pathClass = isActivePath ? ' is-active-path' : ' is-inactive-path';
                    return `
                <div class="world-node-item world-node-item-${node.type}${selectedNodeIds.has(node.id) ? ' is-selected' : ''}${issueClass}${isFinal ? ' is-final' : ''}${pathClass}" data-node-id="${node.id}" style="left:${Math.round(Number(node.x || 0))}px; top:${Math.round(Number(node.y || 0))}px;"${issueTitle}>
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
            bindNodeInteractiveControls();
            if (!activeDrag) activeGuides = { vertical: null, horizontal: null };
            renderGuides();
            renderLinks();
            renderNodeStatus();
            renderNodeInspector();
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
        const addConditionChain = (payload = null) => {
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
            selectedNodeIds.add(variableNode.id);
            selectedNodeIds.add(valueNode.id);
            selectedNodeIds.add(compareNode.id);
            persistGraph({ syncWhen: true });
            renderScene();
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
            if (action === 'addCondition') return void addConditionChain();
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
            if (action === 'addCondition') return void addConditionChain();
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
                selectedNodeIds.clear();
                focusNodeList.forEach((node) => selectedNodeIds.add(node.id));
                renderScene();
                requestAnimationFrame(() => {
                    focusNodes(focusNodeList);
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
            hideContextMenu();
        };
    }
    ensureBlockManageModal() {
        if (this.blockManageModal) return;
        this.blockManageOverlay = document.createElement('div');
        this.blockManageOverlay.className = 'world-block-manage-overlay';
        this.blockManageOverlay.style.display = 'none';
        this.blockManageOverlay.addEventListener('click', () => this.hideBlockManageModal());

        this.blockManageModal = document.createElement('div');
        this.blockManageModal.className = 'world-block-manage-modal';
        this.blockManageModal.style.display = 'none';
        this.blockManageModal.innerHTML = `
            <div class="world-block-manage-modal-header">
                <div class="world-block-manage-modal-title">分页管理</div>
                <button type="button" class="world-block-manage-modal-close" aria-label="关闭">×</button>
            </div>
            <div class="world-block-manage-modal-list" id="world-block-manage-modal-list"></div>
            <div class="world-block-manage-modal-footer">
                <button type="button" class="world-block-manage-modal-done" id="world-block-manage-modal-done">完成</button>
            </div>
        `;
        this.blockManageModal.addEventListener('click', (event) => event.stopPropagation());
        this.blockManageList = this.blockManageModal.querySelector('#world-block-manage-modal-list');
        this.blockManageCloseBtn = this.blockManageModal.querySelector('#world-block-manage-modal-done');

        this.blockManageModal.querySelector('.world-block-manage-modal-close')?.addEventListener('click', () => this.hideBlockManageModal());
        this.blockManageCloseBtn?.addEventListener('click', () => this.hideBlockManageModal());

        document.body.appendChild(this.blockManageOverlay);
        document.body.appendChild(this.blockManageModal);
    }

    getBlockManageEntry() {
        const id = String(this.blockManageEntryId || '').trim();
        if (!id) return null;
        const { entry } = this.resolveEntryById(id);
        return entry || null;
    }

    renderBlockManageModalList() {
        if (!this.blockManageList) return;
        const entry = this.getBlockManageEntry();
        if (!entry) {
            this.blockManageList.innerHTML = '<div class="world-block-manage-modal-empty">未找到条目</div>';
            return;
        }
        const entryId = this.getEntryId(entry);
        const blocks = this.ensureEntryPromptBlocks(entry);
        const currentPage = this.getEntryBlockPage(entry, entryId);
        const compact = (text, max = 50) => {
            const raw = String(text || '').replace(/\s+/g, ' ').trim();
            if (!raw) return '（空）';
            return raw.length > max ? `${raw.slice(0, max)}…` : raw;
        };
        this.blockManageList.innerHTML = blocks.map((block, idx) => `
            <div class="world-block-manage-modal-item ${idx === currentPage ? 'is-active' : ''}">
                <button type="button" class="world-block-manage-modal-open" data-action="open" data-idx="${idx}">
                    <span class="world-block-manage-modal-page">
                        <span>第 ${idx + 1} 页</span>
                        <span class="world-block-manage-modal-badges">
                            <span class="world-block-manage-modal-badge ${block?.enabled === false ? 'warn' : ''}">${block?.enabled === false ? '已禁用' : '已启用'}</span>
                            <span class="world-block-manage-modal-badge subtle">${escapeHtml(this.getOptionLabel(ROLE_OPTIONS, block?.role, 'system'))}</span>
                            <span class="world-block-manage-modal-badge subtle">P${escapeHtml(String(Number.isFinite(Number(block?.priority)) ? Number(block.priority) : 100))}</span>
                        </span>
                    </span>
                    <span class="world-block-manage-modal-titleline">${escapeHtml(String(block?.title || '').trim() || `内容 ${idx + 1}`)}</span>
                    <span class="world-block-manage-modal-preview">${compact(block?.content)}</span>
                </button>
                <div class="world-block-manage-modal-actions">
                    <button type="button" data-action="up" data-idx="${idx}" ${idx <= 0 ? 'disabled' : ''}>上移</button>
                    <button type="button" data-action="down" data-idx="${idx}" ${idx >= blocks.length - 1 ? 'disabled' : ''}>下移</button>
                    <button type="button" data-action="delete" data-idx="${idx}" ${blocks.length <= 1 ? 'disabled' : ''}>删除</button>
                </div>
            </div>
        `).join('');

        this.blockManageList.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = String(btn.dataset.action || '');
                const idx = Number(btn.dataset.idx);
                if (!Number.isFinite(idx)) return;
                if (action === 'open') {
                    this.setEntryBlockPage(entry, entryId, idx);
                    this.hideBlockManageModal();
                    return;
                }
                if (action === 'up') this.movePromptBlock(entry, idx, idx - 1);
                if (action === 'down') this.movePromptBlock(entry, idx, idx + 1);
                if (action === 'delete') this.removePromptBlock(entry, idx);
                this.renderBlockManageModalList();
            });
        });
    }

    showBlockManageModal(entry, entryId = '') {
        if (!entry || typeof entry !== 'object') return;
        this.ensureBlockManageModal();
        this.blockManageEntryId = String(entryId || this.getEntryId(entry) || '').trim();
        this.renderBlockManageModalList();
        if (this.blockManageOverlay) this.blockManageOverlay.style.display = 'block';
        if (this.blockManageModal) this.blockManageModal.style.display = 'block';
    }

    hideBlockManageModal() {
        if (this.blockManageOverlay) this.blockManageOverlay.style.display = 'none';
        if (this.blockManageModal) this.blockManageModal.style.display = 'none';
    }

    toggleBatchMode(force = null) {
        this.batchMode = force === null ? !this.batchMode : Boolean(force);
        if (!this.batchMode) {
            this.selectedEntries.clear();
        }
        this.updateBatchBar();
        this.renderList();
    }

    syncSelectedEntries() {
        const existing = new Set(this.data.entries.map((entry, idx) => this.getEntryId(entry, idx)));
        const next = new Set();
        this.selectedEntries.forEach((id) => {
            if (existing.has(id)) next.add(id);
        });
        this.selectedEntries = next;
    }

    updateBatchBar() {
        this.syncSelectedEntries();
        const count = this.selectedEntries.size;
        if (this.batchBarEl) {
            this.batchBarEl.style.display = this.batchMode ? 'flex' : 'none';
            if (this.batchCountEl) this.batchCountEl.textContent = `已选 ${count}`;
            if (this.batchCreateBtn) this.batchCreateBtn.disabled = count === 0;
        }
        this.updateManageState();
    }

    updateManageState() {
        this.syncSelectedEntries();
        const count = this.selectedEntries.size;
        if (this.manageCountEl) this.manageCountEl.textContent = `已选 ${count}`;
        const disableBatchActions = count === 0;
        if (this.manageCreateSelectedBtn) this.manageCreateSelectedBtn.disabled = disableBatchActions;
        if (this.manageDeleteBtn) this.manageDeleteBtn.disabled = disableBatchActions;
        if (this.manageMoveUpBtn) this.manageMoveUpBtn.disabled = disableBatchActions;
        if (this.manageMoveDownBtn) this.manageMoveDownBtn.disabled = disableBatchActions;
        if (this.manageMoveTopBtn) this.manageMoveTopBtn.disabled = disableBatchActions;
        if (this.manageMoveBottomBtn) this.manageMoveBottomBtn.disabled = disableBatchActions;
        this.renderManageList();
    }

    renderManageList() {
        if (!this.manageListEl) return;
        this.manageListEl.innerHTML = '';
        const compact = (text, max = 52) => {
            const raw = String(text || '').replace(/\s+/g, ' ').trim();
            if (!raw) return '';
            return raw.length > max ? `${raw.slice(0, max)}…` : raw;
        };
        this.data.entries.forEach((entry, idx) => {
            const entryId = this.getEntryId(entry, idx);
            const title = this.getEntryDisplayName(entry, idx);
            const content = compact(entry.content, 48);
            const isSelected = this.selectedEntries.has(entryId);
            const isActive = idx === this.currentIndex;
            const item = document.createElement('div');
            item.className = `world-manage-item${isActive ? ' active' : ''}${isSelected ? ' is-selected' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'world-manage-check';
            checkbox.checked = isSelected;
            checkbox.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleEntrySelection(entryId);
            });
            item.appendChild(checkbox);

            const main = document.createElement('div');
            main.className = 'world-manage-item-main';
            const titleEl = document.createElement('div');
            titleEl.className = 'world-manage-item-title';
            titleEl.textContent = title;
            const subEl = document.createElement('div');
            subEl.className = 'world-manage-item-sub';
            subEl.textContent = content || '';
            main.appendChild(titleEl);
            main.appendChild(subEl);
            item.appendChild(main);

            item.addEventListener('click', () => {
                this.currentIndex = idx;
                this.toggleEntrySelection(entryId);
                this.renderEditor();
            });

            this.manageListEl.appendChild(item);
        });
    }

    toggleEntrySelection(entryId) {
        const id = String(entryId || '').trim();
        if (!id) return;
        if (this.selectedEntries.has(id)) this.selectedEntries.delete(id);
        else this.selectedEntries.add(id);
        this.updateBatchBar();
        this.renderList();
    }

    selectAllEntries() {
        this.selectedEntries = new Set(this.data.entries.map((entry, idx) => this.getEntryId(entry, idx)).filter(Boolean));
        this.updateBatchBar();
        this.renderList();
    }

    clearSelection() {
        this.selectedEntries.clear();
        this.updateBatchBar();
        this.renderList();
    }

    getSelectedEntries() {
        const selected = this.selectedEntries;
        return this.data.entries.filter((entry, idx) => selected.has(this.getEntryId(entry, idx)));
    }

    async createChatFromSelection() {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const selected = this.getSelectedEntries();
        const firstEntry = selected[0] || null;
        const firstIdx = firstEntry ? this.data.entries.findIndex(e => this.getEntryId(e) === this.getEntryId(firstEntry)) : -1;
        const defaultName = firstEntry ? this.getEntryDisplayName(firstEntry, Math.max(0, firstIdx)) : '新聊天室';
        const name = await this.openChatNameModal(defaultName);
        if (!name || !String(name).trim()) return;
        await this.createChatFromEntries(selected, { name });
        this.clearSelection();
        this.updateBatchBar();
    }

    async createChatFromAllEntries() {
        const name = prompt('输入聊天室名称（将引用整本世界书）', this.worldName || '新聊天室');
        if (!name || !String(name).trim()) return;
        await this.createChatFromEntries(this.data.entries, { name, includeAll: true });
    }

    deleteSelectedEntries() {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const count = this.selectedEntries.size;
        const ok = window.confirm(`确定删除已选 ${count} 个条目？此操作不可撤销。`);
        if (!ok) return;
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        this.data.entries = this.data.entries.filter((entry, idx) => !selected.has(this.getEntryId(entry, idx)));
        if (!this.data.entries.length) this.data.entries.push(createDefaultEntry(0));
        this.selectedEntries.clear();
        this.batchMode = false;
        this.currentIndex = Math.max(0, this.data.entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    moveSelectedEntries(direction = 0) {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        if (!direction) return;
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        const entries = this.data.entries;
        if (direction < 0) {
            for (let i = 1; i < entries.length; i += 1) {
                const id = this.getEntryId(entries[i], i);
                const prevId = this.getEntryId(entries[i - 1], i - 1);
                if (selected.has(id) && !selected.has(prevId)) {
                    const tmp = entries[i - 1];
                    entries[i - 1] = entries[i];
                    entries[i] = tmp;
                }
            }
        } else {
            for (let i = entries.length - 2; i >= 0; i -= 1) {
                const id = this.getEntryId(entries[i], i);
                const nextId = this.getEntryId(entries[i + 1], i + 1);
                if (selected.has(id) && !selected.has(nextId)) {
                    const tmp = entries[i + 1];
                    entries[i + 1] = entries[i];
                    entries[i] = tmp;
                }
            }
        }
        this.currentIndex = Math.max(0, entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    moveSelectedToEdge(target = 'top') {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        const entries = this.data.entries;
        const selectedEntries = entries.filter((entry, idx) => selected.has(this.getEntryId(entry, idx)));
        const rest = entries.filter((entry, idx) => !selected.has(this.getEntryId(entry, idx)));
        this.data.entries = target === 'bottom' ? [...rest, ...selectedEntries] : [...selectedEntries, ...rest];
        this.currentIndex = Math.max(0, this.data.entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    getEntryTriggerStrategy(entry) {
        return entry?.constant ? 'blue' : 'green';
    }

    applyEntryTriggerStrategy(entry, strategy = 'green') {
        if (!entry || typeof entry !== 'object') return;
        const mode = String(strategy || '').toLowerCase() === 'blue' ? 'blue' : 'green';
        entry.constant = mode === 'blue';
        entry.selective = mode === 'green';
    }

    setEntryDisabled(index, disabled) {
        const entry = this.data.entries[index];
        if (!entry) return;
        entry.disable = Boolean(disabled);
        if (!entry.disable && !entry.constant && !entry.selective) {
            this.applyEntryTriggerStrategy(entry, 'green');
        }
        this.renderList();
        if (this.currentIndex === index) this.renderEditor();
        if (this.refMode) this.scheduleRefSync();
    }

    getOptionLabel(options = [], value, fallback = '') {
        const target = String(value ?? '').trim();
        const hit = (Array.isArray(options) ? options : []).find((opt) => String(opt?.value ?? '').trim() === target);
        return hit?.label || fallback || target;
    }

    ensureCustomSelectMenu() {
        if (this.customSelectMenuEl) return this.customSelectMenuEl;
        const menu = document.createElement('div');
        menu.className = 'world-app-select-menu';
        menu.style.display = 'none';
        menu.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(menu);
        this.customSelectMenuEl = menu;
        return menu;
    }

    closeCustomSelectMenu() {
        if (this.customSelectMenuAnchor) {
            const field = this.customSelectMenuAnchor?.dataset?.field || this.customSelectMenuAnchor?.id || '';
            logger.info(`[world-select] close anchor=${field}`);
        }
        if (typeof this.customSelectMenuCleanup === 'function') {
            try { this.customSelectMenuCleanup(); } catch {}
        }
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        if (this.customSelectMenuEl) {
            this.customSelectMenuEl.style.display = 'none';
            this.customSelectMenuEl.innerHTML = '';
        }
    }

    openCustomSelectMenu({ anchorEl, options = [], currentValue = '', onSelect = null } = {}) {
        if (!anchorEl) return;
        const isSameAnchorOpen =
            this.customSelectMenuAnchor === anchorEl &&
            this.customSelectMenuEl &&
            this.customSelectMenuEl.style.display !== 'none';
        if (isSameAnchorOpen) {
            const field = anchorEl?.dataset?.field || anchorEl?.id || '';
            logger.info(`[world-select] toggle-close same-anchor=${field}`);
            this.closeCustomSelectMenu();
            return;
        }
        const menu = this.ensureCustomSelectMenu();
        const current = String(currentValue ?? '').trim();
        const opts = Array.isArray(options) ? options : [];
        {
            const field = anchorEl?.dataset?.field || anchorEl?.id || '';
            logger.info(`[world-select] open anchor=${field} options=${opts.length} current=${current}`);
        }
        menu.innerHTML = opts.map((opt) => {
            const value = String(opt?.value ?? '');
            const selected = value === current;
            const label = String(opt?.label ?? value);
            return `
                <button type="button" class="world-app-select-item ${selected ? 'is-selected' : ''}" data-value="${value}">
                    <span class="world-app-select-item-label">${label}</span>
                    <span class="world-app-select-item-check">${selected ? '✓' : ''}</span>
                </button>
            `;
        }).join('');

        menu.querySelectorAll('.world-app-select-item').forEach((item) => {
            item.addEventListener('click', () => {
                const value = String(item.dataset.value ?? '');
                if (typeof onSelect === 'function') onSelect(value);
                this.closeCustomSelectMenu();
            });
        });

        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.minWidth = `${Math.max(170, Math.round(anchorEl.getBoundingClientRect().width))}px`;
        menu.style.left = '0px';
        menu.style.top = '0px';

        const anchorRect = anchorEl.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = anchorRect.left;
        let top = anchorRect.bottom + gap;
        if (left + menuRect.width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuRect.width - 8);
        }
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, anchorRect.top - menuRect.height - gap);
        }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
        menu.style.visibility = 'visible';

        const onDocClick = (ev) => {
            const target = ev?.target;
            if (!target) return;
            if (menu.contains(target) || anchorEl.contains(target)) return;
            logger.info('[world-select] close reason=doc-click');
            this.closeCustomSelectMenu();
        };
        const onResize = () => this.closeCustomSelectMenu();
        const onScroll = (ev) => {
            const target = ev?.target;
            if (target && (menu.contains(target) || anchorEl.contains(target))) return;
            logger.info('[world-select] close reason=scroll');
            this.closeCustomSelectMenu();
        };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('touchstart', onDocClick, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        this.customSelectMenuCleanup = () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('touchstart', onDocClick, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
        this.customSelectMenuAnchor = anchorEl;
    }

    renderList() {
        if (!this.entriesListEl) return;
        this.updateBatchBar();
        this.entriesListEl.innerHTML = '';
        const searchTerm = this.getEntrySearchTerm();
        const filtered = this.getFilteredEntries(searchTerm);

        const rawSize = Number(this.entryPageSize);
        const pageSize = Math.max(1, Math.min(200, Number.isFinite(rawSize) ? Math.trunc(rawSize) : 5));
        this.entryPageSize = pageSize;
        if (this.entryPageSizeEl) this.entryPageSizeEl.value = String(pageSize);

        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        this.entryTotalPages = totalPages;

        this.entryPageIndex = Math.min(Math.max(0, this.entryPageIndex), totalPages - 1);

        const buildEntryItem = (entry, i) => {
            const entryId = this.getEntryId(entry, i);
            const isSelected = this.selectedEntries.has(entryId);
            const item = document.createElement('div');
            item.className = `world-entry-item ${i === this.currentIndex ? 'active' : ''}`;
            if (this.batchMode && isSelected) item.classList.add('is-selected');
            if (entry.disable) item.classList.add('is-disabled');

            const lights = document.createElement('div');
            lights.className = 'world-entry-lights';
            const strategyLight = document.createElement('span');
            const strategy = this.getEntryTriggerStrategy(entry);
            strategyLight.className = `world-entry-light ${entry.disable ? 'off' : strategy}`;
            lights.appendChild(strategyLight);

            const main = document.createElement('div');
            main.className = 'world-entry-main';
            const title = document.createElement('div');
            title.className = 'world-entry-title';
            title.textContent = entry.comment || `（无标题 ${i + 1}）`;
            const meta = document.createElement('div');
            meta.className = 'world-entry-meta';
            const pos = positionLabel(entry.position, entry.role, entry.depth);
            meta.innerHTML = `
                <span>${pos}</span>
                <span>D${entry.depth}</span>
                <span>O${entry.order}</span>
                <span>${entry.useProbability ? `${entry.probability}%` : '100%'}</span>
            `;
            main.appendChild(title);
            main.appendChild(meta);

            if (this.batchMode) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'world-entry-select';
                checkbox.checked = isSelected;
                checkbox.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.toggleEntrySelection(entryId);
                });
                item.appendChild(checkbox);
            }
            item.appendChild(lights);
            item.appendChild(main);
            const controls = document.createElement('div');
            controls.className = 'world-entry-controls';
            const enableToggle = document.createElement('button');
            enableToggle.type = 'button';
            enableToggle.className = `world-entry-enable-toggle ${entry.disable ? 'is-off' : 'is-on'}`;
            enableToggle.setAttribute('aria-label', entry.disable ? '启用条目' : '停用条目');
            enableToggle.setAttribute('aria-pressed', entry.disable ? 'false' : 'true');
            enableToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                this.setEntryDisabled(i, !entry.disable);
            });
            controls.appendChild(enableToggle);
            item.appendChild(controls);
            item.onclick = () => this.selectEntry(i);
            return item;
        };

        if (!filtered.length) {
            const pageEl = document.createElement('li');
            pageEl.className = 'world-entry-page';
            const list = document.createElement('div');
            list.className = 'world-entry-page-list';
            const empty = document.createElement('div');
            empty.className = 'world-entry-empty';
            empty.textContent = searchTerm ? '没有匹配的条目' : '（无条目）';
            list.appendChild(empty);
            pageEl.appendChild(list);
            this.entriesListEl.appendChild(pageEl);
            this.updateEntryPageIndicator();
            requestAnimationFrame(() => this.scrollEntryListToPage());
            return;
        }

        for (let page = 0; page < totalPages; page += 1) {
            const pageEl = document.createElement('li');
            pageEl.className = 'world-entry-page';
            const list = document.createElement('div');
            list.className = 'world-entry-page-list';
            const start = page * pageSize;
            const end = Math.min(start + pageSize, filtered.length);
            for (let idx = start; idx < end; idx += 1) {
                const { entry, idx: originalIndex } = filtered[idx];
                list.appendChild(buildEntryItem(entry, originalIndex));
            }
            pageEl.appendChild(list);
            this.entriesListEl.appendChild(pageEl);
        }
        this.updateEntryPageIndicator();
        requestAnimationFrame(() => this.scrollEntryListToPage());
    }

    getEntrySearchTerm() {
        return String(this.entrySearchTerm || '').trim().toLowerCase();
    }

    getFilteredEntries(searchTerm = this.getEntrySearchTerm()) {
        return this.data.entries
            .map((entry, idx) => ({ entry, idx }))
            .filter(({ entry }) => {
                if (!searchTerm) return true;
                const parts = [];
                if (entry?.comment) parts.push(entry.comment);
                if (entry?.content) parts.push(entry.content);
                if (Array.isArray(entry?.key)) parts.push(entry.key.join(' '));
                if (!Array.isArray(entry?.key) && entry?.key) parts.push(entry.key);
                if (Array.isArray(entry?.keysecondary)) parts.push(entry.keysecondary.join(' '));
                if (!Array.isArray(entry?.keysecondary) && entry?.keysecondary) parts.push(entry.keysecondary);
                if (entry?.id) parts.push(entry.id);
                const haystack = parts.join(' ').toLowerCase();
                return haystack.includes(searchTerm);
            })
            .sort((a, b) => {
                const aDisabled = a.entry?.disable ? 1 : 0;
                const bDisabled = b.entry?.disable ? 1 : 0;
                if (aDisabled !== bDisabled) return aDisabled - bDisabled;
                return a.idx - b.idx;
            });
    }

    updateEntryPageIndicator() {
        const total = Math.max(1, this.entryTotalPages || 1);
        const current = Math.min(Math.max(0, this.entryPageIndex), total - 1);
        if (this.entryPageIndicatorEl) this.entryPageIndicatorEl.textContent = `${current + 1}/${total}`;
        if (this.entryPagePrevBtn) this.entryPagePrevBtn.disabled = current <= 0;
        if (this.entryPageNextBtn) this.entryPageNextBtn.disabled = current >= total - 1;
        if (this.entryDotsEl) {
            this.entryDotsEl.innerHTML = '';
            if (total <= 1) {
                this.entryDotsEl.style.display = 'none';
                return;
            }
            this.entryDotsEl.style.display = 'flex';
            for (let i = 0; i < total; i += 1) {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = `world-entries-dot${i === current ? ' active' : ''}`;
                dot.setAttribute('aria-label', `第 ${i + 1} 页`);
                dot.addEventListener('click', () => {
                    this.entryPageIndex = i;
                    this.renderList();
                });
                this.entryDotsEl.appendChild(dot);
            }
        }
    }

    scrollEntryListToPage() {
        if (!this.entriesListEl) return;
        const width = this.entriesListEl.clientWidth;
        if (!width) return;
        const target = Math.round(width * this.entryPageIndex);
        this.entryPageScrollLock = true;
        this.entriesListEl.scrollTo({ left: target, behavior: 'auto' });
        window.setTimeout(() => {
            this.entryPageScrollLock = false;
        }, 120);
    }

    selectEntry(index) {
        this.hideBlockManageModal();
        this.currentIndex = Math.max(0, Math.min(index, this.data.entries.length - 1));
        const filtered = this.getFilteredEntries();
        const currentPos = filtered.findIndex(item => item.idx === this.currentIndex);
        if (currentPos >= 0) {
            const rawSize = Number(this.entryPageSize);
            const pageSize = Math.max(1, Math.min(200, Number.isFinite(rawSize) ? Math.trunc(rawSize) : 5));
            this.entryPageIndex = Math.floor(currentPos / pageSize);
        }
        this.renderList();
        this.renderEditor();
    }

    renderEditor() {
        if (!this.editorEl) return;
        this.cleanupNodeEditor();
        this.closeCustomSelectMenu();
        const entry = this.data.entries[this.currentIndex];
        if (!entry) {
            this.editorEl.innerHTML = '<div style="color:#888;">（无条目）</div>';
            return;
        }

        const blocks = this.ensureEntryPromptBlocks(entry);
        const entryId = this.getEntryId(entry, this.currentIndex);
        const blockPage = this.getEntryBlockPage(entry, entryId);
        const activeBlock = blocks[blockPage] || blocks[0];
        const blockFlipped = this.isBlockFlipped(activeBlock?.id);
        const blockExpanded = this.isBlockExpanded(activeBlock?.id);
        const blockBackView = this.getBlockBackView(activeBlock?.id);
        const aiBusy = this.aiBusy && String(entry.id || '') === String(this.aiPendingEntryId || '');
        const triggerStrategy = this.getEntryTriggerStrategy(entry);
        const triggerStrategyLabel = this.getOptionLabel(TRIGGER_STRATEGY_OPTIONS, triggerStrategy, '🟢 绿灯（关键词触发）');
        const positionLabelText = this.getOptionLabel(POSITION_OPTIONS, entry.position, '↑Char（角色前）');
        const roleLabelText = this.getOptionLabel(ROLE_OPTIONS, entry.role, 'system');
        const selectiveLogicLabel = this.getOptionLabel(SELECTIVE_LOGIC_OPTIONS, entry.selectiveLogic, 'AND 任一（匹配任一关键词）');
        this.editorEl.innerHTML = `
            <div class="world-entry-form">
                <div class="world-entry-card">
                    <label>标题 / Memo</label>
                    <input type="text" id="we-comment" value="${entry.comment || ''}" placeholder="条目标题（可选）">

                    <div class="world-block-toolbar">
                        <div class="world-block-toolbar-actions">
                            <button type="button" class="world-ai-trigger" id="we-ai-generate" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '生成中...' : 'AI生成'}</button>
                            <button type="button" class="world-block-btn" id="we-block-add">＋</button>
                            <button type="button" class="world-block-btn" id="we-block-manage">管理</button>
                        </div>
                    </div>

                    <div class="world-block-page-dots" id="we-block-dots">
                        ${blocks.map((_, idx) => `
                            <button type="button" class="world-block-dot ${idx === blockPage ? 'active' : ''}" data-idx="${idx}" aria-label="第 ${idx + 1} 页"></button>
                        `).join('')}
                    </div>

                    <div class="world-content-title">内容</div>
                    <div class="world-block-overlay ${blockExpanded ? 'show' : ''}" id="we-block-overlay"></div>
                    <div class="world-flip-card world-content-card ${blockFlipped ? 'is-flipped' : ''} ${blockExpanded ? 'is-expanded' : ''}" id="we-block-shell">
                        <button type="button" class="world-block-corner-btn" id="we-block-corner-btn" aria-label="${blockExpanded ? '翻转' : '展开'}">
                            ${blockExpanded ? BLOCK_FLIP_ICON_SVG : BLOCK_EXPAND_ICON_SVG}
                        </button>
                        <div class="world-flip-card-face world-flip-card-front">
                            <textarea id="we-block-content" placeholder="输入本页提示词内容">${activeBlock?.content || ''}</textarea>
                        </div>
                        <div class="world-flip-card-face world-flip-card-back">
                            <div class="world-block-back-tools ${blockBackView === 'editor' ? 'is-editor' : 'is-summary'}">
                                ${blockBackView === 'editor' ? `
                                    <div class="world-block-back-tool-group">
                                        <button type="button" class="world-block-back-nav-btn" id="we-block-editor-back">概览</button>
                                    </div>
                                    <button type="button" class="world-block-back-save-btn" id="we-block-editor-save">保存</button>
                                ` : `
                                    <div class="world-block-back-tool-group">
                                        <button type="button" class="world-block-back-nav-btn primary" id="we-block-open-node">${BLOCK_MODE_NODE_ICON_SVG}<span>节点编辑</span></button>
                                    </div>
                                `}
                            </div>
                            ${this.renderBlockSettingsPanel(activeBlock, blockPage)}
                            ${blockBackView === 'editor' ? `
                                <div class="world-node-editor" id="we-node-editor">
                                    <div class="world-node-toolbar">
                                        <button type="button" class="world-node-toolbar-btn" data-action="template" title="常用节点模板">模板</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="addCondition" title="新增条件链">条件链</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="addVariable" title="新增变量并建链">变量</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="addValue" title="新增值节点">值</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="addCompare" title="新增比较节点">比较</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="addLogic" title="新增逻辑节点">逻辑</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="zoomOut" title="缩小">缩小</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="zoomReset" title="缩放重置">1:1</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="zoomIn" title="放大">放大</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="fitSelection" title="缩放到当前选中">选中</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="fitAll" title="缩放到全部节点">全部</button>
                                        <button type="button" class="world-node-toolbar-btn" data-action="layout" title="自动排版">排版</button>
                                    </div>
                                    <div class="world-node-status" id="we-node-status" data-tone="muted"></div>
                                    <div class="world-node-canvas-wrap" id="we-node-canvas-wrap">
                                        <div class="world-node-scene" id="we-node-scene">
                                            <svg class="world-node-links" id="we-node-links" viewBox="0 0 760 320" preserveAspectRatio="none" aria-hidden="true"></svg>
                                            <div class="world-node-guides" id="we-node-guides" aria-hidden="true"></div>
                                            <div class="world-node-canvas" id="we-node-canvas"></div>
                                            <div class="world-node-marquee" id="we-node-marquee"></div>
                                        </div>
                                        <div class="world-node-context-menu" id="we-node-context-menu"></div>
                                    </div>
                                    <div class="world-node-inspector" id="we-node-inspector"></div>
                                </div>
                            ` : this.renderBlockConditionOverview(entry, activeBlock)}
                        </div>
                    </div>
                </div>

                <div class="world-entry-card">
                    <div class="world-entry-card-title">基础触发设置</div>
                    <div class="world-entry-grid world-entry-grid-core">
                        <div class="world-entry-field">
                            <label>触发策略</label>
                            <button type="button" class="world-app-select-btn" id="we-triggerStrategy-btn">
                                <span>${triggerStrategyLabel}</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </div>
                        <div class="world-entry-field">
                            <label>位置（position）</label>
                            <button type="button" class="world-app-select-btn" id="we-position-btn">
                                <span>${positionLabelText}</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </div>
                        <div class="world-entry-field">
                            <label>深度（depth）</label>
                            <input type="number" id="we-depth" min="0" max="1000" value="${entry.depth}">
                        </div>
                        <div class="world-entry-field">
                            <label>顺序 / Order</label>
                            <input type="number" id="we-order" min="-9999" max="9999" value="${entry.order}">
                        </div>
                        <div class="world-entry-field">
                            <label>触发概率（Trigger %）</label>
                            <input type="number" id="we-probability" min="0" max="100" value="${entry.probability}">
                        </div>
                        <div class="world-entry-field">
                            <label>&nbsp;</label>
                            <label class="world-entry-inline-check">
                                <input type="checkbox" id="we-useProbability" ${entry.useProbability ? 'checked' : ''}>
                                <span>启用概率</span>
                            </label>
                        </div>
                    </div>
                </div>

                <details class="world-entry-advanced">
                    <summary>高级设置</summary>
                    <div class="world-entry-advanced-body">
                        <div class="world-entry-group">
                            <div class="world-entry-group-title">关键词与角色</div>
                            <div class="world-entry-grid world-entry-grid-2">
                                <div class="world-entry-field">
                                    <label>主触发关键词（key）</label>
                                    <textarea id="we-key" placeholder="用逗号或换行分隔">${(entry.key || []).join(', ')}</textarea>
                                </div>
                                <div class="world-entry-field">
                                    <label>副触发关键词（keysecondary）</label>
                                    <textarea id="we-keysecondary" placeholder="用逗号或换行分隔">${(entry.keysecondary || []).join(', ')}</textarea>
                                </div>
                            </div>
                            <div class="world-entry-grid world-entry-grid-2">
                                <div class="world-entry-field" id="we-role-wrap" style="${Number(entry.position) === 4 ? '' : 'display:none;'}">
                                    <label>插入角色（role）</label>
                                    <button type="button" class="world-app-select-btn" id="we-role-btn">
                                        <span>${roleLabelText}</span>
                                        <span class="world-app-select-btn-chevron">▾</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="world-entry-group">
                            <div class="world-entry-group-title">触发补充与递归</div>
                            <div class="world-entry-toggle-grid">
                                <label><input type="checkbox" id="we-ignoreBudget" ${entry.ignoreBudget ? 'checked' : ''}> 忽略预算</label>
                                <label><input type="checkbox" id="we-excludeRecursion" ${entry.excludeRecursion ? 'checked' : ''}> 不参与递归</label>
                                <label><input type="checkbox" id="we-preventRecursion" ${entry.preventRecursion ? 'checked' : ''}> 阻止递归</label>
                            </div>
                            <label style="margin-top:8px;">选择性逻辑（Selective Logic）</label>
                            <button type="button" class="world-app-select-btn" id="we-selectiveLogic-btn">
                                <span>${selectiveLogicLabel}</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </div>

                        <div class="world-entry-group">
                            <div class="world-entry-group-title">匹配来源（Match）</div>
                            <div class="world-entry-toggle-grid">
                                <label><input type="checkbox" id="we-matchPersonaDescription" ${entry.matchPersonaDescription ? 'checked' : ''}> Persona 描述</label>
                                <label><input type="checkbox" id="we-matchCharacterDescription" ${entry.matchCharacterDescription ? 'checked' : ''}> 角色描述</label>
                                <label><input type="checkbox" id="we-matchCharacterPersonality" ${entry.matchCharacterPersonality ? 'checked' : ''}> 角色性格</label>
                                <label><input type="checkbox" id="we-matchCharacterDepthPrompt" ${entry.matchCharacterDepthPrompt ? 'checked' : ''}> 角色深度提示</label>
                                <label><input type="checkbox" id="we-matchScenario" ${entry.matchScenario ? 'checked' : ''}> 场景</label>
                                <label><input type="checkbox" id="we-matchCreatorNotes" ${entry.matchCreatorNotes ? 'checked' : ''}> 作者注释</label>
                            </div>
                        </div>

                        <div class="world-entry-group">
                            <div class="world-entry-group-title">分组与覆盖</div>
                            <div class="world-entry-grid world-entry-grid-3">
                                <div class="world-entry-field">
                                    <label>纳入组（group）</label>
                                    <input type="text" id="we-group" value="${entry.group || ''}" placeholder="逗号分隔多个组">
                                </div>
                                <div class="world-entry-field">
                                    <label>组权重（groupWeight）</label>
                                    <input type="number" id="we-groupWeight" min="0" max="9999" value="${entry.groupWeight}">
                                </div>
                                <div class="world-entry-field">
                                    <label>递归延迟（delayUntilRecursion）</label>
                                    <input type="number" id="we-delayUntilRecursion" min="0" max="9999" value="${entry.delayUntilRecursion ?? 0}">
                                </div>
                            </div>
                            <div class="world-entry-toggle-grid" style="margin-top:6px;">
                                <label><input type="checkbox" id="we-groupOverride" ${entry.groupOverride ? 'checked' : ''}> 允许覆盖同组</label>
                                <label><input type="checkbox" id="we-caseSensitive" ${entry.caseSensitive ? 'checked' : ''}> 区分大小写（覆盖）</label>
                                <label><input type="checkbox" id="we-matchWholeWords" ${entry.matchWholeWords ? 'checked' : ''}> 全词匹配（覆盖）</label>
                                <label><input type="checkbox" id="we-useGroupScoring" ${entry.useGroupScoring ? 'checked' : ''}> 组打分（覆盖）</label>
                            </div>
                            <label style="margin-top:6px;">扫描深度覆盖（scanDepth，可空）</label>
                            <input type="number" id="we-scanDepth" min="0" max="1000" value="${entry.scanDepth ?? ''}" placeholder="留空使用全局设置">
                        </div>
                    </div>
                </details>

                <div class="world-entry-actions">
                    <button id="we-duplicate">复制条目</button>
                    <button id="we-delete">删除条目</button>
                </div>
            </div>
        `;

        const q = (sel) => this.editorEl.querySelector(sel);
        const markRefDirty = () => {
            if (this.refMode) this.scheduleRefSync();
        };
        const bindInput = (sel, key, map = (v) => v) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                entry[key] = map(el.value);
                if (key === 'comment') this.renderList();
                markRefDirty();
            });
        };
        const bindNumber = (sel, key, def, min, max) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                let v = toNumber(el.value, def);
                if (min != null) v = Math.max(min, v);
                if (max != null) v = Math.min(max, v);
                entry[key] = v;
                if (key === 'order' || key === 'depth' || key === 'position') this.renderList();
                markRefDirty();
            });
        };
        const bindCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked;
                this.renderList();
                markRefDirty();
            });
        };

        bindInput('#we-comment', 'comment', (v) => v);
        bindInput('#we-key', 'key', (v) => normalizeArray(v));
        bindInput('#we-keysecondary', 'keysecondary', (v) => normalizeArray(v));

        const blockContentEl = q('#we-block-content');
        if (blockContentEl) {
            let blockScrollTimer = null;
            blockContentEl.addEventListener('input', () => {
                activeBlock.content = String(blockContentEl.value || '');
                this.syncEntryContentFromBlocks(entry);
                this.renderList();
                markRefDirty();
            });
            blockContentEl.addEventListener('scroll', () => {
                const shell = q('#we-block-shell');
                if (!shell) return;
                shell.classList.add('is-scrolling');
                if (blockScrollTimer) clearTimeout(blockScrollTimer);
                blockScrollTimer = setTimeout(() => {
                    shell.classList.remove('is-scrolling');
                    blockScrollTimer = null;
                }, 520);
            }, { passive: true });
        }

        const blockTitleEl = q('#we-block-title');
        if (blockTitleEl) {
            blockTitleEl.addEventListener('input', () => {
                activeBlock.title = String(blockTitleEl.value || '');
                this.renderBlockManageModalList();
                markRefDirty();
            });
        }

        const blockEnabledEl = q('#we-block-enabled');
        if (blockEnabledEl) {
            blockEnabledEl.addEventListener('change', () => {
                activeBlock.enabled = Boolean(blockEnabledEl.checked);
                this.renderBlockManageModalList();
                markRefDirty();
                this.renderEditor();
            });
        }

        const blockPriorityEl = q('#we-block-priority');
        if (blockPriorityEl) {
            blockPriorityEl.addEventListener('input', () => {
                activeBlock.priority = toNumber(blockPriorityEl.value, 100);
                this.renderBlockManageModalList();
                markRefDirty();
            });
        }

        bindNumber('#we-depth', 'depth', DEFAULT_DEPTH, 0, 1000);
        bindNumber('#we-order', 'order', 100, -9999, 9999);
        bindNumber('#we-probability', 'probability', 100, 0, 100);
        bindNumber('#we-groupWeight', 'groupWeight', DEFAULT_WEIGHT, 0, 9999);
        bindNumber('#we-delayUntilRecursion', 'delayUntilRecursion', 0, 0, 9999);

        const bindCustomSelect = ({ btnSelector, options, getValue, setValue, rerenderList = false }) => {
            const btn = q(btnSelector);
            if (!btn) return;
            const renderBtn = () => {
                const label = this.getOptionLabel(options, getValue(), '');
                const labelEl = btn.querySelector('span');
                if (labelEl) labelEl.textContent = label;
            };
            renderBtn();
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.openCustomSelectMenu({
                    anchorEl: btn,
                    options,
                    currentValue: getValue(),
                    onSelect: (value) => {
                        setValue(value);
                        renderBtn();
                        if (rerenderList) this.renderList();
                        markRefDirty();
                    },
                });
            });
        };

        bindCustomSelect({
            btnSelector: '#we-position-btn',
            options: POSITION_OPTIONS,
            getValue: () => entry.position,
            setValue: (value) => {
                entry.position = toNumber(value, 0);
                const roleWrap = q('#we-role-wrap');
                if (roleWrap) roleWrap.style.display = Number(entry.position) === 4 ? '' : 'none';
            },
            rerenderList: true,
        });

        bindCustomSelect({
            btnSelector: '#we-role-btn',
            options: ROLE_OPTIONS,
            getValue: () => entry.role,
            setValue: (value) => {
                entry.role = toNumber(value, 0);
            },
            rerenderList: true,
        });

        bindCustomSelect({
            btnSelector: '#we-block-role-btn',
            options: ROLE_OPTIONS,
            getValue: () => activeBlock?.role,
            setValue: (value) => {
                activeBlock.role = toNumber(value, 0);
                this.renderBlockManageModalList();
            },
            rerenderList: false,
        });

        bindCustomSelect({
            btnSelector: '#we-selectiveLogic-btn',
            options: SELECTIVE_LOGIC_OPTIONS,
            getValue: () => entry.selectiveLogic,
            setValue: (value) => {
                entry.selectiveLogic = toNumber(value, 0);
            },
            rerenderList: false,
        });

        // 覆盖类字段：checkbox 表示 true；若取消则置 null（表示不覆盖）
        const bindOverrideCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked ? true : null;
                markRefDirty();
            });
        };

        bindCustomSelect({
            btnSelector: '#we-triggerStrategy-btn',
            options: TRIGGER_STRATEGY_OPTIONS,
            getValue: () => this.getEntryTriggerStrategy(entry),
            setValue: (value) => {
                this.applyEntryTriggerStrategy(entry, value);
            },
            rerenderList: true,
        });

        this.editorEl.querySelectorAll('.world-block-dot').forEach((dot) => {
            dot.addEventListener('click', () => {
                const idx = Number(dot.dataset.idx);
                if (!Number.isFinite(idx)) return;
                this.setEntryBlockPage(entry, entryId, idx);
            });
        });
        const addBlockBtn = q('#we-block-add');
        if (addBlockBtn) addBlockBtn.addEventListener('click', () => this.addPromptBlock(entry));
        const manageBtn = q('#we-block-manage');
        if (manageBtn) manageBtn.addEventListener('click', () => this.showBlockManageModal(entry, entryId));

        const blockOverlayEl = q('#we-block-overlay');
        if (blockOverlayEl) blockOverlayEl.addEventListener('click', () => this.setBlockExpanded(activeBlock?.id, false));

        const cornerBtn = q('#we-block-corner-btn');
        if (cornerBtn) {
            cornerBtn.addEventListener('click', () => {
                if (!this.isBlockExpanded(activeBlock?.id)) {
                    this.setBlockExpanded(activeBlock?.id, true);
                    return;
                }
                this.setBlockFlipped(activeBlock?.id, !this.isBlockFlipped(activeBlock?.id));
            });
        }
        const openNodeBtn = q('#we-block-open-node');
        if (openNodeBtn) {
            openNodeBtn.addEventListener('click', () => {
                this.openBlockConditionEditor(activeBlock?.id, 'node', activeBlock);
            });
        }
        const editorBackBtn = q('#we-block-editor-back');
        if (editorBackBtn) {
            editorBackBtn.addEventListener('click', () => {
                this.setBlockBackView(activeBlock?.id, 'summary');
            });
        }
        const editorSaveBtn = q('#we-block-editor-save');
        if (editorSaveBtn) {
            editorSaveBtn.addEventListener('click', () => {
                void this.saveBlockConditionEditor(activeBlock?.id, activeBlock);
            });
        }
        this.editorEl.querySelectorAll('.world-cond-overview-pending-main').forEach((btn) => {
            btn.addEventListener('click', () => {
                const path = String(btn.dataset.path || '').trim();
                const nodeId = String(btn.dataset.nodeId || '').trim();
                this.openBlockConditionEditor(
                    activeBlock?.id,
                    'node',
                    activeBlock,
                    path || 'root',
                    nodeId ? { nodeIds: [nodeId] } : null,
                );
            });
        });
        this.editorEl.querySelectorAll('.world-cond-overview-pending-fix').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const kind = String(btn.dataset.fixKind || '').trim();
                const fixIndex = Math.max(0, Number(btn.dataset.fixIndex || 0));
                const nodeId = String(btn.dataset.nodeId || '').trim();
                void this.applyOverviewQuickFix(activeBlock, { kind, fixIndex, nodeId });
            });
        });
        if (blockBackView === 'editor') {
            this.mountNodeEditor({ entry, block: activeBlock, markRefDirty });
        }

        const blockShellEl = q('#we-block-shell');
        if (blockShellEl) {
            let startX = 0;
            let startY = 0;
            blockShellEl.addEventListener('touchstart', (event) => {
                const touch = event.touches?.[0];
                if (!touch) return;
                startX = touch.clientX;
                startY = touch.clientY;
            }, { passive: true });
            blockShellEl.addEventListener('touchend', (event) => {
                if (this.isBlockExpanded(activeBlock?.id)) return;
                const touch = event.changedTouches?.[0];
                if (!touch) return;
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                if (Math.abs(dx) < 46 || Math.abs(dx) <= Math.abs(dy)) return;
                if (dx < 0 && blockPage < blocks.length - 1) {
                    this.setEntryBlockPage(entry, entryId, blockPage + 1);
                } else if (dx > 0 && blockPage > 0) {
                    this.setEntryBlockPage(entry, entryId, blockPage - 1);
                }
            }, { passive: true });
        }

        bindCheck('#we-ignoreBudget', 'ignoreBudget');
        bindCheck('#we-excludeRecursion', 'excludeRecursion');
        bindCheck('#we-preventRecursion', 'preventRecursion');

        bindCheck('#we-matchPersonaDescription', 'matchPersonaDescription');
        bindCheck('#we-matchCharacterDescription', 'matchCharacterDescription');
        bindCheck('#we-matchCharacterPersonality', 'matchCharacterPersonality');
        bindCheck('#we-matchCharacterDepthPrompt', 'matchCharacterDepthPrompt');
        bindCheck('#we-matchScenario', 'matchScenario');
        bindCheck('#we-matchCreatorNotes', 'matchCreatorNotes');

        bindInput('#we-group', 'group', (v) => v);
        bindCheck('#we-groupOverride', 'groupOverride');

        bindOverrideCheck('#we-caseSensitive', 'caseSensitive');
        bindOverrideCheck('#we-matchWholeWords', 'matchWholeWords');
        bindOverrideCheck('#we-useGroupScoring', 'useGroupScoring');

        const scanDepthEl = q('#we-scanDepth');
        if (scanDepthEl) {
            scanDepthEl.addEventListener('input', () => {
                const v = scanDepthEl.value.trim();
                entry.scanDepth = v === '' ? null : toNumber(v, null);
                markRefDirty();
            });
        }

        bindCheck('#we-useProbability', 'useProbability');

        const dupBtn = q('#we-duplicate');
        if (dupBtn) {
            if (this.refMode) {
                dupBtn.disabled = true;
                dupBtn.style.opacity = '0.6';
                dupBtn.style.cursor = 'not-allowed';
            } else {
                dupBtn.onclick = () => this.duplicateEntry(this.currentIndex);
            }
        }
        const delBtn = q('#we-delete');
        if (delBtn) {
            if (this.refMode) {
                delBtn.disabled = true;
                delBtn.style.opacity = '0.6';
                delBtn.style.cursor = 'not-allowed';
            } else {
                delBtn.onclick = () => this.deleteEntry(this.currentIndex);
            }
        }
        const aiBtn = q('#we-ai-generate');
        if (aiBtn) aiBtn.onclick = () => this.showAiModal(entry);
    }

    addEntry() {
        const newEntry = createDefaultEntry(this.data.entries.length);
        newEntry.id = `entry-${Date.now()}`;
        this.data.entries.unshift(newEntry);
        this.selectEntry(0);
    }

    duplicateEntry(index) {
        const base = this.data.entries[index];
        if (!base) return;
        const copy = normalizeEntry(deepClone(base), this.data.entries.length);
        copy.id = `entry-${Date.now()}`;
        copy.comment = `${copy.comment || 'entry'}（复制）`;
        this.data.entries.splice(index + 1, 0, copy);
        this.selectEntry(index + 1);
    }

    deleteEntry(index) {
        if (this.data.entries.length <= 1) {
            window.toastr?.warning('至少保留一个条目');
            return;
        }
        this.data.entries.splice(index, 1);
        this.selectEntry(Math.max(0, index - 1));
    }

    ensureUniqueSessionId(baseName, contactsStore) {
        const name = String(baseName || '').trim() || '新聊天室';
        let sessionId = name;
        let idx = 1;
        while (contactsStore.getContact(sessionId)) {
            sessionId = `${name}_${idx}`;
            idx += 1;
        }
        return { sessionId, name };
    }

    async ensureUniqueWorldbookId(baseName, { allowUnicode = false } = {}) {
        const sanitize = (value, fallback = 'worldbook') => {
            const raw = String(value || '').trim();
            if (allowUnicode) return raw || fallback;
            const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 48);
            return cleaned || fallback;
        };
        const worldStore = window.appBridge?.worldStore;
        try {
            await worldStore?.ready;
        } catch {}
        const base = sanitize(baseName, 'worldbook');
        if (!worldStore?.load?.(base)) return base;
        let idx = 1;
        while (idx < 9999) {
            const next = `${base}_${idx}`;
            if (!worldStore?.load?.(next)) return next;
            idx += 1;
        }
        return `${base}_${Date.now()}`;
    }

    buildWorldRefs(entries = [], { includeAll = false } = {}) {
        const sourceWorldId = String(this.worldName || '').trim();
        if (!sourceWorldId) return [];
        if (includeAll) {
            return [{ sourceId: sourceWorldId, includeAll: true }];
        }
        const list = Array.isArray(entries) ? entries : [];
        const refs = [];
        const seen = new Set();
        list.forEach((entry, idx) => {
            const entryId = this.getEntryId(entry, idx);
            if (!entryId || seen.has(entryId)) return;
            seen.add(entryId);
            refs.push({ sourceId: sourceWorldId, entryId });
        });
        return refs;
    }

    async resolveRefEntriesForDisplay(refs = []) {
        const list = Array.isArray(refs) ? refs : [];
        if (!list.length) return [];
        const results = [];
        const cache = new Map();
        for (const raw of list) {
            const ref = raw && typeof raw === 'object' ? raw : {};
            const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
            if (!sourceId) continue;
            if (!cache.has(sourceId)) {
                let sourceData = null;
                try {
                    sourceData = await window.appBridge?.getWorldInfo?.(sourceId);
                } catch {}
                cache.set(sourceId, sourceData || null);
            }
            const sourceData = cache.get(sourceId);
            const sourceEntries = Array.isArray(sourceData?.entries) ? sourceData.entries : [];
            if (!sourceEntries.length) continue;
            const entryIdRaw = String(ref.entryId || ref.entry || '').trim();
            const entryIds = Array.isArray(ref.entryIds)
                ? ref.entryIds.map(val => String(val || '').trim()).filter(Boolean)
                : [];
            const includeAll = ref.includeAll === true || ref.all === true || entryIdRaw === '*' || entryIds.includes('*');
            let picked = sourceEntries;
            if (!includeAll) {
                const idSet = new Set(entryIds);
                if (entryIdRaw) idSet.add(entryIdRaw);
                picked = idSet.size
                    ? sourceEntries.filter(entry => idSet.has(String(entry?.id ?? entry?.uid ?? '').trim()))
                    : [];
            }
            picked.forEach((entry, idx) => {
                if (!entry) return;
                const entryId = String(entry?.id ?? entry?.uid ?? `entry-${idx}`).trim();
                results.push({ ...entry, _refSourceId: sourceId, _refEntryId: entryId });
            });
        }
        return results;
    }

    async createChatFromEntries(entries, { name = '', includeAll = false } = {}) {
        const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
        if (!list.length) {
            window.toastr?.warning?.('未选择任何条目');
            return;
        }
        const contactsStore = window.appBridge?.contactsStore;
        const chatStore = window.appBridge?.chatStore;
        if (!contactsStore || !chatStore) {
            window.toastr?.warning?.('联系人/会话尚未就绪');
            return;
        }
        const baseName = String(name || '').trim() || String(list[0]?.comment || list[0]?.title || '新聊天室').trim() || '新聊天室';
        const { sessionId, name: resolvedName } = this.ensureUniqueSessionId(baseName, contactsStore);
        contactsStore.upsertContact({
            id: sessionId,
            name: resolvedName,
            avatar: '',
            isGroup: false,
            addedAt: Date.now(),
            description: '',
            source: 'world_entry',
            isUserCreated: true,
        });
        if (typeof chatStore._ensureSession === 'function') {
            chatStore._ensureSession(sessionId);
            const settings = chatStore.getSessionSettings?.(sessionId) || {};
            chatStore.setSessionSettings?.(sessionId, { ...settings, sharedVariables: true, sharedMemory: true });
            chatStore._persist?.();
        }
        window.dispatchEvent(new CustomEvent('contacts-updated', { detail: { id: sessionId, source: 'world_entry' } }));
        list.forEach((entry) => {
            const splitTo = Array.isArray(entry.splitTo) ? entry.splitTo.slice() : [];
            if (!splitTo.includes(sessionId)) splitTo.push(sessionId);
            entry.splitTo = splitTo;
        });
        const refs = this.buildWorldRefs(list, { includeAll });
        if (refs.length) {
            const worldName = resolvedName;
            const worldId = await this.ensureUniqueWorldbookId(worldName, { allowUnicode: true });
            const payload = {
                name: worldName,
                entries: [],
                refs,
                source: 'world_entry',
            };
            await window.appBridge?.saveWorldInfo?.(worldId, payload);
            window.appBridge?.bindWorldToSession?.(sessionId, worldId, { silent: true });
        } else {
            window.toastr?.warning?.('未能创建引用世界书，请稍后重试');
        }
        this.renderList();
        this.renderEditor();
        this.saveWorldSilently?.({ showToast: false });
        window.toastr?.success?.(`已创建聊天室：${resolvedName}`);
    }

    async createChatFromEntry(entry) {
        if (!entry) return;
        await this.createChatFromEntries([entry], { name: entry.comment || entry.title || '' });
    }

    prepareForSave(nameOverride = this.worldName) {
        const sourceEntries = this.refMode ? (this.refLocalEntries || []) : this.data.entries;
        const entries = sourceEntries.map((entry, i) => {
            const e = normalizeEntry(entry, i);
            // 兼容旧命名
            e.title = e.comment;
            e.triggers = e.key;
            e.secondary = e.keysecondary;
            e.priority = e.order;
            return e;
        });
        return { ...(this.data || {}), name: nameOverride, entries };
    }

    async saveRefEdits({ showToast = true } = {}) {
        try {
            const list = Array.isArray(this.data?.entries) ? this.data.entries : [];
            if (!list.length) {
                if (showToast) window.toastr?.warning?.('没有可同步的条目');
                return false;
            }
            const updatesBySource = new Map();
            list.forEach((entry, idx) => {
                const sourceId = String(entry?._refSourceId || '').trim();
                if (!sourceId) return;
                const targetId = String(entry?._refEntryId ?? entry?.id ?? entry?.uid ?? '').trim();
                const fallbackIndex = Number.isFinite(Number(entry?._refEntryIndex)) ? Number(entry._refEntryIndex) : idx;
                const cleaned = normalizeEntry(deepClone(entry), idx);
                delete cleaned._refSourceId;
                delete cleaned._refWorldId;
                delete cleaned._refEntryId;
                delete cleaned._refEntryIndex;
                if (targetId) cleaned.id = targetId;
                if (cleaned.uid == null && /^\d+$/.test(cleaned.id)) cleaned.uid = Number(cleaned.id);
                if (!updatesBySource.has(sourceId)) updatesBySource.set(sourceId, []);
                updatesBySource.get(sourceId).push({ targetId, fallbackIndex, data: cleaned });
            });
            if (!updatesBySource.size) {
                if (showToast) window.toastr?.warning?.('未找到可同步的来源世界书');
                return false;
            }
            const updatedSources = [];
            let updatedCount = 0;
            let failedCount = 0;
            for (const [sourceId, updates] of updatesBySource.entries()) {
                let sourceData = null;
                try {
                    sourceData = await window.appBridge?.getWorldInfo?.(sourceId);
                } catch {}
                if (!sourceData || !Array.isArray(sourceData.entries)) {
                    failedCount += updates.length;
                    continue;
                }
                const nextEntries = sourceData.entries.map((item) => ({ ...item }));
                let localUpdated = 0;
                updates.forEach(({ targetId, fallbackIndex, data }) => {
                    let idx = -1;
                    if (targetId) {
                        idx = nextEntries.findIndex(item => String(item?.id ?? item?.uid ?? '').trim() === targetId);
                    }
                    if (idx < 0 && Number.isFinite(fallbackIndex) && fallbackIndex >= 0 && fallbackIndex < nextEntries.length) {
                        idx = fallbackIndex;
                    }
                    if (idx < 0) return;
                    nextEntries[idx] = { ...nextEntries[idx], ...data };
                    localUpdated += 1;
                });
                if (localUpdated > 0) {
                    await window.appBridge?.saveWorldInfo?.(sourceId, { ...sourceData, entries: nextEntries });
                    updatedCount += localUpdated;
                    updatedSources.push(sourceId);
                }
            }
            if (showToast) {
                if (updatedCount > 0) {
                    const labels = updatedSources.length ? `（${updatedSources.join('、')}）` : '';
                    window.toastr?.success?.(`已同步到来源世界书${labels}`);
                } else {
                    window.toastr?.warning?.('未找到可同步的条目');
                }
                if (failedCount > 0) {
                    window.toastr?.warning?.('部分来源世界书不可用，已跳过');
                }
            }
            return updatedCount > 0;
        } catch (err) {
            logger.error('同步引用世界书失败', err);
            if (showToast) window.toastr?.error?.('同步失败，请检查控制台');
            return false;
        }
    }

    sanitizeExportName(name, fallback = 'worldbook') {
        const raw = String(name || '').trim();
        const safe = raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        return safe || fallback;
    }

    async pickSavePath(defaultName) {
        if (isAndroid()) {
            return { path: '', cancelled: false, fallback: true };
        }
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const result = await save({
                defaultPath: defaultName,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!result) return { path: '', cancelled: true, fallback: false };
            return { path: result, cancelled: false, fallback: false };
        } catch (err) {
            logger.warn('世界书导出：保存对话框不可用', err);
            return { path: '', cancelled: false, fallback: true };
        }
    }

    async exportWorld() {
        try {
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                window.toastr?.warning('名称不能为空');
                return;
            }
            const payload = this.prepareForSave(nextName);

            // 追加绑定正则集合（便于导入时自动带上）
            try {
                await window.appBridge?.regex?.ready;
                const sets = window.appBridge?.regex?.listLocalSets?.() || [];
                const bound = sets
                    .filter(s => s?.bind?.type === 'world' && s.bind.worldId === nextName)
                    .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
                if (bound.length) payload.boundRegexSets = bound;
            } catch {}

            const baseName = String(nextName || '').trim() || 'worldbook';
            const filename = baseName.toLowerCase().endsWith('.json')
                ? baseName
                : `${baseName}.json`;

            if (!hasTauriRuntime()) {
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                window.toastr?.success(`已导出：${filename}`);
                return;
            }

            const pick = await this.pickSavePath(filename);
            if (pick.cancelled) return;
            const dataUrl = buildJsonDataUrl(payload);
            const resp = pick.fallback
                ? await safeInvoke('export_attachment', { dataUrl, fileName: filename })
                : await safeInvoke('export_attachment', { dataUrl, fileName: filename, path: pick.path });
            const savedPath = String(resp?.path || '').trim();
            if (savedPath) {
                window.toastr?.success(`已导出：${savedPath}`);
            } else {
                window.toastr?.success(`已导出：${filename}`);
            }
        } catch (err) {
            logger.error('导出世界书失败', err);
            window.toastr?.error('导出失败');
        }
    }

    async saveWorld() {
        try {
            if (this.refMode) {
                const ok = await this.saveRefEdits({ showToast: true });
                if (ok) this.onSaved?.(this.worldName, this.data);
                this.hide();
                return;
            }
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                window.toastr?.warning('名称不能为空');
                return;
            }
            const payload = this.prepareForSave(nextName);
            if (nextName !== this.worldName) {
                const existing = await window.appBridge.listWorlds?.();
                if (Array.isArray(existing) && existing.includes(nextName)) {
                    window.toastr?.warning('名称已存在，请换一个');
                    return;
                }
                await window.appBridge.renameWorldInfo?.(this.worldName, nextName, payload);
                this.worldName = nextName;
            } else {
                await window.appBridge.saveWorldInfo(this.worldName, payload);
            }
            window.toastr?.success(`世界书已保存：${this.worldName}`);
            this.onSaved?.(this.worldName, payload);
            this.hide();
        } catch (err) {
            logger.error('保存世界书失败', err);
            window.toastr?.error('保存失败，请检查控制台');
        }
    }

    async saveWorldSilently({ showToast = true } = {}) {
        try {
            if (this.refMode) {
                const ok = await this.saveRefEdits({ showToast });
                if (ok) this.onSaved?.(this.worldName, this.data);
                return ok;
            }
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                if (showToast) window.toastr?.warning?.('名称不能为空');
                return false;
            }
            const payload = this.prepareForSave(nextName);
            if (nextName !== this.worldName) {
                const existing = await window.appBridge.listWorlds?.();
                if (Array.isArray(existing) && existing.includes(nextName)) {
                    if (showToast) window.toastr?.warning?.('名称已存在，无法自动保存');
                    return false;
                }
                await window.appBridge.renameWorldInfo?.(this.worldName, nextName, payload);
                this.worldName = nextName;
            } else {
                await window.appBridge.saveWorldInfo(this.worldName, payload);
            }
            this.onSaved?.(this.worldName, payload);
            if (showToast) window.toastr?.success?.(`世界书已保存：${this.worldName}`);
            return true;
        } catch (err) {
            logger.error('自动保存世界书失败', err);
            if (showToast) window.toastr?.error?.('自动保存失败');
            return false;
        }
    }
}
