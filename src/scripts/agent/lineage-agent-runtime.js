const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const listLength = value => (Array.isArray(value) ? value.length : 0);

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeOptionsSummary = (options = {}) => {
  const src = isPlainObject(options) ? options : {};
  return {
    focusId: trim(src.focusId),
    expandedCount: listLength(src.expandedIds),
  };
};

const summarizeLineage = (graph = null, summarizeGraph = null) => {
  const fallback = {
    scopeId: trim(graph?.scopeId, 'default'),
    mode: trim(graph?.mode, 'unknown'),
    nodeCount: listLength(graph?.nodes),
    edgeCount: listLength(graph?.edges),
    riskCount: 0,
  };
  if (typeof summarizeGraph !== 'function') return fallback;
  try {
    const summary = summarizeGraph(graph);
    return {
      scopeId: trim(summary?.scopeId, fallback.scopeId),
      mode: trim(summary?.mode, fallback.mode),
      nodeCount: toFiniteNumber(summary?.nodeCount, fallback.nodeCount),
      edgeCount: toFiniteNumber(summary?.edgeCount, fallback.edgeCount),
      riskCount: toFiniteNumber(summary?.riskCount, fallback.riskCount),
    };
  } catch {
    return fallback;
  }
};

const hasAgentTaskRuntime = runtime => (
  runtime
  && typeof runtime.startRun === 'function'
  && typeof runtime.startStep === 'function'
  && typeof runtime.finishStep === 'function'
  && typeof runtime.finishRun === 'function'
);

export const createLineageAgentRuntime = ({
  agentTaskRuntime = null,
  renderMapSceneHtml = null,
  summarizeGraph = null,
  logger = console,
} = {}) => {
  const renderMapScene = async ({
    graph = null,
    options = {},
    sessionId = '',
    source = 'lineage-graph-view',
    trigger = 'prompt_preview',
  } = {}) => {
    if (typeof renderMapSceneHtml !== 'function') {
      throw new Error('lineage map renderer not configured');
    }
    const render = () => renderMapSceneHtml(graph, options);
    if (!graph || !hasAgentTaskRuntime(agentTaskRuntime)) return render();

    const graphSummary = summarizeLineage(graph, summarizeGraph);
    const optionSummary = normalizeOptionsSummary(options);
    const run = agentTaskRuntime.startRun({
      kind: 'lineage_layout',
      title: 'Lineage layout',
      sessionId: trim(sessionId),
      surface: 'prompt_preview',
      trigger,
      source,
      summary: 'lineage layout started',
      metadata: {
        ...graphSummary,
        ...optionSummary,
      },
    });
    const step = run?.id ? agentTaskRuntime.startStep(run.id, {
      type: 'lineage.layout',
      title: 'Layout lineage graph',
      summary: 'laying out lineage graph',
      input: {
        ...graphSummary,
        ...optionSummary,
      },
    }) : null;

    try {
      const html = await render();
      const output = {
        ...graphSummary,
        htmlLength: String(html || '').length,
      };
      if (run?.id && step?.id) {
        agentTaskRuntime.finishStep(run.id, step.id, {
          status: 'succeeded',
          output,
          summary: 'lineage layout succeeded',
        });
      }
      if (run?.id) {
        agentTaskRuntime.finishRun(run.id, {
          status: 'succeeded',
          summary: 'lineage layout succeeded',
        });
      }
      return html;
    } catch (err) {
      const status = err?.name === 'AbortError' ? 'cancelled' : 'failed';
      const message = err?.message ? String(err.message) : String(err || '');
      if (run?.id && step?.id) {
        agentTaskRuntime.finishStep(run.id, step.id, {
          status,
          errorMessage: message,
          summary: status === 'cancelled' ? 'lineage layout cancelled' : 'lineage layout failed',
        });
      }
      if (run?.id) {
        agentTaskRuntime.finishRun(run.id, {
          status,
          errorMessage: message,
          summary: status === 'cancelled' ? 'lineage layout cancelled' : 'lineage layout failed',
        });
      }
      logger?.warn?.('lineage layout failed', err);
      throw err;
    }
  };

  return {
    renderMapScene,
  };
};
