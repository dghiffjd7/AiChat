import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  buildLineageMapSceneModelWithElk,
  buildLineageMapSceneModel,
  buildLineageGraphViewModel,
  detectLineageCycles,
  exportLineageGraphDot,
  exportLineageGraphMermaid,
  findLineagePaths,
  formatLineageEdgeDetails,
  formatLineageNodeDetails,
  formatLineagePathDiagnostics,
  renderLineageGraphSvg,
  renderLineageMapSceneHtml,
  renderLineageOverviewHtml,
  renderLineagePipelineHtml,
  summarizeLineageGraph,
} from '../../src/scripts/ui/chat/lineage-graph-view-utils.js';

const require = createRequire(import.meta.url);
const ELK = require('elkjs/lib/elk.bundled.js');

const graph = {
  version: 1,
  scopeId: 'persona:1',
  mode: 'moment',
  rootId: 'prompt:req-1',
  generatedAt: 1760000000000,
  nodes: [
    { id: 'contact:a', type: 'contact', label: 'Alice', status: 'active', scopeId: 'persona:1' },
    { id: 'profile:a', type: 'contact_profile', label: 'Alice 画像', status: 'active', scopeId: 'persona:1', meta: { contactId: 'contact:a' } },
    { id: 'row:a:1', type: 'memory_row', label: '拍照事件', status: 'active', scopeId: 'persona:1' },
    { id: 'contact:b', type: 'contact', label: 'Bob', status: 'blocked', scopeId: 'persona:2' },
    { id: 'prompt:req-1', type: 'prompt', label: '本次 Prompt', status: 'active', scopeId: 'persona:1' },
  ],
  edges: [
    { id: 'e1', source: 'contact:a', target: 'profile:a', type: 'contains', status: 'active', reason: 'default_enabled', sourceScopeId: 'persona:1', targetScopeId: 'persona:1' },
    { id: 'e2', source: 'profile:a', target: 'row:a:1', type: 'triggers', status: 'active', reason: 'memory_row_match', sourceScopeId: 'persona:1', targetScopeId: 'persona:1', score: 3 },
    { id: 'e3', source: 'row:a:1', target: 'prompt:req-1', type: 'injects', status: 'active', reason: 'memory_row_match', sourceScopeId: 'persona:1', targetScopeId: 'persona:1' },
    { id: 'e4', source: 'contact:b', target: 'prompt:req-1', type: 'candidate_for', status: 'blocked', reason: 'scope_block', sourceScopeId: 'persona:2', targetScopeId: 'persona:1' },
  ],
};

const buildDenseGraph = () => ({
  ...graph,
  nodes: [
    graph.nodes[4],
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `contact:dense:${index}`,
      type: 'contact',
      label: `联系人 ${index}`,
      status: 'active',
      scopeId: 'persona:1',
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `row:dense:${index}`,
      type: 'memory_row',
      label: `记忆 ${index}`,
      status: 'active',
      scopeId: 'persona:1',
    })),
  ],
  edges: [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `edge:contact:${index}`,
      source: `contact:dense:${index}`,
      target: 'prompt:req-1',
      type: 'candidate_for',
      status: 'candidate',
      sourceScopeId: 'persona:1',
      targetScopeId: 'persona:1',
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `edge:row:${index}`,
      source: `row:dense:${index}`,
      target: 'prompt:req-1',
      type: 'injects',
      status: 'active',
      sourceScopeId: 'persona:1',
      targetScopeId: 'persona:1',
    })),
  ],
});

const collectNodeOverlaps = (nodes = []) => {
  const overlaps = [];
  const visibleNodes = nodes.filter(node => node.kind !== 'root');
  visibleNodes.forEach((node, index) => {
    visibleNodes.slice(index + 1).forEach((other) => {
      const intersects = Math.abs(node.x - other.x) < (node.width + other.width) / 2 + 6
        && Math.abs(node.y - other.y) < (node.height + other.height) / 2 + 10;
      if (intersects) overlaps.push(`${node.id}/${other.id}`);
    });
  });
  return overlaps;
};

{
  const summary = summarizeLineageGraph(graph);
  assert.equal(summary.nodeCount, 5);
  assert.equal(summary.edgeCount, 4);
  assert.equal(summary.riskCount, 1);
  assert.equal(summary.byStatus.active, 3);
  assert.equal(summary.byStatus.blocked, 1);
  console.log('ok - summarizeLineageGraph counts status and scope risks');
}

{
  const model = buildLineageGraphViewModel(graph, { statusFilter: 'active' });
  assert.equal(model.nodes.some(node => node.id === 'contact:b'), false);
  assert.equal(model.edges.length, 3);
  assert.ok(model.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  const svg = renderLineageGraphSvg(model);
  assert.match(svg, /lineage-graph-svg/);
  assert.match(svg, /data-lineage-node-id="contact:a"/);
  assert.doesNotMatch(svg, /data-lineage-node-id="contact:b"/);
  console.log('ok - buildLineageGraphViewModel lays out filtered SVG nodes');
}

{
  const riskModel = buildLineageGraphViewModel(graph, { statusFilter: 'risk' });
  assert.equal(riskModel.edges.length, 1);
  assert.equal(riskModel.edges[0].id, 'e4');
  assert.equal(riskModel.nodes.some(node => node.id === 'contact:b'), true);
  console.log('ok - lineage graph risk filter keeps cross-scope blocked paths');
}

{
  const localModel = buildLineageGraphViewModel(graph, {
    focusId: 'prompt:req-1',
    includeStructuralEdges: false,
  });
  assert.equal(localModel.edges.some(edge => edge.id === 'e1'), false);
  assert.equal(localModel.edges.some(edge => edge.id === 'e3'), true);
  assert.equal(localModel.nodes.some(node => node.id === 'prompt:req-1'), true);
  console.log('ok - local lineage graph hides low-signal structural edges by default');
}

{
  const scene = renderLineageMapSceneHtml(graph);
  assert.match(scene, /lineage-map-scene/);
  assert.match(scene, /data-lineage-map-category="contacts"/);
  assert.match(scene, /联系人/);
  assert.doesNotMatch(scene, /NaN/);
  assert.doesNotMatch(scene, /Alice 画像/);
  const expandedCategory = renderLineageMapSceneHtml(graph, { expandedIds: ['contacts'] });
  assert.doesNotMatch(expandedCategory, /is-contains/);
  const expanded = renderLineageMapSceneHtml(graph, { expandedIds: ['contacts'], focusId: 'contact:a' });
  assert.match(expanded, /data-lineage-node-id="contact:a"/);
  assert.match(expanded, /Alice/);
  assert.match(expanded, /is-contains/);
  console.log('ok - lineage map scene renders first-layer categories and expands on demand');
}

{
  const model = buildLineageMapSceneModel(buildDenseGraph(), { expandedIds: ['contacts', 'memories'] });
  assert.deepEqual(collectNodeOverlaps(model.nodes), []);
  assert.ok(model.edges.every(edge => /C/.test(edge.path)));
  console.log('ok - lineage map scene allocates expanded bands without node overlap');
}

{
  const model = await buildLineageMapSceneModelWithElk(buildDenseGraph(), {
    expandedIds: ['contacts', 'memories'],
    elkConstructor: ELK,
  });
  assert.equal(model.layoutEngine, 'elk');
  assert.deepEqual(collectNodeOverlaps(model.nodes), []);
  assert.ok(model.edges.filter(edge => edge.kind === 'aggregate').every(edge => /C/.test(edge.path)));
  assert.ok(model.edges.filter(edge => edge.kind !== 'aggregate').every(edge => /L/.test(edge.path)));
  console.log('ok - lineage map scene uses ELK layered orthogonal layout without node overlap');
}

{
  const nodeText = formatLineageNodeDetails(graph.nodes[1]);
  assert.match(nodeText, /Alice 画像/);
  assert.match(nodeText, /meta.contactId/);
  const edgeText = formatLineageEdgeDetails(graph.edges[3], graph);
  assert.match(edgeText, /跨角色卡 scope 边/);
  assert.match(edgeText, /scope_block/);
  console.log('ok - lineage node and edge detail formatters expose evidence');
}

{
  const mermaid = exportLineageGraphMermaid(graph);
  assert.match(mermaid, /flowchart LR/);
  assert.match(mermaid, /注入/);
  const dot = exportLineageGraphDot(graph);
  assert.match(dot, /digraph ContextLineageGraph/);
  assert.match(dot, /scope: persona:1/);
  console.log('ok - lineage graph exports Mermaid and DOT');
}

{
  const result = findLineagePaths(graph, { query: 'Alice' });
  assert.equal(result.startCount, 2);
  assert.equal(result.paths.length, 2);
  assert.match(result.paths[0].text, /Alice/);
  assert.match(result.paths[0].text, /本次 Prompt/);
  const risk = findLineagePaths(graph);
  assert.equal(risk.paths.length, 1);
  assert.match(formatLineagePathDiagnostics(risk, graph), /风险路径诊断/);
  assert.deepEqual(detectLineageCycles(graph), []);
  console.log('ok - lineage path diagnostics finds query and risk paths');
}

{
  const overview = renderLineageOverviewHtml(graph);
  assert.match(overview, /lineage-overview-view/);
  assert.match(overview, /已注入/);
  assert.match(overview, /风险/);
  const pipeline = renderLineagePipelineHtml(graph);
  assert.match(pipeline, /lineage-pipeline-view/);
  assert.match(pipeline, /候选来源/);
  assert.match(pipeline, /阻止 \/ 裁剪 \/ 风险/);
  console.log('ok - lineage readable views render overview and pipeline summaries');
}
